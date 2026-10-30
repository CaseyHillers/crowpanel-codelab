import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const moduleUrl = new URL("../site/lessons.js", import.meta.url);
const source = await readFile(moduleUrl, "utf8");
const rawImports = [...source.matchAll(/^import (\w+) from "([^"]+\?raw)";$/gm)];
let executable = source;
const importedSamples = new Map();
for (const [statement, identifier, specifier] of rawImports) {
  const sampleUrl = new URL(specifier.replace(/\?raw$/, ""), moduleUrl);
  const sampleSource = await readFile(sampleUrl, "utf8");
  importedSamples.set(identifier, { name: sampleUrl.pathname.split("/").at(-1), source: sampleSource });
  executable = executable.replace(statement, `const ${identifier} = ${JSON.stringify(sampleSource)};`);
}
const { lessons, samples, totalMinutes } = runInNewContext(
  `${executable.replace(/^export /gm, "")}\n({ lessons, samples, totalMinutes });`,
  Object.create(null),
  { timeout: 1000 },
);
const lessonById = Object.fromEntries(lessons.map((lesson) => [lesson.id, lesson]));
const primary = (lesson) => lesson.content.replace(/<details\b[^>]*>[\s\S]*?<\/details>/g, "");
const text = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

test("the course checks factory hardware before exercises and totals 120 minutes", () => {
  assert.deepEqual(Array.from(lessons, (lesson) => lesson.id), [
    "welcome", "setup", "verify", "snake", "mac", "slideshow", "message", "finish", "weather", "stocks",
  ]);
  assert.equal(totalMinutes, 120);
  assert.equal(lessons.filter(lesson => !lesson.archived).reduce((total, lesson) => total + lesson.minutes, 0), 120);
  for (const lesson of lessons) assert.ok(Number.isInteger(lesson.minutes) && lesson.minutes > 0);
});

