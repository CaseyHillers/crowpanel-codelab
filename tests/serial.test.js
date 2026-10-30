import test from "node:test";
import assert from "node:assert/strict";
import { MicroPythonConnection } from "../site/serial.js";

const encoder = new TextEncoder();
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function eventually(predicate) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) return;
    await delay(2);
  }
  assert.fail("Expected serial activity did not happen.");
}

class FakePort {
  constructor(options = {}) {
    this.options = options;
    this.writes = [];
    this.sources = [];
    this.program = [];
    this.mode = "friendly";
    this.openCount = 0;
    this.closeCount = 0;
    this.cancelCount = 0;
    this.abortCount = 0;
    this.readable = new ReadableStream({
      start: (controller) => { this.controller = controller; },
      cancel: () => { this.cancelCount++; },
    });
    this.writable = new WritableStream({
      write: async (bytes) => {
        this.writes.push(Uint8Array.from(bytes));
        const text = new TextDecoder().decode(bytes);
        if (text === "\x03\x03\x01") {
          this.mode = "raw";
          this.program = [];
          if (!options.noPrompt) this.emit("stale >>> \r\nraw REPL; CTRL-B to exit\r\n>", 1);
          if (options.extraRawPrompt) {
            this.emit("raw REPL; CTRL-B to exit\r\n>", 1);
            await delay(0);
          }
        } else if (text === "\x04") {
          assert.equal(this.mode, "raw");
          if (!this.program.length) {
            this.resetCount = (this.resetCount || 0) + 1;
            if (options.delayedOldPrompt) this.emit("raw REPL; CTRL-B to exit\r\n>", 1);
            if (options.onSoftReset) await options.onSoftReset(this);
            else if (!options.noResetPrompt) this.emit("MPY: soft reboot\r\nraw REPL; CTRL-B to exit\r\n>", 1);
            return;
          }
          this.mode = "running";
          const source = new TextDecoder().decode(Buffer.concat(this.program));
          this.sources.push(source);
          this.emit(options.badAck ? "NO" : "OK", 1);
          if (options.onExecute) await options.onExecute(this, source);
          else this.complete(options.stdout ?? "hello\r\n", options.stderr ?? "");
        } else if (text === "\x03\x03") {
          if (this.mode === "running" && !options.ignoreStop) {
            this.complete("", "Traceback (most recent call last):\r\nKeyboardInterrupt\r\n");
          }
        } else if (text === "\x02" || text === "\x03\x03\x02") {
          this.mode = "friendly";
          this.emit("\r\nMicroPython v1.fake\r\n>>> ", 2);
        } else {
          assert.equal(this.mode, "raw");
          this.program.push(Uint8Array.from(bytes));
        }
        await options.onWrite?.(this, bytes);
      },
      abort: () => { this.abortCount++; },
    });
  }

  getInfo() {
    return { usbVendorId: 0x1a86, usbProductId: 0x7522 };
  }

  async open(options) {
    this.openCount++;
    this.openOptions = options;
    await this.options.open?.();
  }

  async setSignals(signals) {
    this.signals = signals;
    if (this.options.signalError) throw new Error("Unable to set UART signals.");
  }

  async close() {
    assert.equal(this.readable.locked, false);
    assert.equal(this.writable.locked, false);
    this.closeCount++;
  }

  emit(text, chunkSize = Infinity) {
    const bytes = encoder.encode(text);
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      this.controller.enqueue(bytes.slice(offset, offset + chunkSize));
    }
  }

  complete(stdout = "", stderr = "") {
    this.mode = "raw";
    this.emit(`${stdout}\x04${stderr}\x04>`, 1);
  }
}

function fixture(context, options = {}, callbacks = {}) {
  const port = new FakePort(options);
  const serial = new EventTarget();
  serial.requestCount = 0;
  serial.requestPort = (requestOptions) => {
    serial.requestCount++;
    serial.requestOptions = requestOptions;
    return options.requestPort ? options.requestPort() : Promise.resolve(port);
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { serial } });
  const output = [];
  const states = [];
  const connection = new MicroPythonConnection({
    onOutput: (text) => { output.push(text); callbacks.onOutput?.(text); },
    onState: (state) => { states.push(state); callbacks.onState?.(state); },
  });
  context.after(async () => {
    await connection.disconnect();
    if (previous) Object.defineProperty(globalThis, "navigator", previous);
    else delete globalThis.navigator;
  });
  return { port, serial, connection, output, states };
}

