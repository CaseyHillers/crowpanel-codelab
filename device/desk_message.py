"""Bounded BLE desk messages. No Wi-Fi, pairing secrets or background service.

The service is intentionally unauthenticated: use non-private workshop text.
Only poll() touches the canvas; BLE callbacks only collect bounded packets.
"""

import os
import time
try:
    import bluetooth
except ImportError:
    bluetooth = None
from crowpanel import CrowPanel, WHITE

SERVICE_UUID = "8b5e4d20-6c8a-4b39-a7d8-3f2c91a65010"
RX_UUID = "8b5e4d20-6c8a-4b39-a7d8-3f2c91a65011"
STATUS_UUID = "8b5e4d20-6c8a-4b39-a7d8-3f2c91a65012"
MAX_MESSAGE_BYTES = 112
REFRESH_SPACING_MS = 2000


def layout_message(text):
    if not isinstance(text, str):
        raise ValueError("Use plain text for the desk message")
    text = text.replace("\r\n", "\n")
    if (not text.strip() or len(text) > MAX_MESSAGE_BYTES
            or any(char != "\n" and not 32 <= ord(char) <= 126 for char in text)):
        raise ValueError("Use 1-112 ASCII characters: letters, numbers, punctuation and newlines")
    lines = []
    for paragraph in text.split("\n"):
        while len(paragraph) > 28:
            split = paragraph.rfind(" ", 0, 29)
            if split > 0:
                lines.append(paragraph[:split])
                paragraph = paragraph[split:].lstrip(" ")
            else:
                lines.append(paragraph[:28])
                paragraph = paragraph[28:]
        lines.append(paragraph)
    if len(lines) > 4:
        raise ValueError("Message must fit four lines of 28 characters")
    return lines


def _draw(panel, name, lines, footer):
    panel.fill(WHITE)
    panel.text(name, 8, 8)
    panel.text("Your desk message", 8, 24)
    for index, line in enumerate(lines):
        panel.text(line, 8, 44 + index * 14)
    panel.text(footer, 8, 108)
    panel.show()


