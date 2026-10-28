import contextlib
import importlib.util
import io
from pathlib import Path
import types
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]


class ScriptedClock:
    PERIOD = 1 << 30

    def __init__(self, start=0):
        self.start = start
        self.elapsed = 0
        self.sleeps = []

    def ticks_ms(self):
        return (self.start + self.elapsed) % self.PERIOD

    def ticks_diff(self, newer, older):
        return (newer - older + self.PERIOD // 2) % self.PERIOD - self.PERIOD // 2

    def sleep_ms(self, duration):
        self.sleeps.append(duration)
        self.elapsed += duration


class InputsTests(unittest.TestCase):
    def run_sample(self, scripts=None, duration=200, start=0, interrupt=False):
        scripts = scripts or {}
        clock = ScriptedClock(start)
        configured = []

        class Pin:
            IN = 0
            PULL_UP = 2

            def __init__(self, number, mode, pull):
                self.number = number
                configured.append((number, mode, pull))

            def value(self):
                if interrupt and clock.elapsed >= 10:
                    raise KeyboardInterrupt
                reading = 1
                for at, value in scripts.get(self.number, []):
                    if clock.elapsed >= at:
                        reading = value
                return reading

        spec = importlib.util.spec_from_file_location(
            "inputs_under_test", ROOT / "device/examples/05_inputs.py",
        )
        sample = importlib.util.module_from_spec(spec)
        output = io.StringIO()
        with patch.dict("sys.modules", {
            "machine": types.SimpleNamespace(Pin=Pin), "time": clock,
        }), contextlib.redirect_stdout(output):
            spec.loader.exec_module(sample)
            sample.run(duration_ms=duration)
        return output.getvalue(), configured, clock

    def test_idle_inputs_report_baselines_and_zero_counts_then_return(self):
        output, configured, clock = self.run_sample(duration=60_000)
        self.assertEqual(configured, [(number, 0, 2) for number in (6, 4, 5, 2, 1)])
        for name in ("Up", "Down", "Press", "Menu", "Back"):
            self.assertIn("Initial %s: RELEASED (raw=1)" % name, output)
            self.assertIn("%s: presses=0 releases=0" % name, output)
        self.assertIn("not a hardware PASS", output)
        self.assertIn("BOOT and RESET are not part", output)
        self.assertEqual(clock.elapsed, 60_000)
        self.assertEqual(set(clock.sleeps), {5})

    def test_bouncing_press_and_release_count_once_each(self):
        output, _, _ = self.run_sample({6: [
            (10, 0), (15, 1), (20, 0), (30, 1), (40, 0),
            (100, 1), (110, 0), (120, 1),
        ]})
        self.assertEqual(output.count("\nUp: PRESSED\n"), 1)
        self.assertEqual(output.count("\nUp: RELEASED\n"), 1)
        self.assertIn("Up: presses=1 releases=1", output)

    def test_short_pulse_is_ignored_and_held_press_does_not_repeat(self):
        output, _, _ = self.run_sample({4: [(10, 0), (20, 1), (50, 0)]})
        self.assertEqual(output.count("\nDown: PRESSED\n"), 1)
        self.assertNotIn("\nDown: RELEASED\n", output)
        self.assertIn("Down: presses=1 releases=0", output)

    def test_initially_held_input_only_counts_later_release(self):
        output, _, _ = self.run_sample({5: [(0, 0), (40, 1)]})
        self.assertIn("Initial Press: PRESSED (raw=0)", output)
        self.assertNotIn("\nPress: PRESSED\n", output)
        self.assertIn("\nPress: RELEASED\n", output)
        self.assertIn("Press: presses=0 releases=1", output)

    def test_simultaneous_inputs_debounce_independently(self):
        output, _, _ = self.run_sample({
            2: [(10, 0), (80, 1)],
            1: [(10, 0), (20, 1), (30, 0), (80, 1)],
        })
        for name in ("Menu", "Back"):
            self.assertEqual(output.count("\n%s: PRESSED\n" % name), 1)
            self.assertEqual(output.count("\n%s: RELEASED\n" % name), 1)
            self.assertIn("%s: presses=1 releases=1" % name, output)

    def test_debounce_and_run_deadline_survive_ticks_wrap(self):
        output, _, clock = self.run_sample(
            {6: [(10, 0), (60, 1)]}, start=ScriptedClock.PERIOD - 20,
        )
        self.assertIn("Up: presses=1 releases=1", output)
        self.assertEqual(clock.elapsed, 200)

    def test_keyboard_interrupt_propagates(self):
        with self.assertRaises(KeyboardInterrupt):
            self.run_sample(interrupt=True)


if __name__ == "__main__":
    unittest.main()
