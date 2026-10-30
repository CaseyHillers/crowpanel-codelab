import test from "node:test";
import assert from "node:assert/strict";
import { createProjectStore, STORAGE_KEY, normalizeProjectName } from "../site/project-store.js";

function fixture(initial = null) {
  const data = new Map(initial === null ? [] : [[STORAGE_KEY, initial]]);
  const writes = [];
  let writeError = null;
  const storage = {
    getItem: key => data.get(key) ?? null,
    setItem(key, value) {
      if (writeError) throw writeError;
      writes.push([key, value]);
      data.set(key, value);
    },
  };
  let nextId = 0;
  const options = {
    getStorage: () => storage,
    now: () => "2026-10-30T12:00:00.000Z",
    makeId: () => `project-${++nextId}`,
  };
  return { data, writes, storage, options, store: createProjectStore(options), fail: error => { writeError = error; } };
}

test("projects persist independently and reload with their names, source and timestamps", () => {
  const setup = fixture();
  assert.deepEqual(setup.store.load(), []);
  const first = setup.store.save({ name: "desk", source: "print('desk')\n" });
  const second = setup.store.save({ name: "counter.py", source: "" });
  const reload = createProjectStore(setup.options);
  assert.equal(first.name, "desk.py");
  assert.equal(first.updatedAt, "2026-10-30T12:00:00.000Z");
  assert.deepEqual(reload.list(), [first, second]);
  assert.deepEqual(reload.get(first.id), first);
  assert.equal(reload.get("missing"), null);
  reload.save({ id: first.id, name: "renamed.py", source: "print('new')\n" });
  assert.equal(reload.get(first.id).name, "renamed.py");
  assert.equal(reload.get(second.id).source, "");
  reload.remove(first.id);
  assert.deepEqual(setup.store.list(), [second]);
});

test("reads do not create browser data and returned objects cannot mutate saved projects", () => {
  const setup = fixture();
  setup.store.load();
  setup.store.list();
  setup.store.get("missing");
  assert.equal(setup.writes.length, 0);
  const saved = setup.store.save({ name: "desk.py", source: "original" });
  saved.source = "changed outside store";
  const loaded = setup.store.get(saved.id);
  assert.equal(loaded.source, "original");
  loaded.name = "changed.py";
  assert.equal(setup.store.get(saved.id).name, "desk.py");
});

test("saving and removing reread browser data to preserve other tabs' projects", () => {
  const setup = fixture();
  const first = setup.store.save({ name: "first.py", source: "first" });
  const other = createProjectStore({ ...setup.options, makeId: () => "other-tab" });
  const second = other.save({ name: "second.py", source: "second" });
  setup.store.save({ id: first.id, name: first.name, source: "updated" });
  assert.equal(other.get(second.id).source, "second");
  other.remove(second.id);
  assert.equal(setup.store.get(first.id).source, "updated");
});

test("failed saves and deletions leave the last persisted project intact", () => {
  const setup = fixture();
  const project = setup.store.save({ name: "keep.py", source: "keep this" });
  const before = setup.data.get(STORAGE_KEY);
  setup.fail(new Error("QuotaExceededError"));
  for (const operation of [
    () => setup.store.save({ id: project.id, name: project.name, source: "new draft" }),
    () => setup.store.save({ name: "another.py", source: "unsaved" }),
    () => setup.store.remove(project.id),
  ]) {
    assert.throws(operation, /save|storage/i);
    assert.equal(setup.data.get(STORAGE_KEY), before);
    assert.deepEqual(setup.store.list(), [project]);
  }
});

test("blocked localStorage access gives actionable guidance without throwing at construction", () => {
  for (const getStorage of [
    () => { throw new Error("SecurityError"); },
    () => ({ getItem() { throw new Error("SecurityError"); } }),
    () => undefined,
  ]) {
    const store = createProjectStore({ getStorage });
    assert.throws(() => store.load(), /storage.*unavailable.*download/i);
    assert.throws(() => store.save({ name: "desk.py", source: "keep" }), /storage.*unavailable.*download/i);
  }
});

test("malformed or unsupported saved data cannot be silently overwritten or deleted", () => {
  const valid = { id: "one", name: "one.py", source: "print(1)", updatedAt: "2026-10-30T12:00:00Z" };
  for (const initial of [
    "{broken", "null", "[]", JSON.stringify({ version: 2, projects: [] }),
    JSON.stringify({ version: 1, projects: {} }),
    JSON.stringify({ version: 1, projects: [null] }),
    JSON.stringify({ version: 1, projects: [{ ...valid, source: 42 }] }),
    JSON.stringify({ version: 1, projects: [{ ...valid, name: "../one.py" }] }),
    JSON.stringify({ version: 1, projects: [{ ...valid, updatedAt: "yesterday" }] }),
    JSON.stringify({ version: 1, projects: [valid, valid] }),
  ]) {
    const setup = fixture(initial);
    for (const operation of [
      () => setup.store.load(),
      () => setup.store.save({ name: "new.py", source: "new" }),
      () => setup.store.remove("one"),
    ]) assert.throws(operation, /saved projects.*read|version/i);
    assert.equal(setup.data.get(STORAGE_KEY), initial);
    assert.equal(setup.writes.length, 0);
  }
});

test("file names stay flat and Python-only; duplicate names or unknown IDs never overwrite data", () => {
  const setup = fixture();
  const project = setup.store.save({ name: "desk.py", source: "keep" });
  const before = setup.data.get(STORAGE_KEY);
  for (const name of ["", "../desk.py", "sub/desk.py", "sub\\desk.py", "main.js", "<script>.py", "a\n.py", "a".repeat(125) + ".py"]) {
    assert.throws(() => setup.store.save({ name, source: "bad" }), /name|filename/i);
  }
  assert.throws(() => setup.store.save({ name: "desk.py", source: "duplicate" }), /already exists/i);
  assert.throws(() => setup.store.save({ id: "missing", name: "new.py", source: "bad" }), /no longer exists/i);
  assert.throws(() => setup.store.remove("missing"), /no longer exists/i);
  assert.equal(setup.data.get(STORAGE_KEY), before);
  assert.equal(setup.store.get(project.id).source, "keep");
  assert.equal(normalizeProjectName("  my_project  "), "my_project.py");
});
