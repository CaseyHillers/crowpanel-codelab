# CrowPanel slide assets

The checked-in `device/slides.py` contains three original, procedurally drawn
monochrome illustrations: **Crow**, **Circuit**, and **Summit**. No external artwork
or fonts are needed. Their reproducible source is `demo_slides()` in
`tools/convert_images.py`; separate image files are not required.

## Generate slides

Run from the repository root with Python 3.10 or newer and the pinned host-only
dependency **Pillow 12.3.0**:

```sh
python3 -m pip install -r requirements.txt
python3 tools/convert_images.py --demo
python3 tools/convert_images.py assets/photo.png assets/diagram.jpg
python3 tools/convert_images.py assets/photo.png --output device/slides.py
```

`--output` defaults to `device/slides.py`, relative to the current directory.
Its parent directories are created if necessary. Image arguments determine slide
order; each filename without its extension becomes the slide name. Names use
Python string literal escaping for quotes, backslashes, control characters, and
Unicode. Surrogate code points are rejected. Pass `--` before image paths whose
names begin with a dash. `--demo` and image paths cannot be combined; supplying
neither is an error, so generated modules always have at least one slide.
Generation overwrites the output, but all inputs are decoded and converted before
the output is opened. Bad inputs leave an existing output untouched. For animated
images, only the first frame is used.

EXIF orientation is applied. Each image is scaled up or down to fit inside
**250 × 100**, preserving aspect ratio without cropping, centered on white.
Transparent pixels are composited over white. Conversion then uses grayscale
and Floyd–Steinberg dithering to produce a 1-bit bitmap. The physical display is
**250 × 122**; the bottom **22 pixels** remain available for the firmware footer.

## MicroPython API and bitmap contract

The generated module is pure Python with exactly four public exports:
`WIDTH = 250`, `HEIGHT = 100`, `STRIDE = 256`, and `SLIDES`. `SLIDES` is an immutable
tuple of `(name, data)` tuples, where `name` is a string and `data` is an immutable
bytes literal. Adjacent bytes literals are concatenated by the Python compiler;
there is no runtime bitmap decoding. Pillow is needed only on the host, never on
the device. The module does not import `framebuf` or any other library.

Bitmaps use **`framebuf.MONO_HLSB`**, with **MSB leftmost**, **white = 1**, and
**black = 0**, matching the driver's white/paper convention. Rows run top to bottom.
Each row occupies **32 bytes** (256 pixels of stride), including **six white (1)
padding bits** after the 250 visible pixels. `STRIDE` is measured in **pixels**,
not bytes. Each bitmap occupies **3,200 bytes**; the three demos total **9,600
bitmap bytes**, excluding names and metadata. Do not invert the data again.

Despite its name, `MONO_HLSB` puts the leftmost pixel at bit 7. This agrees with
both the [MicroPython framebuf documentation](https://docs.micropython.org/en/v1.27.0/library/framebuf.html)
and the [v1.27.0 implementation](https://github.com/micropython/micropython/blob/v1.27.0/extmod/modframebuf.c):
`mono_horiz_getpixel`/`mono_horiz_setpixel` use offset `7 - (x & 7)` for this format
and byte index `(x + y * stride) >> 3`. `MONO_HMSB`, not `MONO_HLSB`, uses `x & 7`.
For a visible pixel `(x, y)`, a nonzero
`data[y * 32 + x // 8] & (0x80 >> (x % 8))` means white.

When `device/` is on the device import path, a slideshow can use:

```python
import framebuf
from slides import WIDTH, HEIGHT, STRIDE, SLIDES

name, data = SLIDES[0]
slide = framebuf.FrameBuffer(
    bytearray(data), WIDTH, HEIGHT, framebuf.MONO_HLSB, STRIDE
)
```

The `bytearray` provides the writable 3,200-byte backing buffer required by
`FrameBuffer`. Use `len(SLIDES)` for navigation and blit `slide` onto the driver's
framebuffer at `(0, 0)`. Firmware owns the footer, refresh, and slide navigation;
the converter does none of those operations.

## Verification

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m unittest discover -s tests -v
```

The host tests cover polarity, MSB bit order, independent white row padding,
EXIF orientation (including the file-loading path), aspect-fit letterboxing,
transparency, dithering, slide ordering, Python name escaping, CLI input validation,
preservation of existing output on bad input, and byte-for-byte regeneration of
the checked-in demos. Generated modules are compiled and loaded with `importlib`,
including a load with Pillow imports blocked. Tests verify the exact exported API,
tuple/bytes types, dimensions, and padding. These are host checks, not a
MicroPython interpreter or physical-panel test. Keep the pinned Pillow version
when regenerating the samples.
