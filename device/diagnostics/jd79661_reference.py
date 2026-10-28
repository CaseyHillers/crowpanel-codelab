"""Standalone JD79661 reference replay; no framebuffer or production driver.

Call run() for hardware SPI or run(transport="bitbang") explicitly.
Successful sleep leaves panel power enabled like the coworker application.
"""

import time


TIMEOUT_MS = 15000
INIT = (
    (0x00, b"\xf7\x8a"), (0x01, b"\x03\x00\x3f\x3f\x03"),
    (0x03, b"\x00"), (0x06, b"\x27\x27\x2f"), (0x30, b"\x0d"),
    (0x60, b"\x22"), (0x82, b"\x07"), (0xE3, b"\x88"),
    (0x41, b"\x00"), (0x61, b"\x80\x00\xfa"),
    (0x65, b"\x00\x00\x00"), (0x50, b"\xb7"),
)


class _Transport:
    def __init__(self, transport):
        from machine import Pin

        self.sck = Pin(12, Pin.OUT, value=0)
        self.mosi = Pin(11, Pin.OUT, value=0)
        self.reset = Pin(10, Pin.OUT, value=1)
        self.dc = Pin(13, Pin.OUT, value=1)
        self.cs = Pin(14, Pin.OUT, value=1)
        self.busy = Pin(9, Pin.IN)
        self.spi = None
        if transport == "hardware":
            from machine import SPI

            self.spi = SPI(2, baudrate=4000000, polarity=0, phase=0,
                           bits=8, firstbit=SPI.MSB, sck=self.sck,
                           mosi=self.mosi, miso=None)

    def _write(self, data, command=False):
        chunks = (data,) if self.spi is not None else data
        for chunk in chunks:
            self.dc.value(0 if command else 1)
            self.cs.value(0)
            try:
                if self.spi is not None:
                    self.spi.write(chunk)
                else:
                    for shift in range(7, -1, -1):
                        self.sck.value(0)
                        self.mosi.value((chunk >> shift) & 1)
                        self.sck.value(1)
            finally:
                self.cs.value(1)
                self.dc.value(1)

    def command(self, command, data):
        self._write(bytes((command,)), command=True)
        self._write(data)


def _load_gc(bus, alternate):
    registers = (0x20, 0x21, 0x24, 0x23, 0x22) if alternate else (0x20, 0x21, 0x24, 0x22, 0x23)
    for register, waveform in zip(registers, (0x00, 0x60, 0x90, 0x20, 0x10)):
        bus.command(register, bytes((1, waveform, 0x14, 0x14, 1, 0, 0, 1)) + bytes(48))


def _wait_level(bus, level, label, phase):
    started = time.ticks_ms()
    while bus.busy.value() != level:
        if time.ticks_diff(time.ticks_ms(), started) >= TIMEOUT_MS:
            raise OSError("%s: BUSY %s timed out after 15000 ms" % (label, phase))
        time.sleep_ms(1)
    return time.ticks_diff(time.ticks_ms(), started)


def _refresh(bus, label):
    bus.command(0x17, b"\xa5")
    elapsed = _wait_level(bus, 0, label, "assertion")
    print("%s: BUSY asserted after %d ms" % (label, elapsed))
    elapsed = _wait_level(bus, 1, label, "completion")
    print("%s: BUSY completed after %d ms from assertion observation" % (label, elapsed))


def _pattern():
    """Four native black/white quadrants; six padding pixels remain white."""
    return ((b"\x00" * 8 + b"\xff" * 8) * 125
            + (b"\xff" * 8 + b"\x00" * 7 + b"\x3f") * 125)


def run(transport="hardware"):
    """Replay two bounded refreshes; cut power and propagate every failure."""
    if transport not in ("hardware", "bitbang"):
        raise ValueError("Transport must be 'hardware' or 'bitbang'; no fallback")
    from machine import Pin

    power = Pin(7, Pin.OUT, value=0)
    try:
        power.value(1)
        time.sleep_ms(100)
        print("JD79661 reference transport: %s; successful sleep keeps GPIO7 HIGH" % transport)
        bus = _Transport(transport)
        time.sleep_ms(100)
        bus.reset.value(1)
        time.sleep_ms(10)
        bus.reset.value(0)
        time.sleep_ms(100)
        bus.reset.value(1)
        time.sleep_ms(100)
        for command, data in INIT:
            bus.command(command, data)
        white = b"\xff" * 4000
        bus.command(0x10, white)
        bus.command(0x13, white)
        _load_gc(bus, alternate=False)
        _refresh(bus, "clear")
        bus.command(0x50, b"\xd7")
        bus.command(0x13, _pattern())
        _load_gc(bus, alternate=True)
        _refresh(bus, "pattern")
        bus.command(0x07, b"\xa5")
        time.sleep_ms(20)
        print("Protocol finished; GPIO7 left HIGH after sleep (reference power lifecycle).")
        print("Physical display check required: four black/white quadrants; orientation may differ.")
        print("BUSY alone does not prove visible display success.")
    except BaseException:
        power.value(0)
        raise


if __name__ == "__main__":
    run()