class MessageReceiver:
    def __init__(self, ble, panel, name="Desk-ABC123"):
        if bluetooth is None:
            raise RuntimeError("BLE is unavailable; set USE_BLUETOOTH=False for USB or ask a facilitator")
        if not name or len(name) > 20 or any(not 32 <= ord(char) <= 126 for char in name):
            raise ValueError("Use a short ASCII Bluetooth name")
        self.ble, self.panel, self.name = ble, panel, name
        self._queue = []
        self._central = None
        self._generation = 0
        self._pending = None
        self._last_refresh = None
        self._closed = False
        self._overflow = None
        self._clear_assembly()
        try:
            ble.active(True)
            service = (bluetooth.UUID(SERVICE_UUID), (
                (bluetooth.UUID(RX_UUID), bluetooth.FLAG_WRITE),
                (bluetooth.UUID(STATUS_UUID), bluetooth.FLAG_READ | bluetooth.FLAG_NOTIFY),
            ))
            ((self._rx, self._status_handle),) = ble.gatts_register_services((service,))
            ble.gatts_set_buffer(self._rx, 20, False)
            ble.gatts_write(self._status_handle, b"ready")
            ble.irq(self._irq)
            self._advertise()
        except BaseException:
            self.close()
            raise

    def _advertise(self):
        service = bytes(bluetooth.UUID(SERVICE_UUID))
        name = self.name.encode("utf-8")
        self.ble.gap_advertise(250000,
            adv_data=b"\x02\x01\x06" + bytes((len(service) + 1, 0x07)) + service,
            resp_data=bytes((len(name) + 1, 0x09)) + name)

    def _clear_assembly(self):
        self._message_id = None
        self._expected = 0
        self._buffer = bytearray()

    def _irq(self, event, data):
        if self._closed:
            return
        if event == 1:
            connection = data[0]
            if self._central is not None:
                self.ble.gap_disconnect(connection)
            else:
                self._central = connection
                self.ble.gatts_write(self._status_handle, b"ready")
        elif event == 2 and data[0] == self._central:
            self._central = None
            self._generation += 1
            self._queue.clear()
            self._overflow = None
            self._pending = None
            self._clear_assembly()
            self._advertise()
        elif event == 3 and data[0] == self._central and data[1] == self._rx:
            packet = bytes(self.ble.gatts_read(self._rx))
            if self._overflow is not None:
                return
            if len(self._queue) >= 16:
                self._queue.clear()
                self._overflow = packet[1] if len(packet) > 1 else 0
            else:
                self._queue.append(packet)

    def _status(self, kind, message_id):
        value = ("%s:%d" % (kind, message_id)).encode("utf-8")
        try:
            self.ble.gatts_write(self._status_handle, value)
            if self._central is not None:
                self.ble.gatts_notify(self._central, self._status_handle, value)
        except OSError:
            # A departing central cannot turn a completed refresh into a retry.
            pass

    def _reject(self, message_id):
        self._clear_assembly()
        self._status("error", message_id)

    def _packet(self, packet):
        message_id = packet[1] if len(packet) > 1 else (self._message_id or 0)
        if not 2 <= len(packet) <= 20:
            self._reject(message_id)
            return
        opcode = packet[0]
        if opcode == 1:
            if self._pending is not None:
                self._status("busy", message_id)
                return
            self._clear_assembly()
            if len(packet) != 3 or not 1 <= packet[2] <= MAX_MESSAGE_BYTES:
                self._reject(message_id)
                return
            self._message_id, self._expected = message_id, packet[2]
        elif opcode == 2:
            if (len(packet) < 3 or message_id != self._message_id
                    or len(self._buffer) + len(packet) - 2 > self._expected):
                self._reject(message_id)
                return
            self._buffer.extend(packet[2:])
        elif opcode == 3:
            if (len(packet) != 2 or message_id != self._message_id
                    or len(self._buffer) != self._expected):
                self._reject(message_id)
                return
            try:
                lines = layout_message(self._buffer.decode("utf-8"))
            except (UnicodeError, ValueError):
                self._reject(message_id)
                return
            self._pending = (message_id, lines, self._generation)
            self._clear_assembly()
        else:
            self._reject(message_id)

    def poll(self, now_ms=None):
        if self._closed:
            return
        if self._overflow is not None:
            message_id, self._overflow = self._overflow, None
            self._clear_assembly()
            self._status("error", message_id)
        for _ in range(len(self._queue)):
            if self._queue:
                self._packet(self._queue.pop(0))
        now_ms = time.ticks_ms() if now_ms is None else now_ms
        if (self._pending is None or (self._last_refresh is not None
                and time.ticks_diff(now_ms, self._last_refresh) < REFRESH_SPACING_MS)):
            return
        message_id, lines, generation = self._pending
        self._pending = None
        try:
            _draw(self.panel, self.name, lines, "Back: end session")
        except BaseException:
            if generation == self._generation and self._central is not None:
                self._status("error", message_id)
            raise
        self._last_refresh = time.ticks_ms()
        if generation == self._generation and self._central is not None:
            self._status("shown", message_id)

    def close(self):
        if self._closed:
            return
        self._closed = True
        for action in (lambda: self.ble.irq(None),
                       lambda: self.ble.gap_advertise(None),
                       lambda: self.ble.gap_disconnect(self._central) if self._central is not None else None,
                       lambda: self.ble.active(False)):
            try:
                action()
            except OSError:
                pass
        self._queue.clear()
        self._pending = None
        self._clear_assembly()
        self._central = None


def run(initial_message="Hello from my desk!", use_bluetooth=True, session_ms=300000):
    """Run in RAM for up to five minutes; Back/Ctrl-C closes BLE. USB fallback draws once."""
    if not isinstance(session_ms, int) or not 1000 <= session_ms <= 300000:
        raise ValueError("Session must be between one second and five minutes")
    lines = layout_message(initial_message)
    panel = CrowPanel(controller="jd79661")
    if not use_bluetooth:
        _draw(panel, "My desk display", lines, "Message sent over USB")
        print("USB message refresh completed; check the physical display.")
        return
    if bluetooth is None:
        raise RuntimeError("BLE is unavailable; set USE_BLUETOOTH=False for USB or ask a facilitator")
    name = "Desk-" + "".join("%02X" % byte for byte in os.urandom(3))
    receiver = MessageReceiver(bluetooth.BLE(), panel, name)
    try:
        _draw(panel, name, lines, "Choose this Bluetooth name")
        receiver._last_refresh = time.ticks_ms()
        print("Bluetooth ready. Choose", name, "in the browser. Back or Stop ends this five-minute session.")
        started = time.ticks_ms()
        released = panel.back.value() != 0
        pressed_at = None
        while time.ticks_diff(time.ticks_ms(), started) < session_ms:
            receiver.poll()
            if panel.back.value():
                released, pressed_at = True, None
            elif released:
                if pressed_at is None:
                    pressed_at = time.ticks_ms()
                elif time.ticks_diff(time.ticks_ms(), pressed_at) >= 30:
                    break
            time.sleep_ms(20)
    finally:
        receiver.close()
        print("Bluetooth session ended. Click Run in RAM again to receive more messages.")
