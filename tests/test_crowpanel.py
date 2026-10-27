import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("crowpanel", ROOT / "device" / "crowpanel.py")
crowpanel = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(crowpanel)


class FakeClock:
    PERIOD = 1 << 30

    def __init__(self):
        self.microseconds = 0
        self.sleeps = []

    def ticks_ms(self):
        return (self.microseconds // 1000) % self.PERIOD

    def ticks_diff(self, newer, older):
        return (newer - older + self.PERIOD // 2) % self.PERIOD - self.PERIOD // 2

    def sleep_ms(self, milliseconds):
        self.sleeps.append(milliseconds)
        self.microseconds += milliseconds * 1000

    def sleep_us(self, microseconds):
        self.microseconds += microseconds


class FakeFrameBuffer:
    def __init__(self, buffer, width, height, format, stride=None):
        self.buffer = buffer
        self.width = width
        self.height = height
        self.stride = stride or width
        self.format = format
        self.text_calls = []

    def pixel(self, x, y, color=None):
        if not 0 <= x < self.width or not 0 <= y < self.height:
            return None
        offset = (y * self.stride + x) // 8
        mask = 0x80 >> (x % 8)
        if color is None:
            return int(bool(self.buffer[offset] & mask))
        if color:
            self.buffer[offset] |= mask
        else:
            self.buffer[offset] &= 255 ^ mask

    def fill(self, color):
        self.buffer[:] = bytes([255 if color else 0]) * len(self.buffer)

    def text(self, message, x, y, color):
        self.text_calls.append((message, x, y, color))

    def rect(self, x, y, width, height, color):
        for offset in range(width):
            self.pixel(x + offset, y, color)
            self.pixel(x + offset, y + height - 1, color)
        for offset in range(height):
            self.pixel(x, y + offset, color)
            self.pixel(x + width - 1, y + offset, color)

    def fill_rect(self, x, y, width, height, color):
        for offset_y in range(height):
            for offset_x in range(width):
                self.pixel(x + offset_x, y + offset_y, color)

    def blit(self, bitmap, x, y):
        for source_y in range(bitmap.height):
            for source_x in range(bitmap.width):
                self.pixel(x + source_x, y + source_y, bitmap.pixel(source_x, source_y))


class NativeBufferTests(unittest.TestCase):
    def test_white_stays_white_and_input_is_not_modified(self):
        source = b"\xff" * 3904
        self.assertEqual(crowpanel.native_buffer(source), b"\xff" * 4000)
        self.assertEqual(source, b"\xff" * 3904)

    def test_each_corner_has_the_required_rotation_and_msb_bit_order(self):
        for landscape_x, landscape_y, native_offset, mask in [
            (0, 0, 3984, 0x80),
            (249, 0, 0, 0x80),
            (0, 121, 3999, 0x40),
            (249, 121, 15, 0x40),
            (125, 64, 1992, 0x80),
        ]:
            with self.subTest(position=(landscape_x, landscape_y)):
                source = bytearray(b"\xff" * 3904)
                source[landscape_y * 32 + landscape_x // 8] &= 255 ^ (0x80 >> (landscape_x % 8))
                snapshot = bytes(source)
                expected = bytearray(b"\xff" * 4000)
                expected[native_offset] &= 255 ^ mask
                self.assertEqual(crowpanel.native_buffer(source), expected)
                self.assertEqual(source, snapshot)

    def test_black_visible_area_keeps_six_native_padding_pixels_white(self):
        native = crowpanel.native_buffer(b"\x00" * 3904)
        for row in range(250):
            self.assertEqual(native[row * 16:row * 16 + 16], b"\x00" * 15 + b"\x3f")

    def test_landscape_padding_never_becomes_visible(self):
        source = bytearray(b"\xff" * 3904)
        for row in range(122):
            source[row * 32 + 31] = 0xC0
        self.assertEqual(crowpanel.native_buffer(source), b"\xff" * 4000)

    def test_invalid_buffer_lengths_are_rejected(self):
        for length in (0, 3200, 3903, 3905, 4000):
            with self.subTest(length=length), self.assertRaises(ValueError):
                crowpanel.native_buffer(bytes(length))


class PanelTests(unittest.TestCase):
    def setUp(self):
        self.clock = FakeClock()
        self.pins = {}
        self.transfers = []
        self.fail_write = None
        self.on_command = None
        owner = self

        class Pin:
            IN = 0
            OUT = 1
            PULL_UP = 2

            def __init__(self, number, mode=None, pull=None, value=None):
                self.number = number
                self.mode = mode
                self.pull = pull
                self.level = value if value is not None else int(pull == self.PULL_UP)
                self.history = []
                self.read = None
                owner.pins[number] = self

            def value(self, value=None):
                if value is None:
                    return self.read() if self.read else self.level
                self.level = value
                self.history.append((owner.clock.ticks_ms(), value))

        class SPI:
            MSB = 0

            def __init__(self, bus, **settings):
                self.bus = bus
                self.settings = settings

            def write(self, data):
                owner.assertEqual(owner.pins[14].level, 0)
                owner.assertEqual(owner.pins[7].level, 1)
                command = owner.pins[13].level == 0
                owner.transfers.append((command, bytes(data), owner.clock.ticks_ms()))
                if owner.fail_write and owner.fail_write(command, bytes(data)):
                    raise OSError("SPI failed")
                if command and owner.on_command:
                    owner.on_command(bytes(data))

        self.machine = types.SimpleNamespace(Pin=Pin, SPI=SPI)
        self.framebuf = types.SimpleNamespace(MONO_HLSB=3, FrameBuffer=FakeFrameBuffer)
        self.modules = patch.dict(sys.modules, {"machine": self.machine, "framebuf": self.framebuf})
        self.modules.start()
        self.addCleanup(self.modules.stop)
        self.timer = patch.object(crowpanel, "time", self.clock)
        self.timer.start()
        self.addCleanup(self.timer.stop)
        self.panel = crowpanel.CrowPanel()

    def command_sequence(self):
        result = []
        for command, data, timestamp in self.transfers:
            if command:
                result.append([data[0], bytearray(), timestamp])
            else:
                result[-1][1].extend(data)
        return [(command, bytes(data)) for command, data, _ in result]

    def test_pins_spi_buttons_and_idle_power_match_the_board(self):
        for attribute, number in (("up", 6), ("down", 4), ("dial", 5), ("menu", 2), ("back", 1)):
            button = getattr(self.panel, attribute)
            self.assertIs(button, self.pins[number])
            self.assertEqual(button.mode, self.machine.Pin.IN)
            self.assertEqual(button.pull, self.machine.Pin.PULL_UP)
            self.assertEqual(button.value(), 1)
            button.value(0)
            self.assertEqual(button.value(), 0)
        self.assertEqual(self.panel._spi.bus, 2)
        self.assertEqual(self.panel._spi.settings["sck"].number, 12)
        self.assertEqual(self.panel._spi.settings["mosi"].number, 11)
        self.assertIsNone(self.panel._spi.settings["miso"])
        self.assertEqual(self.panel._spi.settings["polarity"], 0)
        self.assertEqual(self.panel._spi.settings["phase"], 0)
        self.assertEqual(self.panel._spi.settings["firstbit"], self.machine.SPI.MSB)
        self.assertEqual(self.pins[7].level, 0)
        self.assertEqual(self.pins[19].level, 0)
        self.assertEqual(self.transfers, [])
        self.assertEqual(self.panel.buffer, b"\xff" * 3904)

    def test_complete_vendor_initialization_refresh_and_sleep_protocol(self):
        self.panel.pixel(249, 0, crowpanel.BLACK)
        self.panel.show()
        native = bytearray(b"\xff" * 4000)
        native[0] = 0x7F
        self.assertEqual(self.command_sequence(), [
            (0x12, b""), (0x01, b"\xf9\x00\x00"), (0x11, b"\x03"),
            (0x44, b"\x00\x0f"), (0x45, b"\x00\x00\xf9\x00"),
            (0x3C, b"\x01"), (0x18, b"\x80"), (0x4E, b"\x00"),
            (0x4F, b"\x00\x00"), (0x3C, b"\x01"), (0x24, bytes(native)),
            (0x22, b"\xf4"), (0x20, b""), (0x22, b"\x83"), (0x20, b""),
            (0x10, b"\x01"), (0x3C, b"\x01"),
        ])
        self.assertEqual(self.pins[10].history, [(100, 1), (110, 0), (120, 1)])
        self.assertEqual(self.pins[7].level, 0)
        self.assertEqual(self.pins[14].level, 1)
        self.assertEqual(self.pins[13].level, 1)

    def test_full_refreshes_are_at_least_two_seconds_apart(self):
        self.panel.show()
        first = self.panel._last_refresh
        self.panel.show()
        second = self.panel._last_refresh
        self.assertGreaterEqual(self.clock.ticks_diff(second, first), 2000)
        self.assertEqual(sum(command == 0x12 for command, _ in self.command_sequence()), 2)
        self.assertEqual(self.pins[7].level, 0)

    def test_refresh_interval_handles_tick_wraparound(self):
        self.clock.microseconds = (self.clock.PERIOD - 500) * 1000
        self.panel.show()
        first = self.panel._last_refresh
        self.panel.show()
        self.assertLess(self.panel._last_refresh, first)
        self.assertGreaterEqual(self.clock.ticks_diff(self.panel._last_refresh, first), 2000)

    def test_busy_high_is_waited_on_until_low(self):
        self.pins[9].read = lambda: int(self.clock.ticks_ms() < 180)
        self.panel.show()
        self.assertGreaterEqual(self.transfers[0][2], 180)
        self.assertEqual(self.pins[7].level, 0)

    def test_stuck_busy_times_out_and_still_sleeps_and_powers_off(self):
        self.pins[9].value(1)
        with self.assertRaisesRegex(OSError, "BUSY.*15 seconds"):
            self.panel.show()
        self.assertGreaterEqual(self.clock.ticks_ms(), 15000)
        self.assertLess(self.clock.ticks_ms(), 15200)
        self.assertEqual(self.command_sequence(), [
            (0x22, b"\x83"), (0x20, b""), (0x10, b"\x01"), (0x3C, b"\x01"),
        ])
        self.assertEqual(self.pins[7].level, 0)
        self.assertEqual(self.pins[14].level, 1)

    def test_refresh_busy_timeout_is_bounded_and_cuts_power(self):
        self.on_command = lambda data: self.pins[9].value(1) if data == b"\x20" else None
        with self.assertRaisesRegex(OSError, "BUSY"):
            self.panel.show()
        self.assertLess(self.clock.ticks_ms(), 15200)
        self.assertEqual(self.pins[7].level, 0)
        self.assertIn((0x10, b"\x01"), self.command_sequence())

    def test_busy_timeout_handles_tick_wraparound(self):
        self.clock.microseconds = (self.clock.PERIOD - 5000) * 1000
        started = self.clock.ticks_ms()
        self.pins[9].value(1)
        with self.assertRaisesRegex(OSError, "BUSY"):
            self.panel.show()
        elapsed = self.clock.ticks_diff(self.clock.ticks_ms(), started)
        self.assertGreaterEqual(elapsed, 15000)
        self.assertLess(elapsed, 15200)
        self.assertEqual(self.pins[7].level, 0)

    def test_poweroff_busy_timeout_still_enters_deep_sleep(self):
        activations = []

        def busy_on_poweroff(data):
            if data == b"\x20":
                activations.append(data)
                if len(activations) == 2:
                    self.pins[9].value(1)

        self.on_command = busy_on_poweroff
        with self.assertRaisesRegex(OSError, "BUSY"):
            self.panel.show()
        self.assertIn((0x10, b"\x01"), self.command_sequence())
        self.assertEqual(self.pins[7].level, 0)

    def test_spi_failure_and_keyboard_interrupt_cannot_leave_panel_powered(self):
        self.fail_write = lambda command, data: not command and len(data) == 4000
        with self.assertRaisesRegex(OSError, "SPI failed"):
            self.panel.show()
        self.assertEqual(self.pins[7].level, 0)
        self.assertEqual(self.pins[14].level, 1)

        def interrupt(data):
            if data == b"\x24":
                raise KeyboardInterrupt()

        self.fail_write = None
        self.on_command = interrupt
        with self.assertRaises(KeyboardInterrupt):
            self.panel.show()
        self.assertEqual(self.pins[7].level, 0)
        self.assertEqual(self.pins[14].level, 1)

    def test_failure_during_shutdown_still_releases_chip_select_and_power(self):
        self.fail_write = lambda command, data: command and data in (b"\x22", b"\x10")
        with self.assertRaisesRegex(OSError, "SPI failed"):
            self.panel.show()
        self.assertEqual(self.pins[7].level, 0)
        self.assertEqual(self.pins[14].level, 1)
        self.assertEqual(self.pins[13].level, 1)

    def test_canvas_colors_rectangles_pixels_and_text_defaults(self):
        self.panel.pixel(10, 20, crowpanel.BLACK)
        self.assertEqual(self.panel.pixel(10, 20), 0)
        self.panel.fill()
        self.assertEqual(self.panel.pixel(10, 20), 1)
        self.panel.rect(5, 5, 10, 10)
        self.assertEqual(self.panel.pixel(5, 5), 0)
        self.assertEqual(self.panel.pixel(6, 6), 1)
        self.panel.rect(20, 20, 10, 10, fill=True)
        self.assertEqual(self.panel.pixel(21, 21), 0)
        self.panel.rect(20, 20, 10, 10, crowpanel.WHITE, fill=True)
        self.assertEqual(self.panel.pixel(21, 21), 1)
        self.panel.text("Hello", 0, 100)
        self.assertEqual(self.panel._canvas.text_calls, [("Hello", 0, 100, crowpanel.BLACK)])

    def test_image_blits_msb_first_white_is_one_without_overwriting_footer(self):
        self.panel.fill(crowpanel.BLACK)
        image = bytearray(b"\xff" * 3200)
        image[0] = 0x7F
        image[-1] = 0x40
        self.panel.image(image)
        self.assertEqual(self.panel.pixel(0, 0), 0)
        self.assertEqual(self.panel.pixel(1, 0), 1)
        self.assertEqual(self.panel.pixel(248, 99), 0)
        self.assertEqual(self.panel.pixel(249, 99), 1)
        self.assertEqual(self.panel.pixel(1, 100), 0)
        self.assertEqual(image[0], 0x7F)

    def test_image_supports_custom_stride_position_and_clipping(self):
        self.panel.image(b"\x7f\xff\xbf\xff", width=2, height=2, stride=16, x=249, y=121)
        self.assertEqual(self.panel.pixel(249, 121), 0)
        self.panel.image(b"\x7f", width=2, height=1, stride=8, x=-1, y=0)
        self.assertEqual(self.panel.pixel(0, 0), 1)

    def test_invalid_image_shape_and_stride_fail_before_blitting(self):
        for arguments in (
            {"width": 0}, {"height": -1}, {"stride": 255}, {"stride": 248},
            {"width": 1.5}, {"height": "100"},
        ):
            with self.subTest(arguments=arguments), self.assertRaises(ValueError):
                self.panel.image(b"", **arguments)
        with self.assertRaises(ValueError):
            self.panel.image(bytes(3199))
        self.assertEqual(self.panel.buffer, b"\xff" * 3904)


if __name__ == "__main__":
    unittest.main()
