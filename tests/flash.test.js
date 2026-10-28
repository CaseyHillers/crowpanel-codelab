import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ESPLoader, Transport } from "esptool-js";
import { flashMicroPython } from "../site/flash.js";

function setup(context, chip = "ESP32-S3") {
  const state = { selections: 0, opens: 0, boots: 0, writes: [], resets: [], closes: 0 };
  const port = {
    getInfo: () => ({ usbVendorId: 0x1a86, usbProductId: 0x7522 }),
    open: async () => { state.opens++; },
  };
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
    serial: { requestPort(options) {
      state.selections++;
      state.requestOptions = options;
      return Promise.resolve(port);
    } },
  } });
  context.after(() => {
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    else delete globalThis.navigator;
  });
  context.mock.method(ESPLoader.prototype, "main", async function () {
    state.boots++;
    port.readable = {};
    this.chip = { CHIP_NAME: chip };
  });
  context.mock.method(ESPLoader.prototype, "writeFlash", async function (options) {
    state.writes.push(options);
    options.reportProgress(0, 50, 100);
  });
  context.mock.method(ESPLoader.prototype, "after", async (mode) => { state.resets.push(mode); });
  context.mock.method(Transport.prototype, "disconnect", async () => { state.closes++; });
  const firmware = new Uint8Array(1024);
  firmware[0] = 0xe9;
  return { state, port, firmware };
}

test("flasher selects synchronously, writes a combined image at zero, resets and releases the port", async (context) => {
  const { state, firmware } = setup(context);
  const progress = [];
  const pending = flashMicroPython({ firmware, onProgress: (percent) => progress.push(percent) });
  assert.equal(state.selections, 1);
  assert.deepEqual(state.requestOptions, {
    filters: [{ usbVendorId: 0x1a86, usbProductId: 0x7522 }],
  });
  assert.deepEqual(await pending, { success: true });
  assert.equal(state.writes[0].fileArray[0].data, firmware);
  assert.equal(state.writes[0].fileArray[0].address, 0);
  assert.equal(state.writes[0].eraseAll, true);
  assert.equal(state.writes[0].compress, true);
  assert.deepEqual(state.resets, ["hard_reset"]);
  assert.deepEqual(progress, [50, 100]);
  assert.equal(state.closes, 1);
});

for (const [label, info] of [
  ["another vendor", { usbVendorId: 0x10c4, usbProductId: 0x7522 }],
  ["another product", { usbVendorId: 0x1a86, usbProductId: 0x7523 }],
  ["a missing product", { usbVendorId: 0x1a86 }],
  ["a non-USB port", {}],
  ["missing identity metadata", null],
  ["an unavailable getInfo API", undefined],
]) {
  test(`flasher rejects ${label} before loading firmware or opening and permits retry`, async (context) => {
    const { state, port, firmware } = setup(context);
    port.getInfo = info === undefined ? undefined : () => info;
    const fetchMock = context.mock.method(globalThis, "fetch", async () => {
      assert.fail("Unsupported ports must not load firmware.");
    });
    const progress = [];
    const logs = [];
    await assert.rejects(flashMicroPython({
      onProgress: (percent) => progress.push(percent), onLog: (text) => logs.push(text),
    }), /CrowPanel.*1a86:7522.*USB/i);
    assert.equal(fetchMock.mock.callCount(), 0);
    assert.equal(state.opens, 0);
    assert.equal(state.boots, 0);
    assert.equal(state.writes.length, 0);
    assert.equal(state.closes, 0);
    assert.deepEqual(state.resets, []);
    assert.deepEqual(progress, []);
    assert.deepEqual(logs, []);
    port.getInfo = () => ({ usbVendorId: 0x1a86, usbProductId: 0x7522 });
    assert.deepEqual(await flashMicroPython({ firmware }), { success: true });
  });
}

test("a detected non-S3 chip never reaches erase/write", async (context) => {
  const { state, firmware } = setup(context, "ESP32-C3");
  await assert.rejects(flashMicroPython({ firmware }), /Wrong chip/);
  assert.equal(state.writes.length, 0);
  assert.equal(state.closes, 1);
});

test("write failures release the port without claiming success or resetting", async (context) => {
  const { state, firmware } = setup(context);
  context.mock.method(ESPLoader.prototype, "writeFlash", async () => { throw new Error("USB lost"); });
  await assert.rejects(flashMicroPython({ firmware }), /USB lost/);
  assert.equal(state.closes, 1);
  assert.deepEqual(state.resets, []);
});

test("invalid local images never enter the bootloader", async (context) => {
  const { state } = setup(context);
  await assert.rejects(flashMicroPython({ firmware: new Uint8Array(1024) }), /combined ESP32-S3/);
  assert.equal(state.boots, 0);
});

test("bundled firmware is loaded locally and passes the pinned size and SHA-256", async (context) => {
  const { state } = setup(context);
  const bytes = await readFile(new URL("../site/public/firmware/micropython.bin", import.meta.url));
  Object.defineProperty(globalThis, "document", { configurable: true, value: { baseURI: "https://example.test/course/" } });
  context.after(() => { delete globalThis.document; });
  context.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(String(url), "https://example.test/course/firmware/micropython.bin");
    return new Response(bytes);
  });
  assert.deepEqual(await flashMicroPython(), { success: true });
  assert.equal(state.writes[0].fileArray[0].data.length, bytes.length);
});

test("tampered bundled firmware fails before bootloader entry", async (context) => {
  const { state, firmware } = setup(context);
  Object.defineProperty(globalThis, "document", { configurable: true, value: { baseURI: "https://example.test/" } });
  context.after(() => { delete globalThis.document; });
  context.mock.method(globalThis, "fetch", async () => new Response(firmware));
  await assert.rejects(flashMicroPython(), /integrity check failed/);
  assert.equal(state.boots, 0);
  assert.equal(state.writes.length, 0);
});

test("chooser cancellation clears exclusive ownership so the next attempt can proceed", async (context) => {
  const { firmware } = setup(context);
  const serial = navigator.serial;
  const chooser = context.mock.method(serial, "requestPort", () => Promise.reject(new DOMException("Cancelled", "NotFoundError")));
  await assert.rejects(flashMicroPython({ firmware }), { name: "NotFoundError" });
  chooser.mock.restore();
  assert.deepEqual(await flashMicroPython({ firmware }), { success: true });
});

test("concurrent flash attempts cannot claim a second port", async (context) => {
  const { state, firmware, port } = setup(context);
  let select;
  context.mock.method(navigator.serial, "requestPort", () => new Promise((resolve) => { select = resolve; }));
  const pending = flashMicroPython({ firmware });
  await assert.rejects(flashMicroPython({ firmware }), /already in progress/);
  select(port);
  await pending;
  assert.equal(state.writes.length, 1);
});
