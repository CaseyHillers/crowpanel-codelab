import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { layoutMessage } from "../site/desk-message.js";

const source = await readFile(new URL("../site/app.js", import.meta.url), "utf8");
function section(start, end) {
  const begin = source.indexOf(start);
  const finish = source.indexOf(end, begin);
  assert.ok(begin >= 0 && finish > begin, `expected ${start} boundaries`);
  return source.slice(begin, finish);
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function fixture({ available = true } = {}) {
  const nodes = new Map();
  const byId = id => {
    if (!nodes.has(id)) nodes.set(id, {
      value: "Hello desk", hidden: true, disabled: false, textContent: "",
      addEventListener(event, handler) { this[event] = handler; },
    });
    return nodes.get(id);
  };
  let connection, states;
  class FakeConnection {
    constructor({ onState }) { connection = this; states = onState; this.connected = false; this.sending = false; }
    async connect() { this.connected = true; states("connected"); return "Desk-A1B2"; }
    async send() {}
    disconnect() { this.connected = false; states("disconnected"); }
  }
  const sandbox = { workshopFiles: { active: null, dirty: false },
    byId, DeskMessageConnection: FakeConnection, layoutMessage,
    navigator: { bluetooth: available ? {} : undefined }, isSecureContext: true,
    bluetoothConnecting: false, job: { kind: "run" },
  };
  runInNewContext(section("const bluetoothAvailable", "\nfunction updateControls()"), sandbox);
  return { byId, connection, update: () => sandbox.updateMessageControls(), states };
}

test("Bluetooth connect and send remain usable while the USB receiver is running", async () => {
  const setup = fixture();
  setup.update();
  assert.equal(setup.byId("desk-message-connect").disabled, false);
  assert.equal(setup.byId("desk-message-send").disabled, true);
  await setup.byId("desk-message-connect").click();
  assert.match(setup.byId("desk-message-status").textContent, /Desk-A1B2/);
  assert.equal(setup.byId("desk-message-connect").disabled, true);
  assert.equal(setup.byId("desk-message-send").disabled, false);
  assert.equal(setup.byId("desk-message-disconnect").disabled, false);
});

test("unsupported browsers explain the USB fallback and disable Bluetooth connection", () => {
  const setup = fixture({ available: false });
  setup.update();
  assert.equal(setup.byId("desk-message-connect").disabled, true);
  assert.match(setup.byId("desk-message-status").textContent, /USB fallback/);
  assert.match(setup.byId("desk-message-status").textContent, /policy/);
});

test("invalid drafts cannot send and valid edits clear validation errors", async () => {
  const setup = fixture();
  await setup.byId("desk-message-connect").click();
  setup.byId("desk-message-text").value = "Hello 🐍";
  setup.byId("desk-message-text").input();
  assert.equal(setup.byId("desk-message-send").disabled, true);
  assert.equal(setup.byId("desk-message-error").hidden, false);
  setup.byId("desk-message-text").value = "Hello Arm";
  setup.byId("desk-message-text").input();
  assert.equal(setup.byId("desk-message-send").disabled, false);
  assert.equal(setup.byId("desk-message-error").hidden, true);
});

test("send waits for the receiver acknowledgment before reporting refresh completion", async () => {
  const setup = fixture();
  await setup.byId("desk-message-connect").click();
  const ack = deferred();
  setup.connection.send = text => {
    assert.equal(text, "Hello desk");
    setup.connection.sending = true;
    setup.states("sending");
    return ack.promise.finally(() => { setup.connection.sending = false; setup.states("connected"); });
  };
  const pending = setup.byId("desk-message-send").click();
  assert.match(setup.byId("desk-message-status").textContent, /waiting/);
  assert.equal(setup.byId("desk-message-send").disabled, true);
  assert.equal(setup.byId("desk-message-text").disabled, true);
  ack.resolve();
  await pending;
  assert.match(setup.byId("desk-message-status").textContent, /Board reports refresh complete/);
  assert.match(setup.byId("desk-message-status").textContent, /physical screen/);
  assert.equal(setup.byId("desk-message-text").disabled, false);
});

test("failed send reports no display confirmation and leaves the message editable", async () => {
  const setup = fixture();
  await setup.byId("desk-message-connect").click();
  setup.connection.send = async () => { throw new Error("Receiver timed out"); };
  await setup.byId("desk-message-send").click();
  assert.match(setup.byId("desk-message-status").textContent, /not confirmed/);
  assert.match(setup.byId("desk-message-error").textContent, /Receiver timed out/);
  assert.equal(setup.byId("desk-message-error").hidden, false);
  assert.equal(setup.byId("desk-message-text").value, "Hello desk");
  assert.equal(setup.byId("desk-message-text").disabled, false);
});

test("cancelling the Bluetooth chooser gives retry guidance without claiming connection", async () => {
  const setup = fixture();
  setup.connection.connect = async () => { throw Object.assign(new Error("cancelled"), { name: "NotFoundError" }); };
  await setup.byId("desk-message-connect").click();
  assert.match(setup.byId("desk-message-error").textContent, /No Bluetooth board selected/);
  assert.equal(setup.byId("desk-message-connect").disabled, false);
  assert.equal(setup.byId("desk-message-send").disabled, true);
});

test("disconnect control clears the Bluetooth connection", async () => {
  const setup = fixture();
  await setup.byId("desk-message-connect").click();
  setup.byId("desk-message-disconnect").click();
  assert.equal(setup.connection.connected, false);
  assert.equal(setup.byId("desk-message-send").disabled, true);
  assert.match(setup.byId("desk-message-status").textContent, /disconnected/);
});

test("course paging keeps archived network lessons outside the core sequence", () => {
  const nodes = new Map();
  const byId = id => {
    if (!nodes.has(id)) nodes.set(id, { addEventListener: (_event, handler) => { nodes.get(id).click = handler; } });
    return nodes.get(id);
  };
  const coreLessons = [{ id: "mac" }, { id: "message" }, { id: "finish" }];
  const archivedLessons = [{ id: "stocks", archived: true }, { id: "weather", archived: true }];
  const sandbox = { workshopFiles: { active: null, dirty: false }, byId, coreLessons, archivedLessons, currentLesson: coreLessons[1], location: { hash: "message" }, usbDetected: true };
  runInNewContext(section("const lessonSequence =", "\n",), sandbox);
  runInNewContext(section('byId("previous-lesson").addEventListener', '\nbyId("lesson-content").addEventListener'), sandbox);
  byId("next-lesson").click();
  assert.equal(sandbox.location.hash, "finish");
  sandbox.currentLesson = coreLessons[2];
  byId("next-lesson").click();
  assert.equal(sandbox.location.hash, "finish");
  sandbox.currentLesson = archivedLessons[0];
  byId("next-lesson").click();
  assert.equal(sandbox.location.hash, "weather");
  sandbox.currentLesson = archivedLessons[1];
  byId("previous-lesson").click();
  assert.equal(sandbox.location.hash, "stocks");
});

test("leaving the message lesson releases Bluetooth, including the hardware appendix", () => {
  for (const route of ["snake", "appendix", "message"]) {
    let disconnects = 0;
    const message = { id: "message" };
    const sandbox = { workshopFiles: { active: null, dirty: false },
      currentLesson: message, drafts: new Map(), editor: { value: "learner receiver" },
      location: { hash: `#${route}` }, lessons: [{ id: "welcome" }, message, { id: "snake" }],
      deskMessage: { disconnect: () => { disconnects += 1; } },
    };
    const renderStart = section("function renderLesson(", "\n  const sample = samples[next.sample];");
    runInNewContext(`${renderStart}\n}`, sandbox);
    sandbox.renderLesson();
    assert.equal(disconnects, route === "message" ? 0 : 1);
    assert.equal(sandbox.drafts.get("message"), "learner receiver");
  }
});

test("page exit disconnects Bluetooth and an active Bluetooth session prompts before unload", () => {
  const handlers = {};
  let disconnects = 0;
  const sandbox = { workshopFiles: { active: null, dirty: false },
    window: { addEventListener: (event, handler) => { handlers[event] = handler; } },
    drafts: new Map(), samples: {}, lessons: [], job: null, projectWorkspace: { dirty: false },
    deskMessage: { connected: true, disconnect: () => { disconnects += 1; } },
  };
  runInNewContext(section('window.addEventListener("beforeunload"', '\nrenderLesson();'), sandbox);
  let prevented = false;
  handlers.beforeunload({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true);
  handlers.pagehide();
  assert.equal(disconnects, 1);
});
