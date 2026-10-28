import contextlib
import importlib.util
import io
from pathlib import Path
import types
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = ("02_snake.py", "02_snake_solution.py")


def load_example(filename):
    spec = importlib.util.spec_from_file_location(
        filename[:-3], ROOT / "device/examples" / filename,
    )
    example = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(example)
    return example


def game_state(game):
    return (tuple(game.snake), game.direction, game.food, game.score,
            game.running, game.over, game.won)


class SnakeLogicTests(unittest.TestCase):
    def test_default_square_is_ready_and_start_never_moves(self):
        for filename in EXAMPLES:
            with self.subTest(filename=filename):
                game = load_example(filename).Game()
                self.assertEqual((game.columns, game.rows), (8, 8))
                original = game_state(game)
                self.assertFalse(game.running)
                self.assertFalse(game.over)
                self.assertFalse(game.won)
                self.assertFalse(game.advance())
                self.assertEqual(game_state(game), original)
                self.assertTrue(game.start())
                self.assertTrue(game.running)
                self.assertEqual(game.snake, list(original[0]))
                started = game_state(game)
                self.assertFalse(game.start())
                self.assertEqual(game_state(game), started)

    def test_turns_wrap_without_moving_and_running_steps_one_cell(self):
        for filename in EXAMPLES:
            with self.subTest(filename=filename):
                game = load_example(filename).Game()
                original = list(game.snake)
                for turn in (-1, 1):
                    for _ in range(4):
                        self.assertTrue(game.rotate(turn))
                    self.assertEqual(game.direction, 0)
                    self.assertEqual(game.snake, original)
                self.assertTrue(game.rotate(1))
                self.assertEqual(game.direction, 1)
                self.assertTrue(game.rotate(-1))
                game.food = (0, 0)
                game.start()
                self.assertTrue(game.advance())
                self.assertEqual(game.snake, [
                    (original[0][0] + 1, original[0][1]),
                ] + original[:-1])
                self.assertEqual(game.score, 0)
                self.assertTrue(game.running)

    def test_growth_places_food_only_in_empty_cells(self):
        for filename in EXAMPLES:
            with self.subTest(filename=filename):
                game = load_example(filename).Game()
                original = list(game.snake)
                game.food = (original[0][0] + 1, original[0][1])
                game.start()
                self.assertTrue(game.advance())
                self.assertEqual(game.snake[1:], original)
                self.assertEqual(game.score, 1)
                self.assertNotIn(game.food, game.snake)
                self.assertTrue(0 <= game.food[0] < game.columns)
                self.assertTrue(0 <= game.food[1] < game.rows)
                self.assertTrue(game.running)

    def test_first_food_is_one_move_ahead_and_later_food_stays_near_center(self):
        for filename in EXAMPLES:
            with self.subTest(filename=filename):
                game = load_example(filename).Game()
                self.assertEqual(game.food, (5, 4))
                game.start()
                game.advance()
                self.assertEqual(game.score, 1)
                self.assertEqual(len(game.snake), 4)
                self.assertNotIn(game.food, game.snake)
                self.assertLessEqual(abs(game.food[0] - 4) + abs(game.food[1] - 4), 1)

    def test_center_food_search_reaches_edge_when_center_is_full(self):
        for filename in EXAMPLES:
            with self.subTest(filename=filename):
                game = load_example(filename).Game()
                game.snake = [(column, row) for row in range(8) for column in range(8)
                              if (column, row) != (0, 0)]
                self.assertEqual(game.place_food(), (0, 0))
                game.snake.append((0, 0))
                self.assertIsNone(game.place_food())

    def test_all_walls_body_and_neck_collisions_stop_until_restart(self):
        cases = (([(7, 3), (6, 3), (5, 3)], 0),
                 ([(3, 7), (3, 6), (3, 5)], 1),
                 ([(0, 3), (1, 3), (2, 3)], 2),
                 ([(3, 0), (3, 1), (3, 2)], 3),
                 ([(3, 3), (3, 2), (4, 2), (4, 3), (5, 3)], 0),
                 ([(5, 5), (4, 5), (3, 5)], 2))
        for filename in EXAMPLES:
            for snake, direction in cases:
                with self.subTest(filename=filename, snake=snake,
                                  direction=direction):
                    game = load_example(filename).Game()
                    ready = game_state(game)
                    game.snake = snake[:]
                    game.direction = direction
                    game.food = (0, 0)
                    game.start()
                    self.assertTrue(game.advance())
                    self.assertTrue(game.over)
                    self.assertFalse(game.won)
                    self.assertFalse(game.running)
                    self.assertEqual(game.snake, snake)
                    stopped = game_state(game)
                    self.assertFalse(game.advance())
                    self.assertFalse(game.rotate(1))
                    self.assertFalse(game.start())
                    self.assertEqual(game_state(game), stopped)
                    self.assertTrue(game.restart())
                    self.assertEqual(game_state(game), ready)

    def test_restart_discards_running_score_heading_and_growth(self):
        for filename in EXAMPLES:
            with self.subTest(filename=filename):
                game = load_example(filename).Game()
                ready = game_state(game)
                game.food = (game.snake[0][0] + 1, game.snake[0][1])
                game.start()
                game.advance()
                game.rotate(1)
                self.assertEqual(game.score, 1)
                self.assertTrue(game.restart())
                self.assertEqual(game_state(game), ready)
                self.assertFalse(game.advance())

    def test_vacating_tail_is_legal_but_filling_board_wins_and_stops(self):
        for filename in EXAMPLES:
            with self.subTest(filename=filename):
                game = load_example(filename).Game(columns=4, rows=2)
                game.snake = [(0, 0), (0, 1), (1, 1), (1, 0)]
                game.food = (3, 1)
                game.start()
                self.assertTrue(game.advance())
                self.assertFalse(game.over)
                self.assertTrue(game.running)
                self.assertEqual(game.snake[0], (1, 0))
                self.assertEqual(len(game.snake), 4)
                game.snake = [(2, 0), (1, 0), (0, 0), (0, 1),
                              (1, 1), (2, 1), (3, 1)]
                game.food = (3, 0)
                self.assertTrue(game.advance())
                self.assertTrue(game.over)
                self.assertTrue(game.won)
                self.assertFalse(game.running)
                self.assertIsNone(game.food)
                self.assertEqual(len(game.snake), 8)
                self.assertEqual(game.score, 1)
                won = game_state(game)
                self.assertFalse(game.start())
                self.assertFalse(game.advance())
                self.assertFalse(game.rotate(-1))
                self.assertEqual(game_state(game), won)
                game.restart()
                self.assertFalse(game.running)
                self.assertFalse(game.won)
                self.assertFalse(game.over)

    def test_scaffold_controls_are_safe_noops_except_back(self):
        example = load_example("02_snake.py")
        game = example.Game()
        original = game_state(game)
        for name in ("Up", "Down", "Press", "Menu", "Unknown"):
            self.assertEqual(example.handle_input(game, name), (False, False))
            self.assertEqual(game_state(game), original)
        self.assertEqual(example.handle_input(game, "Back"), (False, True))
        self.assertEqual(game_state(game), original)

    def test_solution_maps_counterclockwise_up_clockwise_down_and_start(self):
        example = load_example("02_snake_solution.py")
        game = example.Game()
        original = list(game.snake)
        self.assertEqual(example.handle_input(game, "Up"), (True, False))
        self.assertEqual(game.direction, 3)
        self.assertEqual(example.handle_input(game, "Down"), (True, False))
        self.assertEqual(game.direction, 0)
        self.assertEqual(example.handle_input(game, "Press"), (True, False))
        self.assertTrue(game.running)
        self.assertEqual(game.snake, original)
        self.assertEqual(example.handle_input(game, "Press"), (False, False))
        self.assertEqual(example.handle_input(game, "Menu"), (True, False))
        self.assertEqual(game.snake, original)
        self.assertFalse(game.running)
        ready = game_state(game)
        self.assertEqual(example.handle_input(game, "Back"), (False, True))
        self.assertEqual(example.handle_input(game, "Unknown"), (False, False))
        self.assertEqual(game_state(game), ready)


