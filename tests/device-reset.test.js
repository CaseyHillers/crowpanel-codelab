import test from "node:test";
import assert from "node:assert/strict";
import { resetDevice } from "../site/device-reset.js";

const files = [{ name: "crowpanel.py", data: "driver" }];
function fixture(failAt) {
  const calls = [];
  const connection = Object.fromEntries(["softReset", "execute", "writeFiles"].map(name => [name, async (...args) => {
    calls.push([name, ...args]);
    if (calls.length === failAt) throw new Error("device failed");
    return { stdout: "WORKSHOP FILES CLEARED\r\n", stderr: "" };
  }]));
  return { calls, connection };
}

test("reset clears the VM, wipes files, clears deletion state, reinstalls and verifies imports in order", async () => {
  const { calls, connection } = fixture();
  await resetDevice(connection, { clearSource: "wipe", files });
  assert.deepEqual(calls.slice(0, 4), [
    ["softReset"], ["execute", "wipe", { timeoutMs: 30000 }], ["softReset"], ["writeFiles", files],
  ]);
  assert.equal(calls[4][0], "execute");
  assert.match(calls[4][1], /import crowpanel, weather, slides, stocks/);
  assert.deepEqual(calls[4][2], { timeoutMs: 10000 });
});

test("every failed reset phase stops before later destructive or success steps", async () => {
  for (let phase = 1; phase <= 5; phase++) {
    const { calls, connection } = fixture(phase);
    await assert.rejects(resetDevice(connection, { clearSource: "wipe", files }), /device failed/);
    assert.equal(calls.length, phase);
  }
});

test("wipe stderr or missing completion marker prevents reinstall", async () => {
  for (const result of [{ stdout: "", stderr: "" }, { stdout: "WORKSHOP FILES CLEARED", stderr: "error" }]) {
    const { calls, connection } = fixture();
    connection.execute = async () => result;
    await assert.rejects(resetDevice(connection, { clearSource: "wipe", files }), /clearing device files/i);
    assert.equal(calls.filter(([name]) => name === "softReset").length, 1);
    assert.equal(calls.some(([name]) => name === "writeFiles"), false);
  }
});

test("import errors cannot be reported as reset success", async () => {
  const { connection } = fixture();
  let count = 0;
  connection.execute = async () => ++count === 1
    ? { stdout: "WORKSHOP FILES CLEARED", stderr: "" }
    : { stdout: "", stderr: "ImportError" };
  await assert.rejects(resetDevice(connection, { clearSource: "wipe", files }), /import/i);
});
