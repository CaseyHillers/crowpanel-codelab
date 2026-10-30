import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../site/app.js", import.meta.url), "utf8");
function section(start, end) {
  const begin = source.indexOf(start), finish = source.indexOf(end, begin);
  assert.ok(begin >= 0 && finish > begin, `expected ${start} boundaries`);
  return source.slice(begin, finish);
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
function writeFixture({ confirm = true, writeError, reloadError } = {}) {
  let listener, pending;
  const events = [], errors = [], statuses = [], confirmations = [];
  const sandbox = {
    workshopFiles: { active: { name: "weather.py", kind: "library", source: "edited source" } },
    requireDevice: () => true, job: null, transitioning: false, stopping: false,
    window: { confirm: text => { confirmations.push(text); return confirm; } },
    byId: () => ({ addEventListener: (_event, handler) => { listener = handler; } }),
    setStatus: text => statuses.push(text),
    connection: {
      async writeFile(name, text) {
        events.push({ write: name, text });
        if (writeError) throw writeError;
      },
      async execute(text) { events.push({ execute: text }); return { stderr: reloadError ? "reload failed" : "" }; },
    },
    perform(_kind, _label, action) {
      pending = (async () => { try { await action(); } catch (error) { errors.push(error); } })();
      return pending;
    },
  };
  runInNewContext(section("async function refreshWorkshopImports()", '\nbyId("install-button").addEventListener'), sandbox);
  return { sandbox, events, errors, statuses, confirmations, click: () => listener(), settled: () => pending };
}

test("cancelled selected-file overwrite never writes or refreshes device imports", async () => {
  const setup = writeFixture({ confirm: false });
  setup.click();
  await setup.settled();
  assert.deepEqual(setup.events, []);
  assert.deepEqual(setup.statuses, []);
  assert.match(setup.confirmations[0], /Overwrite weather\.py/);
});

test("selected-file write captures exactly its filename and source before waiting or navigating", async () => {
  const setup = writeFixture();
  const waiting = deferred();
  setup.sandbox.connection.writeFile = async (name, text) => {
    setup.events.push({ write: name, text });
    await waiting.promise;
  };
  setup.click();
  setup.sandbox.workshopFiles.active = { name: "stocks.py", source: "different file", kind: "library" };
  setup.sandbox.currentLesson = { id: "project" };
  assert.equal(setup.events.length, 1);
  assert.deepEqual(setup.events[0], { write: "weather.py", text: "edited source" });
  waiting.resolve();
  await setup.settled();
  assert.equal(setup.events.length, 2);
  const refresh = setup.events[1].execute;
  assert.match(refresh, /del sys\.modules\[module_name\]/);
  for (const module of ["crowpanel", "weather", "slides", "stocks", "desk_message"]) assert.ok(refresh.includes(`'${module}'`));
  assert.doesNotMatch(refresh, /main\.py|soft_reset|exec\(/);
  assert.equal(setup.errors.length, 0);
  assert.match(setup.statuses[0], /^weather\.py written.*No script was run/);
});

test("failed selected-file writes skip import refresh and never report success", async () => {
  const setup = writeFixture({ writeError: new Error("USB lost") });
  setup.click();
  await setup.settled();
  assert.equal(setup.events.length, 1);
  assert.equal(setup.errors[0].message, "USB lost");
  assert.equal(setup.statuses.length, 0);
});

test("import-refresh failures explicitly report the written file as incomplete", async () => {
  const setup = writeFixture({ reloadError: true });
  setup.click();
  await setup.settled();
  assert.equal(setup.events.length, 2);
  assert.match(setup.errors[0].message, /weather\.py was written, but refreshing workshop imports failed/);
  assert.equal(setup.statuses.length, 0);
});

test("certificate writes require the trust-change warning and still target only the certificate", async () => {
  const setup = writeFixture();
  setup.sandbox.workshopFiles.active = { name: "stocks_ca.pem", source: "certificate", kind: "certificate" };
  setup.click();
  await setup.settled();
  assert.match(setup.confirmations[0], /changes which HTTPS servers this board trusts/);
  assert.deepEqual(setup.events[0], { write: "stocks_ca.pem", text: "certificate" });
});

function runFixture(kind = "library", name = "weather.py") {
  const errors = [], executions = [], keyboard = {}, nodes = new Map();
  let confirmations = 0;
  const sandbox = {
    workshopFiles: { active: { kind, name }, dirty: false },
    editor: { value: "print('selected')", addEventListener: (event, handler) => { keyboard[event] = handler; } },
    currentLesson: { id: "snake", sample: "snake" }, samples: { snake: { name: "02_snake.py" } },
    requireDevice: () => true, transitioning: false, stopping: false, job: null, runTask: null,
    stopRequested: false, receivedOutput: 0, updateControls() {}, setStatus() {}, appendOutput() {},
    window: { confirm: () => { confirmations += 1; return true; } },
    connection: {
      async execute(text) { executions.push(text); return {}; },
      async writeFile() { throw new Error("Unexpected device write"); },
    },
    withBrowserClock: text => `USB CLOCK\n${text}`,
    reportError: error => errors.push(error),
    perform: async (_kind, _label, action) => action(),
    byId: id => {
      if (!nodes.has(id)) nodes.set(id, { addEventListener: (_event, handler) => { nodes.get(id).click = handler; } });
      return nodes.get(id);
    },
  };
  runInNewContext(section("async function runEditor()", '\nbyId("stop-button")'), sandbox);
  runInNewContext(section('byId("save-main").addEventListener', '\nbyId("install-button").textContent'), sandbox);
  return { sandbox, errors, executions, keyboard, nodes, confirmations: () => confirmations };
}

test("selected libraries and certificates cannot run via button, keyboard or Save as main.py", async () => {
  for (const kind of ["library", "certificate"]) {
    const setup = runFixture(kind);
    await setup.sandbox.runEditor();
    setup.keyboard.keydown({ ctrlKey: true, key: "Enter", preventDefault() {} });
    setup.nodes.get("save-main").click();
    assert.equal(setup.executions.length, 0);
    assert.equal(setup.errors.length, 2);
    assert.equal(setup.confirmations(), 0);
  }
});

test("selected stock and weather scripts receive USB clock setup even from another lesson", async () => {
  for (const name of ["04_stocks.py", "04_weather.py"]) {
    const setup = runFixture("script", name);
    await setup.sandbox.runEditor();
    assert.equal(setup.executions.length, 1);
    assert.equal(setup.executions[0], "USB CLOCK\nprint('selected')");
    assert.equal(setup.errors.length, 0);
  }
});

test("editing a selected support file never modifies primary lesson or project drafts", () => {
  let input, fileEdits = 0;
  const sandbox = {
    workshopFiles: { active: { name: "weather.py", kind: "library" }, edited: () => { fileEdits += 1; } },
    editor: { addEventListener: (_event, handler) => { input = handler; } },
    drafts: new Map(), currentLesson: { id: "snake" },
    projectWorkspace: { edited: () => { throw new Error("Unexpected project edit"); } },
    updateDraftState: () => { throw new Error("Unexpected lesson edit"); },
  };
  runInNewContext(section('editor.addEventListener("input"', '\nbyId("reset-editor")'), sandbox);
  input();
  sandbox.currentLesson.id = "project";
  input();
  assert.equal(fileEdits, 2);
  assert.equal(sandbox.drafts.size, 0);
});

test("Ctrl-S on a selected support file never saves it as the primary project", () => {
  const setup = runFixture("library");
  setup.sandbox.currentLesson.id = "project";
  setup.sandbox.projectWorkspace = { save: () => { throw new Error("Support source must not be project-persisted"); } };
  let prevented = false;
  setup.keyboard.keydown({ ctrlKey: true, key: "s", preventDefault: () => { prevented = true; } });
  assert.equal(prevented, false);
});

test("download uses selected support filename even inside Your project", () => {
  let listener, link;
  const sandbox = {
    workshopFiles: { active: { name: "stocks_ca.pem", kind: "certificate" } },
    currentLesson: { id: "project", sample: "project" }, samples: { project: { name: "starter.py" } },
    editor: { value: "edited certificate" }, Blob,
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
    byId: () => ({ addEventListener: (_event, handler) => { listener = handler; } }),
    document: { createElement: () => (link = { click() {}, remove() {} }), body: { append() {} } },
    setTimeout() {}, setStatus() {},
  };
  runInNewContext(section('byId("download-button").addEventListener', '\nbyId("copy-console")'), sandbox);
  listener();
  assert.equal(link.download, "stocks_ca.pem");
});

test("selected file edits warn before unload even when project and lesson drafts are clean", () => {
  let listener;
  const sandbox = {
    workshopFiles: { dirty: true }, projectWorkspace: { dirty: false },
    drafts: new Map(), job: null, deskMessage: { connected: false },
    window: { addEventListener: (event, handler) => { if (event === "beforeunload") listener = handler; } },
  };
  runInNewContext(section('window.addEventListener("beforeunload"', '\nwindow.addEventListener("pagehide"'), sandbox);
  let prevented = false;
  listener({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
});
