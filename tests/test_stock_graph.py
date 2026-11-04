"""Offline graph contracts for both independently downloadable ticker scripts."""

import copy
from pathlib import Path
import runpy
import types
import unittest
from unittest.mock import Mock, patch


ROOT = Path(__file__).resolve().parents[1]
ENTRYFILES = (
    ROOT / "device/projects/stock-ticker/ram/04_stocks.py",
    ROOT / "device/projects/stock-ticker/startup/main.py",
)


def quote(stamp=1793653140, price=123.45, delay=15):
    return {"symbol": "ARM", "price": price, "currency": "USD",
            "quote_time": stamp, "delay_minutes": delay, "source": "TradingView"}


def load_entryfile(path):
    """Import definitions without starting the loop or touching a real device."""
    hardware = Mock(name="hardware")
    network = Mock(name="network")
    weather = Mock(name="weather")
    clock = Mock(name="clock")
    modules = {
        "time": clock, "network": network, "ntptime": Mock(name="ntptime"),
        "crowpanel": types.SimpleNamespace(CrowPanel=hardware, WHITE=1, BLACK=0),
        "weather": weather,
        "stocks": types.SimpleNamespace(format_quote_time=Mock()),
    }
    with patch.dict("sys.modules", modules):
        definitions = runpy.run_path(str(path), run_name="graph_under_test")
    for boundary in (hardware, network, weather, clock):
        if boundary.mock_calls:
            raise AssertionError("Import must not start hardware or network work")
    return definitions


class Canvas:
    """Only the public drawing operations allowed to the graph renderer."""
    def __init__(self):
        self.texts = []
        self.rectangles = []
        self.pixels = []
        self.fills = []

    def fill(self, color=1):
        self.fills.append(color)

    def text(self, message, x, y, color=0):
        self.texts.append((message, x, y))

    def rect(self, x, y, width, height, color=0, fill=False):
        self.rectangles.append((x, y, width, height))

    def pixel(self, x, y, color=0):
        self.pixels.append((x, y))


