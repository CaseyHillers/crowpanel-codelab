import { ESPLoader, Transport } from "esptool-js";
import { FIRMWARE } from "./firmware.js";

let flashing = false;

export async function flashMicroPython({ onProgress = () => {}, onLog = () => {}, firmware = null } = {}) {
  if (flashing) throw new Error("Firmware installation is already in progress.");
  if (!globalThis.navigator?.serial) throw new Error("Web Serial requires a supported desktop browser and HTTPS.");
  flashing = true;
  let transport;
  try {
    const selection = navigator.serial.requestPort();
    const port = await selection;
    transport = new Transport(port, false);
    if (firmware === null) {
      onLog(`Loading pinned MicroPython ${FIRMWARE.version} from this site.\n`);
      const response = await fetch(new URL(FIRMWARE.path, document.baseURI));
      if (!response.ok) throw new Error("Bundled firmware could not be loaded. Check the site deployment.");
      firmware = new Uint8Array(await response.arrayBuffer());
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", firmware));
      const checksum = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
      if (firmware.length !== FIRMWARE.size || checksum !== FIRMWARE.sha256) {
        throw new Error("Bundled firmware integrity check failed; nothing was flashed.");
      }
    }
    if (!(firmware instanceof Uint8Array) || firmware.length < 1024 || firmware[0] !== 0xe9) {
      throw new Error("Select a combined ESP32-S3 MicroPython .bin image (not .app-bin or .uf2).");
    }
    const terminal = {
      clean() {},
      write: (text) => onLog(String(text)),
      writeLine: (text) => onLog(String(text) + "\n"),
    };
    const loader = new ESPLoader({ transport, baudrate: 460800, terminal });
    await loader.main();
    if (loader.chip.CHIP_NAME !== "ESP32-S3") {
      throw new Error("Wrong chip: this workshop firmware requires ESP32-S3.");
    }
    onLog("Erasing flash, including factory firmware and existing files.\n");
    await loader.writeFlash({
      fileArray: [{ data: firmware, address: 0 }],
      flashSize: "keep", flashMode: "keep", flashFreq: "keep",
      eraseAll: true, compress: true,
      reportProgress: (_file, written, total) => onProgress(Math.round(written * 100 / total)),
    });
    await loader.after("hard_reset");
    onProgress(100);
    onLog("Firmware written. Reconnect with Connect device to check the MicroPython REPL.\n");
    return { success: true };
  } finally {
    try {
      if (transport?.device.readable || transport?.device.writable) await transport.disconnect();
    } finally {
      flashing = false;
    }
  }
}