test("Bluetooth messaging replaces the online project and archives remain outside the timed course", async () => {
  assert.deepEqual(Array.from(lessons.filter(lesson => !lesson.archived), lesson => lesson.id), [
    "welcome", "setup", "verify", "snake", "mac", "slideshow", "message", "finish",
  ]);
  assert.deepEqual(Array.from(lessons.filter(lesson => lesson.archived), lesson => lesson.id), ["weather", "stocks"]);
  assert.equal(lessonById.message.minutes, 20);
  assert.equal(samples.message.name, "04_desk_message.py");
  const content = text(lessonById.message.content);
  assert.match(content, /Run in RAM.*Desk-.*Choose Bluetooth board/i);
  assert.match(content, /same name.*physical display/i);
  assert.match(content, /no Wi-Fi.*no internet/i);
  assert.match(content, /five.minute.*Run in RAM.*again/i);
  assert.match(content, /nearby.*private/i);
  assert.match(content, /Stop.*end/i);
  assert.match(content, /does not prove.*physical display/i);
  assert.doesNotMatch(samples.message.source, /import network|sync_time\(\)|fetch_weather\(\)|fetch_quote\(\)/);
  assert.match(text(lessonById.mac.content), /not needed.*Bluetooth/i);
  const html = await readFile(new URL("../site/index.html", import.meta.url), "utf8");
  for (const id of ["desk-message-tools", "desk-message-text", "desk-message-help", "desk-message-connect", "desk-message-send", "desk-message-disconnect", "desk-message-status", "desk-message-error"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /<label for="desk-message-text">/);
  assert.match(html, /id="desk-message-text"[^>]*maxlength="112"/);
  assert.match(html, /id="desk-message-status"[^>]*role="status"/);
  assert.match(html, /id="desk-message-error"[^>]*role="alert"/);
});

test("every lesson resolves to a nonempty sample from an existing Python file", () => {
  for (const lesson of lessons) {
    const sample = samples[lesson.sample];
    const imported = importedSamples.get(lesson.sample);
    assert.ok(sample && imported, `${lesson.id}: missing sample`);
    assert.match(sample.name, /\.py$/);
    assert.equal(sample.name, imported.name);
    assert.ok(sample.source.trim(), `${lesson.id}: empty sample`);
    assert.equal(sample.source, imported.source);
  }
});

test("host preparation and verification stay separate from the code workspace", () => {
  assert.equal(lessonById.welcome.layout, undefined);
  for (const lessonId of ["setup", "verify", "finish"]) assert.equal(lessonById[lessonId].layout, "guide");
  for (const lessonId of ["snake", "mac", "slideshow", "message", "weather", "stocks"]) {
    assert.equal(lessonById[lessonId].layout, "code");
    assert.equal(lessonById[lessonId].sample, lessonId);
  }
});

test("destructive actions follow factory checks, with security warnings visible", () => {
  const steps = Array.from(primary(lessonById.verify).matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g),
    (match) => text(match[1]));
  const factory = steps.findIndex((step) => /factory/i.test(step) && /display/i.test(step) && /controls/i.test(step));
  const flash = steps.findIndex((step) => /consent|confirm/i.test(step) && /flash/i.test(step));
  const install = steps.findIndex((step) => /\binstall\b/i.test(step) && /workshop files|workshop libraries/i.test(step));
  assert.ok(factory >= 0 && flash > factory && install > flash,
    "factory checks must precede flash consent and file installation");
  assert.match(steps[factory], /(?:blank|unresponsive)[^.]*\b(?:stop|do not|don't)\b/i);
  assert.match(steps[flash], /eras\w*[^.]*firmware[^.]*files/i);
  assert.ok(steps.some((step) => /MicroPython/i.test(step) && /skip/i.test(step) && /flash/i.test(step)),
    "existing MicroPython installations must have a non-flashing path");
  assert.match(text(primary(lessonById.setup)), /(?:do not|don't|never)[^.]*eras\w*/i);

  const verification = text(lessonById.verify.content);
  assert.match(verification, /USB IDs do not identify the display controller/i);
  assert.match(verification, /no main\.py is created/i);
  assert.match(verification, /BUSY error[^.]*blank screen is not success/i);
  assert.match(verification, /05_inputs\.py; it needs no working display/i);
});

test("Snake is the first coding task with a TODO scaffold and a distinct full solution", async () => {
  assert.equal(lessons.find((lesson) => lesson.layout === "code").id, "snake");
  assert.equal(lessonById.snake.minutes, 30);
  assert.equal(lessonById.verify.navTitle, "Board check");
  assert.equal(lessonById.inputs, undefined);
  assert.equal(lessonById.hello, undefined);
  assert.equal(samples.inputs.name, "05_inputs.py");

  const instructions = text(primary(lessonById.snake));
  assert.match(instructions, /handle_input.*TODO.*Run in RAM/i);
  assert.match(instructions, /For Press.*game\.over.*game\.restart\(\).*return.*\(game\.start\(\), False\).*start or replay/i);
  const controls = Array.from(lessonById.snake.content.match(/<ul class="control-map">([\s\S]*?)<\/ul>/)[1]
    .matchAll(/<li>([\s\S]*?)<\/li>/g), (match) => text(match[1]));
  for (const [index, control] of [/Up.*↺.*Counterclockwise.*12→9/, /Down.*↻.*Clockwise.*12→3/, /Press.*Start/, /Menu.*ready/i, /Back.*Exit/].entries()) {
    assert.match(controls[index], control);
  }
  assert.match(instructions, /moves automatically/i);
  assert.doesNotMatch(instructions, /turn-based|press.*Move one cell|moves only when you press/i);
  assert.match(instructions, /Show full solution.*asks before replacing your work/i);
  assert.match(samples.snake.source, /def handle_input\(game, name\):[\s\S]*TODO/);
  const solution = await readFile(new URL("../device/examples/02_snake_solution.py", import.meta.url), "utf8");
  assert.ok(solution.trim());
  assert.notEqual(solution, samples.snake.source);
  assert.match(solution, /def handle_input\(game, name\):/);
  assert.doesNotMatch(solution, /TODO/);
});

test("Snake explains frame-paced movement and a square board beside the score", () => {
  const content = lessonById.snake.content;
  const visible = text(primary(lessonById.snake));
  const instructions = text(content.match(/<details\b[^>]*>([\s\S]*?)<\/details>/)[1]);
  assert.match(visible, /reinstall.*workshop libraries/i);
  assert.match(visible, /Board check.*Advanced install/i);
  assert.match(visible, /no firmware reflash/i);
  assert.doesNotMatch(visible, /STEP_MS|catch-up|partial refresh|on_wait/);
  assert.match(instructions, /8×8.*10px.*80px.*82px.*left.*250×122.*score.*status.*instructions.*right/i);
  assert.match(instructions, /food.*center-first.*initial food one cell ahead.*adjacent to center/i);
  assert.match(content, /<svg viewBox="0 0 250 122"/);
  assert.match(content, /<rect x="4" y="20" width="82" height="82"/);
  assert.match(content, /<text x="124"[^>]*>Score:/);
  assert.match(instructions, /Up turns counterclockwise -1.*12→9→6→3/);
  assert.match(instructions, /Down clockwise \+1.*12→3→6→9/);
  assert.match(content, /aria-label="[^"]*Up counterclockwise -1 \(12→9→6→3\), Down clockwise \+1 \(12→3→6→9\)/);
  assert.match(content, /<text x="124"[^>]*>Up: -1 counter<\/text>/);
  assert.match(content, /<text x="124"[^>]*>Down: \+1 clockwise<\/text>/);
  assert.match(instructions, /Press starts.*not a single step/i);
  assert.match(instructions, /STEP_MS\s*=\s*5000.*5 seconds of stable viewing time/i);
  assert.match(instructions, /viewing time after each completed refresh.*additional time/i);
  assert.match(instructions, /full refresh.*slower/i);
  assert.match(instructions, /one step per completed frame.*no catch-up bursts/i);
  assert.match(instructions, /one step per completed frame \(one cell\)/i);
  assert.match(instructions, /one 90-degree steering turn per movement frame; extra turns queue for following frames/i);
  assert.match(instructions, /No smooth, fast or partial refresh/i);
  assert.match(instructions, /latest workshop libraries/i);
  assert.match(instructions, /show\(on_wait=\.\.\.\).*debounced controls.*blocking waits/i);
  assert.match(instructions, /must not.*display.*modify.*canvas/i);
  assert.match(instructions, /waveform.*unchanged/i);
  assert.match(visible, /Game over\?.*Press.*replays.*Menu → Press/i);
  assert.match(visible, /20 seconds.*wall or body collision.*not a 20-second cutoff/i);
  assert.match(visible, /five-minute session ends.*Run in RAM.*again/i);
  assert.doesNotMatch(content, /10×10|112px|2-minute session/);
});

test("noscript Snake preserves the automatic controls without JavaScript", async () => {
  const html = await readFile(new URL("../site/index.html", import.meta.url), "utf8");
  const fallback = text(html.match(/<noscript\b[^>]*>([\s\S]*?)<\/noscript>/)[1]);
  assert.match(fallback, /Snake · 30 minutes/);
  assert.match(fallback, /Press starts.*automatically/i);
  assert.match(fallback, /Up ↺ counterclockwise -1.*12→9→6→3.*Down ↻ clockwise \+1.*12→3→6→9/);
  assert.match(fallback, /Menu resets to ready.*Back exits/);
  assert.match(fallback, /Press starts or replays after game over/i);
  assert.match(fallback, /Menu → Press.*plays again/i);
  assert.match(fallback, /wall or body collision.*no 20-second cutoff/i);
  assert.match(fallback, /five-minute session ends.*Run in RAM again/i);
  assert.match(fallback, /8×8.*10px.*80px.*82px/);
  assert.match(fallback, /food.*center-first.*one cell ahead.*adjacent to center/i);
  assert.match(fallback, /STEP_MS=5000.*5 seconds of stable viewing time after each completed refresh.*additional time/i);
  assert.match(fallback, /one step per completed frame \(one cell\), no catch-up bursts/i);
  assert.match(fallback, /one 90-degree steering turn per movement frame; extra turns queue for following frames/i);
  assert.doesNotMatch(fallback, /Press moves one cell|turn-based/i);
});

test("inline open Wi-Fi defaults disclose private code exposure without weakening security", () => {
  const stocks = text(primary(lessonById.stocks));
  assert.match(stocks, /WIFI_SSID\s*=\s*"Guest-AccessNG"/);
  assert.match(stocks, /WIFI_PASSWORD\s*=\s*"".*open network/i);
  assert.match(stocks, /another approved network.*edit those two variables/i);
  assert.match(stocks, /Private credentials in code are visible in the editor and included in downloads/i);
  assert.match(stocks, /Remove them before sharing/i);
  assert.match(stocks, /Never print secrets, store them in browser storage, or disable TLS verification/i);
  assert.match(stocks, /(?:never|do not|don't)[^.]*\b(?:disable|bypass)\b[^.]*TLS/i);
  assert.doesNotMatch(stocks, /(?:only|must)[^.]*Wi-Fi form|write[^.]*wifi_config\.py/i);
  assert.match(samples.stocks.source, /^WIFI_SSID\s*=\s*"Guest-AccessNG"$/m);
  assert.match(samples.stocks.source, /^WIFI_PASSWORD\s*=\s*""$/m);
  assert.doesNotMatch(samples.stocks.source, /from wifi_config import/);
  assert.match(samples.stocks.source, /connect\(WIFI_SSID, WIFI_PASSWORD, timeout=15\)[\s\S]*fetch_quote\(\)/);

  assert.equal(lessonById.weather.archived, true);
  assert.equal(lessonById.stocks.archived, true);
  assert.equal(lessonById.stocks.minutes, 20);
  assert.equal(samples.stocks.name, "04_stocks.py");
  assert.match(stocks, /ARM.*NASDAQ/i);
  assert.match(stocks, /TradingView/);
  assert.match(stocks, /15 minutes.*delayed|delayed.*15 minutes/i);
  assert.match(stocks, /minute.*UTC/i);
  assert.match(stocks, /not.*real.time/i);
  assert.match(stocks, /fetches once.*no.*polling/i);
  assert.match(stocks, /NTP is not required/i);
  assert.match(stocks, /Board check.*Advanced install.*no firmware reflash/i);

  const troubleshooting = text(lessonById.stocks.content);
  assert.match(troubleshooting, /2\.4 GHz/);
  assert.match(troubleshooting, /clock synchronization/i);
  assert.match(troubleshooting, /Captive portals and enterprise 802\.1X are not supported; MAC registration does not add that support/i);
  assert.match(troubleshooting, /stocks_ca\.pem.*HTTPS verification enabled/i);
  assert.match(text(lessonById.mac.content), /without joining Wi-Fi.*Registration isn’t a connection test/i);
});

test("Finish keeps credential cleanup, explicit autostart and safe battery project guidance", () => {
  const finish = text(lessonById.finish.content);
  assert.match(finish, /Desktop notifications/);
  assert.match(finish, /Calendar viewer.*Keep tokens private/i);
  assert.match(finish, /Build-status display/);
  assert.match(finish, /USB battery pack with low-current support/i);
  for (const check of [/exact board manual/i, /voltage/i, /connector polarity/i, /charging support/i]) {
    assert.match(finish, check);
  }
  assert.match(finish, /Never connect a bare cell without verified protection/i);
  assert.match(finish, /Remove private Wi-Fi credentials from drafts, downloads and any device files/i);
  assert.match(finish, /Stop, then Disconnect/i);
  assert.match(finish, /Drafts disappear when this tab closes/i);
  assert.match(finish, /Save as main\.py only when ready.*overwrites the boot program.*every reset/i);
  assert.match(finish, /Keep USB access to interrupt with Ctrl-C/i);
  assert.match(finish, /not a forensic secure erase/i);
});