test("connect requests the chooser synchronously and releases reset/boot signals", async (context) => {
  const { connection, port, serial, states } = fixture(context);
  const pending = connection.connect();
  assert.equal(serial.requestCount, 1);
  assert.deepEqual(serial.requestOptions, {
    filters: [{ usbVendorId: 0x1a86, usbProductId: 0x7522 }],
  });
  await pending;
  assert.equal(connection.connected, true);
  assert.equal(connection.running, false);
  assert.deepEqual(port.openOptions, { baudRate: 115200, flowControl: "none" });
  assert.deepEqual(port.signals, { dataTerminalReady: false, requestToSend: false });
  assert.deepEqual(states, ["connecting", "connected"]);
  await assert.rejects(connection.connect(), /already open or busy/);
  await connection.disconnect();
  assert.equal(port.cancelCount, 1);
  assert.equal(port.abortCount, 1);
  assert.equal(port.closeCount, 1);
  assert.equal(connection.connected, false);
});

for (const [label, info] of [
  ["another vendor", { usbVendorId: 0x10c4, usbProductId: 0x7522 }],
  ["another product", { usbVendorId: 0x1a86, usbProductId: 0x7523 }],
  ["a missing product", { usbVendorId: 0x1a86 }],
  ["a non-USB port", {}],
  ["missing identity metadata", null],
  ["an unavailable getInfo API", undefined],
]) {
  test(`connect rejects ${label} before opening and permits retry`, async (context) => {
    const { connection, port, states } = fixture(context);
    port.getInfo = info === undefined ? undefined : () => info;
    await assert.rejects(connection.connect(), /CrowPanel.*1a86:7522.*USB/i);
    assert.equal(port.openCount, 0);
    assert.equal(port.closeCount, 0);
    assert.equal(port.writes.length, 0);
    assert.equal(connection.connected, false);
    assert.deepEqual(states, ["connecting", "disconnected"]);
    delete port.getInfo;
    await connection.connect();
    assert.equal(connection.connected, true);
  });
}

test("chooser cancellation and open failures leave no active connection", async (context) => {
  const { connection, states } = fixture(context, {
    requestPort: () => Promise.reject(new Error("Chooser cancelled")),
  });
  await assert.rejects(connection.connect(), /Chooser cancelled/);
  assert.equal(connection.connected, false);
  assert.equal(connection.running, false);
  assert.deepEqual(states, ["connecting", "disconnected"]);
});

test("failed UART setup closes the already opened port", async (context) => {
  const { connection, port } = fixture(context, { signalError: true });
  await assert.rejects(connection.connect(), /UART/);
  assert.equal(port.closeCount, 1);
  assert.equal(connection.connected, false);
});

test("disconnect during open cancels connection and closes the selected port", async (context) => {
  let finishOpen;
  const opening = new Promise((resolve) => { finishOpen = resolve; });
  const { connection, port } = fixture(context, { open: () => opening });
  const pending = connection.connect();
  await eventually(() => port.openCount === 1);
  await connection.disconnect();
  finishOpen();
  await assert.rejects(pending, /cancelled/);
  assert.equal(port.closeCount, 1);
  assert.equal(connection.connected, false);
});

test("fragmented UTF-8, acknowledgment, stdout, stderr, and prompts are parsed without source echoes", async (context) => {
  const { connection, port, output, states } = fixture(context, {
    stdout: "snowman ☃\r\nOK >>> >\r\n", stderr: "ValueError: example\r\n",
  });
  await connection.connect();
  const source = "password = 'do-not-echo-this'\nprint('snowman ☃')\n";
  const result = await connection.execute(source);
  assert.deepEqual(result, { stdout: "snowman ☃\r\nOK >>> >\r\n", stderr: "ValueError: example\r\n" });
  assert.equal(output.join(""), result.stdout + result.stderr);
  assert.equal(output.join("").includes("do-not-echo-this"), false);
  assert.deepEqual(port.sources, [source]);
  assert.equal(port.mode, "friendly");
  assert.equal(port.writes.at(-1)[0], 2);
  assert.equal(connection.running, false);
  assert.deepEqual(states, ["connecting", "connected", "running", "connected"]);
});

test("uploads use byte-sized 128-byte packets and tolerate UTF-8 packet boundaries", async (context) => {
  const { connection, port } = fixture(context);
  await connection.connect();
  const source = `print('${"é".repeat(150)}')\n`;
  await connection.execute(source);
  assert.equal(port.sources[0], source);
  const chunks = port.writes.slice(1, -2);
  assert.deepEqual(chunks.map((bytes) => bytes.length), [128, 128, encoder.encode(source).length - 256]);
});

