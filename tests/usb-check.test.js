import assert from "node:assert/strict";
import test from "node:test";
import { checkUsbDevice, detectHostOs } from "../site/usb-check.js";
import { CROWPANEL_USB_FILTER } from "../site/usb-devices.js";

for (const [label, navigatorLike, expected] of [
  ["UA data Linux priority", { userAgentData: { platform: "Linux" }, platform: "Win32", userAgent: "Macintosh" }, "linux"],
  ["UA data Windows priority", { userAgentData: { platform: "Windows" }, platform: "MacIntel", userAgent: "Linux" }, "windows"],
  ["UA data macOS priority", { userAgentData: { platform: "macOS" }, platform: "Linux x86_64", userAgent: "Windows NT" }, "macos"],
  ["Mac platform", { platform: "MacIntel" }, "macos"],
  ["Windows platform", { platform: "Win32" }, "windows"],
  ["Linux platform", { platform: "Linux x86_64" }, "linux"],
  ["Mac UA", { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" }, "macos"],
  ["Windows UA", { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }, "windows"],
  ["Linux UA", { userAgent: "Mozilla/5.0 (X11; Linux x86_64)" }, "linux"],
  ["unknown UA data fallback", { userAgentData: { platform: "Unknown" }, platform: "Win32" }, "windows"],
  ["unknown platform fallback", { platform: "Unknown", userAgent: "Linux x86_64" }, "linux"],
  ["case insensitive", { userAgentData: { platform: "mAcOs" } }, "macos"],
  ["iPhone", { platform: "iPhone", userAgent: "Mac OS X" }, null],
  ["iPad", { platform: "iPad", userAgentData: { platform: "macOS" } }, null],
  ["iOS UA", { platform: "MacIntel", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" }, null],
  ["iPad masquerade", { platform: "MacIntel", maxTouchPoints: 5, userAgentData: { platform: "macOS" }, userAgent: "Macintosh" }, null],
  ["single touch Mac", { platform: "MacIntel", maxTouchPoints: 1 }, "macos"],
  ["Android UA", { platform: "Linux armv8l", userAgent: "Mozilla/5.0 (Linux; Android 14)" }, null],
  ["Android UA data", { userAgentData: { platform: "Android" }, platform: "Linux" }, null],
  ["mobile UA data", { userAgentData: { platform: "Linux", mobile: true } }, null],
  ["ChromeOS UA data", { userAgentData: { platform: "Chrome OS" }, platform: "Linux x86_64" }, null],
  ["ChromeOS spelling", { userAgentData: { platform: "ChromeOS" }, platform: "Linux" }, null],
  ["ChromeOS UA", { platform: "Linux x86_64", userAgent: "Mozilla/5.0 (X11; CrOS x86_64 16093.0.0)" }, null],
  ["unknown", { platform: "FreeBSD", userAgent: "Unknown" }, null],
  ["empty", {}, null],
  ["missing", undefined, null],
  ["null", null, null],
  ["non-string hints", { userAgentData: { platform: 42 }, platform: {}, userAgent: [] }, null],
]) {
  test(`detectHostOs: ${label}`, () => {
    assert.equal(detectHostOs(navigatorLike), expected);
  });
}

function readOnlyPort(info = { usbVendorId: 0x1a86, usbProductId: 0x7522 }) {
  return new Proxy({ getInfo: () => info }, {
    get(target, property) {
      assert.ok(property === "getInfo" || property === "then", `Unexpected port access: ${String(property)}`);
      return target[property];
    },
  });
}

test("chooser is filtered and synchronous; check returns only plain identity without touching hardware", async () => {
  let resolvePort;
  let selections = 0;
  const chosenPort = new Promise((resolve) => { resolvePort = resolve; });
  const serial = {
    requestPort(options) {
      assert.equal(this, serial);
      selections++;
      assert.deepEqual(options, { filters: [CROWPANEL_USB_FILTER] });
      assert.equal(options.filters[0], CROWPANEL_USB_FILTER);
      return chosenPort;
    },
    getPorts() { assert.fail("Never auto-select a previously authorized port"); },
  };
  const pending = checkUsbDevice(serial);
  assert.equal(selections, 1);
  resolvePort(readOnlyPort({ usbVendorId: 0x1a86, usbProductId: 0x7522, extra: "omit" }));
  const identity = await pending;
  assert.deepEqual(identity, { vendorId: 0x1a86, productId: 0x7522 });
  assert.equal(Object.getPrototypeOf(identity), Object.prototype);
});

for (const [label, info] of [
  ["wrong vendor", { usbVendorId: 0x10c4, usbProductId: 0x7522 }],
  ["wrong product", { usbVendorId: 0x1a86, usbProductId: 0x7523 }],
  ["missing product", { usbVendorId: 0x1a86 }],
  ["Bluetooth port", {}],
  ["missing metadata", null],
]) {
  test(`checkUsbDevice rejects ${label} without touching hardware`, async () => {
    await assert.rejects(checkUsbDevice({ requestPort: () => readOnlyPort(info) }), /CrowPanel.*1a86:7522.*USB/i);
  });
}

test("checkUsbDevice rejects ports without getInfo", async () => {
  await assert.rejects(checkUsbDevice({ requestPort: () => ({}) }), /CrowPanel.*1a86:7522.*USB/i);
});

for (const serial of [undefined, null, {}, { requestPort: true }]) {
  test(`missing requestPort gives actionable guidance: ${JSON.stringify(serial)}`, async () => {
    await assert.rejects(checkUsbDevice(serial), /Web Serial.*(Chrome|Edge).*HTTPS/i);
  });
}

for (const synchronous of [false, true]) {
  test(`chooser errors preserve identity (${synchronous ? "throw" : "rejection"})`, async () => {
    const cancellation = new DOMException("The user cancelled", "NotFoundError");
    await assert.rejects(checkUsbDevice({ requestPort() {
      if (synchronous) throw cancellation;
      return Promise.reject(cancellation);
    } }), (error) => error === cancellation);
  });
}

test("getInfo failures are not wrapped", async () => {
  const failure = new Error("Device disconnected");
  await assert.rejects(checkUsbDevice({ requestPort: () => ({ getInfo() { throw failure; } }) }), (error) => error === failure);
});
