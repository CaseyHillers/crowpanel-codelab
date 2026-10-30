import { MicroPythonConnection } from "./serial.js";
import { lessons, samples, totalMinutes } from "./lessons.js";
import { FIRMWARE } from "./firmware.js";
import { flashMicroPython } from "./flash.js";
import { createHardwareStory } from "./hardware-story.js";
import { createCodeEditor } from "./code-editor.js";
import { checkUsbDevice, detectHostOs } from "./usb-check.js";
import { createProjectPrompt } from "./codex-prompts.js";
import { createStarterInputs } from "./starter-inputs.js";
import starterSource from "../device/examples/00_board_check.py?raw";
import snakeSolution from "../device/examples/02_snake_solution.py?raw";
import panelSource from "../device/crowpanel.py?raw";
import weatherSource from "../device/weather.py?raw";
import slidesSource from "../device/slides.py?raw";
import weatherCa from "../device/weather_ca.pem?raw";

const byId = (id) => document.getElementById(id);
const hardwareStory = createHardwareStory(byId("hardware-intro"), byId("story-viewer"), byId("story-status"));
const editor = createCodeEditor(byId("code-editor"));
const consoleOutput = byId("console-output");
const drafts = new Map();
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
let hasConsoleOutput = false;
let receivedOutput = 0;
let selectedFirmware = null;
let firmwareLoading = false;
let firmwareLoadVersion = 0;
let firmwareSelectionError = false;
let usbDetected = false;
let checkingUsb = false;
let starterActive = false;
const observedInputs = new Map();
let celebrationShown = false;
let boardVerified = false;
const starterInputs = createStarterInputs((name, state) => {
  observedInputs.set(name, state);
  const indicator = document.querySelector(`[data-input="${name}"]`);
  indicator.dataset.state = state;
  indicator.textContent = `${state === "seen" ? "✅" : "👇"} ${name}${state === "pressed" ? " · release" : ""}`;
  indicator.setAttribute("aria-label", `${name}: ${state === "seen" ? "press and release detected" : "pressed; release it"}`);
  const count = [...observedInputs.values()].filter(value => value === "seen").length;
  byId("starter-status").textContent = `✅ ${count}/5 detected${count === 5 ? " · wait for the party screen." : " · try the remaining controls."}`;
  updateVerification();
}, () => {
  celebrationShown = true;
  updateVerification();
});

function updateVerification() {
  const complete = observedInputs.size === 5 && [...observedInputs.values()].every(state => state === "seen");
  byId("verification-result").hidden = !complete;
  byId("confirm-display").disabled = !complete || !celebrationShown || Boolean(job) || !connection.connected;
  byId("confirm-display").hidden = boardVerified;
  byId("verification-display-help").textContent = boardVerified
    ? "Five controls detected + party screen confirmed by you."
    : celebrationShown ? "Can you see the party screen on the physical display?" : "Wait for the party screen. If it stays blank, ask for help.";
  byId("verification-success").hidden = !boardVerified;
  byId("start-coding").hidden = !boardVerified;
}

function resetVerification() {
  starterInputs.reset();
  observedInputs.clear();
  celebrationShown = false;
  boardVerified = false;
  for (const indicator of document.querySelectorAll("[data-input]")) {
    indicator.dataset.state = "waiting";
    indicator.textContent = `○ ${indicator.dataset.input}`;
    indicator.setAttribute("aria-label", `${indicator.dataset.input}: not yet detected`);
  }
}

function celebrateBoard() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const confetti = document.createElement("div");
  confetti.className = "board-confetti";
  confetti.setAttribute("aria-hidden", "true");
  for (let index = 0; index < 48; index += 1) {
    const piece = document.createElement("span");
    piece.style.left = `${(index * 37) % 100}%`;
    piece.style.setProperty("--drift", `${((index * 53) % 240) - 120}px`);
    piece.style.setProperty("--delay", `${(index % 8) * 45}ms`);
    piece.style.setProperty("--turn", `${180 + (index % 5) * 90}deg`);
    confetti.append(piece);
  }
  document.body.append(confetti);
  setTimeout(() => confetti.remove(), 2800);
}

