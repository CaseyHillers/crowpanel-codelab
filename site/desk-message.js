export const SERVICE_UUID = "8b5e4d20-6c8a-4b39-a7d8-3f2c91a65010";
export const RX_UUID = "8b5e4d20-6c8a-4b39-a7d8-3f2c91a65011";
export const STATUS_UUID = "8b5e4d20-6c8a-4b39-a7d8-3f2c91a65012";
export const MAX_MESSAGE_BYTES = 112;
export const MAX_LINES = 4;
export const LINE_COLUMNS = 28;

function normalized(text) {
  if (typeof text !== "string") throw new TypeError("Enter a text message.");
  const result = text.replace(/\r\n/g, "\n");
  if (!result.trim()) throw new Error("Enter a message before sending.");
  if (result.length > MAX_MESSAGE_BYTES) throw new Error("Use at most 112 characters.");
  if (/[^\x20-\x7e\n]/.test(result)) throw new Error("Use plain ASCII text and line breaks; emoji are not supported by the display font.");
  return result;
}

function wrapped(text) {
  const lines = [];
  for (let paragraph of text.split("\n")) {
    while (paragraph.length > LINE_COLUMNS) {
      let cut = paragraph.lastIndexOf(" ", LINE_COLUMNS);
      if (cut <= 0) cut = LINE_COLUMNS;
      lines.push(paragraph.slice(0, cut));
      paragraph = paragraph[cut] === " " ? paragraph.slice(cut + 1).replace(/^ +/, "") : paragraph.slice(cut);
    }
    lines.push(paragraph);
  }
  if (lines.length > MAX_LINES) throw new Error("Your message must fit four lines of 28 characters. Shorten the text or remove a line break.");
  return lines;
}

export function normalizeMessage(text) {
  const result = normalized(text);
  wrapped(result);
  return result;
}

export function layoutMessage(text) {
  return wrapped(normalized(text));
}

