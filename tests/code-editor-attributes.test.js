import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../site/code-editor.js", import.meta.url), "utf8");
const begin = source.indexOf("    setAttribute(name, value) {");
const end = source.indexOf("    addEventListener(type,", begin);
assert.ok(begin >= 0 && end > begin, "expected editor attribute adapter boundaries");

function fixture() {
  const updates = [], textareaAttributes = new Map();
  let dispatching = false;
  const attributes = { "aria-label": "Python source: weather.py", "aria-describedby": "editor-help" };
  const sandbox = {
    attributes,
    textarea: { setAttribute: (name, value) => textareaAttributes.set(name, String(value)) },
    contentAttributes: { reconfigure: value => value },
    EditorView: { contentAttributes: { of: value => value } },
    view: { dispatch: update => {
      if (dispatching) throw new Error("CodeMirror update already in progress");
      updates.push(update);
    } },
  };
  const editor = runInNewContext(`({${source.slice(begin, end)}})`, sandbox);
  return { editor, attributes, updates, textareaAttributes, duringUpdate: () => { dispatching = true; } };
}

test("repeating the current editor label from an input listener does not dispatch a nested CodeMirror update", () => {
  const setup = fixture();
  setup.duringUpdate();
  for (let index = 0; index < 3; index += 1) {
    assert.doesNotThrow(() => setup.editor.setAttribute("aria-label", "Python source: weather.py"));
  }
  assert.equal(setup.updates.length, 0);
  assert.equal(setup.textareaAttributes.get("aria-label"), "Python source: weather.py");
});

test("changing the editor label outside an input update reconfigures once and preserves other accessibility attributes", () => {
  const setup = fixture();
  setup.editor.setAttribute("aria-label", "Python source: stocks.py");
  setup.editor.setAttribute("aria-label", "Python source: stocks.py");
  assert.equal(setup.updates.length, 1);
  assert.equal(setup.updates[0].effects["aria-label"], "Python source: stocks.py");
  assert.equal(setup.updates[0].effects["aria-describedby"], "editor-help");
  assert.equal(setup.attributes["aria-label"], "Python source: stocks.py");
  assert.equal(setup.textareaAttributes.get("aria-label"), "Python source: stocks.py");
});
