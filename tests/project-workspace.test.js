import test from "node:test";
import assert from "node:assert/strict";
import { createProjectWorkspace } from "../site/project-workspace.js";
import { createProjectStore, STORAGE_KEY } from "../site/project-store.js";

function fixture({ data = new Map(), confirm = () => true } = {}) {
  const nodes = new Map();
  const document = { createElement: () => ({}) };
  const byId = id => {
    if (!nodes.has(id)) nodes.set(id, {
      value: "", hidden: false, disabled: false, textContent: "", children: [], ownerDocument: document,
      addEventListener(event, handler) { this[event] = handler; },
      replaceChildren() { this.children = []; },
      append(child) { this.children.push(child); },
      focus() { this.focused = true; },
    });
    return nodes.get(id);
  };
  let error = null, nextId = data.size * 100;
  const storage = {
    getItem: key => data.get(key) ?? null,
    setItem(key, value) { if (error) throw error; data.set(key, value); },
  };
  const store = createProjectStore({
    getStorage: () => storage, makeId: () => `test-${++nextId}`, now: () => "2026-10-30T12:00:00Z",
  });
  const editor = { value: "", focus() { this.focused = true; } };
  const workspace = createProjectWorkspace({ editor, byId, starter: "print('starter')\n", store, confirm });
  return {
    workspace, editor, byId, data, store, fail: () => { error = new Error("quota"); },
    edit(source) { editor.value = source; workspace.edited(); },
    name(value) { byId("project-filename").value = value; byId("project-filename").input(); },
    choose(id) { byId("project-select").value = id; byId("project-select").change(); },
  };
}

test("opening and editing do not persist until an explicit save, which survives a new workspace", () => {
  const setup = fixture();
  setup.workspace.open();
  assert.equal(setup.editor.value, "print('starter')\n");
  assert.equal(setup.data.size, 0);
  setup.edit("print('custom')\n");
  setup.name("custom");
  assert.equal(setup.workspace.dirty, true);
  assert.equal(setup.workspace.label, "Unsaved changes");
  assert.equal(setup.data.size, 0);
  setup.byId("save-project").click();
  assert.equal(setup.workspace.dirty, false);
  assert.equal(setup.workspace.filename, "custom.py");
  assert.equal(setup.byId("project-save-error").hidden, true);
  const reload = fixture({ data: setup.data });
  reload.workspace.open();
  assert.equal(reload.editor.value, "print('custom')\n");
  assert.equal(reload.workspace.filename, "custom.py");
  assert.equal(reload.workspace.dirty, false);
});

test("route reopening preserves an unsaved draft and empty source can be saved", () => {
  const setup = fixture();
  setup.workspace.open();
  setup.edit("");
  setup.name("blank.py");
  setup.editor.value = "other lesson code";
  setup.workspace.open();
  assert.equal(setup.editor.value, "");
  assert.equal(setup.workspace.dirty, true);
  setup.workspace.save();
  assert.equal(setup.store.list()[0].source, "");
});

test("quota and filename errors preserve the editor, dirty state and previous saved version", () => {
  const setup = fixture();
  setup.workspace.open();
  setup.workspace.save();
  const before = setup.data.get(STORAGE_KEY);
  setup.edit("new unsaved work");
  setup.name("../bad.py");
  setup.workspace.save();
  assert.equal(setup.editor.value, "new unsaved work");
  assert.equal(setup.workspace.filename, "../bad.py");
  assert.equal(setup.workspace.dirty, true);
  assert.equal(setup.byId("project-save-error").hidden, false);
  setup.name("valid.py");
  setup.fail();
  setup.workspace.save();
  assert.equal(setup.data.get(STORAGE_KEY), before);
  assert.equal(setup.editor.value, "new unsaved work");
  assert.equal(setup.workspace.dirty, true);
  assert.match(setup.byId("project-save-error").textContent, /download/i);
});

test("cancelling new, switch or reset leaves unsaved work and selection intact", () => {
  const questions = [];
  const setup = fixture({ confirm: message => { questions.push(message); return false; } });
  const first = setup.store.save({ name: "first.py", source: "first" });
  const second = setup.store.save({ name: "second.py", source: "second" });
  setup.workspace.open();
  setup.edit("unsaved first");
  setup.byId("new-project").click();
  setup.choose(second.id);
  setup.workspace.reset();
  assert.equal(questions.length, 3);
  assert.equal(setup.editor.value, "unsaved first");
  assert.equal(setup.workspace.filename, "first.py");
  assert.equal(setup.byId("project-select").value, first.id);
  assert.equal(setup.workspace.dirty, true);
});

test("confirmed switching restores saved projects and new creates an unsaved starter", () => {
  const setup = fixture();
  setup.store.save({ name: "my_project.py", source: "first" });
  const second = setup.store.save({ name: "second.py", source: "second" });
  setup.workspace.open();
  setup.edit("discard this");
  setup.choose(second.id);
  assert.equal(setup.editor.value, "second");
  assert.equal(setup.workspace.dirty, false);
  setup.byId("new-project").click();
  assert.equal(setup.editor.value, "print('starter')\n");
  assert.equal(setup.workspace.filename, "project_2.py");
  assert.equal(setup.byId("delete-project").disabled, true);
  assert.equal(setup.store.list().length, 2);
});

test("delete requires confirmation and retains the current code as an unsaved project", () => {
  let approved = false;
  const setup = fixture({ confirm: () => approved });
  setup.workspace.open();
  setup.edit("my code");
  setup.workspace.save();
  setup.edit("latest unsaved code");
  setup.byId("delete-project").click();
  assert.equal(setup.store.list().length, 1);
  approved = true;
  setup.byId("delete-project").click();
  assert.equal(setup.store.list().length, 0);
  assert.equal(setup.editor.value, "latest unsaved code");
  assert.equal(setup.workspace.dirty, true);
  assert.equal(setup.byId("delete-project").disabled, true);
  setup.workspace.open();
  assert.equal(setup.editor.value, "latest unsaved code");
});

test("failed deletion preserves the saved project and editor draft", () => {
  const setup = fixture();
  setup.workspace.open();
  setup.workspace.save();
  setup.edit("unsaved");
  setup.fail();
  setup.byId("delete-project").click();
  assert.equal(setup.store.list().length, 1);
  assert.equal(setup.editor.value, "unsaved");
  assert.equal(setup.workspace.dirty, true);
  assert.equal(setup.byId("delete-project").disabled, false);
  assert.equal(setup.byId("project-save-error").hidden, false);
});

test("confirmed starter restore changes only the draft until saved", () => {
  const setup = fixture();
  setup.workspace.open();
  setup.edit("original saved code");
  setup.workspace.save();
  setup.workspace.reset();
  assert.equal(setup.editor.value, "print('starter')\n");
  assert.equal(setup.workspace.dirty, true);
  assert.equal(setup.store.list()[0].source, "original saved code");
  assert.equal(setup.editor.focused, true);
});
