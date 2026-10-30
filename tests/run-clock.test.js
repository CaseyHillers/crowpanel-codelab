import test from "node:test";
import assert from "node:assert/strict";
import { withBrowserClock } from "../site/run-clock.js";

test("stocks runs seed RTC in UTC before learner code without NTP or changing the draft", () => {
  const draft = "print('learner stocks')\n";
  const result = withBrowserClock(draft, new Date("2026-11-01T00:30:45+02:00"));
  assert.match(result, /RTC\(\)\.datetime\(\(2026, 10, 31, 5, 22, 30, 45, 0\)\)/);
  assert.ok(result.indexOf("RTC().datetime") < result.indexOf(draft));
  assert.ok(result.endsWith(draft));
  assert.doesNotMatch(result, /ntptime|sync_time/);
  assert.equal(draft, "print('learner stocks')\n");
});

test("an invalid or stale computer clock fails before any learner code is prepared", () => {
  for (const now of [new Date(NaN), new Date("2025-12-31T23:59:59Z"), new Date("+010000-01-01T00:00:00Z")]) {
    assert.throws(() => withBrowserClock("print('run')", now), /computer.*clock/i);
  }
});