// BLE is independent of the USB REPL. A successful write is only transport
// delivery; shown:id acknowledges a completed board refresh, not physical proof.
export class DeskMessageConnection {
  constructor({ bluetooth = globalThis.navigator?.bluetooth, onState = () => {}, timeoutMs = 45000 } = {}) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError("The Bluetooth response timeout must be positive.");
    this.bluetooth = bluetooth;
    this.onState = onState;
    this.timeoutMs = timeoutMs;
    this._attempt = null;
    this._session = null;
    this._pending = null;
    this._sending = false;
    this._nextId = 0;
  }

  get connected() { return Boolean(this._session?.device.gatt.connected); }
  get sending() { return this._sending; }
  get name() { return this._session?.device.name || "Desk display"; }

  _state(state) { try { this.onState(state); } catch {} }

  async connect() {
    if (!this.bluetooth?.requestDevice) throw new Error("Web Bluetooth is unavailable. Use a supported Chrome or Edge browser on HTTPS or localhost, with Bluetooth enabled.");
    if (this._attempt || this._session) throw new Error("Bluetooth is already connected or busy.");
    const attempt = { cancelled: false, session: null };
    attempt.cancelledPromise = new Promise((_, reject) => { attempt.reject = reject; });
    attempt.cancelledPromise.catch(() => {});
    this._attempt = attempt;
    this._state("connecting");
    try {
      // Keep the chooser in the click's user-activation stack.
      const selection = this.bluetooth.requestDevice({ filters: [{ services: [SERVICE_UUID] }] });
      const device = await this._step(attempt, selection);
      const session = { device, status: null, rx: null };
      attempt.session = session;
      session.onDisconnect = () => {
        if (this._attempt === attempt) this._cancel(attempt, new Error("Bluetooth device disconnected while connecting."));
        this._close(session, new Error("Bluetooth device disconnected."));
      };
      device.addEventListener("gattserverdisconnected", session.onDisconnect);
      const server = await this._step(attempt, device.gatt.connect());
      const service = await this._step(attempt, server.getPrimaryService(SERVICE_UUID));
      session.rx = await this._step(attempt, service.getCharacteristic(RX_UUID));
      session.status = await this._step(attempt, service.getCharacteristic(STATUS_UUID));
      session.onStatus = event => this._status(session, event.target.value);
      session.status.addEventListener("characteristicvaluechanged", session.onStatus);
      await this._step(attempt, session.status.startNotifications());
      await this._step(attempt, session.status.readValue());
      if (!device.gatt.connected) throw new Error("Bluetooth device disconnected while connecting.");
      this._session = session;
      this._state("connected");
      return this.name;
    } catch (error) {
      if (attempt.session) this._cleanup(attempt.session);
      this._state(this.connected ? "connected" : "disconnected");
      throw error;
    } finally {
      if (this._attempt === attempt) this._attempt = null;
    }
  }

  _step(attempt, operation) {
    const promise = Promise.resolve(operation);
    // Browser GATT operations cannot be aborted. Release a late connection too.
    promise.then(() => {
      if (attempt.cancelled && attempt.session) this._cleanup(attempt.session);
    }, () => {});
    return Promise.race([promise, attempt.cancelledPromise]);
  }

  _cancel(attempt, error) {
    if (attempt.cancelled) return;
    attempt.cancelled = true;
    attempt.reject(error);
  }

  _cleanup(session) {
    session.device.removeEventListener("gattserverdisconnected", session.onDisconnect);
    if (session.onStatus) session.status?.removeEventListener("characteristicvaluechanged", session.onStatus);
    try { Promise.resolve(session.status?.stopNotifications()).catch(() => {}); } catch {}
    // A cancelled old operation must not disconnect a newer owner of the device.
    const newerOwner = (this._session && this._session !== session && this._session.device === session.device)
      || (this._attempt?.session && this._attempt.session !== session && this._attempt.session.device === session.device);
    if (!newerOwner && session.device.gatt.connected) session.device.gatt.disconnect();
  }

  _close(session, error) {
    if (this._session === session) {
      this._session = null;
      this._fail(this._pending, error);
    }
    this._cleanup(session);
    this._state(this.connected ? "connected" : "disconnected");
  }

  disconnect() {
    if (this._attempt) {
      this._cancel(this._attempt, new Error("Bluetooth connection cancelled."));
      if (this._attempt.session) this._cleanup(this._attempt.session);
    }
    if (this._session) this._close(this._session, new Error("Bluetooth disconnected."));
    else this._state("disconnected");
  }

  _fail(pending, error) {
    if (!pending || pending.settled) return;
    pending.settled = true;
    pending.error = error;
    clearTimeout(pending.timer);
    if (this._pending === pending) this._pending = null;
    pending.reject(error);
  }

  _complete(pending) {
    if (pending.settled || !pending.writesDone || !pending.shown) return;
    pending.settled = true;
    clearTimeout(pending.timer);
    if (this._pending === pending) this._pending = null;
    pending.resolve({ id: pending.id, status: "shown" });
  }

  _status(session, value) {
    if (session !== this._session || !this._pending || !(value instanceof DataView)) return;
    const text = new TextDecoder().decode(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    const match = /^(shown|error|busy):(\d{1,3})$/.exec(text);
    const pending = this._pending;
    if (!match || Number(match[2]) !== pending.id) return;
    if (match[1] === "shown") {
      pending.shown = true;
      this._complete(pending);
    } else {
      this._fail(pending, new Error(match[1] === "busy" ? "The board is busy. Wait for the refresh before sending again." : "The board rejected the message or reported a display error. Check its serial console."));
    }
  }

  async send(text) {
    if (!this.connected) throw new Error("Connect the Bluetooth desk display first.");
    if (this._sending) throw new Error("A message is already pending; wait for the board's response.");
    const message = normalizeMessage(text);
    const session = this._session;
    const id = this._nextId;
    this._nextId = (id + 1) % 256;
    const pending = { id, writesDone: false, shown: false, settled: false };
    pending.result = new Promise((resolve, reject) => { pending.resolve = resolve; pending.reject = reject; });
    pending.result.catch(() => {});
    pending.timer = setTimeout(() => {
      this._fail(pending, new Error("Bluetooth display response timed out. Reconnect before sending again."));
      if (this._session === session) this.disconnect();
    }, this.timeoutMs);
    this._pending = pending;
    this._sending = true;
    this._state("sending");
    const payload = new TextEncoder().encode(message);
    const packets = [new Uint8Array([1, id, payload.length])];
    for (let offset = 0; offset < payload.length; offset += 18) packets.push(new Uint8Array([2, id, ...payload.subarray(offset, offset + 18)]));
    packets.push(new Uint8Array([3, id]));
    try {
      for (const packet of packets) {
        if (pending.error) throw pending.error;
        if (this._session !== session || !this.connected) throw new Error("Bluetooth disconnected.");
        await Promise.race([session.rx.writeValueWithResponse(packet), pending.result]);
      }
      pending.writesDone = true;
      this._complete(pending);
      return await pending.result;
    } catch (error) {
      this._fail(pending, error);
      throw error;
    } finally {
      this._sending = false;
      this._state(this.connected ? "connected" : "disconnected");
    }
  }
}
