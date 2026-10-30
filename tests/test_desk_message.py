"""Behavioral contract for the bounded BLE desk-message receiver."""

import importlib.util
from pathlib import Path
import types
import unittest
from unittest.mock import Mock, patch
import uuid


ROOT = Path(__file__).resolve().parents[1]
SERVICE = "8b5e4d20-6c8a-4b39-a7d8-3f2c91a65010"
RX = "8b5e4d20-6c8a-4b39-a7d8-3f2c91a65011"
STATUS = "8b5e4d20-6c8a-4b39-a7d8-3f2c91a65012"


class FakeUUID:
    def __init__(self, value):
        self.value = str(value)

    def __bytes__(self):
        return uuid.UUID(self.value).bytes[::-1]

    def __str__(self):
        return self.value


class Clock:
    PERIOD = 1 << 30

    def __init__(self):
        self.now = 0
        self.sleep_hook = None

    def ticks_ms(self):
        return self.now % self.PERIOD

    def ticks_diff(self, end, start):
        return (end - start + self.PERIOD // 2) % self.PERIOD - self.PERIOD // 2

    def sleep_ms(self, milliseconds):
        self.now += milliseconds
        if self.sleep_hook:
            self.sleep_hook()


class FakeBLE:
    RX_HANDLE = 11
    STATUS_HANDLE = 12

    def __init__(self):
        self.active_calls = []
        self.advertisements = []
        self.services = []
        self.buffers = []
        self.values = {}
        self.notifications = []
        self.disconnections = []
        self.handler = None

    def active(self, value=None):
        if value is not None:
            self.active_calls.append(value)
        return bool(self.active_calls and self.active_calls[-1])

    def irq(self, handler):
        self.handler = handler

    def config(self, *args, **kwargs):
        if args == ("mac",):
            return (0, b"\x01\x02\x03\x04\x05\x06")

    def gatts_register_services(self, services):
        self.services = services
        return ((self.RX_HANDLE, self.STATUS_HANDLE),)

    def gatts_set_buffer(self, handle, size, append=False):
        self.buffers.append((handle, size, append))

    def gatts_read(self, handle):
        return self.values.get(handle, b"")

    def gatts_write(self, handle, value, *args):
        self.values[handle] = bytes(value)

    def gatts_notify(self, connection, handle, value=None):
        self.notifications.append((connection, handle, bytes(value) if value is not None else self.values[handle]))

    def gap_advertise(self, interval_us, **kwargs):
        self.advertisements.append((interval_us, kwargs))

    def gap_disconnect(self, connection):
        self.disconnections.append(connection)

    def connect(self, connection=1):
        self.handler(1, (connection, 0, b"\x01" * 6))

    def disconnect(self, connection=1):
        self.handler(2, (connection, 0, b"\x01" * 6))

    def packet(self, data, connection=1, handle=None):
        handle = self.RX_HANDLE if handle is None else handle
        self.values[handle] = bytes(data)
        self.handler(3, (connection, handle))

    def statuses(self):
        return [value for _, handle, value in self.notifications if handle == self.STATUS_HANDLE]


class FakePanel:
    def __init__(self, clock):
        self.clock = clock
        self.calls = []
        self.show_calls = []
        self.show_duration = 0
        self.show_error = None
        self.on_show = None
        self.back = types.SimpleNamespace(value=lambda: 1)

    def fill(self, *args):
        self.calls.append(("fill", args))

    def text(self, *args):
        self.calls.append(("text", args))

    def show(self, *args, **kwargs):
        self.show_calls.append(self.clock.ticks_ms())
        if self.on_show:
            self.on_show()
        self.clock.now += self.show_duration
        if self.show_error:
            raise self.show_error


class DeskMessageTests(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.ble = FakeBLE()
        self.panel = FakePanel(self.clock)
        bluetooth = types.SimpleNamespace(UUID=FakeUUID, BLE=lambda: self.ble,
            FLAG_READ=2, FLAG_WRITE=8, FLAG_NOTIFY=16)
        spec = importlib.util.spec_from_file_location("desk_message_under_test", ROOT / "device/desk_message.py")
        self.module = importlib.util.module_from_spec(spec)
        with patch.dict("sys.modules", {
            "bluetooth": bluetooth, "time": self.clock,
            "machine": types.SimpleNamespace(),
            "crowpanel": types.SimpleNamespace(WHITE=1, CrowPanel=lambda **kwargs: self.panel),
        }):
            spec.loader.exec_module(self.module)

    def receiver(self):
        result = self.module.MessageReceiver(self.ble, self.panel, name="Desk-ABC123")
        self.ble.connect()
        return result

    def send(self, text, message_id=1, commit=True, connection=1):
        encoded = text.encode("ascii") if isinstance(text, str) else text
        self.ble.packet(bytes((1, message_id, len(encoded))), connection)
        for start in range(0, len(encoded), 18):
            self.ble.packet(bytes((2, message_id)) + encoded[start:start + 18], connection)
        if commit:
            self.ble.packet(bytes((3, message_id)), connection)

    def poll(self, receiver, now):
        self.clock.now = now
        return receiver.poll(now % self.clock.PERIOD)

    def test_layout_wraps_without_losing_printable_ascii_and_normalizes_crlf(self):
        self.assertEqual(self.module.MAX_MESSAGE_BYTES, 112)
        self.assertEqual(self.module.layout_message("Hello from my desk!"), ["Hello from my desk!"])
        self.assertEqual(self.module.layout_message("one\r\ntwo"), ["one", "two"])
        self.assertEqual(self.module.layout_message("x" * 112), ["x" * 28] * 4)
        lines = self.module.layout_message("A friendly note that is longer than one display line")
        self.assertLessEqual(len(lines), 4)
        self.assertTrue(all(len(line) <= 28 for line in lines))
        self.assertEqual(" ".join(lines), "A friendly note that is longer than one display line")

    def test_layout_rejects_empty_non_ascii_controls_and_overflow(self):
        for value in ("", " \n ", "x" * 113, "one\ntwo\nthree\nfour\nfive", "hello\tthere", "hello\rthere", "caf\u00e9", "hi\x00", "\U0001f600"):
            with self.subTest(value=repr(value)):
                with self.assertRaises(ValueError):
                    self.module.layout_message(value)

    def test_advertises_custom_service_and_unique_name_with_legal_payload_sizes(self):
        self.receiver()
        service_uuid, characteristics = self.ble.services[0]
        self.assertEqual(str(service_uuid), SERVICE)
        self.assertEqual([(str(item[0]), item[1]) for item in characteristics], [(RX, 8), (STATUS, 18)])
        self.assertIn((self.ble.RX_HANDLE, 20, False), self.ble.buffers)
        _, advertisement = next(item for item in self.ble.advertisements if item[0])
        self.assertLessEqual(len(advertisement["adv_data"]), 31)
        self.assertLessEqual(len(advertisement["resp_data"]), 31)
        self.assertIn(bytes(FakeUUID(SERVICE)), advertisement["adv_data"])
        self.assertIn(b"Desk-ABC123", advertisement["resp_data"])

    def test_valid_fragmented_message_is_only_drawn_in_poll_and_acknowledged_after_show(self):
        receiver = self.receiver()
        before = len(self.panel.show_calls)
        text = "Hello from a nearby computer. This text takes multiple packets."
        self.send(text, message_id=17)
        self.assertEqual(len(self.panel.show_calls), before, "BLE IRQ must never refresh the display")
        self.assertNotIn(b"shown:17", self.ble.statuses())
        self.panel.on_show = lambda: self.assertNotIn(b"shown:17", self.ble.statuses())
        self.poll(receiver, 3000)
        self.assertEqual(len(self.panel.show_calls), before + 1)
        self.assertIn(b"shown:17", self.ble.statuses())
        labels = [args[0] for action, args in self.panel.calls if action == "text"]
        for line in self.module.layout_message(text):
            self.assertIn(line, labels)

    def test_invalid_frames_do_not_display_and_later_valid_message_recovers(self):
        cases = [
            [b"\x02\x01abc", b"\x03\x01"],
            [b"\x01\x01\x04", b"\x02\x01abc", b"\x03\x01"],
            [b"\x01\x01\x03", b"\x02\x02abc", b"\x03\x01"],
            [b"\x01\x01\x02", b"\x02\x01abc", b"\x03\x01"],
            [b"\x01\x01\x00"], [b"\x01\x01\x71"],
            [b"\x01\x01\x02", b"\x02\x01\xc3\xa9", b"\x03\x01"],
            [b"\x01\x01\x03", b"\x02\x01a\x00b", b"\x03\x01"],
            [b"\x01\x01\x03extra"], [b"\x09\x01"],
            [b"\x02\x01" + b"a" * 19],
            [b""], [b"\x01"], [b"\x02"], [b"\x03"],
        ]
        for packets in cases:
            with self.subTest(packets=packets):
                self.setUp()
                receiver = self.receiver()
                before = len(self.panel.show_calls)
                for packet in packets:
                    self.ble.packet(packet)
                self.poll(receiver, 3000)
                self.assertEqual(len(self.panel.show_calls), before)
                self.assertTrue(any(status.startswith(b"error:") for status in self.ble.statuses()))
                self.send("Recovered", message_id=9)
                self.poll(receiver, 6000)
                self.assertIn(b"shown:9", self.ble.statuses())

    def test_new_begin_discards_partial_previous_message(self):
        receiver = self.receiver()
        self.send("Old partial", message_id=1, commit=False)
        self.send("New message", message_id=2)
        self.poll(receiver, 3000)
        self.assertNotIn(b"shown:1", self.ble.statuses())
        self.assertIn(b"shown:2", self.ble.statuses())

    def test_disconnect_discards_queued_and_partial_text_before_reconnect(self):
        receiver = self.receiver()
        before = len(self.panel.show_calls)
        self.send("Must not survive disconnect", message_id=1)
        self.ble.disconnect()
        self.poll(receiver, 3000)
        self.assertEqual(len(self.panel.show_calls), before)
        self.ble.connect()
        self.send("New session", message_id=2)
        self.poll(receiver, 6000)
        self.assertIn(b"shown:2", self.ble.statuses())
        self.assertNotIn(b"shown:1", self.ble.statuses())

    def test_another_central_cannot_write_or_disconnect_the_owner(self):
        receiver = self.receiver()
        before = len(self.panel.show_calls)
        self.ble.connect(2)
        self.assertIn(2, self.ble.disconnections)
        self.send("Intruder", message_id=2, connection=2)
        self.ble.disconnect(2)
        self.poll(receiver, 3000)
        self.assertEqual(len(self.panel.show_calls), before)
        self.send("Owner", message_id=1)
        self.poll(receiver, 6000)
        self.assertIn(b"shown:1", self.ble.statuses())
        self.assertNotIn(b"shown:2", self.ble.statuses())

    def test_flood_keeps_receive_queue_bounded_and_does_not_refresh_in_irq(self):
        receiver = self.receiver()
        before = len(self.panel.show_calls)
        for number in range(100):
            self.ble.packet(bytes((1, number % 256, 1)))
        self.assertLessEqual(len(receiver._queue), 16)
        self.assertEqual(len(self.panel.show_calls), before)
        self.poll(receiver, 3000)
        self.assertEqual(len(self.panel.show_calls), before)
        self.send("After flood", message_id=200)
        self.poll(receiver, 6000)
        self.assertIn(b"shown:200", self.ble.statuses())

    def test_one_poll_never_performs_multiple_physical_refreshes(self):
        receiver = self.receiver()
        before = len(self.panel.show_calls)
        self.send("First", message_id=1)
        self.send("Second", message_id=2)
        self.poll(receiver, 3000)
        self.assertLessEqual(len(self.panel.show_calls), before + 1)

    def test_refresh_spacing_starts_after_completion_and_survives_ticks_wrap(self):
        receiver = self.receiver()
        self.panel.show_duration = 6000
        self.send("First", message_id=1)
        first_start = self.clock.PERIOD - 1000
        self.poll(receiver, first_start)
        self.assertIn(b"shown:1", self.ble.statuses())
        before = len(self.panel.show_calls)
        self.send("Second", message_id=2)
        completed = first_start + 6000
        self.poll(receiver, completed + 1999)
        self.assertEqual(len(self.panel.show_calls), before)
        self.poll(receiver, completed + 2000)
        self.assertEqual(len(self.panel.show_calls), before + 1)
        self.assertIn(b"shown:2", self.ble.statuses())

    def test_new_begin_while_frame_waits_for_refresh_spacing_is_busy_and_preserves_frame(self):
        receiver = self.receiver()
        self.send("First", message_id=1)
        self.poll(receiver, 3000)
        self.send("Waiting frame", message_id=2)
        self.poll(receiver, 4000)
        self.send("Must not replace it", message_id=3)
        self.poll(receiver, 4100)
        self.poll(receiver, 5000)
        self.assertIn(b"shown:2", self.ble.statuses())
        self.assertIn(b"busy:3", self.ble.statuses())
        self.assertNotIn(b"shown:3", self.ble.statuses())

    def test_refresh_failure_reports_error_without_shown_success(self):
        receiver = self.receiver()
        self.send("Will fail", message_id=4)
        self.panel.show_error = OSError("panel BUSY timeout")
        with self.assertRaisesRegex(OSError, "panel BUSY timeout"):
            self.poll(receiver, 3000)
        self.assertIn(b"error:4", self.ble.statuses())
        self.assertNotIn(b"shown:4", self.ble.statuses())
        before = len(self.panel.show_calls)
        self.panel.show_error = None
        self.poll(receiver, 6000)
        self.assertEqual(len(self.panel.show_calls), before, "A failed physical refresh must not retry automatically")

    def test_departing_sender_failure_is_not_acknowledged_to_a_new_central(self):
        receiver = self.receiver()
        self.send("Old sender text", message_id=8)

        def reconnect_during_refresh():
            self.ble.disconnect(1)
            self.ble.connect(2)

        self.panel.on_show = reconnect_during_refresh
        self.panel.show_error = OSError("refresh failed after reconnect")
        with self.assertRaises(OSError):
            self.poll(receiver, 3000)
        self.assertNotIn((2, self.ble.STATUS_HANDLE, b"error:8"), self.ble.notifications)
        self.assertNotIn((2, self.ble.STATUS_HANDLE, b"shown:8"), self.ble.notifications)

    def test_close_disconnects_stops_advertising_and_disables_bluetooth(self):
        receiver = self.receiver()
        receiver.close()
        self.assertIn(1, self.ble.disconnections)
        self.assertTrue(any(interval is None for interval, _ in self.ble.advertisements))
        self.assertEqual(self.ble.active_calls[-1], False)

    def test_usb_fallback_draws_once_without_initializing_bluetooth_or_sleeping(self):
        factory = Mock(side_effect=AssertionError("USB fallback must not initialize BLE"))
        self.module.bluetooth = types.SimpleNamespace(BLE=factory)
        with patch("builtins.print") as output:
            self.module.run("Hello over USB", use_bluetooth=False)
        factory.assert_not_called()
        self.assertEqual(self.ble.active_calls, [])
        self.assertEqual(len(self.panel.show_calls), 1)
        self.assertEqual(self.clock.now, 0)
        labels = [args[0] for action, args in self.panel.calls if action == "text"]
        self.assertIn("Hello over USB", labels)
        self.assertNotIn("Hello over USB", str(output.call_args_list))

    def test_usb_fallback_works_when_firmware_has_no_bluetooth_module(self):
        self.module.bluetooth = None
        with patch("builtins.print"):
            self.module.run("Offline", use_bluetooth=False)
        self.assertEqual(len(self.panel.show_calls), 1)
        self.assertEqual(self.ble.active_calls, [])

    def test_run_rejects_bad_message_or_session_before_constructing_display_or_ble(self):
        panel_factory = Mock(return_value=self.panel)
        self.module.CrowPanel = panel_factory
        for kwargs in ({"initial_message": ""}, {"initial_message": "\U0001f600"},
                       {"initial_message": "line\rbreak"}, {"session_ms": 999},
                       {"session_ms": 300001}, {"session_ms": True},
                       {"session_ms": 1000.0}, {"session_ms": None}):
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                self.module.run(**kwargs)
        panel_factory.assert_not_called()
        self.assertEqual(self.ble.active_calls, [])

    def test_run_session_deadline_survives_ticks_wrap_and_always_stops_the_radio(self):
        self.clock.now = self.clock.PERIOD - 100
        started = self.clock.now
        with patch.object(self.module.os, "urandom", return_value=b"\xAB\xC1\x23"), patch("builtins.print") as output:
            self.module.run(session_ms=1000)
        self.assertEqual(self.clock.now - started, 1000)
        self.assertEqual(self.ble.active_calls[-1], False)
        self.assertTrue(any(interval is None for interval, _ in self.ble.advertisements))
        self.assertIn("Run in RAM again", str(output.call_args_list))
        self.assertEqual(len(self.panel.show_calls), 1)

    def test_initially_held_back_must_release_before_a_debounced_press_ends_session(self):
        self.panel.back.value = lambda: int(60 <= self.clock.now < 80)
        self.panel.on_show = lambda: self.ble.connect()
        with patch("builtins.print"):
            self.module.run(session_ms=1000)
        self.assertEqual(self.clock.now, 120)
        self.assertIn(1, self.ble.disconnections)
        self.assertEqual(self.ble.active_calls[-1], False)

    def test_ctrl_c_during_session_disconnects_and_disables_radio(self):
        self.panel.on_show = lambda: self.ble.connect()

        def interrupt():
            if self.clock.now >= 40:
                raise KeyboardInterrupt("user stopped the receiver")

        self.clock.sleep_hook = interrupt
        with patch("builtins.print"), self.assertRaises(KeyboardInterrupt):
            self.module.run(session_ms=1000)
        self.assertIn(1, self.ble.disconnections)
        self.assertEqual(self.ble.active_calls[-1], False)

    def test_initial_display_failure_cleans_up_the_new_bluetooth_receiver(self):
        self.panel.on_show = lambda: self.ble.connect()
        self.panel.show_error = OSError("initial refresh failed")
        with patch("builtins.print"), self.assertRaisesRegex(OSError, "initial refresh failed"):
            self.module.run(session_ms=1000)
        self.assertIn(1, self.ble.disconnections)
        self.assertEqual(self.ble.active_calls[-1], False)

    def test_received_display_failure_cleans_up_and_never_reports_message_shown(self):
        self.panel.on_show = lambda: self.ble.connect()

        def enqueue_after_startup():
            self.clock.sleep_hook = None
            self.send("Private display text", message_id=7)
            self.panel.show_error = OSError("message refresh failed")

        self.clock.sleep_hook = enqueue_after_startup
        with patch("builtins.print") as output, self.assertRaisesRegex(OSError, "message refresh failed"):
            self.module.run(session_ms=3000)
        self.assertIn(b"error:7", self.ble.statuses())
        self.assertNotIn(b"shown:7", self.ble.statuses())
        self.assertNotIn("Private display text", str(output.call_args_list))
        self.assertIn(1, self.ble.disconnections)
        self.assertEqual(self.ble.active_calls[-1], False)


if __name__ == "__main__":
    unittest.main()
