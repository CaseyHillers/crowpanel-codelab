import { MicroPythonConnection } from "./serial.js";
import { lessons, samples, totalMinutes } from "./lessons.js";
import { FIRMWARE } from "./firmware.js";
import { flashMicroPython } from "./flash.js";
import panelSource from "../device/crowpanel.py?raw";
import weatherSource from "../device/weather.py?raw";
import slidesSource from "../device/slides.py?raw";
import weatherCa from "../device/weather_ca.pem?raw";

const byId = (id) => document.getElementById(id);
const editor = byId("code-editor");
const consoleOutput = byId("console-output");
const drafts = new Map();
const completed = new Set();
const libraryFiles = [
  { name: "crowpanel.py", data: panelSource },
  { name: "weather.py", data: weatherSource },
  { name: "slides.py", data: slidesSource },
  { name: "weather_ca.pem", data: weatherCa },
];
const serialAvailable = Boolean(globalThis.isSecureContext && navigator.serial);
let currentLesson;
let job = null;
let runTask = null;
let transitioning = false;
let stopping = false;
let stopRequested = false;
let suppressOutput = false;
let hasConsoleOutput = false;
let receivedOutput = 0;
let selectedFirmware = null;
let firmwareLoading = false;
let firmwareLoadVersion = 0;
let firmwareSelectionError = false;

