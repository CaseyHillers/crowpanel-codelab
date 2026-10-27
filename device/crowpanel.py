"""CrowPanel 2.13-inch SSD1680, following the vendor EPD_Init.cpp and spi.h."""

import time


WHITE = 1
BLACK = 0
WIDTH = 250
HEIGHT = 122
STRIDE = 256
BUSY_TIMEOUT_MS = 15000
REFRESH_INTERVAL_MS = 2000


def native_buffer(landscape):
    """Rotate MSB-first landscape pixels into white-padded 128 by 250 RAM."""
    if len(landscape) != STRIDE // 8 * HEIGHT:
        raise ValueError("Expected a 250 by 122 bitmap with a 256-pixel stride")
    native = bytearray(b"\xff" * 4000)
    for landscape_y in range(HEIGHT):
        source_row = landscape_y * (STRIDE // 8)
        native_mask = 0x80 >> (landscape_y & 7)
        native_column = landscape_y >> 3
        for landscape_x in range(WIDTH):
            if not landscape[source_row + (landscape_x >> 3)] & (0x80 >> (landscape_x & 7)):
                native[(249 - landscape_x) * 16 + native_column] &= 255 ^ native_mask
    return native


class CrowPanel:
    """A 250 by 122 monochrome canvas with active-low button Pin objects."""

    WIDTH = WIDTH
    HEIGHT = HEIGHT
    WHITE = WHITE
    BLACK = BLACK

    def __init__(self):
        import framebuf
        from machine import Pin, SPI

        self._framebuf = framebuf
        self.buffer = bytearray(b"\xff" * (STRIDE // 8 * HEIGHT))
        self._canvas = framebuf.FrameBuffer(self.buffer, WIDTH, HEIGHT, framebuf.MONO_HLSB, STRIDE)
        self.power = Pin(7, Pin.OUT, value=0)
        self.led = Pin(19, Pin.OUT, value=0)
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

    def _wait_busy(self):
        started = time.ticks_ms()
        while self._busy.value():
            if time.ticks_diff(time.ticks_ms(), started) >= BUSY_TIMEOUT_MS:
                raise OSError("SSD1680 BUSY stayed high for 15 seconds; check the panel and wiring")
            time.sleep_ms(10)
        time.sleep_us(100)

    def _initialize(self):
        time.sleep_ms(100)
        self._reset.value(1)
        time.sleep_ms(10)
        self._reset.value(0)
        time.sleep_ms(10)
        self._reset.value(1)
        time.sleep_ms(10)
        self._wait_busy()
        self._command(0x12)
        self._wait_busy()
        self._command(0x01, b"\xf9\x00\x00")
        self._command(0x11, b"\x03")
        self._command(0x44, b"\x00\x0f")
        self._command(0x45, b"\x00\x00\xf9\x00")
        self._command(0x3C, b"\x01")
        self._wait_busy()
        self._command(0x18, b"\x80")
        self._command(0x4E, b"\x00")
        self._command(0x4F, b"\x00\x00")
        self._wait_busy()

    def _sleep(self, wait):
        try:
            self._command(0x22, b"\x83")
            self._command(0x20)
            if wait:
                self._wait_busy()
        finally:
            try:
                self._command(0x10, b"\x01")
                self._command(0x3C, b"\x01")
                time.sleep_ms(20)
            finally:
                self.power.value(0)

    def show(self):
        """Perform a full refresh, then disable the booster, sleep, and cut power."""
        if self._last_refresh is not None:
            elapsed = time.ticks_diff(time.ticks_ms(), self._last_refresh)
            if elapsed < REFRESH_INTERVAL_MS:
                time.sleep_ms(REFRESH_INTERVAL_MS - elapsed)
        bitmap = native_buffer(self.buffer)
        refreshed = False
        try:
            self.power.value(1)
            self._initialize()
            self._command(0x3C, b"\x01")
            self._command(0x24, bitmap)
            self._last_refresh = time.ticks_ms()
            self._command(0x22, b"\xf4")
            self._command(0x20)
            self._wait_busy()
            refreshed = True
        finally:
            self._sleep(refreshed)
