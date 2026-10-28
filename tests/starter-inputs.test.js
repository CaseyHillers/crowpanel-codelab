import assert from "node:assert/strict";
import test from "node:test";
import { createStarterInputs } from "../site/starter-inputs.js";

function recordInputs() {
  const updates = [];
  const inputs = createStarterInputs((name, state) => updates.push([name, state]));
  return { inputs, updates };
}

test("tracks independent press and release states for every control", () => {
  const { inputs, updates } = recordInputs();
  const names = ["Up", "Down", "Press", "Menu", "Back"];
  inputs.push(names.map(name => `INPUT ${name} PRESSED\n`).join(""));
  inputs.push(names.map(name => `INPUT ${name} RELEASED\n`).join(""));
  assert.deepEqual(updates, [
    ...names.map(name => [name, "pressed"]),
    ...names.map(name => [name, "seen"]),
  ]);
});

test("waits for complete lines across arbitrary chunks and split CRLF", () => {
  const { inputs, updates } = recordInputs();
  for (const character of "INPUT Up PRESSED") inputs.push(character);
  inputs.push("");
  assert.deepEqual(updates, []);
  inputs.push("\r");
  assert.deepEqual(updates, []);
  inputs.push("\nINPUT Down PRESSED\nINPUT Up REL");
  assert.deepEqual(updates, [["Up", "pressed"], ["Down", "pressed"]]);
  inputs.push("EASED\r\nINPUT Down RELEASED\r\n");
  assert.deepEqual(updates, [
    ["Up", "pressed"], ["Down", "pressed"],
    ["Up", "seen"], ["Down", "seen"],
  ]);
});

test("rejects noise, unknown controls, source echo and nonexact lines", () => {
  const { inputs, updates } = recordInputs();
  inputs.push([
    "", "booting", "INPUT Left PRESSED", "INPUT BOOT PRESSED",
    "INPUT Reset PRESSED", "INPUT up PRESSED", "input Up PRESSED",
    "INPUT Up pressed", " INPUT Up PRESSED", "INPUT Up PRESSED ",
    "INPUT  Up PRESSED", "INPUT Up\tPRESSED", "INPUT Up PRESSED extra",
    ">>> INPUT Up PRESSED", 'print("INPUT Up PRESSED")',
    "prefixINPUT Up PRESSED", "INPUT Up PRESSEDsuffix",
    "INPUT Up PRESSED\rnoise", "INPUT Up PRESSED\r\r",
    "INPUT Up RELEASED", "INPUT Menu RELEASED",
  ].join("\n") + "\n");
  assert.deepEqual(updates, []);
  inputs.push("INPUT Back PRESSED\r\nINPUT Back RELEASED\r\n");
  assert.deepEqual(updates, [["Back", "pressed"], ["Back", "seen"]]);
});

test("initial releases do not pass held controls and seen never regresses", () => {
  const { inputs, updates } = recordInputs();
  inputs.push("INPUT Up RELEASED\nINPUT Up RELEASED\nINPUT Down PRESSED\n");
  inputs.push("INPUT Up RELEASED\nINPUT Down PRESSED\nINPUT Down RELEASED\n");
  inputs.push("INPUT Down PRESSED\nINPUT Down RELEASED\nINPUT Down RELEASED\n");
  inputs.push("INPUT Up PRESSED\nINPUT Up RELEASED\n");
  assert.deepEqual(updates, [
    ["Down", "pressed"], ["Down", "seen"],
    ["Up", "pressed"], ["Up", "seen"],
  ]);
});

test("reset silently clears partial lines and every control state", () => {
  const { inputs, updates } = recordInputs();
  inputs.push("INPUT Up PRESSED\nINPUT Up RELEASED\nINPUT Down PRESSED\nINPUT Back PRE");
  inputs.reset();
  assert.deepEqual(updates, [["Up", "pressed"], ["Up", "seen"], ["Down", "pressed"]]);
  inputs.push("SSED\nINPUT Down RELEASED\nINPUT Up RELEASED\nINPUT Back RELEASED\n");
  assert.equal(updates.length, 3);
  inputs.push("INPUT Up PRESSED\nINPUT Up RELEASED\nINPUT Down PRESSED\n");
  assert.deepEqual(updates.slice(3), [["Up", "pressed"], ["Up", "seen"], ["Down", "pressed"]]);
});

test("bounded unfinished noise cannot turn a suffix into a valid line", () => {
  const { inputs, updates } = recordInputs();
  inputs.push("x".repeat(4096));
  inputs.push("INPUT Up PRESSED\n");
  inputs.push("x".repeat(4097));
  inputs.push("INPUT Down PRESSED\n");
  for (let chunk = 0; chunk < 1000; chunk++) inputs.push("x".repeat(4096));
  inputs.push("INPUT Menu PRESSED\r");
  inputs.push("\n");
  inputs.push("x".repeat(100000) + "INPUT Back PRESSED\nINPUT Press PRESSED\n");
  assert.deepEqual(updates, [["Press", "pressed"]]);
  inputs.push("INPUT Press RELEASED\n");
  assert.deepEqual(updates, [["Press", "pressed"], ["Press", "seen"]]);
});

test("reset recovers immediately from an oversized unfinished line", () => {
  const { inputs, updates } = recordInputs();
  inputs.push("x".repeat(4097));
  inputs.reset();
  inputs.push("INPUT Menu PRESSED\nINPUT Menu RELEASED\n");
  assert.deepEqual(updates, [["Menu", "pressed"], ["Menu", "seen"]]);
});

test("celebration needs all five completed cycles and the exact display marker", () => {
  let celebrations = 0;
  const inputs = createStarterInputs(() => {}, () => { celebrations += 1; });
  inputs.push("DISPLAY CELEBRATION SHOWN\n");
  assert.equal(celebrations, 0);
  for (const name of ["Up", "Down", "Press", "Menu"]) {
    inputs.push(`INPUT ${name} PRESSED\nINPUT ${name} RELEASED\n`);
  }
  inputs.push("INPUT Back RELEASED\nDISPLAY CELEBRATION SHOWN\n");
  assert.equal(celebrations, 0, "an initial release must not count");
  inputs.push("INPUT Back PRESSED\nDISPLAY CELEBRATION SHOWN\n");
  assert.equal(celebrations, 0, "the last release is still missing");
  inputs.push("INPUT Back RELEASED\nDISPLAY CELEBRATION SHOWN extra\n");
  assert.equal(celebrations, 0, "five controls alone is not a successful display sequence");
  for (const character of "DISPLAY CELEBRATION SHOWN\r\n") inputs.push(character);
  assert.equal(celebrations, 1);
  inputs.push("DISPLAY CELEBRATION SHOWN\n");
  assert.equal(celebrations, 1, "duplicate output cannot celebrate twice");
  inputs.reset();
  inputs.push("DISPLAY CELEBRATION SHOWN\n");
  assert.equal(celebrations, 1, "a new attempt needs new input observations");
  for (const name of ["Up", "Down", "Press", "Menu", "Back"]) {
    inputs.push(`INPUT ${name} PRESSED\nINPUT ${name} RELEASED\n`);
  }
  inputs.push("DISPLAY CELEBRATION SHOWN\n");
  assert.equal(celebrations, 2);
});
