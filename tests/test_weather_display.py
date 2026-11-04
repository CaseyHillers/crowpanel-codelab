"""Offline contracts for the one-refresh monochrome Weather sample."""

import copy
from pathlib import Path
import runpy
import types
import unittest
from unittest.mock import Mock, patch


ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / "device/examples/04_weather.py"
CONDITIONS = {
    "clear": (0,),
    "partly_cloudy": (1, 2),
    "cloudy": (3,),
    "fog": (45, 48),
    "drizzle": (51, 53, 55, 56, 57),
    "rain": (61, 63, 65, 66, 67, 80, 81, 82),
    "snow": (71, 73, 75, 77, 85, 86),
    "thunder": (95, 96, 99),
}


def current(code=0, temperature=72.5):
    return {
        "time": "2026-11-04T14:15", "temperature_2m": temperature,
        "relative_humidity_2m": 44, "apparent_temperature": 71.2,
        "wind_speed_10m": 4.3, "weather_code": code,
    }


def definitions():
    hardware = Mock(name="hardware")
    weather = Mock(name="weather")
    weather.fetch_weather.return_value = current()
    with patch.dict("sys.modules", {
        "crowpanel": types.SimpleNamespace(CrowPanel=hardware, WHITE=1, BLACK=0),
        "weather": weather,
    }), patch("builtins.print"):
        code = runpy.run_path(str(SAMPLE), run_name="weather_display_under_test")
    return code, hardware, weather


class Canvas:
    """Public drawing API only, with pixel geometry and fixed 8x8 text bounds."""

    def __init__(self):
        self.texts = []
        self.fills = []
        self.bitmap = [1] * (250 * 122)

    def fill(self, color=1):
        assert color in (0, 1)
        self.fills.append(color)
        self.bitmap[:] = [color] * len(self.bitmap)

    def text(self, message, x, y, color=0):
        assert isinstance(message, str)
        assert all(32 <= ord(char) <= 126 for char in message), message
        assert 0 <= x and x + len(message) * 8 <= 250, (message, x, y)
        assert 0 <= y and y + 8 <= 122, (message, x, y)
        assert color in (0, 1)
        self.texts.append((message, x, y, color))

    def pixel(self, x, y, color=0):
        assert isinstance(x, int) and isinstance(y, int), (x, y)
        assert 0 <= x < 250 and 0 <= y < 122, (x, y)
        assert color in (0, 1)
        self.bitmap[y * 250 + x] = color

    def rect(self, x, y, width, height, color=0, fill=False):
        assert isinstance(width, int) and isinstance(height, int)
        assert width > 0 and height > 0
        assert 0 <= x and x + width <= 250, (x, width)
        assert 0 <= y and y + height <= 122, (y, height)
        for row in range(y, y + height):
            for col in range(x, x + width):
                if fill or row in (y, y + height - 1) or col in (x, x + width - 1):
                    self.pixel(col, row, color)

    def ink(self):
        return {(index % 250, index // 250)
                for index, value in enumerate(self.bitmap) if value == 0}

    def signature(self):
        return (tuple(self.texts), bytes(self.bitmap))


class WeatherDisplayTests(unittest.TestCase):
    def test_import_only_defines_the_sample_without_network_or_display_work(self):
        code, hardware, weather = definitions()
        hardware.assert_not_called()
        weather.connect.assert_not_called()
        weather.fetch_weather.assert_not_called()
        self.assertTrue(callable(code["run"]))

    def test_wmo_groups_have_matching_icons_and_helpful_condition_labels(self):
        code, _, _ = definitions()
        for kind, values in CONDITIONS.items():
            for value in values:
                with self.subTest(weather_code=value):
                    result_kind, label = code["weather_condition"](value)
                    self.assertEqual(result_kind, kind)
                    self.assertIsInstance(label, str)
                    self.assertTrue(label.strip())
                    self.assertTrue(all(32 <= ord(char) <= 126 for char in label))

    def test_unknown_conditions_are_not_presented_as_known_weather(self):
        code, _, _ = definitions()
        for value in (-1, 4, 100, None, "clear", {}, []):
            with self.subTest(weather_code=repr(value)):
                kind, label = code["weather_condition"](value)
                self.assertEqual(kind, "unknown")
                self.assertRegex(label.lower(), r"unknown|unavailable")

    def test_condition_icons_are_distinct_substantial_and_stay_inside_their_region(self):
        code, _, _ = definitions()
        signatures = set()
        for kind in (*CONDITIONS, "unknown"):
            for x, y in ((0, 0), (37, 19)):
                with self.subTest(kind=kind, origin=(x, y)):
                    panel = Canvas()
                    code["draw_weather_icon"](panel, kind, x, y, size=64)
                    ink = panel.ink()
                    self.assertGreaterEqual(len(ink), 40, "Weather needs a visible graphic")
                    self.assertTrue(all(x <= px < x + 64 and y <= py < y + 64
                                        for px, py in ink))
                    self.assertGreaterEqual(max(px for px, _ in ink) - min(px for px, _ in ink), 20)
                    self.assertGreaterEqual(max(py for _, py in ink) - min(py for _, py in ink), 20)
                    if (x, y) == (0, 0):
                        signatures.add(frozenset(ink))
        self.assertEqual(len(signatures), len(CONDITIONS) + 1,
                         "Different condition groups need distinguishable icons")

    def render(self, code, conditions):
        panel = Canvas()
        before = copy.deepcopy(conditions)
        code["render_weather"](panel, conditions)
        self.assertEqual(conditions, before)
        self.assertTrue(panel.fills, "Clear the previous frame before drawing")
        return panel, "\n".join(message for message, _, _, _ in panel.texts)

    def test_layout_keeps_weather_details_source_and_provider_time_within_the_screen(self):
        code, _, _ = definitions()
        for value in (*[values[0] for values in CONDITIONS.values()], -1):
            with self.subTest(weather_code=value):
                panel, text = self.render(code, current(value))
                for required in ("Sabre Springs", "Open-Meteo", "71.2", "44", "4.3",
                                 "2026-11-04", "14:15"):
                    self.assertIn(required, text)
                self.assertRegex(text.lower(), r"feels")
                self.assertRegex(text.lower(), r"humidity|humid|rh")
                self.assertRegex(text.lower(), r"wind|mph")
                self.assertRegex(text.lower(), r"local|los angeles|pacific")
                self.assertIn(code["weather_condition"](value)[1], text)
                self.assertGreaterEqual(len(panel.ink()), 40)

    def test_the_current_temperature_changes_the_rendered_output(self):
        code, _, _ = definitions()
        panels = [self.render(code, current(0, temperature))[0]
                  for temperature in (-12.5, 0.0, 72.5, 123.4)]
        self.assertEqual(len({panel.signature() for panel in panels}), 4,
                         "The primary temperature may use text or bitmap digits, but must be visible")


if __name__ == "__main__":
    unittest.main()
