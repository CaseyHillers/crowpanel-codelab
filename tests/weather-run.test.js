import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { withBrowserClock } from "../site/weather-clock.js";

const appSource = await readFile(new URL("../site/app.js", import.meta.url), "utf8");
const begin = appSource.indexOf("async function runEditor()");
const end = appSource.indexOf('\nbyId("run-button").addEventListener', begin);
assert.ok(begin >= 0 && end > begin, "expected runEditor boundaries");

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fixture(lesson = "weather", now = new Date("2026-10-31T15:16:17Z")) {
  const calls = [];
  const errors = [];
  const output = [];
  const sandbox = {
    editor: { value: "print('learner draft')\n" },
    currentLesson: { id: lesson, sample: lesson },
    samples: { weather: { name: "04_weather.py" }, snake: { name: "02_snake.py" } },
    transitioning: false, stopping: false, job: null, runTask: null,
    stopRequested: false, receivedOutput: 0,
    requireDevice: () => true,
    window: { confirm: () => true },
    connection: {
      execute: async (source, options) => {
        calls.push({ source, options });
        return { stdout: "", stderr: "" };
      },
      stop: async () => {},
    },
    withBrowserClock: source => withBrowserClock(source, now),
    updateControls: () => {},
    reportError: error => { errors.push(error); },
    appendOutput: text => { output.push(text); },
    setStatus: () => {},
  };
  sandbox.perform = async (_kind, _label, action) => {
    assert.equal(sandbox.job, null);
    try { await action(); }
    catch (error) { errors.push(error); }
  };
  runInNewContext(appSource.slice(begin, end), sandbox);
  return { sandbox, calls, errors, output, run: () => sandbox.runEditor() };
}

test("Weather executes UTC clock setup before its draft without editing the learner source", async () => {
  const setup = fixture();
  const draft = setup.sandbox.editor.value;
  await setup.run();
  assert.equal(setup.errors.length, 0);
  assert.equal(setup.calls.length, 1);
  assert.ok(setup.calls[0].source.startsWith("from machine import RTC\nRTC().datetime((2026, 10, 31, 5, 15, 16, 17, 0))\n"));
  assert.ok(setup.calls[0].source.endsWith(draft));
  assert.equal(setup.calls[0].options.timeoutMs, 0);
  assert.equal(setup.sandbox.editor.value, draft);
});

test("other lessons execute their draft unchanged without setting the clock", async () => {
  const setup = fixture("snake");
  const draft = setup.sandbox.editor.value;
  await setup.run();
  assert.equal(setup.errors.length, 0);
  assert.equal(setup.calls.length, 1);
  assert.equal(setup.calls[0].source, draft);
  assert.equal(setup.sandbox.editor.value, draft);
});

test("an invalid computer clock prevents Weather execution and preserves its draft", async () => {
  const setup = fixture("weather", new Date(NaN));
  const draft = setup.sandbox.editor.value;
  await setup.run();
  assert.equal(setup.calls.length, 0);
  assert.equal(setup.errors.length, 1);
  assert.match(setup.errors[0].message, /computer.*clock/i);
  assert.equal(setup.sandbox.editor.value, draft);
});

test("navigating while Stop finishes cannot change whether the captured draft receives a clock", async () => {
  for (const initialLesson of ["weather", "snake"]) {
    const setup = fixture(initialLesson);
    const stopped = deferred();
    const previousRun = deferred();
    setup.sandbox.job = { kind: "run" };
    setup.sandbox.connection.stop = () => stopped.promise;
    setup.sandbox.runTask = previousRun.promise.then(() => { setup.sandbox.job = null; });
    const draft = setup.sandbox.editor.value;
    const pending = setup.run();
    const nextLesson = initialLesson === "weather" ? "snake" : "weather";
    setup.sandbox.currentLesson = { id: nextLesson, sample: nextLesson };
    setup.sandbox.editor.value = "print('new lesson draft')\n";
    stopped.resolve();
    previousRun.resolve();
    await pending;
    assert.equal(setup.errors.length, 0);
    assert.equal(setup.calls.length, 1);
    assert.equal(setup.calls[0].source.includes("RTC().datetime"), initialLesson === "weather");
    assert.ok(setup.calls[0].source.endsWith(draft));
    assert.doesNotMatch(setup.calls[0].source, /new lesson draft/);
  }
});
