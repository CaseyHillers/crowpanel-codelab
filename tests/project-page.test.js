import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { normalizeProjectName } from "../site/project-store.js";

const source = await readFile(new URL("../site/app.js", import.meta.url), "utf8");
function section(start, end) {
  const begin = source.indexOf(start);
  const finish = source.indexOf(end, begin);
  assert.ok(begin >= 0 && finish > begin, `expected ${start} boundaries`);
  return source.slice(begin, finish);
}

test("the project route is separate from core lessons and never enters lesson drafts or paging", () => {
  const projectPage = { id: "project", sample: "project" };
  const sandbox = { workshopFiles: { active: null, dirty: false },
    projectPage, currentLesson: projectPage, drafts: new Map(), editor: { value: "unsaved project" },
    location: { hash: "#project" }, lessons: [{ id: "welcome" }, { id: "finish" }],
    coreLessons: [{ id: "welcome" }, { id: "finish" }], archivedLessons: [],
    deskMessage: { disconnect() {} },
  };
  runInNewContext(`${section("function renderLesson(", "\n  const sample = samples[next.sample];")}\n}`, sandbox);
  runInNewContext(section("const lessonSequence =", "\n"), sandbox);
  sandbox.renderLesson();
  assert.equal(sandbox.currentLesson, projectPage);
  assert.equal(sandbox.drafts.size, 0);
  assert.equal(runInNewContext("lessonSequence().length", sandbox), 0);
  sandbox.location.hash = "#finish";
  sandbox.renderLesson();
  assert.equal(sandbox.currentLesson.id, "finish");
  assert.equal(sandbox.drafts.size, 0);
  assert.equal(runInNewContext("lessonSequence().length", sandbox), 2);
});

test("lesson edits stay in tab drafts while project edits go only to the project workspace", () => {
  const handlers = {};
  let projectEdits = 0, updated = 0;
  const sandbox = { workshopFiles: { active: null, dirty: false },
    currentLesson: { id: "snake" }, drafts: new Map(),
    editor: { value: "lesson code", addEventListener: (event, handler) => { handlers[event] = handler; } },
    projectWorkspace: { edited: () => { projectEdits += 1; } },
    updateDraftState: () => { updated += 1; },
  };
  runInNewContext(section('editor.addEventListener("input"', '\nbyId("reset-editor")'), sandbox);
  handlers.input();
  assert.equal(sandbox.drafts.get("snake"), "lesson code");
  assert.equal(projectEdits, 0);
  assert.equal(updated, 1);
  sandbox.currentLesson = { id: "project" };
  sandbox.editor.value = "private project draft";
  handlers.input();
  assert.equal(projectEdits, 1);
  assert.equal(sandbox.drafts.has("project"), false);
});

test("project download uses its chosen Python filename and preserves source, with a safe fallback", () => {
  for (const [filename, expected] of [["desk", "desk.py"], ["counter.py", "counter.py"], ["../bad.py", "my_project.py"]]) {
    let handler, link, blob;
    const sandbox = { workshopFiles: { active: null, dirty: false },
      currentLesson: { id: "project", sample: "project" }, editor: { value: "print('my code')\n" },
      samples: { project: { name: "starter.py" } }, projectWorkspace: { filename }, normalizeProjectName,
      byId: () => ({ addEventListener: (_event, callback) => { handler = callback; } }),
      Blob, URL: { createObjectURL: value => { blob = value; return "blob:test"; }, revokeObjectURL() {} },
      document: { createElement: () => (link = { click() {}, remove() {} }), body: { append() {} } },
      setTimeout() {}, setStatus() {},
    };
    runInNewContext(section('byId("download-button").addEventListener', '\nbyId("copy-console")'), sandbox);
    handler();
    assert.equal(link.download, expected);
    assert.equal(blob.size, Buffer.byteLength(sandbox.editor.value));
    assert.equal(sandbox.editor.value, "print('my code')\n");
  }
});

test("project runs use the custom filename and execute RAM source without setting a clock or saving files", async () => {
  const executions = [], output = [], errors = [];
  const sandbox = { workshopFiles: { active: null, dirty: false },
    currentLesson: { id: "project", sample: "project" }, editor: { value: "print('custom')\n" },
    projectWorkspace: { filename: "desk.py" }, samples: {}, transitioning: false, stopping: false,
    job: null, runTask: null, stopRequested: false, receivedOutput: 0,
    requireDevice: () => true, appendOutput: text => output.push(text),
    perform: async (_kind, _label, action) => action(),
    reportError: error => errors.push(error), setStatus() {},
    withBrowserClock: () => { throw new Error("Unexpected clock seed"); },
    connection: { execute: async (text, options) => { executions.push({ text, options }); return {}; } },
  };
  runInNewContext(section("async function runEditor()", '\nbyId("run-button")'), sandbox);
  await sandbox.runEditor();
  assert.equal(errors.length, 0);
  assert.equal(executions.length, 1);
  assert.equal(executions[0].text, sandbox.editor.value);
  assert.equal(executions[0].options.timeoutMs, 0);
  assert.match(output[0], /Run desk\.py in RAM/);
});

test("Ctrl/Command-S saves only the project page and prevents the browser save dialog", () => {
  let handler, saves = 0;
  const sandbox = { workshopFiles: { active: null, dirty: false },
    byId: () => ({ addEventListener() {} }), currentLesson: { id: "project" },
    editor: { addEventListener: (_event, callback) => { handler = callback; } },
    projectWorkspace: { save: () => { saves += 1; } },
  };
  runInNewContext(section('byId("run-button").addEventListener', '\nbyId("stop-button")'), sandbox);
  let prevented = 0;
  const event = { ctrlKey: true, key: "s", preventDefault: () => { prevented += 1; } };
  handler(event);
  assert.equal(saves, 1);
  assert.equal(prevented, 1);
  sandbox.currentLesson = { id: "snake" };
  handler(event);
  assert.equal(saves, 1);
  assert.equal(prevented, 1);
});

test("unsaved project work warns before closing even while reading a different lesson", () => {
  let unload;
  const sandbox = { workshopFiles: { active: null, dirty: false },
    window: { addEventListener: (event, callback) => { if (event === "beforeunload") unload = callback; } },
    drafts: new Map(), samples: {}, lessons: [], job: null,
    deskMessage: { connected: false, disconnect() {} }, projectWorkspace: { dirty: true },
  };
  runInNewContext(section('window.addEventListener("beforeunload"', '\nrenderLesson();'), sandbox);
  let prevented = 0;
  const event = { preventDefault: () => { prevented += 1; } };
  unload(event);
  assert.equal(prevented, 1);
  assert.equal(event.returnValue, "");
  sandbox.projectWorkspace.dirty = false;
  unload({ preventDefault: () => { prevented += 1; } });
  assert.equal(prevented, 1);
});
