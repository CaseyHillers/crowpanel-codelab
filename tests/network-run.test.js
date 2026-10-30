import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { withBrowserClock } from "../site/run-clock.js";

const appSource = await readFile(new URL("../site/app.js", import.meta.url), "utf8");
const begin = appSource.indexOf("async function runEditor()");
const end = appSource.indexOf('\nbyId("run-button").addEventListener', begin);
assert.ok(begin >= 0 && end > begin, "expected runEditor boundaries");

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fixture(lesson = "stocks", now = new Date("2026-10-31T15:16:17Z")) {
  const calls = [];
  const errors = [];
  const output = [];
  const sandbox = { workshopFiles: { active: null, dirty: false },
    editor: { value: "print('learner draft')\n" },
    currentLesson: { id: lesson, sample: lesson },
    samples: { stocks: { name: "04_stocks.py" }, snake: { name: "02_snake.py" }, weather: { name: "04_weather.py" }, message: { name: "04_desk_message.py" } },
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
    deskMessage: { disconnect: () => calls.push({ disconnect: true }) },
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

test("Stocks executes UTC clock setup before its draft without editing the learner source", async () => {
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

test("an invalid computer clock prevents Stocks execution and preserves its draft", async () => {
  const setup = fixture("stocks", new Date(NaN));
  const draft = setup.sandbox.editor.value;
  await setup.run();
  assert.equal(setup.calls.length, 0);
  assert.equal(setup.errors.length, 1);
  assert.match(setup.errors[0].message, /computer.*clock/i);
  assert.equal(setup.sandbox.editor.value, draft);
});

test("navigating while Stop finishes cannot change whether the captured draft receives a clock", async () => {
  for (const initialLesson of ["stocks", "snake"]) {
    const setup = fixture(initialLesson);
    const stopped = deferred();
    const previousRun = deferred();
    setup.sandbox.job = { kind: "run" };
    setup.sandbox.connection.stop = () => stopped.promise;
    setup.sandbox.runTask = previousRun.promise.then(() => { setup.sandbox.job = null; });
    const draft = setup.sandbox.editor.value;
    const pending = setup.run();
    const nextLesson = initialLesson === "stocks" ? "snake" : "stocks";
    setup.sandbox.currentLesson = { id: nextLesson, sample: nextLesson };
    setup.sandbox.editor.value = "print('new lesson draft')\n";
    stopped.resolve();
    previousRun.resolve();
    await pending;
    assert.equal(setup.errors.length, 0);
    assert.equal(setup.calls.length, 1);
    assert.equal(setup.calls[0].source.includes("RTC().datetime"), initialLesson === "stocks");
    assert.ok(setup.calls[0].source.endsWith(draft));
    assert.doesNotMatch(setup.calls[0].source, /new lesson draft/);
  }
});


test("archived Weather receives computer UTC without requiring NTP", async () => {
  const setup = fixture("weather");
  await setup.run();
  assert.equal(setup.errors.length, 0);
  assert.equal(setup.calls.length, 1);
  assert.match(setup.calls[0].source, /RTC\(\)\.datetime/);
});

test("message receiver disconnects Bluetooth when execution completes or fails", async () => {
  for (const failure of [false, true]) {
    const setup = fixture("message");
    const running = deferred();
    setup.sandbox.connection.execute = async (source) => {
      setup.calls.push({ source });
      await running.promise;
      if (failure) throw new Error("receiver interrupted");
      return { stdout: "", stderr: "" };
    };
    const pending = setup.run();
    assert.equal(setup.calls.length, 1);
    assert.equal(setup.calls[0].source, setup.sandbox.editor.value);
    running.resolve();
    await pending;
    assert.equal(setup.calls.filter(call => call.disconnect).length, 1);
    assert.equal(setup.errors.length, failure ? 1 : 0);
  }
});

test("receiver cleanup follows the captured lesson when navigation changes during execution", async () => {
  for (const initialLesson of ["message", "snake"]) {
    const setup = fixture(initialLesson);
    const running = deferred();
    setup.sandbox.connection.execute = () => running.promise;
    const pending = setup.run();
    setup.sandbox.currentLesson = { id: initialLesson === "message" ? "snake" : "message" };
    running.resolve({ stdout: "", stderr: "" });
    await pending;
    assert.equal(setup.calls.filter(call => call.disconnect).length, initialLesson === "message" ? 1 : 0);
  }
});