function appendOutput(text) {
  if (!text) return;
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
    message = "No port was selected, or the operation was cancelled. You can retry.";
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
    receivedOutput += 1;
    appendOutput(text);
    if (starterActive) starterInputs.push(text);
  },
  onState(state) {
    const names = { connected: "Connected", disconnected: "Disconnected", connecting: "Connecting…", running: "Busy" };
    byId("connection-state").textContent = names[state] || "Check connection";
    if (state === "disconnected") {
      resetVerification();
      byId("connection-help").textContent = "Port closed. Check the cable, then reconnect to continue.";
    } else if (state === "connected") {
      usbDetected = true;
      byId("connection-help").textContent = "USB serial connected. Run a sample to check the MicroPython runtime.";
    }
    updateControls();
  },
});

function updateControls() {
  const busy = Boolean(job || transitioning || checkingUsb);
  for (const button of document.querySelectorAll("[data-device]")) {
    button.disabled = !serialAvailable || !connection.connected || busy;
  }
  byId("run-button").disabled = !serialAvailable || !connection.connected || transitioning || stopping || Boolean(job && job.kind !== "run");
  byId("run-button").textContent = job?.kind === "run" ? "Run again…" : "Run in RAM";
  byId("connect-button").disabled = !serialAvailable || connection.connected || busy;
  byId("disconnect-button").disabled = !connection.connected || transitioning || job?.kind === "flash" || job?.kind === "connect";
  byId("stop-button").disabled = stopping || !connection.connected || !connection.running;
  byId("stop-button").textContent = stopping ? "Stopping…" : "Stop";
  byId("flash-button").disabled = !serialAvailable || !usbDetected || busy || connection.connected || firmwareLoading || firmwareSelectionError;
  byId("starter-button").disabled = !serialAvailable || (!usbDetected && !connection.connected) || busy;
  byId("setup-usb-note").hidden = usbDetected || connection.connected;
  byId("firmware-file").disabled = job?.kind === "flash";
  updateVerification();
  if (byId("usb-check-button")) byId("usb-check-button").disabled = !serialAvailable || busy;
  if (currentLesson) byId("next-lesson").disabled = lessons.indexOf(currentLesson) === lessons.length - 1
    || (currentLesson.id === "setup" && !usbDetected)
    || (currentLesson.id === "verify" && !boardVerified);
}