test("output streams live and infinite programs have no default total deadline", async (context) => {
  const { connection, port, output } = fixture(context, {
    onExecute: (device) => { device.emit("first\n"); },
  });
  await connection.connect();
  let settled = false;
  const pending = connection.execute("while True: pass").finally(() => { settled = true; });
  await eventually(() => output.join("") === "first\n");
  assert.equal(settled, false);
  assert.equal(connection.running, true);
  port.emit("second\n");
  await eventually(() => output.join("") === "first\nsecond\n");
  await delay(40);
  assert.equal(settled, false);
  await Promise.all([connection.stop(), connection.stop()]);
  const result = await pending;
  assert.equal(result.stdout, "first\nsecond\n");
  assert.match(result.stderr, /KeyboardInterrupt/);
  assert.equal(connection.connected, true);
  assert.equal(connection.running, false);
  assert.equal(port.writes.filter((bytes) => new TextDecoder().decode(bytes) === "\x03\x03").length, 1);
  port.options.onExecute = null;
  await connection.execute("print('again')");
});

test("only one execution or file transfer can own the protocol", async (context) => {
  const { connection, port } = fixture(context, { onExecute: () => {} });
  await connection.connect();
  const pending = connection.execute("while True: pass");
  await assert.rejects(connection.execute("print('other')"), /busy/);
  await assert.rejects(connection.writeFile("main.py", "pass"), /busy/);
  await assert.rejects(connection.writeFiles([]), /busy/);
  await eventually(() => port.mode === "running");
  await connection.stop();
  await pending;
  assert.equal(port.sources.length, 1);
});

test("soft reset restarts the VM in raw REPL without executing source and leaves it reusable", async (context) => {
  const { connection, port } = fixture(context);
  await connection.connect();
  await connection.softReset();
  assert.equal(port.resetCount, 1);
  assert.deepEqual(port.sources, []);
  assert.deepEqual(port.writes.map((bytes) => new TextDecoder().decode(bytes)), ["\x03\x03\x01", "\x04", "\x02"]);
  assert.equal(port.mode, "friendly");
  assert.equal(connection.connected, true);
  assert.equal(connection.running, false);
  await connection.execute("print('ready')");
  assert.deepEqual(port.sources, ["print('ready')"]);
});

test("soft reset requires a connected idle protocol and cannot interrupt another owner", async (context) => {
  const { connection, port } = fixture(context, { onExecute: () => {} });
  await assert.rejects(connection.softReset(), /Connect/i);
  assert.equal(port.writes.length, 0);
  await connection.connect();
  const running = connection.execute("while True: pass");
  await eventually(() => port.mode === "running");
  const writesBefore = port.writes.length;
  await assert.rejects(connection.softReset(), /busy/i);
  assert.equal(port.writes.length, writesBefore);
  await connection.stop();
  await running;
});

test("soft reset owns the serial protocol until its new prompt arrives", async (context) => {
  let releaseReset;
  const { connection, port } = fixture(context, {
    onSoftReset: () => new Promise((resolve) => { releaseReset = resolve; }),
  });
  await connection.connect();
  const pending = connection.softReset();
  await eventually(() => releaseReset);
  await assert.rejects(connection.execute("print('race')"), /busy/i);
  await assert.rejects(connection.writeFile("main.py", "pass"), /busy/i);
  await assert.rejects(connection.softReset(), /busy/i);
  port.emit("MPY: soft reboot\r\nraw REPL; CTRL-B to exit\r\n>", 1);
  releaseReset();
  await pending;
  assert.equal(port.resetCount, 1);
});

test("buffered and delayed pre-reset prompts cannot count as a reboot and reset failure closes the port", async (context) => {
  const { connection, port } = fixture(context, { extraRawPrompt: true, delayedOldPrompt: true, noResetPrompt: true });
  await connection.connect();
  await assert.rejects(connection.softReset(), /timed out/i);
  assert.equal(port.resetCount, 1);
  assert.deepEqual(port.sources, []);
  assert.equal(connection.connected, false);
  assert.equal(connection.running, false);
  assert.equal(port.closeCount, 1);
  assert.equal(port.readable.locked, false);
  assert.equal(port.writable.locked, false);
});

test("Stop during raw negotiation recovers friendly REPL without another reader", async (context) => {
  const { connection, port } = fixture(context, { noPrompt: true });
  await connection.connect();
  const pending = connection.execute("print('never uploaded')");
  const rejected = assert.rejects(pending, /stopped before/);
  await eventually(() => port.mode === "raw");
  await connection.stop();
  await rejected;
  assert.equal(connection.connected, true);
  assert.equal(connection.running, false);
  assert.equal(port.mode, "friendly");
  assert.equal(port.sources.length, 0);
  assert.equal(port.cancelCount, 0);
});

