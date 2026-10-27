import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "convert_images", ROOT / "tools" / "convert_images.py"
)
converter = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(converter)


def load_module(path):
    compile(path.read_text(encoding="utf-8"), str(path), "exec")
    spec = importlib.util.spec_from_file_location("generated_slides", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class BitmapTests(unittest.TestCase):
    def test_white_is_one_msb_first_and_rows_have_independent_padding(self):
        image = Image.new("1", (10, 2), 255)
        for position in [(0, 0), (7, 0), (8, 0), (9, 1)]:
            image.putpixel(position, 0)
        self.assertEqual(converter.pack_bitmap(image), b"\x7e\x7f\xff\xbf")

    def test_full_width_black_has_six_white_padding_bits_per_row(self):
        bitmap = converter.pack_bitmap(Image.new("1", (250, 100), 0))
        self.assertEqual(len(bitmap), 3200)
        for offset in range(0, len(bitmap), 32):
            self.assertEqual(bitmap[offset:offset + 32], b"\x00" * 31 + b"\x3f")

    def test_white_produces_only_set_bits(self):
        self.assertEqual(
            converter.pack_bitmap(Image.new("1", (250, 100), 255)),
            b"\xff" * 3200,
        )

    def test_packing_requires_monochrome_image(self):
        with self.assertRaises(ValueError):
            converter.pack_bitmap(Image.new("L", (250, 100)))

    def test_exif_orientation_is_applied_before_aspect_fit(self):
        source = Image.new("RGB", (100, 250), "white")
        source.paste("black", (0, 0, 100, 125))
        source.getexif()[274] = 6
        image = converter.prepare_image(source)
        self.assertEqual(image.point(lambda pixel: 255 - pixel).getbbox(),
                         (125, 0, 250, 100))

    def test_square_is_centered_without_stretching(self):
        image = converter.prepare_image(Image.new("RGB", (20, 20), "black"))
        self.assertEqual(image.mode, "1")
        self.assertEqual(image.size, (250, 100))
        self.assertEqual(image.point(lambda pixel: 255 - pixel).getbbox(),
                         (75, 0, 175, 100))

    def test_wide_image_is_letterboxed_without_cropping(self):
        image = converter.prepare_image(Image.new("RGB", (500, 100), "black"))
        self.assertEqual(image.point(lambda pixel: 255 - pixel).getbbox(),
                         (0, 25, 250, 75))

    def test_transparency_is_composited_onto_white(self):
        source = Image.new("RGBA", (250, 100), (0, 0, 0, 0))
        source.putpixel((125, 50), (0, 0, 0, 255))
        source.putpixel((126, 50), (255, 255, 255, 128))
        image = converter.prepare_image(source)
        self.assertEqual(image.getpixel((0, 0)), 255)
        self.assertEqual(image.getpixel((125, 50)), 0)
        self.assertEqual(image.getpixel((126, 50)), 255)

    def test_mid_gray_is_dithered_not_thresholded(self):
        image = converter.prepare_image(Image.new("L", (250, 100), 128))
        black_count = image.histogram()[0]
        self.assertGreater(black_count, 11000)
        self.assertLess(black_count, 14000)


class CliTests(unittest.TestCase):
    def run_cli(self, *arguments, cwd):
        return subprocess.run(
            [sys.executable, str(ROOT / "tools" / "convert_images.py"), *arguments],
            cwd=cwd, capture_output=True, text=True,
        )

    def test_demo_reproduces_checked_in_module(self):
        with tempfile.TemporaryDirectory() as directory:
            result = self.run_cli("--demo", cwd=directory)
            self.assertEqual(result.returncode, 0, result.stderr)
            generated = Path(directory, "device", "slides.py").read_bytes()
            self.assertEqual(generated, (ROOT / "device" / "slides.py").read_bytes())

    def test_paths_preserve_order_and_escape_names(self):
        with tempfile.TemporaryDirectory() as directory:
            first = Path(directory, 'first"\\image\t鸦.png')
            second = Path(directory, "second.png")
            Image.new("RGB", (250, 100), "white").save(first)
            Image.new("RGB", (250, 100), "black").save(second)
            output = Path(directory, "generated", "custom.py")
            result = self.run_cli(str(first), str(second), "--output", str(output),
                                  cwd=directory)
            self.assertEqual(result.returncode, 0, result.stderr)
            module = load_module(output)
            self.assertEqual(tuple(name for name, _ in module.SLIDES),
                             (first.stem, second.stem))
            self.assertEqual(module.SLIDES[0][1], b"\xff" * 3200)
            self.assertEqual(module.SLIDES[1][1],
                             (b"\x00" * 31 + b"\x3f") * 100)

    def test_exif_file_is_oriented_once(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Image.new("RGB", (100, 250), "white")
            source.paste("black", (0, 0, 100, 125))
            source.getexif()[274] = 6
            path = Path(directory, "oriented.png")
            source.save(path, exif=source.getexif())
            result = self.run_cli(str(path), cwd=directory)
            self.assertEqual(result.returncode, 0, result.stderr)
            module = load_module(Path(directory, "device", "slides.py"))
            expected_row = b"\xff" * 15 + b"\xf8" + b"\x00" * 15 + b"\x3f"
            self.assertEqual(module.SLIDES[0][1], expected_row * 100)

    def test_empty_input_and_demo_with_paths_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            for arguments in [(), ("--demo", "some.png")]:
                with self.subTest(arguments=arguments):
                    result = self.run_cli(*arguments, cwd=directory)
                    self.assertEqual(result.returncode, 2, result.stderr)
                    self.assertFalse(Path(directory, "device", "slides.py").exists())

    def test_bad_input_does_not_overwrite_existing_module(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory, "slides.py")
            output.write_text("keep this")
            valid = Path(directory, "valid.png")
            invalid = Path(directory, "invalid.png")
            Image.new("L", (10, 10), 0).save(valid)
            invalid.write_text("not an image")
            for arguments in [(), ("--demo", str(valid)), (str(valid), str(invalid)),
                              (str(valid), str(Path(directory, "missing.png")))]:
                with self.subTest(arguments=arguments):
                    result = self.run_cli(*arguments, "--output", str(output),
                                          cwd=directory)
                    self.assertEqual(result.returncode, 2, result.stderr)
                    self.assertNotIn("Traceback", result.stderr)
                    self.assertEqual(output.read_text(), "keep this")


class PythonOutputTests(unittest.TestCase):
    def test_surrogates_are_rejected(self):
        with self.assertRaises(ValueError):
            converter.render_module([("\udcff", Image.new("1", (250, 100)))])

    def test_empty_module_is_rejected(self):
        with self.assertRaises(ValueError):
            converter.render_module([])

    def test_checked_in_module_compiles_and_loads_without_pillow(self):
        with patch.dict(sys.modules, {"PIL": None, "PIL.Image": None}):
            module = load_module(ROOT / "device" / "slides.py")
        self.assertEqual({name for name in vars(module) if not name.startswith("_")},
                         {"WIDTH", "HEIGHT", "STRIDE", "SLIDES"})
        self.assertEqual((module.WIDTH, module.HEIGHT, module.STRIDE), (250, 100, 256))
        self.assertIsInstance(module.SLIDES, tuple)
        self.assertEqual(tuple(name for name, _ in module.SLIDES),
                         ("Crow", "Circuit", "Summit"))
        for slide in module.SLIDES:
            self.assertIsInstance(slide, tuple)
            _, bitmap = slide
            self.assertIsInstance(bitmap, bytes)
            self.assertEqual(len(bitmap), 3200)
            for row_end in range(31, 3200, 32):
                self.assertEqual(bitmap[row_end] & 0x3f, 0x3f)

    def test_generated_names_round_trip_without_executing_name_contents(self):
        names = [
            "",
            'quote" backslash\\',
            "".join(chr(codepoint) for codepoint in range(32)),
            "".join(chr(codepoint) for codepoint in range(127, 160)),
            "café 鸦 🐦\u2028\u2029",
            r'literal \u1234 \123 \xFF',
            "'); raise RuntimeError('injected'); #",
        ]
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory, "slides.py")
            output.write_text(converter.render_module(
                (name, Image.new("1", (250, 100), 255)) for name in names
            ), encoding="utf-8")
            module = load_module(output)
            self.assertEqual(tuple(name for name, _ in module.SLIDES), tuple(names))


if __name__ == "__main__":
    unittest.main()
