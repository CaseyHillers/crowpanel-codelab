import unittest

if __package__:
    from .test_crowpanel import PanelFixture, crowpanel
else:
    from test_crowpanel import PanelFixture, crowpanel


class RefreshPollingTests(PanelFixture):
    def prepare_refresh(self):
        self.refresh_started = None
        self.sleep_started = None
        self.activations = 0
        self.pins[9].read = None
        self.pins[9].level = 1 - self.panel._busy_level

        def on_command(data):
            if data == b"\x20" and self.panel.controller == "ssd1680":
                self.activations += 1
                if self.command_sequence()[-2] == (0x22, b"\xf4"):
                    self.refresh_started = self.clock.ticks_ms()
                    self.pins[9].read = refresh_busy
                else:
                    self.pins[9].read = None
                    self.pins[9].level = 0
            elif data == b"\x17" and self.panel.controller == "jd79661":
                self.refresh_started = self.clock.ticks_ms()
                self.pins[9].read = refresh_busy
            if data == (b"\x07" if self.panel.controller == "jd79661" else b"\x10"):
                self.sleep_started = self.clock.ticks_ms()

        def refresh_busy():
            elapsed = self.clock.ticks_diff(self.clock.ticks_ms(), self.refresh_started)
            if self.panel.controller == "jd79661":
                return 0 if 30 <= elapsed < 90 else 1
            return int(elapsed < 90)

        self.on_command = on_command

    def assert_released(self):
        self.assertEqual(self.pins[7].level, 0)
        self.assertEqual(self.pins[14].level, 1)
        self.assertEqual(self.pins[13].level, 1)

    def assert_callback_interrupt(self, predicate):
        interruption = KeyboardInterrupt("stop refresh")

        def on_wait():
            if predicate():
                raise interruption

        with self.assertRaises(KeyboardInterrupt) as caught:
            self.panel.show(on_wait=on_wait)
        self.assertIs(caught.exception, interruption)
        self.assert_released()

    def test_explicit_none_preserves_default_protocol_and_waits(self):
        self.prepare_refresh()
        self.panel.show()
        default_transfers = list(self.transfers)
        default_sleeps = list(self.clock.sleeps)
        default_reset = list(self.pins[10].history)
        default_power = list(self.pins[7].history)

        self.panel = self.create_panel()
        self.transfers.clear()
        self.clock.microseconds = 0
        self.clock.sleeps.clear()
        self.prepare_refresh()
        self.panel.show(on_wait=None)

        self.assertEqual(self.transfers, default_transfers)
        self.assertEqual(self.clock.sleeps, default_sleeps)
        self.assertEqual(self.pins[10].history, default_reset)
        self.assertEqual(self.pins[7].history, default_power)
        self.assert_released()

    def test_show_polls_reset_refresh_and_sleep_without_shortening_waits(self):
        self.assertTrue(self.panel.SUPPORTS_WAIT_CALLBACK)
        self.prepare_refresh()
        observations = []

        def on_wait():
            observations.append((self.clock.ticks_ms(), self.pins[10].level))

        self.panel.show(on_wait=on_wait)

        first_command = next(timestamp for command, _, timestamp in self.transfers if command)
        self.assertTrue(any(timestamp < first_command and reset == 0
                            for timestamp, reset in observations))
        self.assertTrue(any(timestamp < first_command and reset == 1
                            for timestamp, reset in observations))
        self.assertTrue(any(30 <= self.clock.ticks_diff(timestamp, self.refresh_started) < 90
                            for timestamp, _ in observations))
        if self.panel.controller == "jd79661":
            self.assertTrue(any(0 <= self.clock.ticks_diff(timestamp, self.refresh_started) < 30
                                for timestamp, _ in observations))
        self.assertGreaterEqual(self.clock.ticks_diff(self.sleep_started, self.refresh_started), 90)
        poweroff = self.pins[7].history[-1][0]
        self.assertGreaterEqual(self.clock.ticks_diff(poweroff, self.sleep_started), 20)
        self.assertTrue(any(0 <= self.clock.ticks_diff(timestamp, self.sleep_started) < 20
                            for timestamp, _ in observations))
        self.assert_released()

    def test_second_show_polls_throttle_while_power_remains_off(self):
        self.prepare_refresh()
        self.panel.show()
        previous_refresh = self.panel._last_refresh
        started = self.clock.ticks_ms()
        remaining = crowpanel.REFRESH_INTERVAL_MS - self.clock.ticks_diff(started, previous_refresh)
        self.assertGreater(remaining, 0)
        self.prepare_refresh()
        throttle_polls = []

        def on_wait():
            if self.pins[7].level == 0:
                throttle_polls.append(self.clock.ticks_ms())

        self.panel.show(on_wait=on_wait)
        self.assertGreater(len(throttle_polls), 1)
        self.assertTrue(any(self.clock.ticks_diff(timestamp, started) < remaining
                            for timestamp in throttle_polls))
        powered_at = next(timestamp for timestamp, value in self.pins[7].history
                          if value == 1 and self.clock.ticks_diff(timestamp, started) >= 0)
        self.assertGreaterEqual(self.clock.ticks_diff(powered_at, started), remaining)
        self.assertGreaterEqual(self.clock.ticks_diff(self.panel._last_refresh, previous_refresh),
                                crowpanel.REFRESH_INTERVAL_MS)
        self.assert_released()

    def test_callback_can_interrupt_throttle_before_power_is_enabled(self):
        self.prepare_refresh()
        self.panel.show()
        transfers_before = list(self.transfers)
        power_history_before = list(self.pins[7].history)
        self.assert_callback_interrupt(lambda: True)
        self.assertEqual(self.transfers, transfers_before)
        self.assertEqual(self.pins[7].history, power_history_before)

    def test_callback_can_interrupt_reset_with_safe_cleanup(self):
        self.prepare_refresh()
        self.assert_callback_interrupt(lambda: self.pins[10].level == 0)
        self.assertIsNone(self.refresh_started)

    def test_initialization_busy_wait_polls_and_can_be_interrupted(self):
        self.prepare_refresh()
        busy_reads = []

        def stay_busy():
            busy_reads.append(self.clock.ticks_ms())
            return self.panel._busy_level

        self.pins[9].read = stay_busy
        self.assert_callback_interrupt(lambda: bool(busy_reads))
        self.assertIsNone(self.refresh_started)

    def test_callback_can_interrupt_refresh_completion_with_safe_cleanup(self):
        self.prepare_refresh()
        self.assert_callback_interrupt(
            lambda: self.refresh_started is not None
            and 30 <= self.clock.ticks_diff(self.clock.ticks_ms(), self.refresh_started) < 90)
        if self.panel.controller == "jd79661":
            self.assertNotIn((0x07, b"\xa5"), self.command_sequence())
            self.assertTrue(self.panel._refresh_pending)

    def test_callback_can_interrupt_sleep_delay_without_leaving_power_on(self):
        self.prepare_refresh()
        self.assert_callback_interrupt(lambda: self.sleep_started is not None)

    def test_polling_does_not_turn_stuck_refresh_busy_into_success(self):
        self.prepare_refresh()
        scripted_command = self.on_command

        def stay_busy(data):
            scripted_command(data)
            if self.refresh_started is not None:
                self.pins[9].read = None
                self.pins[9].level = self.panel._busy_level

        self.on_command = stay_busy
        polls = []
        with self.assertRaisesRegex(OSError, "BUSY"):
            self.panel.show(on_wait=lambda: polls.append(self.clock.ticks_ms()))
        elapsed = self.clock.ticks_diff(self.clock.ticks_ms(), self.refresh_started)
        self.assertGreaterEqual(elapsed, crowpanel.BUSY_TIMEOUT_MS)
        self.assertLess(elapsed, crowpanel.BUSY_TIMEOUT_MS + 100)
        self.assertTrue(any(self.clock.ticks_diff(timestamp, self.refresh_started) >= 0
                            for timestamp in polls))
        if self.panel.controller == "jd79661":
            self.assertNotIn((0x07, b"\xa5"), self.command_sequence())
            self.assertTrue(self.panel._refresh_pending)
        self.assert_released()

    def test_callback_can_interrupt_ssd_poweroff_busy_wait(self):
        if self.panel.controller != "ssd1680":
            self.skipTest("SSD1680 has a separate booster power-off BUSY wait")
        self.prepare_refresh()
        scripted_command = self.on_command

        def poweroff_busy(data):
            scripted_command(data)
            if self.activations == 2:
                self.pins[9].level = 1

        self.on_command = poweroff_busy
        self.assert_callback_interrupt(lambda: self.activations == 2)
        self.assertIn((0x10, b"\x01"), self.command_sequence())