class Clock:
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
        if duration <= 0:
            raise AssertionError("Polling must advance time")
        self.sleeps.append(duration)
        self.elapsed += duration


class SnakeRuntimeTests(unittest.TestCase):
    def run_sample(self, filename="02_snake_solution.py", scripts=None,
                   duration=400, step=100, start=0, show_delay=0, failure=None,
                   failure_frame=1, missing=False, interrupt_at=None,
                   legacy_driver=False):
        example = load_example(filename)
        clock = Clock(start)
        scripts = scripts or {}
        frames = []
        draws = []
        inputs = []
        power_values = []
        controllers = []
        wait_calls = []
        real_draw = example.draw
        real_handle_input = example.handle_input

        class Pin:
            def __init__(self, name):
                self.name = name

            def value(self):
                if interrupt_at is not None and clock.elapsed >= interrupt_at:
                    raise KeyboardInterrupt
                reading = 1
                for at, value in scripts.get(self.name, []):
                    if clock.elapsed >= at:
                        reading = value
                return reading

        class Panel:
            SUPPORTS_WAIT_CALLBACK = True

            def __init__(self, controller):
                controllers.append(controller)
                self.power = types.SimpleNamespace(value=power_values.append)
                self.texts = []
                self.rects = []
                if not missing:
                    for attribute in ("up", "down", "dial", "menu", "back"):
                        setattr(self, attribute, Pin(attribute))

            def fill(self):
                self.texts = []
                self.rects = []

            def text(self, message, x, y):
                if x < 0 or y < 0 or x + len(message) * 8 > 250 or y + 8 > 122:
                    raise AssertionError("Text outside the display: %r" % message)
                self.texts.append((message, x, y))

            def rect(self, x, y, width, height, color=0, fill=False):
                if (x < 0 or y < 0 or width <= 0 or height <= 0
                        or x + width > 250 or y + height > 122):
                    raise AssertionError("Rectangle outside the display")
                self.rects.append((x, y, width, height, color, fill))

            def show(self, on_wait=None):
                frames.append({"at": clock.elapsed, "texts": tuple(self.texts),
                               "rects": tuple(self.rects)})
                frame_number = len(frames)
                delay = (show_delay[frame_number - 1]
                         if isinstance(show_delay, (list, tuple))
                         and frame_number <= len(show_delay)
                         else 0 if isinstance(show_delay, (list, tuple))
                         else show_delay)
                finish_at = clock.elapsed + delay
                while clock.elapsed < finish_at:
                    if on_wait is not None:
                        wait_calls.append(clock.elapsed)
                        on_wait()
                    clock.sleep_ms(min(5, finish_at - clock.elapsed))
                if on_wait is not None:
                    wait_calls.append(clock.elapsed)
                    on_wait()
                if failure is not None and frame_number == failure_frame:
                    raise failure

        def record_draw(panel, game, on_wait=None):
            draws.append({"at": clock.elapsed, "snake": tuple(game.snake),
                          "direction": game.direction, "running": game.running,
                          "over": game.over, "won": game.won,
                          "score": game.score})
            return real_draw(panel, game, on_wait=on_wait)

        def record_input(game, name):
            inputs.append((clock.elapsed, name))
            return real_handle_input(game, name)

        if legacy_driver:
            refresh = Panel.show

            def legacy_show(panel):
                return refresh(panel)

            del Panel.SUPPORTS_WAIT_CALLBACK
            Panel.show = legacy_show

        self.output = io.StringIO()
        self.clock = clock
        self.frames = frames
        self.draws = draws
        self.inputs = inputs
        self.power_values = power_values
        self.controllers = controllers
        self.wait_calls = wait_calls
        arguments = {} if duration is None else {"duration_ms": duration}
        if step is not None:
            arguments["step_ms"] = step
        with patch.dict("sys.modules", {
            "time": clock, "crowpanel": types.SimpleNamespace(CrowPanel=Panel),
        }), patch.object(example, "draw", record_draw), patch.object(
            example, "handle_input", record_input,
        ), contextlib.redirect_stdout(self.output):
            return example.run(**arguments)

    def assert_frame_times(self, expected):
        self.assertEqual([frame["at"] for frame in self.frames], expected)

    def test_legacy_driver_runs_without_keyword_and_explains_upgrade(self):
        for filename in EXAMPLES:
            with self.subTest(filename=filename):
                self.run_sample(filename, legacy_driver=True)
                self.assert_frame_times([0])
                self.assertEqual(self.wait_calls, [])
                self.assertEqual(self.power_values, [0])
                self.assertIn("Inputs during refresh are unavailable", self.output.getvalue())
                self.assertIn("Board check > Advanced install", self.output.getvalue())
                self.assertIn("No firmware reflash", self.output.getvalue())
                self.assertNotIn("Steering is collected", self.output.getvalue())

    def test_legacy_driver_still_moves_automatically_and_exits(self):
        game = self.run_sample(legacy_driver=True, scripts={
            "dial": [(10, 0)], "back": [(270, 0)],
        })
        self.assert_frame_times([0, 140, 240])
        self.assertEqual(game.snake[0], (6, 4))
        self.assertEqual(self.clock.elapsed, 300)
        self.assertEqual(self.power_values, [0])

    def test_callback_driver_type_errors_propagate_without_retry(self):
        for filename in EXAMPLES:
            with self.subTest(filename=filename):
                with self.assertRaisesRegex(TypeError, "driver callback failed"):
                    self.run_sample(filename, failure=TypeError("driver callback failed"))
                self.assert_frame_times([0])
                self.assertTrue(self.wait_calls)
                self.assertEqual(self.power_values, [0])

    def test_idle_missing_controls_and_scaffold_render_only_initial_frame(self):
        for filename, missing in ((EXAMPLES[1], False), (EXAMPLES[1], True),
                                  (EXAMPLES[0], False)):
            with self.subTest(filename=filename, missing=missing):
                scripts = {name: [(10, 0), (60, 1)]
                           for name in ("dial", "up", "down", "menu")}
                if filename == EXAMPLES[1]:
                    scripts = {}
                game = self.run_sample(filename, scripts, duration=403,
                                       missing=missing)
                self.assertEqual(self.clock.elapsed, 403)
                self.assert_frame_times([0])
                self.assertEqual(self.controllers, ["jd79661"])
                self.assertEqual(self.power_values, [0])
                self.assertFalse(game.running)
                self.assertEqual(tuple(game.snake), self.draws[0]["snake"])
                self.assertTrue(all(0 < delay <= 5 for delay in self.clock.sleeps))

    def test_default_step_is_five_seconds_and_press_only_starts(self):
        game = self.run_sample(scripts={"dial": [(10, 0)]},
                               duration=10100, step=None)
        self.assert_frame_times([0, 5040, 10040])
        self.assertEqual(game.snake[0], (6, 4))
        self.assertTrue(game.running)

    def test_default_cadence_leaves_five_seconds_after_a_six_second_refresh(self):
        for legacy_driver in (False, True):
            with self.subTest(legacy_driver=legacy_driver):
                game = self.run_sample(scripts={"dial": [(10, 0)]},
                                       duration=22050, step=None,
                                       show_delay=[0, 6000, 6000],
                                       legacy_driver=legacy_driver)
                self.assert_frame_times([0, 5040, 16040])
                self.assertEqual([draw["snake"][0] for draw in self.draws],
                                 [(4, 4), (5, 4), (6, 4)])
                self.assertEqual(game.snake[0], (6, 4))
                self.assertIn("Viewing time: 5000 ms after each full refresh", self.output.getvalue())

    def test_first_move_waits_full_step_since_debounced_press(self):
        game = self.run_sample(scripts={"dial": [(85, 0)]}, duration=316)
        self.assert_frame_times([0, 215, 315])
        self.assertEqual(game.snake[0], (6, 4))

    def test_repeated_press_does_not_step_or_restart_schedule(self):
        game = self.run_sample(scripts={
            "dial": [(10, 0), (60, 1), (105, 0), (155, 1)],
        }, duration=341)
        self.assert_frame_times([0, 140, 240, 340])
        self.assertEqual(game.snake[0], (7, 4))
        self.assertEqual([name for _, name in self.inputs], ["Press", "Press"])

    def test_bounce_and_hold_produce_only_one_start(self):
        game = self.run_sample(scripts={"dial": [
            (10, 0), (15, 1), (20, 0), (30, 1), (40, 0),
        ]}, duration=271)
        self.assert_frame_times([0, 170, 270])
        self.assertEqual([name for _, name in self.inputs], ["Press"])
        self.assertEqual(game.snake[0], (6, 4))

    def test_initially_held_requires_debounced_release_and_fresh_press(self):
        for transitions, expected in (
            ([(0, 0), (40, 1)], [0]),
            ([(0, 0), (40, 1), (90, 0)], [0, 220, 320]),
            ([(0, 0), (40, 1), (55, 0)], [0]),
        ):
            with self.subTest(transitions=transitions):
                game = self.run_sample(scripts={"dial": transitions}, duration=321)
                self.assert_frame_times(expected)
                self.assertEqual(game.running, len(expected) > 1)

    def test_debounce_and_move_schedule_survive_tick_wrap(self):
        for start in (Clock.PERIOD - 20, Clock.PERIOD - 125):
            with self.subTest(start=start):
                game = self.run_sample(scripts={"dial": [(10, 0)]},
                                       duration=341, start=start)
                self.assert_frame_times([0, 140, 240, 340])
                self.assertEqual(game.snake[0], (7, 4))
                self.assertEqual(self.clock.elapsed, 341)

    def test_turning_and_start_do_not_refresh_until_scheduled_move(self):
        game = self.run_sample(scripts={
            "up": [(10, 0), (60, 1)],
            "dial": [(70, 0)],
            "down": [(130, 0)],
        }, duration=301)
        self.assert_frame_times([0, 200, 300])
        self.assertEqual([name for _, name in self.inputs], ["Up", "Press", "Down"])
        self.assertEqual(game.direction, 0)
        self.assertEqual(game.snake[0], (5, 3))
        self.run_sample(scripts={"up": [(10, 0)]}, duration=350)
        self.assert_frame_times([0])

    def test_menu_resets_ready_once_and_new_press_gets_new_schedule(self):
        game = self.run_sample(scripts={
            "dial": [(10, 0), (60, 1), (300, 0)],
            "menu": [(170, 0), (220, 1)],
        }, duration=531)
        self.assert_frame_times([0, 140, 200, 430, 530])
        self.assertFalse(self.draws[2]["running"])
        self.assertEqual(self.draws[2]["snake"], self.draws[0]["snake"])
        self.assertEqual(self.draws[2]["score"], 0)
        self.assertEqual(game.snake[0], (6, 4))
        self.run_sample(scripts={"dial": [(10, 0)], "menu": [(170, 0)]},
                        duration=800)
        self.assert_frame_times([0, 140, 200])

    def test_collision_frame_renders_once_then_stays_stopped(self):
        game = self.run_sample(scripts={"dial": [(10, 0)]}, duration=1000)
        self.assert_frame_times([0, 140, 240, 340, 440])
        self.assertTrue(game.over)
        self.assertFalse(game.running)
        self.assertTrue(self.draws[-1]["over"])
        self.assertEqual(self.draws[-1]["snake"], self.draws[-2]["snake"])
        self.assertIn(("Press: replay", 124, 53), self.frames[-1]["texts"])
        self.assertIn("Game over. Press plays again; Menu resets.", self.output.getvalue())

    def test_menu_and_press_replay_after_collision(self):
        game = self.run_sample(scripts={
            "dial": [(10, 0), (60, 1), (700, 0)],
            "menu": [(600, 0), (650, 1)],
        }, duration=950)
        self.assert_frame_times([0, 140, 240, 340, 440, 630, 830, 930])
        self.assertTrue(self.draws[4]["over"])
        self.assertFalse(self.draws[5]["over"])
        self.assertFalse(self.draws[5]["running"])
        self.assertTrue(game.running)
        self.assertEqual(game.snake[0], (6, 4))

    def test_press_replays_after_twenty_seconds_without_a_new_browser_run(self):
        self.run_sample(scripts={
            "dial": [(10, 0), (60, 1), (25000, 0), (25050, 1)],
            "back": [(40000, 0)],
        }, duration=60000, step=2000)
        self.assertEqual(self.clock.elapsed, 40030)
        self.assertTrue(self.draws[4]["over"])
        self.assertFalse(self.draws[5]["over"])
        self.assertTrue(self.draws[5]["running"])
        self.assertEqual(self.frames[5]["at"], 27030)
        self.assertEqual([name for _, name in self.inputs], ["Press", "Press", "Back"])

    def test_default_session_remains_responsive_for_five_minutes(self):
        for filename in EXAMPLES:
            with self.subTest(filename=filename):
                self.assertEqual(load_example(filename).RUN_MS, 300000)
                self.run_sample(filename, duration=None, missing=True)
                self.assertEqual(self.clock.elapsed, 300000)
                self.assert_frame_times([0])
                self.assertIn("Session ended", self.output.getvalue())
                self.assertEqual(self.power_values, [0])

    def test_menu_does_not_discard_press_collected_later_during_refresh(self):
        for release in ([], [(140, 1)]):
            with self.subTest(release=release):
                game = self.run_sample(scripts={
                    "menu": [(10, 0), (60, 1)],
                    "dial": [(90, 0)] + release,
                }, duration=501, show_delay=[250])
                self.assertEqual([name for _, name in self.inputs], ["Menu", "Press"])
                self.assertTrue(game.running)
                self.assert_frame_times([0, 250, 350, 450])

    def test_turn_queue_cannot_block_reset_and_start(self):
        turns = []
        for at in range(10, 1211, 80):
            turns.extend(((at, 0), (at + 40, 1)))
        game = self.run_sample(scripts={
            "up": turns, "menu": [(1330, 0), (1380, 1)],
            "dial": [(1450, 0), (1500, 1)],
        }, duration=2001, show_delay=[1700])
        self.assertEqual([name for _, name in self.inputs], ["Menu", "Press"])
        self.assertTrue(game.running)
        self.assert_frame_times([0, 1700, 1800, 1900, 2000])

    def test_start_displaces_steering_when_queue_is_full(self):
        turns = []
        for at in range(10, 1211, 80):
            turns.extend(((at, 0), (at + 40, 1)))
        game = self.run_sample(scripts={
            "up": turns, "dial": [(1450, 0), (1500, 1)],
        }, duration=3301, show_delay=[1700])
        handled = [name for _, name in self.inputs]
        self.assertEqual(handled.count("Up"), 15)
        self.assertEqual(handled.count("Press"), 1)
        self.assertEqual(len(handled), 16)
        self.assertTrue(game.running)
        self.assert_frame_times([0] + list(range(1800, 3301, 100)))

    def test_back_wins_over_simultaneous_inputs_without_refresh(self):
        for filename in EXAMPLES:
            with self.subTest(filename=filename):
                game = self.run_sample(filename, scripts={
                    name: [(10, 0)] for name in ("back", "menu", "dial", "up")
                })
                self.assertEqual(self.clock.elapsed, 40)
                self.assert_frame_times([0])
                self.assertEqual(tuple(game.snake), self.draws[0]["snake"])
                self.assertFalse(game.running)

    def test_refresh_captures_complete_turn_cycles_for_following_frame(self):
        game = self.run_sample(scripts={
            "dial": [(10, 0)],
            "up": [(155, 0), (195, 1), (240, 0), (280, 1)],
        }, duration=481, show_delay=[0, 140])
        self.assertEqual(len(self.frames), 4)
        self.assertEqual([frame["at"] for frame in self.frames[:2]], [0, 140])
        self.assertEqual(self.frames[2]["at"], 380)
        self.assertGreater(len(self.wait_calls), 20)
        self.assertEqual([name for _, name in self.inputs], ["Press", "Up", "Up"])
        self.assertEqual(self.draws[1]["direction"], 0)
        self.assertEqual(self.draws[2]["direction"], 3)
        self.assertEqual(self.draws[3]["direction"], 2)
        for before, after in zip(self.draws, self.draws[1:]):
            previous_x, previous_y = before["snake"][0]
            next_x, next_y = after["snake"][0]
            self.assertEqual(abs(next_x - previous_x) + abs(next_y - previous_y), 1)
        self.assertEqual(game.snake[0], (4, 3))
        self.assertFalse(game.over)

    def test_refresh_does_not_reset_held_or_release_debounce_baselines(self):
        game = self.run_sample(scripts={
            "dial": [(10, 0)], "up": [(160, 0), (310, 1), (360, 0)],
        }, duration=461, show_delay=[0, 120])
        self.assertEqual(len(self.frames), 4)
        self.assertEqual([frame["at"] for frame in self.frames[:2]], [0, 140])
        self.assertEqual(self.frames[2]["at"], 360)
        self.assertEqual(self.frames[3]["at"] - self.frames[2]["at"], 100)
        self.assertEqual([name for _, name in self.inputs], ["Press", "Up", "Up"])
        self.assertEqual(self.draws[2]["direction"], 3)
        self.assertEqual(self.draws[3]["direction"], 2)
        self.assertEqual(game.direction, 2)
        self.assertEqual(game.snake[0], (4, 3))

    def test_press_during_initial_refresh_is_not_discarded(self):
        game = self.run_sample(scripts={"dial": [(10, 0), (55, 1)]},
                               duration=350, show_delay=[100])
        self.assertTrue(game.running)
        self.assertEqual([name for _, name in self.inputs], ["Press"])
        self.assertEqual(len(self.frames), 3)
        self.assertGreaterEqual(self.frames[1]["at"], 140)
        self.assertLessEqual(self.frames[1]["at"], 200)
        self.assertEqual(self.frames[2]["at"] - self.frames[1]["at"], 100)

    def test_slow_frame_is_followed_by_full_viewing_interval(self):
        game = self.run_sample(scripts={"dial": [(10, 0)]},
                               duration=620, show_delay=[0, 250])
        self.assert_frame_times([0, 140, 490, 590])
        self.assertEqual(game.snake[0], (7, 4))
        self.assertFalse(game.over)

    def test_back_is_usable_during_viewing_interval_after_slow_refresh(self):
        self.run_sample(scripts={
            "dial": [(10, 0)], "back": [(420, 0)],
        }, duration=700, show_delay=[0, 250])
        self.assert_frame_times([0, 140])
        self.assertEqual(self.clock.elapsed, 450)
        self.assertIn("Snake exited with Back", self.output.getvalue())

    def test_session_limit_explains_how_to_run_again(self):
        self.run_sample(duration=100)
        self.assertIn("Session ended. Click Run in RAM to play again", self.output.getvalue())

    def test_refresh_input_queue_is_bounded_and_back_has_priority(self):
        turns = []
        for at in range(10, 1610, 80):
            turns.extend(((at, 0), (at + 40, 1)))
        self.run_sample(scripts={"up": turns, "dial": [(1800, 0)]}, duration=3431,
                        show_delay=[1700])
        handled = [name for _, name in self.inputs]
        self.assertEqual(handled.count("Up"), 16)
        self.assertEqual(handled.count("Press"), 1)
        self.assertEqual(len(handled), 17)
        self.assert_frame_times([0] + list(range(1930, 3431, 100)))
        for filename in EXAMPLES:
            with self.subTest(filename=filename):
                game = self.run_sample(filename, scripts={
                    "up": turns, "back": [(1650, 0)], "dial": [(1650, 0)],
                }, duration=2500, show_delay=[1700])
                self.assert_frame_times([0])
                self.assertLessEqual(self.clock.elapsed, 1700)
                self.assertFalse(game.running)
                self.assertEqual(game.direction, 0)
                self.assertEqual(tuple(game.snake), self.draws[0]["snake"])
                self.assertEqual([name for _, name in self.inputs], ["Back"])

    def test_square_playfield_and_right_sidebar_stay_within_display(self):
        for filename in EXAMPLES:
            with self.subTest(filename=filename):
                self.run_sample(filename, duration=1)
                frame = self.frames[0]
                self.assertIn((4, 20, 82, 82, 0, False), frame["rects"])
                self.assertTrue(frame["texts"])
                for message, x, y in frame["texts"]:
                    self.assertGreaterEqual(x, 124, message)
                sidebar = " ".join(message for message, _, _ in frame["texts"])
                for word in ("Score", "Up", "Down", "Press", "Menu", "Back"):
                    self.assertIn(word, sidebar)
                for x, y, width, height, _, _ in frame["rects"]:
                    self.assertGreaterEqual(x, 4)
                    self.assertGreaterEqual(y, 5)
                    self.assertLessEqual(x + width, 116)
                    self.assertLessEqual(y + height, 117)

    def test_refresh_time_counts_toward_deadline(self):
        self.run_sample(duration=50, show_delay=80)
        self.assertEqual(self.clock.elapsed, 80)
        self.assert_frame_times([0])
        self.assertEqual(self.power_values, [0])
        self.run_sample(scripts={"dial": [(10, 0)]}, duration=200,
                        show_delay=[0, 100])
        self.assertEqual(self.clock.elapsed, 240)
        self.assert_frame_times([0, 140])
        self.assertEqual(self.power_values, [0])

    def test_display_error_and_keyboard_interrupt_propagate_with_power_off(self):
        for filename in EXAMPLES:
            for error in (OSError("display failed"), KeyboardInterrupt()):
                with self.subTest(filename=filename, error=type(error).__name__):
                    with self.assertRaises(type(error)):
                        self.run_sample(filename, failure=error)
                    self.assertEqual(self.power_values, [0])
                    self.assert_frame_times([0])
        with self.assertRaises(OSError):
            self.run_sample(scripts={"dial": [(10, 0)]},
                            failure=OSError("later refresh failed"), failure_frame=2)
        self.assert_frame_times([0, 140])
        self.assertEqual(self.power_values, [0])

    def test_keyboard_interrupt_during_idle_and_refresh_polling_is_prompt(self):
        for filename in EXAMPLES:
            for delay in (0, 100):
                with self.subTest(filename=filename, delay=delay):
                    with self.assertRaises(KeyboardInterrupt):
                        self.run_sample(filename, interrupt_at=10, show_delay=delay)
                    self.assertEqual(self.clock.elapsed, 10)
                    self.assertEqual(self.power_values, [0])
                    self.assert_frame_times([0])

    def test_nonpositive_duration_never_opens_hardware(self):
        for filename in EXAMPLES:
            for duration in (0, -1):
                with self.subTest(filename=filename, duration=duration):
                    self.run_sample(filename, duration=duration)
                    self.assertEqual(self.controllers, [])
                    self.assertEqual(self.frames, [])

    def test_nonpositive_step_is_rejected_before_opening_hardware(self):
        for filename in EXAMPLES:
            for step in (0, -1):
                with self.subTest(filename=filename, step=step):
                    with self.assertRaises(ValueError):
                        self.run_sample(filename, step=step)
                    self.assertEqual(self.controllers, [])
                    self.assertEqual(self.frames, [])


if __name__ == "__main__":
    unittest.main()
