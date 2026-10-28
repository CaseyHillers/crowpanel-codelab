import contextlib
import importlib.util
import io
from pathlib import Path
import types
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
CONTROLS = (("Up", 6), ("Down", 4), ("Press", 5), ("Menu", 2), ("Back", 1))


class ScriptedClock:
    PERIOD = 1 << 30

    def __init__(self, start=0):
        self.start = start
        self.elapsed = 0
        self.sleeps = []
        self.interrupt_sleep = False

    def ticks_ms(self):
        return (self.start + self.elapsed) % self.PERIOD

    def ticks_diff(self, newer, older):
        return (newer - older + self.PERIOD // 2) % self.PERIOD - self.PERIOD // 2

    def sleep_ms(self, duration):
        if self.interrupt_sleep:
            raise KeyboardInterrupt
        self.sleeps.append(duration)
        self.elapsed += duration


class BoardCheckTests(unittest.TestCase):
    def run_sample(self, scripts=None, duration=200, start=0, display_failure=None,
                   interrupt=None, refresh_ms=0):
        scripts = scripts or {}
        self.clock = ScriptedClock(start)
        self.clock.interrupt_sleep = interrupt == "sleep"
        self.configured = []
        self.screens = []
        self.events = []
        self.input_events = []
        self.graphics = []
        self.text_boxes = []
        owner = self

        class TimedOutput(io.StringIO):
            def write(self, text):
                if text.startswith("INPUT "):
                    owner.input_events.append((owner.clock.elapsed, text))
                if text == "DISPLAY CELEBRATION SHOWN":
                    owner.events.append(("marker", owner.clock.elapsed))
                return super().write(text)

        self.output = TimedOutput()

        class Pin:
            IN = 0
            OUT = 1
            PULL_UP = 2

            def __init__(self, number, mode, pull=None, value=None):
                self.number = number
                owner.configured.append((number, mode, pull, value))

            def value(self):
                owner.events.append(("read", owner.clock.elapsed))
                if interrupt == "read" and owner.clock.elapsed >= 10:
                    raise KeyboardInterrupt
                reading = 1
                for changed_at, level in scripts.get(self.number, []):
                    if owner.clock.elapsed >= changed_at:
                        reading = level
                return reading

        class CrowPanel:
            BLACK = 0

            def __init__(self, *, controller):
                owner.assertEqual(controller, "jd79661")
                owner.assertIn((19, Pin.OUT, None, 1), owner.configured)
                if interrupt == "constructor":
                    raise KeyboardInterrupt
                if display_failure == "constructor":
                    raise OSError("display unavailable")
                self.lines = []

            def fill(self):
                self.lines = []

            def pixel(self, horizontal, vertical, color=None):
                if interrupt == "drawing":
                    raise KeyboardInterrupt
                if display_failure == "drawing":
                    raise OSError("drawing unavailable")
                owner.graphics.append(("pixel", horizontal, vertical, 1, 1, color))

            def rect(self, horizontal, vertical, width, height, color=BLACK, fill=False):
                owner.assertTrue(fill, "Confetti rectangles must be filled")
                owner.graphics.append(("rect", horizontal, vertical, width, height, color))

            def text(self, message, horizontal, vertical):
                owner.assertTrue(message.isascii())
                owner.assertGreaterEqual(horizontal, 0)
                owner.assertGreaterEqual(vertical, 0)
                owner.assertLessEqual(len(message) * 8 + horizontal, 250)
                owner.assertLessEqual(vertical + 8, 122)
                self.lines.append(message)
                owner.text_boxes.append((len(owner.screens) + 1, horizontal, vertical,
                                         len(message) * 8, 8))

            def show(self):
                screen_number = len(owner.screens) + 1
                owner.events.append(("show", owner.clock.elapsed))
                owner.screens.append((owner.clock.elapsed, list(self.lines)))
                if interrupt == "show" or interrupt == "final_show" and screen_number == 2:
                    raise KeyboardInterrupt
                if display_failure == screen_number:
                    raise OSError("refresh unavailable")
                owner.clock.elapsed += refresh_ms
                owner.events.append(("shown", owner.clock.elapsed))

        spec = importlib.util.spec_from_file_location(
            "board_check_under_test", ROOT / "device/examples/00_board_check.py",
        )
        sample = importlib.util.module_from_spec(spec)
        with patch.dict("sys.modules", {
            "machine": types.SimpleNamespace(Pin=Pin),
            "time": self.clock,
            "crowpanel": types.SimpleNamespace(CrowPanel=CrowPanel),
        }), contextlib.redirect_stdout(self.output):
            spec.loader.exec_module(sample)
            self.assertEqual(self.configured, [], "Import must not start the demo")
            return sample.run() if duration is None else sample.run(duration_ms=duration)

    def assert_counts(self, result, expected):
        self.assertEqual(result, {name: expected.get(name, 0) for name, _ in CONTROLS})
        for name, count in result.items():
            self.assertIn("%s: observed presses=%d" % (name, count), self.output.getvalue())

    def assert_no_celebration(self):
        self.assertNotIn("DISPLAY CELEBRATION SHOWN", self.output.getvalue())
        self.assertEqual(self.graphics, [])

    def test_celebration_is_static_bounded_confetti_with_sight_confirmation(self):
        result = self.run_sample(
            {number: [(100, 0), (150, 1)] for _, number in CONTROLS},
            duration=300, refresh_ms=80,
        )
        self.assert_counts(result, {name: 1 for name, _ in CONTROLS})
        self.assertEqual(len(self.screens), 2, "Only initial and final refreshes")
        self.assertEqual(self.output.getvalue().splitlines().count("DISPLAY CELEBRATION SHOWN"), 1)
        self.assertEqual(self.events[-2:], [("shown", 260), ("marker", 260)])
        self.assertIn("Confirm by sight.", self.screens[-1][1])
        self.assertIn("confirm", self.output.getvalue().lower())
        self.assertIn("not a hardware PASS", self.output.getvalue())
        pixels = {shape[1:3] for shape in self.graphics if shape[0] == "pixel"}
        rectangles = [shape[1:] for shape in self.graphics if shape[0] == "rect"]
        self.assertGreaterEqual(len(pixels), 40)
        self.assertGreaterEqual(len(rectangles), 4)
        for direction in (-1, 1):
            self.assertTrue(any(
                all((horizontal + direction * offset, vertical + offset) in pixels
                    for offset in range(5))
                for horizontal, vertical in pixels
            ), "Sprinkles must include continuous diagonals in both directions")
        self.assertTrue(any(vertical < 30 for _, vertical in pixels))
        self.assertTrue(any(vertical > 95 for _, vertical in pixels))
        for kind, horizontal, vertical, shape_width, shape_height, color in self.graphics:
            self.assertIn(kind, ("pixel", "rect"))
            self.assertEqual(color, 0, "Black confetti on the white canvas")
            self.assertGreater(shape_width, 0)
            self.assertGreater(shape_height, 0)
            left, top = horizontal, vertical
            right = horizontal + shape_width - 1
            bottom = vertical + shape_height - 1
            self.assertTrue(0 <= left <= right < 250)
            self.assertTrue(0 <= top <= bottom < 122)
            for screen, text_x, text_y, width, height in self.text_boxes:
                if screen == 2:
                    self.assertTrue(right < text_x or left >= text_x + width
                                    or bottom < text_y or top >= text_y + height,
                                    "Confetti must not obscure the message")

    def test_all_controls_pressed_but_one_unreleased_keeps_count_summary(self):
        scripts = {number: [(10, 0), (60, 1)] for _, number in CONTROLS}
        scripts[1] = [(10, 0)]
        result = self.run_sample(scripts)
        self.assert_counts(result, {name: 1 for name, _ in CONTROLS})
        self.assert_no_celebration()
        self.assertIn("END", self.screens[-1][1])
        for name, _ in CONTROLS:
            self.assertIn("%s: 1" % name, self.screens[-1][1])

    def test_complete_inputs_do_not_emit_marker_on_display_errors(self):
        for failure in ("constructor", 1, "drawing", 2):
            with self.subTest(failure=failure):
                result = self.run_sample(
                    {number: [(10, 0), (60, 1)] for _, number in CONTROLS},
                    display_failure=failure,
                )
                self.assert_counts(result, {name: 1 for name, _ in CONTROLS})
                self.assertNotIn("DISPLAY CELEBRATION SHOWN", self.output.getvalue())

    def test_stop_during_final_refresh_does_not_emit_marker_or_retry(self):
        for location, screen_count in (("drawing", 1), ("final_show", 2)):
            with self.subTest(location=location), self.assertRaises(KeyboardInterrupt):
                self.run_sample(
                    {number: [(10, 0), (60, 1)] for _, number in CONTROLS},
                    interrupt=location,
                )
            self.assertEqual(self.clock.elapsed, 90)
            self.assertEqual(len(self.screens), screen_count)
            self.assertNotIn("DISPLAY CELEBRATION SHOWN", self.output.getvalue())

    def test_idle_runs_for_default_minute_with_pullups_and_two_screens(self):
        result = self.run_sample(duration=None)
        self.assert_counts(result, {})
        self.assertEqual(self.clock.elapsed, 60_000)
        self.assertEqual(set(self.configured), {
            (19, 1, None, 1), *((number, 0, 2, None) for _, number in CONTROLS),
        })
        self.assertEqual(len(self.configured), 6)
        self.assertEqual([stamp for stamp, _ in self.screens], [0, 60_000])
        self.assertIn("Press and release", " ".join(self.screens[0][1]))
        self.assertIn("END", self.screens[1][1])
        for name, _ in CONTROLS:
            self.assertIn("%s: 0" % name, self.screens[1][1])
        self.assertNotIn("INPUT ", self.output.getvalue())
        self.assert_no_celebration()
        self.assertIn("observations", self.output.getvalue().lower())

    def test_all_five_complete_only_after_stable_release_not_while_held(self):
        result = self.run_sample({number: [(10, 0), (150, 1)] for _, number in CONTROLS})
        self.assert_counts(result, {name: 1 for name, _ in CONTROLS})
        self.assertGreaterEqual(self.clock.elapsed, 180)
        self.assertLess(self.clock.elapsed, 200)
        for name, _ in CONTROLS:
            self.assertEqual(self.output.getvalue().count("INPUT %s PRESSED\n" % name), 1)
            self.assertEqual(self.output.getvalue().count("INPUT %s RELEASED\n" % name), 1)
        self.assertEqual(len(self.screens), 2)
        self.assertEqual(self.input_events, [
            *((40, "INPUT %s PRESSED" % name) for name, _ in CONTROLS),
            *((180, "INPUT %s RELEASED" % name) for name, _ in CONTROLS),
        ])

    def test_non_poll_multiple_deadline_does_not_overshoot_or_count_late_press(self):
        result = self.run_sample({6: [(75, 0)]}, duration=103)
        self.assert_counts(result, {})
        self.assertEqual(self.clock.elapsed, 103)
        self.assertEqual(len(self.screens), 2)

    def test_bounce_and_short_pulses_are_ignored_independently(self):
        result = self.run_sample({
            6: [(10, 0), (15, 1), (20, 0), (30, 1), (40, 0),
                (100, 1), (110, 0), (120, 1)],
            4: [(10, 0), (35, 1)],
            5: [(10, 0)],
        })
        self.assert_counts(result, {"Up": 1, "Press": 1})
        self.assertEqual(self.output.getvalue().count("INPUT Up PRESSED\n"), 1)
        self.assertEqual(self.output.getvalue().count("INPUT Up RELEASED\n"), 1)
        self.assertNotIn("INPUT Down", self.output.getvalue())
        self.assertNotIn("INPUT Press RELEASED", self.output.getvalue())
        self.assertEqual(self.clock.elapsed, 200)

        self.assert_no_celebration()

    def test_repeated_distinct_presses_count_but_holding_does_not_repeat(self):
        result = self.run_sample({2: [(10, 0), (60, 1), (110, 0)]})
        self.assert_counts(result, {"Menu": 2})
        self.assertEqual(self.output.getvalue().count("INPUT Menu PRESSED\n"), 2)
        self.assertEqual(self.output.getvalue().count("INPUT Menu RELEASED\n"), 1)

    def test_initial_hold_and_release_do_not_complete_the_control(self):
        scripts = {number: [(10, 0), (60, 1)] for _, number in CONTROLS}
        scripts[5] = [(0, 0), (60, 1)]
        result = self.run_sample(scripts)
        self.assert_counts(result, {name: 1 for name, _ in CONTROLS if name != "Press"})
        self.assertNotIn("INPUT Press PRESSED", self.output.getvalue())
        self.assertEqual(self.output.getvalue().count("INPUT Press RELEASED\n"), 1)
        self.assertEqual(self.clock.elapsed, 200)

        self.assert_no_celebration()

    def test_initial_hold_requires_release_and_new_press_then_release(self):
        scripts = {number: [(10, 0), (60, 1)] for _, number in CONTROLS}
        scripts[5] = [(0, 0), (10, 1), (25, 0), (60, 1), (110, 0), (160, 1)]
        result = self.run_sample(scripts, duration=300)
        self.assert_counts(result, {name: 1 for name, _ in CONTROLS})
        self.assertEqual(self.output.getvalue().count("INPUT Press PRESSED\n"), 1)
        self.assertEqual(self.output.getvalue().count("INPUT Press RELEASED\n"), 2)
        self.assertGreaterEqual(self.clock.elapsed, 190)
        self.assertLess(self.clock.elapsed, 300)

    def test_debounce_and_deadline_survive_clock_wraparound(self):
        result = self.run_sample({1: [(10, 0), (60, 1)]}, start=ScriptedClock.PERIOD - 20)
        self.assert_counts(result, {"Back": 1})
        self.assertEqual(self.clock.elapsed, 200)

    def test_refreshes_surround_scanning_and_initial_refresh_is_not_in_deadline(self):
        result = self.run_sample(duration=100, refresh_ms=80)
        self.assert_counts(result, {})
        self.assertEqual([stamp for stamp, _ in self.screens], [0, 180])
        reads = [stamp for event, stamp in self.events if event == "read"]
        self.assertTrue(reads)
        self.assertGreaterEqual(min(reads), 80)
        self.assertLess(max(reads), 180)

    def test_display_oserrors_do_not_prevent_console_scanning_or_counts(self):
        for failure in ("constructor", 1, 2):
            with self.subTest(failure=failure):
                result = self.run_sample({6: [(10, 0), (60, 1)]}, display_failure=failure)
                self.assert_counts(result, {"Up": 1})
                self.assertIn("INPUT Up PRESSED\n", self.output.getvalue())
                self.assertIn("INPUT Up RELEASED\n", self.output.getvalue())
                self.assertIn("display", self.output.getvalue().lower())
                self.assertEqual(self.clock.elapsed, 200)

    def test_keyboard_interrupt_is_not_swallowed_or_delayed_by_summary(self):
        for location in ("read", "sleep", "constructor", "show"):
            with self.subTest(location=location), self.assertRaises(KeyboardInterrupt):
                self.run_sample(interrupt=location)
            self.assertLessEqual(self.clock.elapsed, 10)
            self.assertNotIn("END", self.output.getvalue())
            self.assertLessEqual(len(self.screens), 1)
            self.assert_no_celebration()


if __name__ == "__main__":
    unittest.main()