function appendOutput(text) {
  if (suppressOutput || !text) return;
  const followsTail = consoleOutput.scrollHeight - consoleOutput.scrollTop - consoleOutput.clientHeight < 48;
  const previous = hasConsoleOutput ? consoleOutput.textContent : "";
  const combined = previous + String(text);
  consoleOutput.textContent = combined.length > 60000 ? `[Earlier output trimmed]\n${combined.slice(-50000)}` : combined;
  hasConsoleOutput = true;
  if (followsTail) consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function setStatus(text) {
  byId("action-status").textContent = text;
}

function clearError() {
  byId("action-error").hidden = true;
  byId("action-error").textContent = "";
}

function reportError(error, fallback = "The operation failed.") {
  let message = error instanceof Error && error.message ? error.message : fallback;
  if (error?.name === "NotFoundError" || error?.name === "AbortError") {
    message = "No port was selected, or the operation was cancelled. Nothing is marked complete; you can retry.";
  } else if (error?.name === "SecurityError" || error?.name === "NotAllowedError") {
    message = "Serial access was denied. Check browser permissions, HTTPS and your organization's device policy.";
  } else if (error?.name === "NetworkError") {
    message = "The USB port could not be used. Close other serial clients, check the cable and reconnect.";
  }
  byId("action-error").textContent = message;
  byId("action-error").hidden = false;
}

const connection = new MicroPythonConnection({
  onOutput(text) {
    if (!suppressOutput) {
      receivedOutput += 1;
      appendOutput(text);
    }
  },
  onState(state) {
    const names = { connected: "Connected", disconnected: "Disconnected", connecting: "Connecting…", running: "Busy" };
    byId("connection-state").textContent = names[state] || "Check connection";
    if (state === "disconnected") {
      byId("connection-help").textContent = "Port closed. Check the cable, then reconnect to continue.";
    } else if (state === "connected") {
      byId("connection-help").textContent = "USB serial connected. Run a sample to check the MicroPython runtime.";
    }
    updateControls();
  },
});

function updateControls() {
  const busy = Boolean(job || transitioning);
  for (const button of document.querySelectorAll("[data-device]")) {
    button.disabled = !serialAvailable || !connection.connected || busy;
  }
  byId("run-button").disabled = !serialAvailable || !connection.connected || transitioning || stopping || Boolean(job && job.kind !== "run");
  byId("run-button").textContent = job?.kind === "run" ? "Run again…" : "Run in RAM";
  byId("connect-button").disabled = !serialAvailable || connection.connected || busy;
  byId("disconnect-button").disabled = !connection.connected || transitioning || job?.kind === "flash" || job?.kind === "connect";
  byId("stop-button").disabled = stopping || !connection.connected || !connection.running;
  byId("stop-button").textContent = stopping ? "Stopping…" : "Stop";
  byId("flash-button").disabled = !serialAvailable || busy || connection.connected || firmwareLoading || firmwareSelectionError;
  byId("firmware-file").disabled = job?.kind === "flash";
}

async function perform(kind, label, action, { sensitive = false } = {}) {
  if (job) {
    reportError(new Error("Another operation is active. Stop the running script or wait for it to finish."));
    return;
  }
  const operation = { kind };
  job = operation;
  suppressOutput = sensitive;
  clearError();
  setStatus(label);
  updateControls();
  try {
    await action();
  } catch (error) {
    setStatus("Operation did not complete. Read the error before retrying.");
    reportError(sensitive ? new Error("Could not write Wi-Fi config. Credentials were not logged. Check the USB connection and retry; the device file may be incomplete.") : error);
  } finally {
    suppressOutput = false;
    if (job === operation) job = null;
    updateControls();
  }
}

function requireDevice() {
  if (!connection.connected) {
    reportError(new Error("Connect a MicroPython device first. You can still read, edit and download without one."));
    return false;
  }
  return true;
}

function updateProgress() {
  byId("course-progress").max = lessons.length;
  byId("course-progress").value = completed.size;
  byId("progress-text").textContent = `${completed.size} of ${lessons.length} marked complete`;
  for (const lesson of lessons) {
    const link = byId(`nav-${lesson.id}`);
    link.setAttribute("aria-label", `${lesson.navTitle}, ${lesson.minutes} minutes${completed.has(lesson.id) ? ", marked complete" : ""}`);
    const number = link.querySelector(".step-number");
    number.textContent = String(lessons.indexOf(lesson) + 1);
    number.classList.toggle("is-complete", completed.has(lesson.id));
    link.querySelector(".step-duration").textContent = completed.has(lesson.id) ? "Done" : `${lesson.minutes}m`;
  }
}

function clearWifiFields() {
  byId("wifi-ssid").value = "";
  byId("wifi-password").value = "";
}

function setNavOpen(open) {
  byId("course-nav").classList.toggle("is-open", open);
  byId("nav-toggle").setAttribute("aria-expanded", String(open));
}

function renderLesson({ focus = false } = {}) {
  if (currentLesson) drafts.set(currentLesson.id, editor.value);
  const id = location.hash.slice(1);
  const next = lessons.find((lesson) => lesson.id === id) || lessons[0];
  if (currentLesson?.id === "weather" && next.id !== "weather") clearWifiFields();
  currentLesson = next;
  const sample = samples[next.sample];
  byId("lesson-title").textContent = next.title;
  byId("lesson-duration").textContent = `${next.minutes} min`;
  byId("lesson-summary").textContent = next.summary;
  byId("lesson-content").innerHTML = next.content;
  byId("editor-filename").textContent = sample.name;
  editor.value = drafts.get(next.id) ?? sample.source;
  editor.setAttribute("aria-label", `Python source: ${sample.name}, ${next.title}`);
  byId("setup-tools").hidden = next.id !== "setup";
  byId("wifi-tools").hidden = next.id !== "weather";
  byId("lesson-complete").checked = completed.has(next.id);
  const index = lessons.indexOf(next);
  byId("previous-lesson").disabled = index === 0;
  byId("next-lesson").disabled = index === lessons.length - 1;
  for (const lesson of lessons) {
    const link = byId(`nav-${lesson.id}`);
    if (lesson.id === next.id) link.setAttribute("aria-current", "step");
    else link.removeAttribute("aria-current");
  }
  updateDraftState();
  setNavOpen(false);
  document.title = `${next.title} · CrowPanel lab`;
  if (focus) {
    byId("lesson").focus({ preventScroll: true });
    byId("lesson").scrollIntoView({ block: "start", behavior: "instant" });
  }
}

function updateDraftState() {
  byId("draft-state").textContent = editor.value === samples[currentLesson.sample].source ? "Sample" : "Edited · tab only";
}

for (const lesson of lessons) {
  const item = document.createElement("li");
  const link = document.createElement("a");
  link.id = `nav-${lesson.id}`;
  link.href = `#${lesson.id}`;
  const number = document.createElement("span");
  number.className = "step-number";
  number.setAttribute("aria-hidden", "true");
  const title = document.createElement("span");
  title.textContent = lesson.navTitle;
  const duration = document.createElement("span");
  duration.className = "step-duration";
  duration.textContent = `${lesson.minutes}m`;
  duration.setAttribute("aria-hidden", "true");
  link.append(number, title, duration);
  link.addEventListener("click", () => {
    if (currentLesson?.id === lesson.id) {
      setNavOpen(false);
      byId("lesson").focus();
    }
  });
  item.append(link);
  byId("lesson-list").append(item);
}

byId("nav-toggle").addEventListener("click", () => setNavOpen(byId("nav-toggle").getAttribute("aria-expanded") !== "true"));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && byId("nav-toggle").getAttribute("aria-expanded") === "true") {
    setNavOpen(false);
    byId("nav-toggle").focus();
  }
});
window.addEventListener("hashchange", () => renderLesson({ focus: true }));
byId("previous-lesson").addEventListener("click", () => {
  const previous = lessons[lessons.indexOf(currentLesson) - 1];
  if (previous) location.hash = previous.id;
});
byId("next-lesson").addEventListener("click", () => {
  const next = lessons[lessons.indexOf(currentLesson) + 1];
  if (next) location.hash = next.id;
});
byId("lesson-complete").addEventListener("change", (event) => {
  if (event.target.checked) completed.add(currentLesson.id);
  else completed.delete(currentLesson.id);
  updateProgress();
});
editor.addEventListener("input", () => {
  drafts.set(currentLesson.id, editor.value);
  updateDraftState();
});
byId("reset-editor").addEventListener("click", () => {
  if (editor.value !== samples[currentLesson.sample].source && !window.confirm("Discard the edited draft for this lesson and restore its sample? Download it first if you want to keep it.")) return;
  editor.value = samples[currentLesson.sample].source;
  drafts.delete(currentLesson.id);
  updateDraftState();
  editor.focus();
});
byId("download-button").addEventListener("click", () => {
  const blob = new Blob([editor.value], { type: "text/x-python;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = samples[currentLesson.sample].name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus("Download requested. Check your browser's downloads for the Python file.");
});
byId("clear-console").addEventListener("click", () => {
  consoleOutput.textContent = "";
  hasConsoleOutput = false;
});

byId("connect-button").addEventListener("click", () => {
  void perform("connect", "Choose the board's serial port…", async () => {
    await connection.connect();
    setStatus("USB connected. MicroPython and panel operation are not yet verified; run a sample next.");
  });
});
byId("disconnect-button").addEventListener("click", async () => {
  if ((connection.running || job) && !window.confirm("Disconnect during the current operation? Its work may be incomplete. The program may continue on the board.")) return;
  try {
    await connection.disconnect();
    setStatus("Serial port disconnected. Disconnecting does not erase files or guarantee a running program stopped.");
  } catch (error) {
    reportError(error);
  }
});

async function runEditor() {
  if (!requireDevice() || transitioning || stopping) return;
  const source = editor.value;
  if (!source.trim()) {
    reportError(new Error("The editor is empty. Add Python code or reset the sample before running."));
    return;
  }
  if (job) {
    if (job.kind !== "run") {
      reportError(new Error("Wait for the current file or firmware operation before running code."));
      return;
    }
    if (!window.confirm("Stop the currently running script with Ctrl-C, then run this editor draft in RAM?")) return;
    transitioning = true;
    updateControls();
    try {
      stopRequested = true;
      await connection.stop();
      await runTask;
    } catch (error) {
      reportError(error);
      return;
    } finally {
      transitioning = false;
      updateControls();
    }
    if (!requireDevice()) return;
  }
  stopRequested = false;
  const filename = samples[currentLesson.sample].name;
  runTask = perform("run", `Running ${filename} in RAM. Use Stop for an interactive loop.`, async () => {
    appendOutput(`\n[Run ${filename} in RAM]\n`);
    const outputBefore = receivedOutput;
    const result = await connection.execute(source, { timeoutMs: 0 });
    if (receivedOutput === outputBefore) appendOutput((result?.stdout || "") + (result?.stderr || ""));
    if (stopRequested) {
      setStatus("Script interrupted with Ctrl-C. No boot file was changed.");
    } else if (result?.stderr) {
      throw new Error("MicroPython reported an exception. Read the serial console; this is not a successful run.");
    } else {
      setStatus("Script finished in RAM. Check the physical device yourself before marking the lesson complete.");
    }
  });
  await runTask;
}

byId("run-button").addEventListener("click", () => { void runEditor(); });
editor.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    void runEditor();
  }
});
byId("stop-button").addEventListener("click", async () => {
  if (stopping || !connection.connected || !connection.running) return;
  stopping = true;
  stopRequested = true;
  updateControls();
  setStatus("Sending Ctrl-C; waiting for the board to return to its prompt…");
  try {
    await connection.stop();
    if (connection.connected) setStatus("Interrupt sent. Check the console for the program's final output.");
    else reportError(new Error("The board did not return to a usable prompt. Reconnect before continuing."));
  } catch (error) {
    reportError(error);
  } finally {
    stopping = false;
    updateControls();
  }
});