async function perform(kind, label, action) {
  if (job) {
    reportError(new Error("Another operation is active. Stop the running script or wait for it to finish."));
    return;
  }
  const operation = { kind };
  job = operation;
  clearError();
  setStatus(label);
  updateControls();
  try {
    await action();
  } catch (error) {
    setStatus("Operation did not complete. Read the error before retrying.");
    reportError(error);
  } finally {
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

function setNavOpen(open) {
  byId("course-nav").classList.toggle("is-open", open);
  byId("nav-toggle").setAttribute("aria-expanded", String(open));
}

function renderLesson({ focus = false } = {}) {
  if (currentLesson) drafts.set(currentLesson.id, editor.value);
  const requestedId = location.hash.slice(1);
  const id = ({ inputs: "verify", hello: "snake" })[requestedId] || requestedId;
  const isAppendix = id === "appendix";
  const next = lessons.find((lesson) => lesson.id === id) || lessons[0];
  currentLesson = next;
  const sample = samples[next.sample];
  byId("lesson-title").textContent = isAppendix ? "Hardware & 3D prints" : next.title;
  byId("lesson-duration").hidden = isAppendix;
  byId("lesson-duration").textContent = `${next.minutes} min`;
  byId("lesson-summary").textContent = isAppendix ? "The full CAD explorer and optional desk-kit print files. Outside the timed course." : next.summary;
  const isWelcome = !isAppendix && next.id === "welcome";
  const isCode = !isAppendix && next.layout === "code";
  const isVerify = !isAppendix && next.id === "verify";
  document.body.classList.toggle("is-landing", isWelcome);
  const skipLink = document.querySelector(".skip-link");
  skipLink.href = isWelcome ? "#setup" : "#lesson";
  skipLink.textContent = isWelcome ? "Skip introduction and start the workshop" : "Skip to lesson";
  document.querySelector(".workshop-grid").classList.toggle("is-welcome", isWelcome);
  document.querySelector(".workshop-grid").classList.toggle("is-appendix", isAppendix);
  document.querySelector(".workshop-grid").classList.toggle("is-code", isCode);
  document.querySelector(".workshop-grid").classList.toggle("is-guide", !isCode && !isWelcome && !isAppendix);
  document.querySelector(".workspace").hidden = !isCode && !isVerify && (isAppendix || next.id !== "finish");
  document.querySelector(".editor-panel").hidden = !isCode;
  byId("jump-to-code").hidden = !isCode;
  byId("host-visual").hidden = isAppendix || next.id !== "setup";
  byId("verification-visual").hidden = !isVerify;
  document.querySelector(".lesson-footer").hidden = isAppendix;
  byId("hardware-intro").hidden = !isWelcome;
  hardwareStory.setActive(isWelcome);
  byId("hardware-appendix").hidden = !isAppendix;
  const hardwareFrame = byId("hardware-viewer");
  if (isAppendix && !hardwareFrame.hasAttribute("src")) {
    hardwareFrame.src = new URL("./hardware/viewer.html", document.baseURI).href;
  } else if (!isAppendix && hardwareFrame.hasAttribute("src")) {
    hardwareFrame.removeAttribute("src");
  }
  byId("lesson-content").innerHTML = isAppendix ? "" : next.content;
  if (!isAppendix && next.id === "setup") {
    byId("usb-guide-download").href = new URL("../docs/usb-setup.md", import.meta.url).href;
    const hostOs = detectHostOs(navigator);
    for (const guide of document.querySelectorAll("[data-os]")) guide.open = guide.dataset.os === hostOs;
    byId("usb-check-status").textContent = usbDetected
      ? "✅ USB detected. Continue to Board check."
      : serialAvailable ? "○ Not checked. Select the board to unlock Next." : "USB access isn’t available. Use desktop Chrome or Edge on HTTPS or localhost. You can still read the lessons from the sidebar.";
    byId("usb-check-status").dataset.state = usbDetected ? "detected" : "waiting";
  }
  byId("editor-filename").textContent = sample.name;
  editor.value = drafts.get(next.id) ?? sample.source;
  editor.setAttribute("aria-label", `Python source: ${sample.name}, ${next.title}`);
  byId("setup-tools").hidden = !isVerify;
  byId("show-solution").hidden = isAppendix || next.id !== "snake";
  const index = lessons.indexOf(next);
  byId("previous-lesson").disabled = index === 0;
  byId("next-lesson").disabled = index === lessons.length - 1;
  for (const lesson of lessons) {
    const link = byId(`nav-${lesson.id}`);
    if (!isAppendix && lesson.id === next.id) link.setAttribute("aria-current", "step");
    else link.removeAttribute("aria-current");
  }
  if (isAppendix) byId("nav-appendix").setAttribute("aria-current", "page");
  else byId("nav-appendix").removeAttribute("aria-current");
  if (!isAppendix) updateDraftState();
  updateProjectPrompt();
  updateControls();
  setNavOpen(false);
  document.title = `${isAppendix ? "Hardware & 3D prints" : next.title} · CrowPanel lab`;
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
  link.setAttribute("aria-label", `${lesson.navTitle}, ${lesson.minutes} minutes`);
  const number = document.createElement("span");
  number.className = "step-number";
  number.textContent = String(lessons.indexOf(lesson) + 1);
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
byId("jump-to-code").addEventListener("click", () => {
  document.querySelector(".editor-panel").scrollIntoView({ block: "start" });
  editor.focus();
});
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
  if (currentLesson.id === "setup" && !usbDetected) return;
  const next = lessons[lessons.indexOf(currentLesson) + 1];
  if (next) location.hash = next.id;
});
byId("lesson-content").addEventListener("click", async (event) => {
  if (event.target.closest("#usb-check-button")) {
    if (checkingUsb || job) return;
    checkingUsb = true;
    usbDetected = false;
    const status = byId("usb-check-status");
    status.dataset.state = "waiting";
    status.textContent = "Choose the CrowPanel’s USB serial port…";
    try {
      const selection = checkUsbDevice(navigator.serial);
      updateControls();
      await selection;
      usbDetected = true;
      status.dataset.state = "detected";
      status.textContent = "✅ USB 1a86:7522 detected. Board unchanged. Continue to Board check.";
    } catch (error) {
      status.dataset.state = "error";
      status.textContent = error?.name === "NotFoundError"
        ? "No device selected. Check the cable and OS guide, then retry. Nothing on the board was changed."
        : `USB check didn’t pass: ${error.message}`;
    } finally {
      checkingUsb = false;
      updateControls();
    }
    return;
  }
  if (!event.target.closest("#copy-usb-prompt")) return;
  const prompt = byId("usb-codex-prompt");
  const status = byId("usb-copy-status");
  try {
    await navigator.clipboard.writeText(prompt.value);
    status.textContent = "Copied. Paste into your Codex session.";
  } catch {
    prompt.focus();
    prompt.select();
    status.textContent = "Copy isn’t available here. The prompt is selected; copy it manually.";
  }
});

function updateProjectPrompt() {
  byId("project-codex-prompt").value = createProjectPrompt(byId("project-idea").value, { lessonTitle: currentLesson?.title });
  byId("project-copy-status").textContent = "";
}

byId("project-idea").addEventListener("input", updateProjectPrompt);
byId("copy-project-prompt").addEventListener("click", async () => {
  const prompt = byId("project-codex-prompt");
  const status = byId("project-copy-status");
  try {
    await navigator.clipboard.writeText(prompt.value);
    status.textContent = "Copied. Ask Codex, review its code, then paste it into the editor.";
  } catch {
    prompt.focus();
    prompt.select();
    status.textContent = "Copy isn’t available. Copy the selected prompt manually.";
  }
});

if (navigator.serial) navigator.serial.addEventListener("disconnect", () => {
  usbDetected = false;
  if (byId("usb-check-status")) {
    byId("usb-check-status").dataset.state = "waiting";
    byId("usb-check-status").textContent = "A serial device disconnected. Reconnect the board and check USB again.";
  }
  updateControls();
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
byId("copy-console").addEventListener("click", async () => {
  const button = byId("copy-console");
  const status = byId("console-copy-status");
  if (!hasConsoleOutput) {
    status.textContent = "No serial output to copy yet.";
    return;
  }
  button.disabled = true;
  status.textContent = "Copying serial output…";
  try {
    await navigator.clipboard.writeText(consoleOutput.textContent);
    status.textContent = "Serial output copied.";
  } catch {
    consoleOutput.focus();
    status.textContent = "Copy isn’t available. Select the serial output and copy it manually.";
  } finally {
    button.disabled = false;
  }
});
byId("clear-console").addEventListener("click", () => {
  consoleOutput.textContent = "";
  hasConsoleOutput = false;
  byId("console-copy-status").textContent = "";
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
      setStatus("Script finished in RAM. Check the physical device for the expected result.");
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
async function refreshWorkshopImports() {
  const result = await connection.execute("import sys\nfor module_name in ('crowpanel', 'weather', 'slides'):\n    if module_name in sys.modules:\n        del sys.modules[module_name]\n");
  if (result?.stderr) throw new Error("Files were written, but reloading workshop libraries failed. Retry installation before running Snake.");
}

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
      await refreshWorkshopImports();
    } catch (error) {
      byId("install-status").textContent = `Installation incomplete. ${installed.length} of ${libraryFiles.length} files written. Reconnect if needed and retry the full installation.`;
      throw error;
    }
    byId("install-status").textContent = `All ${libraryFiles.length} workshop files written and imports refreshed. Panel behavior still needs a physical check.`;
    setStatus("Workshop libraries updated without rebooting. No boot script was created. Return to Snake when ready.");
  });
});