test("Stop during source transfer does not execute a truncated program", async (context) => {
  let connection;
  const setup = fixture(context, {
    onWrite: (_device, bytes) => {
      if (bytes.length === 128) void connection.stop();
    },
  });
  connection = setup.connection;
  await connection.connect();
  await assert.rejects(connection.execute(`print('${"secret".repeat(100)}')`), /stopped before/);
  await connection.stop();
  assert.equal(setup.port.sources.length, 0);
  assert.equal(connection.connected, true);
  assert.equal(setup.port.mode, "friendly");
});

test("stale idle buffers and previous stderr do not contaminate a later execution", async (context) => {
  const { connection, port, output } = fixture(context, { stdout: "", stderr: "old error\n" });
  await connection.connect();
  assert.equal((await connection.execute("pass")).stderr, "old error\n");
  port.emit("stale banner >>> \x04\x04>", 1);
  await delay(0);
  port.options.onExecute = (device) => device.complete("new output\n", "");
  const result = await connection.execute("print('new output')");
  assert.deepEqual(result, { stdout: "new output\n", stderr: "" });
  assert.equal(output.join(""), "old error\nnew output\n");
});

test("write failures reject the execution and release stream locks", async (context) => {
  const { connection, port } = fixture(context, {
    onWrite: () => { throw new Error("USB write failed"); },
  });
  await connection.connect();
  await assert.rejects(connection.execute("pass"), /USB write failed/);
  assert.equal(connection.connected, false);
  assert.equal(port.readable.locked, false);
  assert.equal(port.writable.locked, false);
  assert.equal(port.closeCount, 1);
});

test("timeout interrupts cleanup and rejects instead of hanging", async (context) => {
  const { connection, port } = fixture(context, { onExecute: () => {} });
  await connection.connect();
  await assert.rejects(connection.execute("while True: pass", { timeoutMs: 50 }), /timed out/i);
  assert.equal(connection.connected, false);
  assert.equal(connection.running, false);
  assert.equal(port.closeCount, 1);
  assert.ok(port.writes.some((bytes) => new TextDecoder().decode(bytes) === "\x03\x03"));
});

test("raw REPL negotiation has a bounded deadline even without an execution timeout", async (context) => {
  const { connection, port } = fixture(context, { noPrompt: true });
  await connection.connect();
  await assert.rejects(connection.execute("print(1)"), /timed out/i);
  assert.equal(port.sources.length, 0);
  assert.equal(port.closeCount, 1);
});

test("an unresponsive running program cannot make Stop wait forever", async (context) => {
  const { connection, port } = fixture(context, { onExecute: () => {}, ignoreStop: true });
  await connection.connect();
  const pending = connection.execute("while True: pass");
  const rejected = assert.rejects(pending, /Stop|timed out/i);
  await eventually(() => port.mode === "running");
  await connection.stop();
  await rejected;
  assert.equal(connection.connected, false);
  assert.equal(port.closeCount, 1);
});

test("disconnect rejects a pending execution and releases both stream locks", async (context) => {
  const { connection, port } = fixture(context, { onExecute: () => {} });
  await connection.connect();
  const pending = connection.execute("while True: pass");
  const rejected = assert.rejects(pending, /disconnected/);
  await eventually(() => port.mode === "running");
  await connection.disconnect();
  await rejected;
  assert.equal(port.readable.locked, false);
  assert.equal(port.writable.locked, false);
  assert.equal(connection.running, false);
  await connection.disconnect();
  assert.equal(port.closeCount, 1);
});

test("physical disconnect events reject pending reads", async (context) => {
  const { connection, port, serial } = fixture(context, { onExecute: () => {} });
  await connection.connect();
  const pending = connection.execute("while True: pass");
  const rejected = assert.rejects(pending, /disconnected/);
  await eventually(() => port.mode === "running");
  const event = new Event("disconnect");
  Object.defineProperty(event, "port", { value: port });
  serial.dispatchEvent(event);
  await rejected;
  assert.equal(connection.connected, false);
  assert.equal(port.closeCount, 1);
});

test("stream errors and EOF close the session, including while idle", async (context) => {
  const { connection, port } = fixture(context);
  await connection.connect();
  port.controller.error(new Error("USB read failed"));
  await eventually(() => port.closeCount === 1);
  assert.equal(connection.connected, false);
  assert.equal(port.readable.locked, false);
  assert.equal(port.writable.locked, false);
});