class JDRefreshPollingTests(RefreshPollingTests):
    def create_panel(self):
        panel = crowpanel.CrowPanel(controller="jd79661")
        self.pins[9].level = 1
        return panel

    def test_callback_can_interrupt_busy_assertion_without_sending_sleep(self):
        self.prepare_refresh()
        self.assert_callback_interrupt(
            lambda: self.refresh_started is not None
            and self.clock.ticks_diff(self.clock.ticks_ms(), self.refresh_started) < 30)
        self.assertTrue(self.panel._refresh_pending)
        self.assertNotIn((0x07, b"\xa5"), self.command_sequence())

    def test_callback_activity_cannot_replace_required_busy_assertion(self):
        self.prepare_refresh()
        scripted_command = self.on_command

        def never_assert(data):
            scripted_command(data)
            self.pins[9].read = None
            self.pins[9].level = 1

        self.on_command = never_assert
        polls = []
        with self.assertRaisesRegex(OSError, "did not assert BUSY"):
            self.panel.show(on_wait=lambda: polls.append(self.clock.ticks_ms()))
        elapsed = self.clock.ticks_diff(self.clock.ticks_ms(), self.refresh_started)
        self.assertGreaterEqual(elapsed, 1000)
        self.assertLess(elapsed, 1100)
        self.assertTrue(any(self.clock.ticks_diff(timestamp, self.refresh_started) >= 0
                            for timestamp in polls))
        self.assertTrue(self.panel._refresh_pending)
        self.assertNotIn((0x07, b"\xa5"), self.command_sequence())
        self.assert_released()


if __name__ == "__main__":
    unittest.main()