class StockGraphTests(unittest.TestCase):
    def variants(self):
        for path in ENTRYFILES:
            yield path.relative_to(ROOT), load_entryfile(path)

    def test_history_collects_real_quotes_replaces_same_minute_and_rejects_older(self):
        for path, code in self.variants():
            with self.subTest(entryfile=str(path)):
                remember = code["remember_quote"]
                history = []
                first = quote()
                original_quote = first.copy()
                remember(history, first)
                self.assertEqual(history, [(first["quote_time"], 123.45)])
                self.assertEqual(first, original_quote)
                remember(history, quote(price=124.0))
                self.assertEqual(history, [(first["quote_time"], 124.0)])
                remember(history, quote(first["quote_time"] + 900, 121.0))
                self.assertEqual(history, [(first["quote_time"], 124.0),
                                           (first["quote_time"] + 900, 121.0)])
                before = history[:]
                with self.assertRaises(ValueError):
                    remember(history, quote(first["quote_time"] + 60, 200.0))
                self.assertEqual(history, before)

    def test_history_is_bounded_to_the_latest_32_distinct_provider_minutes(self):
        for path, code in self.variants():
            with self.subTest(entryfile=str(path)):
                self.assertEqual(code["HISTORY_LIMIT"], 32)
                history = []
                for index in range(40):
                    code["remember_quote"](history, quote(1793653140 + index * 60, 100 + index))
                self.assertEqual(history, [(1793653140 + index * 60, 100 + index)
                                           for index in range(8, 40)])
                code["remember_quote"](history, quote(1793653140 + 39 * 60, 150))
                self.assertEqual(len(history), 32)
                self.assertEqual(history[-1], (1793653140 + 39 * 60, 150))

    def test_chart_uses_elapsed_time_and_price_extrema_without_mutating_history(self):
        history = [(1000, 10.0), (1060, 20.0), (1600, 15.0)]
        for path, code in self.variants():
            with self.subTest(entryfile=str(path)):
                before = history[:]
                points = code["chart_points"](history, 10, 20, 101, 41)
                self.assertEqual(points, [(10, 60), (20, 20), (110, 40)])
                self.assertEqual(history, before)

    def test_empty_single_and_flat_history_never_fabricate_a_trend(self):
        for path, code in self.variants():
            with self.subTest(entryfile=str(path)):
                chart = code["chart_points"]
                self.assertEqual(chart([], 10, 20, 101, 41), [])
                self.assertEqual(chart([(1000, 12.0)], 10, 20, 101, 41), [(60, 40)])
                self.assertEqual(chart([(1000, 12.0), (1600, 12.0)], 10, 20, 101, 41),
                                 [(10, 40), (110, 40)])
                # Tiny drawable regions cannot produce out-of-range endpoints.
                self.assertEqual(chart([(1000, 12.0), (1600, 20.0)], 7, 9, 1, 1),
                                 [(7, 9), (7, 9)])

    def assert_canvas_bounds(self, panel):
        self.assertTrue(panel.fills, "The renderer must clear the previous canvas")
        for message, x, y in panel.texts:
            self.assertIsInstance(message, str)
            self.assertTrue(all(32 <= ord(char) <= 126 for char in message), message)
            self.assertGreaterEqual(x, 0)
            self.assertGreaterEqual(y, 0)
            self.assertLessEqual(x + len(message) * 8, 250, message)
            self.assertLessEqual(y + 8, 122, message)
        for x, y, width, height in panel.rectangles:
            self.assertGreaterEqual(x, 0)
            self.assertGreaterEqual(y, 0)
            self.assertGreater(width, 0)
            self.assertGreater(height, 0)
            self.assertLessEqual(x + width, 250)
            self.assertLessEqual(y + height, 122)
        for x, y in panel.pixels:
            self.assertIsInstance(x, int)
            self.assertIsInstance(y, int)
            self.assertTrue(0 <= x < 250 and 0 <= y < 122, (x, y))

    def render(self, code, history, entry=None, failed=False, pending=False,
               symbol="ARM", checked="22:45 UTC"):
        panel = Canvas()
        before = copy.deepcopy((history, entry))
        code["render_quote"](panel, symbol, 1, 3, entry, checked, failed, pending, history)
        self.assertEqual((history, entry), before)
        self.assert_canvas_bounds(panel)
        return panel, "\n".join(message for message, _, _ in panel.texts)

    def test_renderer_preserves_identity_delay_source_quote_time_and_check_time(self):
        for path, code in self.variants():
            for delay in (0, 15):
                with self.subTest(entryfile=str(path), delay=delay):
                    entry = (quote(delay=delay), "2026-11-02 20:59")
                    panel, text = self.render(code, [(1793653080, 120), (1793653140, 123.45)], entry)
                    for required in ("ARM", "NASDAQ", "USD", "123.45", "TradingView",
                                     "2026-11-02 20:59", "22:45"):
                        self.assertIn(required, text)
                    self.assertIn("UTC", text)
                    self.assertRegex(text.lower(), r"quote")
                    self.assertRegex(text.lower(), r"check")
                    self.assertRegex(text.lower(), r"delay|source reports")
                    self.assertRegex(text, r"15" if delay else r"(?i)no delay|delay[^\n]*0|0[^\n]*delay")
                    self.assertTrue(panel.pixels, "Collected price history must be drawn")

    def test_renderer_explains_missing_single_flat_stale_and_queued_states(self):
        for path, code in self.variants():
            with self.subTest(entryfile=str(path)):
                panel, text = self.render(code, [], failed=True)
                self.assertRegex(text.lower(), r"unavailable|no quote")
                self.assertRegex(text.lower(), r"unknown|unavailable|no quote")
                self.assertFalse(panel.pixels, "No quote must not produce invented chart points")
                _, text = self.render(code, [(1793653140, 123.45)],
                                      (quote(), "2026-11-02 20:59"))
                self.assertRegex(text.lower(), r"waiting|collect|single|one (?:point|quote)|1 (?:point|quote)")
                _, text = self.render(code, [(1793653080, 123.45), (1793653140, 123.45)],
                                      (quote(), "2026-11-02 20:59"), failed=True, pending=True)
                self.assertIn("STALE", text)
                self.assertRegex(text.lower(), r"queued|pending")
                self.assertRegex(text.lower(), r"flat|unchanged")
                # Longest accepted ticker must fit without losing identity.
                _, text = self.render(code, [], symbol="ABCDEFGHIJ")
                self.assertIn("ABCDEFGHIJ", text)


if __name__ == "__main__":
    unittest.main()