test("EOF during execution rejects the operation", async (context) => {
  const { connection, port } = fixture(context, { onExecute: () => {} });
  await connection.connect();
  const pending = connection.execute("while True: pass");
  const rejected = assert.rejects(pending, /stream ended/);
  await eventually(() => port.mode === "running");
  port.controller.close();
  await rejected;
  assert.equal(port.closeCount, 1);
});

test("unexpected acknowledgments are not exposed as program output", async (context) => {
  const { connection, output } = fixture(context, { badAck: true });
  await connection.connect();
  await assert.rejects(connection.execute("print(1)", { timeoutMs: 60 }), /timed out/i);
  assert.deepEqual(output, []);
});

test("file uploads encode exact bytes in bounded hex chunks under a closing context manager", async (context) => {
  const { connection, port, output } = fixture(context, { stdout: "" });
  await connection.connect();
  const bytes = Uint8Array.from({ length: 600 }, (_, index) => index % 256);
  await connection.writeFile("crowpanel.py", bytes);
  const source = port.sources[0];
  assert.match(source, /^import ubinascii\nwith open\('crowpanel.py', 'wb'\) as _crowpanel_file:\n/);
  const hexChunks = [...source.matchAll(/unhexlify\('([a-f0-9]*)'\)/g)].map((match) => match[1]);
  assert.deepEqual(hexChunks.map((chunk) => chunk.length), [512, 512, 176]);
  assert.deepEqual(Buffer.from(hexChunks.join(""), "hex"), Buffer.from(bytes));
  assert.deepEqual(output, []);
  await connection.writeFile("wifi_config.py", "SSID = 'secret-é'\n");
  assert.equal(port.sources[1].includes("secret"), false);
  const utf8 = [...port.sources[1].matchAll(/unhexlify\('([a-f0-9]*)'\)/g)].map((match) => match[1]).join("");
  assert.equal(Buffer.from(utf8, "hex").toString(), "SSID = 'secret-é'\n");
  await connection.writeFile("ca.pem", new Uint8Array());
  assert.match(port.sources[2], /    pass\n$/);
  await connection.writeFile(".pem", new Uint8Array());
});

test("flat filenames reject traversal and Python injection before touching serial", async (context) => {
  const { connection, port } = fixture(context);
  await connection.connect();
  for (const name of ["", ".", "..", "../main.py", "folder/main.py", "folder\\main.py", "/main.py",
    "x..py", "x'\nprint(1)", "x\x00.py", "x".repeat(129)]) {
    await assert.rejects(connection.writeFile(name, "pass"), /filename/);
  }
  await assert.rejects(connection.writeFile("main.py", [1, 2]), /Uint8Array/);
  assert.equal(port.writes.length, 0);
});

test("writeFiles validates the whole batch first, then writes files in order", async (context) => {
  const { connection, port } = fixture(context, { stdout: "" });
  await connection.connect();
  await assert.rejects(connection.writeFiles([
    { name: "main.py", data: "pass" }, { name: "../bad.py", data: "bad" },
  ]), /filename/);
  assert.equal(port.writes.length, 0);
  const results = await connection.writeFiles([
    { name: "main.py", data: "import crowpanel" }, { name: "slides.py", data: new Uint8Array([0, 255]) },
  ]);
  assert.deepEqual(results, [{ stdout: "", stderr: "" }, { stdout: "", stderr: "" }]);
  assert.match(port.sources[0], /open\('main.py'/);
  assert.match(port.sources[1], /open\('slides.py'/);
});

test("file exceptions reject instead of claiming a successful upload", async (context) => {
  const { connection } = fixture(context, { stdout: "", stderr: "OSError: ENOSPC\r\n" });
  await connection.connect();
  await assert.rejects(connection.writeFile("weather.py", "pass"), /could not write weather.py/);
  assert.equal(connection.connected, true);
});

test("callback exceptions do not leak locks or corrupt protocol state", async (context) => {
  const { connection, port } = fixture(context, {}, {
    onOutput: () => { throw new Error("UI callback failed"); },
    onState: () => { throw new Error("UI state failed"); },
  });
  await connection.connect();
  assert.equal((await connection.execute("print(1)")).stdout, "hello\r\n");
  await connection.disconnect();
  assert.equal(port.closeCount, 1);
});

test("invalid source, control bytes, and deadlines fail before writing", async (context) => {
  const { connection, port } = fixture(context);
  await connection.connect();
  await assert.rejects(connection.execute(new Uint8Array()), /Python text/);
  await assert.rejects(connection.execute("print(1)\x04"), /control/);
  for (const timeoutMs of [-1, NaN, Infinity, "100"]) {
    await assert.rejects(connection.execute("pass", { timeoutMs }), /timeoutMs/);
  }
  assert.equal(port.writes.length, 0);
});