byId("starter-button").addEventListener("click", () => {
  if (!serialAvailable || job || checkingUsb || transitioning || (!usbDetected && !connection.connected)) return;
  if (!window.confirm("Copy the four workshop files and 00_board_check.py to this board, replacing files with those names, then run a 60-second input demo? Back up existing files first. No main.py or autostart program will be created.")) return;
  stopRequested = false;
  resetVerification();
  runTask = perform("run", "Connecting and preparing the board check…", async () => {
    try {
      if (!connection.connected) await connection.connect();
      const files = [...libraryFiles, { name: "00_board_check.py", data: starterSource }];
      for (const [index, file] of files.entries()) {
        byId("starter-status").textContent = `Copying file ${index + 1} of ${files.length}: ${file.name}…`;
        await connection.writeFile(file.name, file.data);
      }
      await refreshWorkshopImports();
      byId("install-status").textContent = "Workshop files copied. The input demo is next.";
      byId("starter-status").textContent = "👇 Press and release each control. Wait for the party screen after all five turn ✅.";
      starterActive = true;
      const result = await connection.execute(starterSource, { timeoutMs: 0 });
      if (result?.stderr && !stopRequested) throw new Error("The demo reported an error. Read the serial console before retrying.");
      if (stopRequested) celebrationShown = false;
      byId("starter-status").textContent = stopRequested
        ? "⏹ Check stopped. Try again when ready."
        : celebrationShown ? "🎉 All five detected! Confirm the party screen below." : "⚠️ Check incomplete. Missing input or blank screen? Ask for help, then retry.";
      setStatus("Board check ended. No boot file was created.");
    } catch (error) {
      celebrationShown = false;
      byId("starter-status").textContent = "⚠️ Check didn’t finish. See the console, reconnect and retry. Some files may have been copied.";
      throw error;
    } finally {
      starterActive = false;
    }
  });
});

