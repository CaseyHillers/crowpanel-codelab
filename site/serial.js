import { CROWPANEL_USB_FILTER, requireCrowPanelPort } from "./usb-devices.js";

const encoder = new TextEncoder();
const NEGOTIATION_MS = 3000;
const RAW_PROMPT = "raw REPL; CTRL-B to exit\r\n>";
const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function fileSource(name, data) {
  if (typeof name !== "string" || name.length > 128 ||
      !/^\.?[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(name) || name.includes("..")) {
    throw new TypeError("Use a flat filename, such as main.py or ca.pem; paths are not allowed.");
  }
  if (typeof data !== "string" && !(data instanceof Uint8Array)) {
    throw new TypeError("File data must be a string or Uint8Array.");
  }
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  const lines = ["import ubinascii", `with open('${name}', 'wb') as _crowpanel_file:`];
  for (let offset = 0; offset < bytes.length; offset += 256) {
    const hex = Array.from(bytes.subarray(offset, offset + 256),
      (byte) => byte.toString(16).padStart(2, "0")).join("");
    lines.push(`    _crowpanel_file.write(ubinascii.unhexlify('${hex}'))`);
  }
  if (!bytes.length) lines.push("    pass");
  return `${lines.join("\n")}\n`;
}

export class MicroPythonConnection {
  constructor({ onOutput = () => {}, onState = () => {} } = {}) {
    this.onOutput = onOutput;
    this.onState = onState;
    this._session = null;
    this._connecting = null;
    this._operation = null;
    this._stopping = null;
  }

  get connected() {
    return Boolean(this._session && !this._session.error);
  }

  get running() {
    return Boolean(this._operation);
  }

  _notify(callback, value) {
    try { callback(value); } catch {}
  }

  _state(value) {
    this._notify(this.onState, value);
  }

  async connect() {
    if (this._connecting || this._session) throw new Error("Serial connection is already open or busy.");
    const serial = globalThis.navigator?.serial;
    if (!serial) throw new Error("Web Serial is unavailable. Use a supported browser in a secure context.");
    const attempt = { cancelled: false };
    this._connecting = attempt;
    let session;
    try {
      const selected = serial.requestPort({ filters: [CROWPANEL_USB_FILTER] });
      this._state("connecting");
      const port = await selected;
      if (attempt.cancelled) throw new Error("Connection cancelled.");
      requireCrowPanelPort(port);
      session = {
        port, serial, reader: null, writer: null, pump: null, buffer: "", wake: null,
        error: null, closing: null, writes: Promise.resolve(), listening: false, opened: false,
      };
      await port.open({ baudRate: 115200, flowControl: "none" });
      session.opened = true;
      if (attempt.cancelled) throw new Error("Connection cancelled.");
      if (port.setSignals) {
        await port.setSignals({ dataTerminalReady: false, requestToSend: false });
      }
      if (attempt.cancelled) throw new Error("Connection cancelled.");
      session.reader = port.readable.getReader();
      session.writer = port.writable.getWriter();
      session.onDisconnect = (event) => {
        if (event.target === port || event.port === port) {
          void this._close(session, new Error("Serial device disconnected."));
        }
      };
      serial.addEventListener?.("disconnect", session.onDisconnect);
      this._session = session;
      session.pump = this._pump(session);
      this._state("connected");
    } catch (error) {
      if (session) await this._close(session, error);
      else this._state("disconnected");
      throw error;
    } finally {
      if (this._connecting === attempt) this._connecting = null;
    }
  }

  async disconnect() {
    if (this._connecting) this._connecting.cancelled = true;
    if (this._session) await this._close(this._session, new Error("Serial connection disconnected."));
  }

  async _pump(session) {
    const decoder = new TextDecoder();
    try {
      while (!session.error) {
        const { value, done } = await session.reader.read();
        if (done) throw new Error("Serial device disconnected (stream ended).");
        const text = decoder.decode(value, { stream: true });
        if (session.listening) session.buffer += text;
        session.wake?.();
      }
    } catch (error) {
      if (!session.error) void this._close(session, error);
    } finally {
      session.reader.releaseLock();
    }
  }

  _close(session, error) {
    if (session.closing) return session.closing;
    session.error = error;
    session.listening = false;
    session.buffer = "";
    session.wake?.();
    session.serial.removeEventListener?.("disconnect", session.onDisconnect);
    this._state("disconnected");
    session.closing = Promise.resolve().then(async () => {
      const cancellation = session.reader?.cancel().catch(() => {});
      const abortion = session.writer?.abort(error).catch(() => {});
      await Promise.all([cancellation, abortion, session.pump, session.writes]);
      if (session.reader && !session.pump) session.reader.releaseLock();
      session.writer?.releaseLock();
      if (session.opened) {
        try { await session.port.close(); } catch {}
      }
      if (this._session === session) this._session = null;
    });
    return session.closing;
  }

  _check(session, operation) {
    if (session.error) throw session.error;
    if (operation?.stopped && operation.phase !== "running") {
      throw new Error("Execution stopped before the program started.");
    }
    if (operation?.deadline && Date.now() >= operation.deadline) {
      throw new Error("MicroPython execution timed out.");
    }
    if (operation?.stopDeadline && Date.now() >= operation.stopDeadline) {
      throw new Error("MicroPython did not respond to Stop; reconnect the device.");
    }
  }

  async _write(session, data, operation) {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    const write = session.writes.then(() => {
      this._check(session, operation);
      return session.writer.write(bytes);
    });
    session.writes = write.catch(() => {});
    await write;
  }

  async _readUntil(session, delimiter, deadline, operation, consume) {
    let result = "";
    while (true) {
      this._check(session, operation);
      const end = session.buffer.indexOf(delimiter);
      if (end !== -1) {
        const text = session.buffer.slice(0, end);
        session.buffer = session.buffer.slice(end + delimiter.length);
        if (consume) consume(text);
        else result += text;
        return result;
      }
      if (consume && session.buffer) {
        consume(session.buffer);
        session.buffer = "";
      }
      if (!consume && session.buffer.length > 65536) {
        throw new Error("Unexpected MicroPython REPL response.");
      }
      const limit = Math.min(deadline || Infinity, operation?.deadline || Infinity,
        operation?.stopDeadline || Infinity);
      if (Date.now() >= limit) throw new Error("Timed out waiting for the MicroPython REPL.");
      await new Promise((resolve) => {
        let timer;
        session.wake = () => {
          clearTimeout(timer);
          session.wake = null;
          resolve();
        };
        if (limit !== Infinity) timer = setTimeout(session.wake, Math.max(1, limit - Date.now()));
      });
    }
  }

  async _exclusive(task) {
    if (!this.connected) throw new Error("Connect to a MicroPython device first.");
    if (this._operation || this._stopping) throw new Error("Serial connection is busy; stop or wait for the current operation.");
    const operation = { stopped: false, phase: "negotiating", deadline: 0, stopDeadline: 0 };
    const session = this._session;
    this._operation = operation;
    operation.done = new Promise((resolve) => { operation.finish = resolve; });
    this._state("running");
    try {
      return await task(session, operation);
    } catch (error) {
      if (!session.error && !operation.synchronized) {
        if (operation.stopped && operation.phase !== "running") {
          try {
            session.buffer = "";
            await this._write(session, "\x03\x03\x02");
            await this._readUntil(session, ">>> ", Date.now() + NEGOTIATION_MS);
          } catch (recoveryError) {
            await this._close(session, recoveryError);
          }
        } else {
          try { await this._write(session, "\x03\x03"); } catch {}
          await this._close(session, error);
        }
      }
      throw error;
    } finally {
      session.listening = false;
      session.buffer = "";
      this._operation = null;
      operation.finish();
      if (this.connected) this._state("connected");
    }
  }

  async execute(source, { timeoutMs = 0 } = {}) {
    if (typeof source !== "string" || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(source)) {
      throw new TypeError("Source must be Python text without REPL control characters.");
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw new TypeError("timeoutMs must be nonnegative.");
    return this._exclusive((session, operation) => {
      operation.deadline = timeoutMs ? Date.now() + timeoutMs : 0;
      return this._execute(session, operation, source);
    });
  }

  async _execute(session, operation, source) {
    this._check(session, operation);
    operation.synchronized = false;
    operation.phase = "negotiating";
    session.buffer = "";
    session.listening = true;
    await this._write(session, "\x03\x03\x01", operation);
    await this._readUntil(session, RAW_PROMPT, Date.now() + NEGOTIATION_MS, operation);
    operation.phase = "uploading";
    const bytes = encoder.encode(source);
    for (let offset = 0; offset < bytes.length; offset += 128) {
      await this._write(session, bytes.subarray(offset, offset + 128), operation);
      await pause(10);
    }
    this._check(session, operation);
    operation.phase = "running";
    await this._write(session, "\x04", operation);
    const acknowledgment = await this._readUntil(session, "OK", Date.now() + NEGOTIATION_MS, operation);
    if (acknowledgment) throw new Error("Unexpected MicroPython execution acknowledgment.");
    const result = { stdout: "", stderr: "" };
    for (const channel of ["stdout", "stderr"]) {
      await this._readUntil(session, "\x04", 0, operation, (text) => {
        if (!text) return;
        result[channel] += text;
        this._notify(this.onOutput, text);
      });
    }
    await this._readUntil(session, ">", Date.now() + NEGOTIATION_MS, operation);
    await this._write(session, "\x02", operation);
    await this._readUntil(session, ">>> ", Date.now() + NEGOTIATION_MS, operation);
    operation.synchronized = true;
    return result;
  }

  async stop() {
    if (this._stopping) return this._stopping;
    const operation = this._operation;
    if (!operation) return;
    const session = this._session;
    operation.stopped = true;
    operation.stopDeadline = Date.now() + NEGOTIATION_MS;
    session.wake?.();
    this._stopping = (async () => {
      try {
        await this._write(session, "\x03\x03");
        await operation.done;
      } catch (error) {
        await this._close(session, error);
      } finally {
        this._stopping = null;
      }
    })();
    return this._stopping;
  }

  async writeFile(path, data) {
    const source = fileSource(path, data);
    return this._exclusive(async (session, operation) => {
      const result = await this._execute(session, operation, source);
      if (result.stderr) throw new Error(`MicroPython could not write ${path}.`);
      return result;
    });
  }

  async writeFiles(files) {
    if (!Array.isArray(files)) throw new TypeError("Expected an array of { name, data } files.");
    const prepared = files.map(({ name, data }) => ({ name, source: fileSource(name, data) }));
    return this._exclusive(async (session, operation) => {
      const results = [];
      for (const { name, source } of prepared) {
        const result = await this._execute(session, operation, source);
        if (result.stderr) throw new Error(`MicroPython could not write ${name}.`);
        results.push(result);
      }
      return results;
    });
  }
}
