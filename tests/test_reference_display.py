import contextlib
import importlib.util
import io
from pathlib import Path
import types
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]


class Clock:
    PERIOD = 1 << 30

    def __init__(self):
        self.start = 0
        self.elapsed = 0

    def ticks_ms(self):
        return (self.start + self.elapsed) % self.PERIOD

    def ticks_diff(self, newer, older):
        return (newer - older + self.PERIOD // 2) % self.PERIOD - self.PERIOD // 2

    def sleep_ms(self, duration):
        self.elapsed += duration


class ReferenceDisplayTests(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.pins = {}
        self.events = []
        self.transactions = []
        self.spi_config = None
        self.refresh_at = None
        self.behaviors = ["complete", "complete"]
        self.interrupt = None
        self.output = io.StringIO()
        owner = self

        class Pin:
            IN = 0
            OUT = 1

            def __init__(self, number, mode=None, value=None):
                self.number = number
                self.mode = mode
                self.level = value
                owner.pins[number] = self
                owner.events.append((owner.clock.elapsed, number, value))

            def value(self, value=None):
                if value is not None:
                    self.level = value
                    owner.events.append((owner.clock.elapsed, self.number, value))
                    return
                if self.number != 9 or owner.refresh_at is None:
                    return self.level
                elapsed = owner.clock.elapsed - owner.refresh_at
                if owner.interrupt == "assertion":
                    raise KeyboardInterrupt
                if owner.interrupt == "completion" and elapsed >= 3:
                    raise KeyboardInterrupt
                behavior = owner.behaviors[owner.refresh_count() - 1]
                if behavior == "never":
                    return 1
                if behavior == "stuck":
                    return 0
                if behavior == "late-stuck":
                    return 0 if elapsed >= 14999 else 1
                return 0 if 3 <= elapsed < 8 else 1

        class SPI:
            MSB = 0

            def __init__(self, bus, **config):
                owner.spi_config = (bus, config)

            def write(self, data):
                if owner.pins[14].level != 0:
                    raise AssertionError("SPI write without selected CS")
                if owner.pins[13].level == 0:
                    owner.transactions.append([data[0], bytearray()])
                else:
                    owner.transactions[-1][1].extend(data)
                    if owner.transactions[-1][0] == 0x17:
                        owner.refresh_at = owner.clock.elapsed

        self.machine = types.SimpleNamespace(Pin=Pin, SPI=SPI)
        spec = importlib.util.spec_from_file_location(
            "reference_under_test", ROOT / "device/diagnostics/jd79661_reference.py",
        )
        self.sample = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.sample)
        self.context = contextlib.ExitStack()
        self.addCleanup(self.context.close)
        self.context.enter_context(patch.dict("sys.modules", {"machine": self.machine}))
        self.context.enter_context(patch.object(self.sample, "time", self.clock))
        self.context.enter_context(contextlib.redirect_stdout(self.output))

    def refresh_count(self):
        return sum(command == 0x17 for command, _ in self.transactions)

    def test_exact_reference_protocol_and_successful_power_lifecycle(self):
        self.sample.run()
        initial = [
            (0x00, b"\xf7\x8a"), (0x01, b"\x03\x00\x3f\x3f\x03"),
            (0x03, b"\x00"), (0x06, b"\x27\x27\x2f"), (0x30, b"\x0d"),
            (0x60, b"\x22"), (0x82, b"\x07"), (0xE3, b"\x88"),
            (0x41, b"\x00"), (0x61, b"\x80\x00\xfa"),
            (0x65, b"\x00\x00\x00"), (0x50, b"\xb7"),
        ]
        normal = []
        alternate = []
        for register, alternate_register, waveform in [
            (0x20, 0x20, 0x00), (0x21, 0x21, 0x60), (0x24, 0x24, 0x90),
            (0x22, 0x23, 0x20), (0x23, 0x22, 0x10),
        ]:
            payload = bytes([1, waveform, 20, 20, 1, 0, 0, 1] + [0] * 48)
            normal.append((register, payload))
            alternate.append((alternate_register, payload))
        pattern = (b"\x00" * 8 + b"\xff" * 8) * 125
        pattern += (b"\xff" * 8 + b"\x00" * 7 + b"\x3f") * 125
        expected = initial + [(0x10, b"\xff" * 4000), (0x13, b"\xff" * 4000)]
        expected += normal + [(0x17, b"\xa5"), (0x50, b"\xd7"), (0x13, pattern)]
        expected += alternate + [(0x17, b"\xa5"), (0x07, b"\xa5")]
        self.assertEqual([(command, bytes(data)) for command, data in self.transactions], expected)
        self.assertEqual(self.pins[7].level, 1)
        power_on = next(at for at, pin, value in self.events if pin == 7 and value == 1)
        reset = [(at - power_on, value) for at, pin, value in self.events if pin == 10]
        self.assertEqual(reset[-3:], [(200, 1), (210, 0), (310, 1)])
        self.assertEqual(self.clock.elapsed, 446)
        bus, config = self.spi_config
        self.assertEqual(bus, 2)
        for key, value in {
            "baudrate": 4000000, "polarity": 0, "phase": 0,
            "bits": 8, "firstbit": self.machine.SPI.MSB, "miso": None,
        }.items():
            self.assertEqual(config[key], value)
        self.assertEqual((config["sck"].number, config["mosi"].number), (12, 11))
        self.assertEqual(self.pins[9].mode, self.machine.Pin.IN)
        output = self.output.getvalue()
        for label in ("clear", "pattern"):
            self.assertIn(label + ": BUSY asserted", output)
            self.assertIn(label + ": BUSY completed", output)
        self.assertIn("Physical display check required", output)
        self.assertIn("GPIO7 left HIGH", output)

    def test_explicit_bitbang_matches_vendor_pins_bits_and_per_byte_cs(self):
        bus = self.sample._Transport("bitbang")
        self.events.clear()
        bus.command(0xA5, b"\x81\x42")
        expected = []
        for value, command in ((0xA5, True), (0x81, False), (0x42, False)):
            expected += [(13, 0 if command else 1), (14, 0)]
            for shift in range(7, -1, -1):
                expected += [(12, 0), (11, (value >> shift) & 1), (12, 1)]
            expected += [(14, 1), (13, 1)]
        self.assertEqual([(pin, value) for _, pin, value in self.events], expected)
        self.assertIsNone(self.spi_config)
        self.assertEqual(set(self.pins), {9, 10, 11, 12, 13, 14})

    def assert_failed_refresh(self, behavior, message, completed=0):
        self.behaviors = ["complete"] * completed + [behavior]
        with self.assertRaisesRegex(OSError, message):
            self.sample.run()
        self.assertEqual(self.refresh_count(), completed + 1)
        self.assertNotIn(0x07, [command for command, _ in self.transactions])
        self.assertEqual(self.pins[7].level, 0)
        self.assertEqual(self.clock.elapsed, 410 + completed * 8 + 15000)
        self.assertNotIn("GPIO7 left HIGH", self.output.getvalue())

    def test_never_asserted_busy_times_out_without_pattern_or_sleep(self):
        self.assert_failed_refresh("never", "clear.*assert")
        self.assertEqual(sum(command == 0x13 for command, _ in self.transactions), 1)
        self.assertNotIn("BUSY completed", self.output.getvalue())

    def test_stuck_active_busy_times_out_without_sleep(self):
        self.assert_failed_refresh("stuck", "clear.*complet")
        self.assertIn("clear: BUSY asserted", self.output.getvalue())
        self.assertNotIn("clear: BUSY completed", self.output.getvalue())

    def test_second_refresh_failure_does_not_sleep_or_report_completion(self):
        self.assert_failed_refresh("never", "pattern.*assert", completed=1)
        self.assertIn("clear: BUSY completed", self.output.getvalue())
        self.assertNotIn("pattern: BUSY completed", self.output.getvalue())

    def test_completion_gets_its_own_fifteen_second_budget_after_late_assertion(self):
        self.behaviors = ["late-stuck"]
        with self.assertRaisesRegex(OSError, "clear.*completion"):
            self.sample.run()
        self.assertEqual(self.clock.elapsed, 410 + 14999 + 15000)
        self.assertIn("clear: BUSY asserted after 14999 ms", self.output.getvalue())
        self.assertEqual(self.pins[7].level, 0)
        self.assertEqual(self.refresh_count(), 1)
        self.assertNotIn(0x07, [command for command, _ in self.transactions])

    def test_assertion_and_completion_timeouts_survive_ticks_wrap(self):
        for behavior in ("never", "stuck"):
            with self.subTest(behavior=behavior):
                self.clock.start = self.clock.PERIOD - 1000 - self.clock.elapsed
                before = self.clock.elapsed
                self.behaviors = [behavior] * 4
                with self.assertRaises(OSError):
                    self.sample.run()
                self.assertEqual(self.clock.elapsed - before, 15410)
                self.assertEqual(self.pins[7].level, 0)

    def test_successful_handshakes_survive_ticks_wrap(self):
        self.clock.start = self.clock.PERIOD - 414
        self.sample.run()
        self.assertEqual(self.pins[7].level, 1)
        self.assertIn("pattern: BUSY completed", self.output.getvalue())

    def test_keyboard_interrupt_during_either_wait_cuts_power_without_sleep(self):
        for phase in ("assertion", "completion"):
            with self.subTest(phase=phase):
                self.interrupt = phase
                self.refresh_at = None
                self.transactions.clear()
                with self.assertRaises(KeyboardInterrupt):
                    self.sample.run()
                self.assertEqual(self.pins[7].level, 0)
                self.assertNotIn(0x07, [command for command, _ in self.transactions])

    def test_spi_setup_error_cuts_power_without_protocol_fallback(self):
        self.machine.SPI = unittest.mock.Mock(side_effect=OSError("SPI unavailable"))
        with self.assertRaisesRegex(OSError, "SPI unavailable"):
            self.sample.run()
        self.assertEqual(self.pins[7].level, 0)
        self.assertEqual(self.transactions, [])

    def test_unknown_transport_is_rejected_before_touching_pins(self):
        with self.assertRaises(ValueError):
            self.sample.run(transport="auto")
        self.assertEqual(self.pins, {})


if __name__ == "__main__":
    unittest.main()