byId("save-main").addEventListener("click", () => {
  if (!requireDevice()) return;
  const source = editor.value;
  if (!source.trim()) {
    reportError(new Error("The editor is empty; no boot script was saved."));
    return;
  }
  if (!window.confirm("Overwrite main.py on this device with the current editor? This program will autostart on every reset. Keep USB access so you can interrupt it with Ctrl-C. Saving does not run it now.")) return;
  void perform("save", "Writing main.py to the device…", async () => {
    await connection.writeFile("main.py", source);
    setStatus("main.py was written. It will autostart on reset; it was not run by this save action.");
  });
});

byId("install-button").textContent = `Install ${libraryFiles.length} workshop files`;
byId("install-button").addEventListener("click", () => {
  if (!requireDevice()) return;
  if (!window.confirm("Write crowpanel.py, weather.py, slides.py and weather_ca.pem to the board, replacing files with those names? This enters the REPL and may interrupt an autostart program. No main.py will be created.")) return;
  void perform("install", "Installing workshop libraries and weather trust certificate…", async () => {
    const installed = [];
    try {
      for (const file of libraryFiles) {
        byId("install-status").textContent = `Writing ${file.name} (${installed.length + 1}/${libraryFiles.length})…`;
        await connection.writeFile(file.name, file.data);
        installed.push(file.name);
        appendOutput(`[Wrote ${file.name}]\n`);
      }
    } catch (error) {
      byId("install-status").textContent = `Installation incomplete. ${installed.length} of ${libraryFiles.length} files written. Reconnect if needed and retry the full installation.`;
      throw error;
    }
    byId("install-status").textContent = `All ${libraryFiles.length} workshop files written. Panel behavior still needs a physical check.`;
    setStatus("Workshop files installed. No boot script was created. Run the station MAC exercise next.");
  });
});

