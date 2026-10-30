import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../site/app.js", import.meta.url), "utf8");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture(action, overrides = {}) {
  const nodes = new Map();
  const events = [];
  const errors = [];
  const alerts = [];
  const byId = (id) => {
    if (!nodes.has(id)) nodes.set(id, {
      textContent: "", files: [],
      addEventListener: (_event, handler) => { nodes.get(id).click = handler; },
    });
    return nodes.get(id);
  };
  let pending;
  const sandbox = {
    byId, transitioning: false, stopping: false, checkingUsb: false,
    job: null, runTask: null, stopRequested: false,
    serialAvailable: true, usbDetected: true, firmwareLoading: false,
    firmwareSelectionError: false, selectedFirmware: null,
    FIRMWARE: { version: "test", board: "ESP32-S3" },
    connection: { connected: action === "reset", stop: async () => { events.push("stop"); } },
    requireDevice: () => sandbox.connection.connected,
    window: {
      confirm: () => { events.push("confirm"); return true; },
      alert: (message) => { events.push("alert"); alerts.push(message); },
    },
    updateControls: () => { events.push("controls"); },
    resetVerification: () => { events.push("clear verification"); },
    resetFilesSource: "wipe files",
    libraryFiles: [{ name: "crowpanel.py", data: "driver" }],
    starterSource: "board check",
    resetDevice: async () => { events.push("reset files"); },
    flashMicroPython: async () => { events.push("flash"); return { success: true }; },
    reportError: (error) => { errors.push(error); },
    setStatus: (status) => { byId("action-status").textContent = status; },
    appendOutput: () => {},
    ...overrides,
  };
  // Match perform's ownership and error handling while testing the real listener.
  sandbox.perform = (kind, _label, callback) => {
    assert.equal(sandbox.job, null);
    sandbox.job = { kind };
    pending = (async () => {
      try { await callback(); }
      catch (error) { sandbox.reportError(error); }
      finally { sandbox.job = null; }
    })();
    return pending;
  };
  const [start, end] = action === "reset"
    ? ['byId("reset-device").addEventListener', "\nasync function runEditor"]
    : ['byId("flash-button").addEventListener', "\nif (!serialAvailable)"];
  const begin = source.indexOf(start);
  const finish = source.indexOf(end, begin);
  assert.ok(begin >= 0 && finish > begin, "expected action listener boundaries");
  runInNewContext(source.slice(begin, finish), sandbox);
  return {
    sandbox, byId, events, errors, alerts,
    click: () => byId(action === "reset" ? "reset-device" : "flash-button").click(),
    settled: () => pending,
  };
}

test("cancelling device reset leaves the running program and device files untouched", async () => {
  const setup = fixture("reset");
  setup.sandbox.window.confirm = () => false;
  setup.byId("reset-status").textContent = "Unchanged";
  await setup.click();
  assert.deepEqual(setup.events, []);
  assert.equal(setup.byId("reset-status").textContent, "Unchanged");
  assert.equal(setup.sandbox.transitioning, false);
});

test("device reset waits for Stop and the active run to finish before deleting files", async () => {
  const stop = deferred();
  const run = deferred();
  const setup = fixture("reset");
  setup.sandbox.job = { kind: "run" };
  setup.sandbox.connection.stop = () => { setup.events.push("stop"); return stop.promise; };
  setup.sandbox.runTask = run.promise.then(() => { setup.sandbox.job = null; });
  const resetting = setup.click();
  assert.equal(setup.sandbox.transitioning, true);
  assert.equal(setup.sandbox.stopRequested, true);
  assert.equal(setup.events.includes("reset files"), false);
  stop.resolve();
  await Promise.resolve();
  assert.equal(setup.events.includes("reset files"), false);
  run.resolve();
  await resetting;
  assert.ok(setup.events.indexOf("stop") < setup.events.indexOf("reset files"));
  assert.match(setup.byId("reset-status").textContent, /Workshop files ready/);
  assert.equal(setup.sandbox.transitioning, false);
  assert.equal(setup.sandbox.job, null);
});

test("losing the device during Stop never deletes files or retains a previous reset success", async () => {
  const setup = fixture("reset");
  setup.byId("reset-status").textContent = "Device files reset. Workshop files ready.";
  setup.sandbox.connection.stop = async () => { setup.sandbox.connection.connected = false; };
  await setup.click();
  assert.equal(setup.events.includes("reset files"), false);
  assert.match(setup.byId("reset-status").textContent, /Reset not started/);
  assert.doesNotMatch(setup.byId("action-status").textContent, /Reset complete/);
  assert.equal(setup.sandbox.transitioning, false);
});

test("device reset failure remains incomplete and cannot announce readiness", async () => {
  const setup = fixture("reset", { resetDevice: async () => { throw new Error("write failed"); } });
  await setup.click();
  assert.match(setup.byId("reset-status").textContent, /Reset incomplete/);
  assert.match(setup.byId("install-status").textContent, /Reset incomplete/);
  assert.doesNotMatch(setup.byId("action-status").textContent, /Reset complete/);
  assert.equal(setup.errors.length, 1);
  assert.match(setup.errors[0].message, /write failed/);
  assert.equal(setup.sandbox.transitioning, false);
  assert.equal(setup.sandbox.job, null);
});

test("successful flashing alerts about power cycling only after the installer confirms success", async () => {
  const completed = deferred();
  const setup = fixture("flash", { flashMicroPython: () => completed.promise });
  setup.click();
  assert.equal(setup.alerts.length, 0);
  completed.resolve({ success: true });
  await setup.settled();
  assert.equal(setup.alerts.length, 1);
  assert.match(setup.alerts[0], /unplug.*USB cable.*plug it back in/i);
  assert.match(setup.byId("flash-status").textContent, /written/);
});

test("failed or unconfirmed flashing never shows the successful installation alert", async () => {
  for (const flashMicroPython of [
    async () => { throw new Error("USB failed"); },
    async () => ({ success: false }),
    async () => undefined,
  ]) {
    const setup = fixture("flash", { flashMicroPython });
    setup.click();
    await setup.settled();
    assert.equal(setup.alerts.length, 0);
    assert.match(setup.byId("flash-status").textContent, /Flash not confirmed/);
    assert.equal(setup.errors.length, 1);
  }
});

test("cancelling firmware installation never calls the installer or shows a success alert", async () => {
  const setup = fixture("flash");
  setup.sandbox.window.confirm = () => false;
  setup.click();
  assert.deepEqual(setup.events, []);
  assert.equal(setup.alerts.length, 0);
});