byId("confirm-display").addEventListener("click", () => {
  if (!celebrationShown || job || !connection.connected || boardVerified) return;
  boardVerified = true;
  updateControls();
  celebrateBoard();
  byId("start-coding").focus();
});

byId("show-solution").addEventListener("click", () => {
  if (currentLesson.id !== "snake") return;
  if (editor.value !== samples.snake.source && editor.value !== snakeSolution
      && !window.confirm("Replace your Snake draft with the full solution? Download your work first if you want to keep it.")) return;
  editor.value = snakeSolution;
  drafts.set(currentLesson.id, editor.value);
  updateDraftState();
  editor.focus();
  setStatus("Full Snake solution loaded, not run. Review the input handler, then Run in RAM.");
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
  if (!serialAvailable || !usbDetected || job || checkingUsb || transitioning || firmwareLoading || firmwareSelectionError) return;
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
  if (!window.confirm(`ERASE this board's flash and install ${selected}? Existing firmware, Python files and credentials will be lost. Confirm the ESP32-S3 board/memory variant before continuing.`)) return;
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
      byId("flash-status").textContent = "✅ MicroPython written. Choose Connect & check board below. Display and inputs still need testing.";
      setStatus("Firmware written. Next: check your board.");
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
renderLesson();
updateControls();
if (totalMinutes !== 120) reportError(new Error("The course duration data does not add up to two hours."));