function pythonString(value) {
  return JSON.stringify(value).replace(/[\u2028\u2029]/g, (character) => character === "\u2028" ? "\\u2028" : "\\u2029");
}

byId("wifi-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!requireDevice()) return;
  const ssid = byId("wifi-ssid").value;
  const password = byId("wifi-password").value;
  const encoder = new TextEncoder();
  if (!ssid || encoder.encode(ssid).length > 32) {
    reportError(new Error("The network name must be between 1 and 32 UTF-8 bytes."));
    return;
  }
  if (password && (encoder.encode(password).length < 8 || encoder.encode(password).length > 64)) {
    reportError(new Error("Use a WPA2 password of 8–63 bytes, a 64-character hexadecimal key, or leave it empty for an open network."));
    return;
  }
  if (encoder.encode(password).length === 64 && !/^[0-9a-fA-F]{64}$/.test(password)) {
    reportError(new Error("A 64-character WPA2 key must contain only hexadecimal characters."));
    return;
  }
  if (!window.confirm("Write Wi-Fi credentials in plaintext to wifi_config.py on this board, replacing that file? This enters the REPL and may interrupt a boot program. Remove the file before sharing the board.")) return;
  void perform("wifi", "Writing Wi-Fi config directly over USB; output is suppressed…", async () => {
    byId("wifi-status").textContent = "Writing configuration. Credentials are not shown in the editor or console.";
    try {
      await connection.writeFile("wifi_config.py", `SSID = ${pythonString(ssid)}\nPASSWORD = ${pythonString(password)}\n`);
    } catch {
      byId("wifi-status").textContent = "Write failed. The device file may be incomplete. Reconnect and retry.";
      throw new Error("Wi-Fi config write failed.");
    }
    clearWifiFields();
    byId("wifi-status").textContent = "wifi_config.py written; form fields cleared. Run the weather sample to test the network.";
    setStatus("Wi-Fi config saved on the device. No network connection or weather fetch has been verified yet.");
  }, { sensitive: true });
});

