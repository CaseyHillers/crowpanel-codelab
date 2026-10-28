#!/usr/bin/env python3
"""Generate a MicroPython module of packed monochrome CrowPanel slide bitmaps."""

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps


SLIDE_WIDTH = 250
SLIDE_HEIGHT = 100
SLIDE_STRIDE = 256


def prepare_image(image):
    """Contain an oriented image on white, then grayscale and dither to 1-bit."""
    oriented = ImageOps.exif_transpose(image).convert("RGBA")
    fitted = ImageOps.contain(
        oriented, (SLIDE_WIDTH, SLIDE_HEIGHT), Image.Resampling.LANCZOS
    )
    canvas = Image.new("RGBA", (SLIDE_WIDTH, SLIDE_HEIGHT), "white")
    position = ((SLIDE_WIDTH - fitted.width) // 2,
                (SLIDE_HEIGHT - fitted.height) // 2)
    canvas.alpha_composite(fitted, position)
    return canvas.convert("L").convert("1", dither=Image.Dither.FLOYDSTEINBERG)


def pack_bitmap(image):
    """Pack MONO_HLSB pixels: white=1, black=0, MSB left, white row padding."""
    if image.mode != "1":
        raise ValueError("pack_bitmap requires a 1-bit image")
    row_bytes = (image.width + 7) // 8
    bitmap = bytearray(b"\xff" * (row_bytes * image.height))
    pixels = image.load()
    for row in range(image.height):
        for column in range(image.width):
            if pixels[column, row] == 0:
                bitmap[row * row_bytes + column // 8] &= ~(0x80 >> (column % 8))
    return bytes(bitmap)


def demo_slides():
    """Create three original monochrome illustrations without external assets."""
    crow = Image.new("1", (SLIDE_WIDTH, SLIDE_HEIGHT), 255)
    drawing = ImageDraw.Draw(crow)
    drawing.line([(20, 86), (230, 86)], fill=0, width=2)
    drawing.polygon([(84, 65), (45, 30), (92, 43), (116, 59),
                     (133, 39), (149, 36), (162, 44), (182, 48),
                     (160, 53), (151, 68), (125, 77), (96, 76),
                     (69, 80)], fill=0)
    drawing.ellipse((137, 42, 140, 45), fill=255)
    drawing.line([(125, 74), (122, 85), (114, 85)], fill=0, width=2)
    drawing.line([(139, 72), (142, 85), (150, 85)], fill=0, width=2)
    drawing.ellipse((196, 13, 216, 33), outline=0, width=2)

    circuit = Image.new("1", (SLIDE_WIDTH, SLIDE_HEIGHT), 255)
    drawing = ImageDraw.Draw(circuit)
    drawing.rounded_rectangle((8, 5, 241, 94), radius=7, outline=0, width=2)
    for horizontal, vertical in [(17, 14), (232, 14), (17, 85), (232, 85)]:
        drawing.ellipse((horizontal - 3, vertical - 3,
                         horizontal + 3, vertical + 3), outline=0)

    traces = [
        [(36, 43), (49, 43), (61, 31), (94, 31)],
        [(36, 55), (55, 55), (63, 47), (94, 47)],
        [(64, 22), (80, 22), (80, 39), (94, 39)],
        [(65, 75), (79, 75), (79, 63), (94, 63)],
        [(110, 27), (110, 15), (163, 15), (173, 25), (180, 25)],
        [(151, 39), (168, 39), (177, 48), (215, 48)],
        [(151, 47), (162, 47), (171, 56), (215, 56)],
        [(151, 63), (175, 63), (175, 72)],
        [(126, 73), (126, 85), (197, 85), (205, 77), (205, 64), (215, 64)],
    ]
    for trace in traces:
        drawing.line(trace, fill=0, width=2)

    for vertical in range(31, 72, 8):
        drawing.rectangle((88, vertical - 1, 157, vertical + 1), fill=0)
    for horizontal in range(102, 144, 8):
        drawing.rectangle((horizontal - 1, 21, horizontal + 1, 79), fill=0)
    drawing.rectangle((94, 27, 151, 73), fill=0)
    drawing.rectangle((101, 34, 144, 66), outline=255)
    drawing.ellipse((104, 37, 108, 41), fill=255)

    drawing.rectangle((9, 34, 36, 64), fill=255, outline=0, width=2)
    drawing.rectangle((9, 40, 28, 58), fill=0)
    drawing.line([(32, 39), (32, 59)], fill=0)
    drawing.rectangle((215, 26, 231, 74), fill=255, outline=0, width=2)
    for vertical in range(32, 70, 8):
        for horizontal in (220, 226):
            drawing.rectangle((horizontal - 1, vertical - 1,
                               horizontal + 1, vertical + 1), fill=0)

    drawing.rounded_rectangle((51, 68, 70, 81), radius=3,
                             fill=255, outline=0, width=2)
    drawing.line([(56, 72), (65, 72)], fill=0)
    for horizontal, vertical in [(54, 17), (174, 20), (169, 72), (186, 72)]:
        drawing.rectangle((horizontal, vertical, horizontal + 12, vertical + 8),
                          fill=0)
        drawing.rectangle((horizontal + 3, vertical + 2,
                           horizontal + 9, vertical + 6), fill=255)
    drawing.ellipse((194, 19, 206, 31), fill=0)
    drawing.ellipse((198, 22, 202, 26), fill=255)

    summit = Image.new("1", (SLIDE_WIDTH, SLIDE_HEIGHT), 255)
    drawing = ImageDraw.Draw(summit)
    drawing.ellipse((180, 8, 208, 36), outline=0, width=2)
    drawing.polygon([(8, 87), (66, 27), (102, 64), (139, 13),
                     (212, 87)], fill=0)
    drawing.polygon([(49, 45), (66, 27), (84, 46), (67, 39),
                     (60, 48)], fill=255)
    drawing.polygon([(117, 44), (139, 13), (168, 43), (145, 35),
                     (137, 47), (131, 36)], fill=255)
    drawing.line([(8, 93), (242, 93)], fill=0, width=2)
    drawing.line([(212, 87), (228, 67), (244, 87)], fill=0, width=2)
    return [("Crow", crow), ("Circuit", circuit), ("Summit", summit)]


def python_string(value):
    """Quote slide names as portable Python literals, rejecting surrogates."""
    for character in value:
        codepoint = ord(character)
        if 0xD800 <= codepoint <= 0xDFFF:
            raise ValueError("slide names must contain only Unicode scalar values")
    return ascii(value)


def render_module(slides):
    """Render nonempty (name, Pillow image) slides as a dependency-free module."""
    slides = list(slides)
    if not slides:
        raise ValueError("at least one slide is required")
    lines = [
        '"""Generated by tools/convert_images.py; do not edit by hand."""', "",
        f"WIDTH = {SLIDE_WIDTH}", f"HEIGHT = {SLIDE_HEIGHT}",
        f"STRIDE = {SLIDE_STRIDE}", "", "SLIDES = (",
    ]
    for name, image in slides:
        bitmap = pack_bitmap(prepare_image(image))
        lines.append(f"    ({python_string(name)}, (")
        for offset in range(0, len(bitmap), 16):
            lines.append('        b"' + "".join(
                f"\\x{byte:02x}" for byte in bitmap[offset:offset + 16]
            ) + '"')
        lines.append("    )),")
    lines.extend([")", ""])
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("images", nargs="*", type=Path, help="images in slide order")
    parser.add_argument("--output", type=Path, default=Path("device/slides.py"))
    parser.add_argument("--demo", action="store_true",
                        help="generate three original monochrome sample slides")
    arguments = parser.parse_args(argv)
    if arguments.demo and arguments.images:
        parser.error("--demo cannot be combined with image paths")
    if not arguments.demo and not arguments.images:
        parser.error("provide at least one image path or use --demo")
    try:
        slides = demo_slides() if arguments.demo else []
        for path in arguments.images:
            with Image.open(path) as image:
                slides.append((path.stem, ImageOps.exif_transpose(image).copy()))
        module = render_module(slides)
        arguments.output.parent.mkdir(parents=True, exist_ok=True)
        arguments.output.write_text(module, encoding="utf-8")
    except (OSError, ValueError, Image.DecompressionBombError) as error:
        parser.error(str(error))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
