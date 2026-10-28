"""CrowPanel 2.13-inch SSD1680 and JD79661 full-refresh drivers."""

import time


WHITE = 1
BLACK = 0
WIDTH = 250
HEIGHT = 122
STRIDE = 256
BUSY_TIMEOUT_MS = 15000
REFRESH_INTERVAL_MS = 2000


def native_buffer(landscape, reverse_x=True):
    """Map MSB-first landscape pixels into white-padded 128 by 250 RAM."""
    if len(landscape) != STRIDE // 8 * HEIGHT:
        raise ValueError("Expected a 250 by 122 bitmap with a 256-pixel stride")
    native = bytearray(b"\xff" * 4000)
    for landscape_y in range(HEIGHT):
        source_row = landscape_y * (STRIDE // 8)
        native_mask = 0x80 >> (landscape_y & 7)
        native_column = landscape_y >> 3
        for landscape_x in range(WIDTH):
            if not landscape[source_row + (landscape_x >> 3)] & (0x80 >> (landscape_x & 7)):
                native_row = WIDTH - 1 - landscape_x if reverse_x else landscape_x
                native[native_row * 16 + native_column] &= 255 ^ native_mask
    return native


class CrowPanel:
    """A 250 by 122 monochrome canvas with active-low button Pin objects."""

    WIDTH = WIDTH
    HEIGHT = HEIGHT
    WHITE = WHITE
    BLACK = BLACK
    SUPPORTS_WAIT_CALLBACK = True

    def __init__(self, controller="ssd1680"):
        if controller not in ("ssd1680", "jd79661"):
            raise ValueError("Controller must be 'ssd1680' or 'jd79661'; check your panel revision")
        import framebuf
        from machine import Pin, SPI

        self.controller = controller
        self._busy_level = 0 if controller == "jd79661" else 1
        self._lut_alternate = False
        self._refresh_pending = False
        self._framebuf = framebuf
        self.buffer = bytearray(b"\xff" * (STRIDE // 8 * HEIGHT))
        self._canvas = framebuf.FrameBuffer(self.buffer, WIDTH, HEIGHT, framebuf.MONO_HLSB, STRIDE)
        self.power = Pin(7, Pin.OUT, value=0)
        self.led = Pin(19, Pin.OUT, value=1)
        self._cs = Pin(14, Pin.OUT, value=1)
        self._dc = Pin(13, Pin.OUT, value=1)
        self._reset = Pin(10, Pin.OUT, value=1)
        self._busy = Pin(9, Pin.IN)
        self.up = Pin(6, Pin.IN, Pin.PULL_UP)
        self.down = Pin(4, Pin.IN, Pin.PULL_UP)
        self.dial = Pin(5, Pin.IN, Pin.PULL_UP)
        self.menu = Pin(2, Pin.IN, Pin.PULL_UP)
        self.back = Pin(1, Pin.IN, Pin.PULL_UP)
        self._spi = SPI(2, baudrate=4000000, polarity=0, phase=0, bits=8,
                        firstbit=SPI.MSB, sck=Pin(12), mosi=Pin(11), miso=None)
        self._last_refresh = None

    def fill(self, color=WHITE):
        self._canvas.fill(color)

    def text(self, message, x, y, color=BLACK):
        self._canvas.text(str(message), x, y, color)

    def rect(self, x, y, width, height, color=BLACK, fill=False):
        if fill:
            self._canvas.fill_rect(x, y, width, height, color)
        else:
            self._canvas.rect(x, y, width, height, color)

    def pixel(self, x, y, color=None):
        if color is None:
            return self._canvas.pixel(x, y)
        self._canvas.pixel(x, y, color)

    def image(self, data, width=250, height=100, x=0, y=0, stride=256):
        """Blit a white-is-one MONO_HLSB bitmap; stride is measured in pixels."""
        if not all(isinstance(value, int) for value in (width, height, stride)):
            raise ValueError("Image dimensions and stride must be integers")
        if width <= 0 or height <= 0 or stride < width or stride % 8:
            raise ValueError("Image stride must be byte-aligned and cover its positive width")
        if len(data) != stride // 8 * height:
            raise ValueError("Image data does not match its dimensions and stride")
        bitmap = self._framebuf.FrameBuffer(bytearray(data), width, height,
                                           self._framebuf.MONO_HLSB, stride)
        self._canvas.blit(bitmap, x, y)

    def _write(self, data, command=False):
        self._dc.value(0 if command else 1)
        self._cs.value(0)
        try:
            self._spi.write(data)
        finally:
            self._cs.value(1)
            self._dc.value(1)

    def _command(self, command, data=None):
        self._write(bytes((command,)), command=True)
        if data is not None:
            self._write(data)

    def _pause(self, milliseconds, on_wait=None):
        if on_wait is None:
            time.sleep_ms(milliseconds)
            return
        remaining = milliseconds
        while remaining > 0:
            on_wait()
            interval = min(5, remaining)
            time.sleep_ms(interval)
            remaining -= interval

    def _wait_busy(self, on_wait=None):
        started = time.ticks_ms()
        while self._busy.value() == self._busy_level:
            if on_wait is not None:
                on_wait()
            if time.ticks_diff(time.ticks_ms(), started) >= BUSY_TIMEOUT_MS:
                level = "low" if self._busy_level == 0 else "high"
                raise OSError("{} BUSY stayed {} for 15 seconds; check controller selection, panel and wiring".format(
                    self.controller.upper(), level))
            time.sleep_ms(10)
        time.sleep_us(100)

    def _initialize(self, on_wait=None):
        self._pause(100, on_wait)
        self._reset.value(1)
        self._pause(10, on_wait)
        self._reset.value(0)
        self._pause(100 if self.controller == "jd79661" else 10, on_wait)
        self._reset.value(1)
        self._pause(100 if self.controller == "jd79661" else 10, on_wait)
        self._wait_busy(on_wait)
        if self.controller == "jd79661":
            self._initialize_jd79661()
            return
        self._command(0x12)
        self._wait_busy(on_wait)
        self._command(0x01, b"\xf9\x00\x00")
        self._command(0x11, b"\x03")
        self._command(0x44, b"\x00\x0f")
        self._command(0x45, b"\x00\x00\xf9\x00")
        self._command(0x3C, b"\x01")
        self._wait_busy(on_wait)
        self._command(0x18, b"\x80")
        self._command(0x4E, b"\x00")
        self._command(0x4F, b"\x00\x00")
        self._wait_busy(on_wait)

    def _initialize_jd79661(self):
        for command, data in (
            (0x00, b"\xf7\x8a"), (0x01, b"\x03\x00\x3f\x3f\x03"),
            (0x03, b"\x00"), (0x06, b"\x27\x27\x2f"),
            (0x30, b"\x0d"), (0x60, b"\x22"), (0x82, b"\x07"),
            (0xE3, b"\x88"), (0x41, b"\x00"), (0x61, b"\x80\x00\xfa"),
            (0x65, b"\x00\x00\x00"), (0x50, b"\xb7"),
        ):
            self._command(command, data)

    def _write_jd79661(self, bitmap):
        self._command(0x50, b"\xd7")
        self._command(0x13, bitmap)
        commands = (0x20, 0x21, 0x24, 0x23, 0x22) if self._lut_alternate else (0x20, 0x21, 0x24, 0x22, 0x23)
        for command, waveform in zip(commands, (0x00, 0x60, 0x90, 0x20, 0x10)):
            self._command(command, bytes((0x01, waveform, 0x14, 0x14, 0x01, 0x00, 0x00, 0x01)) + bytes(48))
        self._lut_alternate = not self._lut_alternate

    def _wait_jd79661_refresh(self, on_wait=None):
        started = time.ticks_ms()
        while self._busy.value() != self._busy_level:
            if on_wait is not None:
                on_wait()
            if time.ticks_diff(time.ticks_ms(), started) >= 1000:
                raise OSError("JD79661 refresh did not assert BUSY; check controller selection, panel and SPI connection")
            time.sleep_ms(1)
        self._wait_busy(on_wait)
        self._refresh_pending = False

    def _sleep(self, wait, on_wait=None):
        if self.controller == "jd79661":
            try:
                if not self._refresh_pending and self._busy.value() != self._busy_level:
                    self._command(0x07, b"\xa5")
                    self._pause(20, on_wait)
            finally:
                self.power.value(0)
            return
        try:
            self._command(0x22, b"\x83")
            self._command(0x20)
            if wait:
                self._wait_busy(on_wait)
        finally:
            try:
                self._command(0x10, b"\x01")
                self._command(0x3C, b"\x01")
                self._pause(20, on_wait)
            finally:
                self.power.value(0)

    def show(self, on_wait=None):
        """Full refresh; optionally collect inputs during waits, without drawing."""
        if self._last_refresh is not None:
            elapsed = time.ticks_diff(time.ticks_ms(), self._last_refresh)
            if elapsed < REFRESH_INTERVAL_MS:
                self._pause(REFRESH_INTERVAL_MS - elapsed, on_wait)
        bitmap = native_buffer(self.buffer, reverse_x=self.controller == "ssd1680")
        try:
            self.power.value(1)
            self._initialize(on_wait)
            if self.controller == "jd79661":
                self._write_jd79661(bitmap)
            else:
                self._command(0x3C, b"\x01")
                self._command(0x24, bitmap)
            self._last_refresh = time.ticks_ms()
            if self.controller == "jd79661":
                self._refresh_pending = True
                self._command(0x17, b"\xa5")
                self._wait_jd79661_refresh(on_wait)
            else:
                self._command(0x22, b"\xf4")
                self._command(0x20)
                self._wait_busy(on_wait)
        except BaseException:
            try:
                self._sleep(False)
            except BaseException:
                pass
            raise
        else:
            self._sleep(True, on_wait)