byId("firmware-description").textContent = `MicroPython ${FIRMWARE.version} · ${FIRMWARE.board} · ${FIRMWARE.variant}. Flashing erases the device's firmware and files. A successful write is not a panel test.`;
byId("firmware-source").href = FIRMWARE.source;
byId("firmware-file").addEventListener("change", async () => {
  const version = ++firmwareLoadVersion;
  const file = byId("firmware-file").files[0];
  selectedFirmware = null;
  firmwareSelectionError = false;
  firmwareLoading = false;
  clearError();
  if (!file) {
    byId("flash-status").textContent = "The next install will use the bundled, pinned firmware image.";
    updateControls();
    return;
  }
  if (!file.name.toLowerCase().endsWith(".bin") || file.size < 1024 || file.size > 8 * 1024 * 1024) {
    firmwareSelectionError = true;
    reportError(new Error("Choose a complete ESP32-S3 firmware .bin between 1 KB and 8 MB. This checks file size and extension, not board compatibility."));
    updateControls();
    return;
  }
  firmwareLoading = true;
  byId("flash-status").textContent = "Reading local firmware into memory. No device has been written.";
  updateControls();
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (version !== firmwareLoadVersion) return;
    selectedFirmware = { file, bytes };
    byId("flash-status").textContent = "Local firmware is ready for the next install. Its board compatibility has not been verified.";
  } catch {
    if (version !== firmwareLoadVersion) return;
    firmwareSelectionError = true;
    byId("flash-status").textContent = "Local firmware could not be read. No flash was started.";
    reportError(new Error("Could not read the selected firmware. Choose the file again or clear the selection to use the bundled image."));
  } finally {
    if (version === firmwareLoadVersion) {
      firmwareLoading = false;
      updateControls();
    }
  }
});
byId("flash-button").addEventListener("click", () => {
  if (!serialAvailable || job || transitioning || firmwareLoading || firmwareSelectionError) return;
  if (connection.connected) {
    reportError(new Error("Disconnect the Python workspace before opening the firmware installer's port."));
    return;
  }
  const file = byId("firmware-file").files[0];
  if (file && selectedFirmware?.file !== file) {
    reportError(new Error("The selected firmware is not ready. Choose it again and wait for the file to finish loading."));
    return;
  }
  const selected = file ? "your selected local .bin" : `the pinned MicroPython ${FIRMWARE.version} ${FIRMWARE.board} image`;
  if (!window.confirm(`ERASE this board's flash and install ${selected}? Existing firmware, Python files and credentials will be lost. This cannot restore the factory image. Confirm the ESP32-S3 board/memory variant and back up first.`)) return;
  void perform("flash", "Preparing firmware installer. Select the board's bootloader port when asked…", async () => {
    byId("flash-progress").hidden = false;
    byId("flash-progress").value = 0;
    byId("flash-status").textContent = "Installer active. Do not unplug the board while writing.";
    try {
      const firmware = file ? selectedFirmware.bytes : null;
      const result = await flashMicroPython({
        firmware,
        onProgress(percent) {
          if (Number.isFinite(percent)) byId("flash-progress").value = Math.min(100, Math.max(0, percent));
        },
        onLog(text) { appendOutput(`[Installer] ${text}\n`); },
      });
      if (result !== true && result?.success !== true) throw new Error("The firmware installer did not explicitly confirm a successful write. Check its log and reconnect to verify the runtime before continuing.");
      byId("flash-progress").value = 100;
      byId("flash-status").textContent = "Firmware write completed without an installer error. Reset/reconnect and run a sample to verify MicroPython; the display has not been tested.";
      setStatus("Firmware write complete. Reconnect the Python workspace, then install the workshop files.");
    } catch (error) {
      byId("flash-progress").hidden = true;
      byId("flash-status").textContent = "Flash not confirmed. If writing began, the board may need reflashing. Check the installer log before retrying.";
      throw error;
    }
  });
});

if (!serialAvailable) {
  byId("capability-warning").hidden = false;
  byId("capability-warning").textContent = !globalThis.isSecureContext
    ? "USB controls need a secure context (HTTPS or localhost). You can still read all lessons, edit samples and download Python files here."
    : "This browser does not expose Web Serial. Use a supported desktop Chrome or Edge browser for USB, or keep reading, editing and downloading without a device.";
  byId("connection-help").textContent = "USB controls are unavailable here. Course reading and local editing still work.";
}
window.addEventListener("beforeunload", (event) => {
  const hasEdits = [...drafts].some(([id, source]) => source !== samples[lessons.find((lesson) => lesson.id === id).sample].source);
  if (job || hasEdits) {
    event.preventDefault();
    event.returnValue = "";
  }
});
window.addEventListener("pagehide", clearWifiFields);
renderLesson();
updateProgress();
updateControls();
if (totalMinutes !== 120) reportError(new Error("The course duration data does not add up to two hours."));
