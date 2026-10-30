import test from "node:test";
import assert from "node:assert/strict";
import { createWorkshopFiles } from "../site/workshop-files.js";

const files = [
  { name: "04_stocks.py", source: "fetch_quote()\n", kind: "script" },
  { name: "weather.py", source: "def fetch_json(): pass\n", kind: "library" },
  { name: "stocks.py", source: "def fetch_quote(): pass\n", kind: "library" },
  { name: "stocks_ca.pem", source: "-----BEGIN CERTIFICATE-----\n", kind: "certificate" },
];

function fixture({ confirm = () => true } = {}) {
  const makeNode = () => ({
    value: "", textContent: "", children: [],
    append(node) { this.children.push(node); },
    replaceChildren() { this.children = []; },
    addEventListener(event, callback) { this[event] = callback; },
  });
  const select = makeNode();
  select.ownerDocument = { createElement: makeNode };
  const editor = { value: "edited lesson draft", focus() { this.focused = true; } };
  const events = [];
  const workspace = createWorkshopFiles({
    editor, byId: id => { assert.equal(id, "workshop-file-select"); return select; }, files, confirm,
    onPrimary() {
      events.push(["primary", workspace.active]);
      editor.value = "edited lesson draft";
    },
    onChange() { events.push(["change", workspace.active]); },
  });
  return {
    editor, workspace, select, events,
    choose(name) { select.value = name; select.change(); },
    edit(source) { editor.value = source; workspace.edited(); },
  };
}

test("file chooser groups all bundled file kinds and starts on the primary script without changing its source", () => {
  const setup = fixture();
  setup.workspace.configure("04_stocks.py");
  assert.equal(setup.editor.value, "edited lesson draft");
  assert.equal(setup.workspace.active, null);
  assert.equal(setup.workspace.source, null);
  assert.equal(setup.workspace.dirty, false);
  assert.equal(setup.select.children[0].textContent, "04_stocks.py");
  assert.deepEqual(setup.select.children.slice(1).map(group => [group.label, group.children.map(option => option.value)]), [
    ["Workshop libraries", ["weather.py", "stocks.py"]],
    ["HTTPS certificates", ["stocks_ca.pem"]],
  ]);
  setup.workspace.configure("03_slideshow.py");
  assert.deepEqual(setup.select.children[1].children.map(option => option.value), ["04_stocks.py"]);
  assert.equal(setup.events.length, 0);
});

test("switching among libraries and returning to the lesson preserves each edited source including an empty draft", () => {
  const setup = fixture();
  setup.workspace.configure("04_stocks.py");
  setup.choose("weather.py");
  assert.equal(setup.workspace.active.kind, "library");
  assert.equal(setup.editor.value, files[1].source);
  setup.edit("def fetch_json(): return {'price': 42}\n");
  setup.choose("stocks.py");
  setup.edit("");
  setup.choose("weather.py");
  assert.equal(setup.editor.value, "def fetch_json(): return {'price': 42}\n");
  assert.equal(setup.workspace.label, "Edited · tab only");
  setup.choose("stocks.py");
  assert.equal(setup.editor.value, "");
  setup.choose("");
  assert.equal(setup.workspace.active, null);
  assert.equal(setup.editor.value, "edited lesson draft");
  assert.deepEqual(setup.events.at(-1), ["primary", null]);
  assert.equal(setup.workspace.dirty, true);
  assert.equal(files[1].source, "def fetch_json(): pass\n");
});

test("route reconfiguration clears the active file without losing edited library drafts or overwriting the next editor", () => {
  const setup = fixture();
  setup.workspace.configure("04_stocks.py");
  setup.choose("weather.py");
  // Capture also protects programmatic edits that have not dispatched input.
  setup.editor.value = "programmatically changed library";
  setup.workspace.configure("03_slideshow.py");
  assert.equal(setup.workspace.active, null);
  assert.equal(setup.editor.value, "programmatically changed library");
  setup.editor.value = "slideshow lesson draft";
  assert.equal(setup.workspace.dirty, true);
  setup.choose("weather.py");
  assert.equal(setup.editor.value, "programmatically changed library");
  assert.equal(setup.workspace.source, setup.editor.value);
});

test("reset cancellation preserves source and confirmed reset affects only the selected file", () => {
  let allow = false;
  const prompts = [];
  const setup = fixture({ confirm(message) { prompts.push(message); return allow; } });
  setup.workspace.configure("04_stocks.py");
  setup.choose("weather.py");
  setup.edit("edited weather");
  setup.choose("stocks.py");
  setup.edit("edited stocks");
  setup.workspace.reset();
  assert.equal(setup.editor.value, "edited stocks");
  assert.equal(setup.workspace.label, "Edited · tab only");
  assert.match(prompts[0], /stocks\.py/);
  allow = true;
  setup.workspace.reset();
  assert.equal(setup.editor.value, files[2].source);
  assert.equal(setup.workspace.label, "Sample");
  assert.equal(setup.editor.focused, true);
  assert.equal(setup.workspace.dirty, true);
  setup.choose("weather.py");
  assert.equal(setup.editor.value, "edited weather");
  setup.workspace.reset();
  assert.equal(setup.workspace.dirty, false);
});

test("certificate text and metadata are available for inspection/editing without treating it as Python", () => {
  const setup = fixture();
  setup.workspace.configure("04_stocks.py");
  setup.choose("stocks_ca.pem");
  assert.deepEqual(setup.workspace.active, files[3]);
  setup.edit("replacement PEM\n");
  assert.deepEqual(setup.workspace.active, { ...files[3], source: "replacement PEM\n" });
  assert.equal(setup.workspace.dirty, true);
});

test("unknown selection and primary-mode input/reset cannot change workshop source", () => {
  const setup = fixture();
  setup.workspace.configure("04_stocks.py");
  setup.workspace.edited();
  setup.workspace.reset();
  assert.equal(setup.workspace.dirty, false);
  assert.equal(setup.editor.value, "edited lesson draft");
  setup.choose("../main.py");
  assert.equal(setup.select.value, "");
  assert.equal(setup.workspace.active, null);
  assert.equal(setup.events.length, 0);
  setup.choose("stocks.py");
  setup.choose("unknown.py");
  assert.equal(setup.select.value, "stocks.py");
  assert.equal(setup.editor.value, files[2].source);
});
