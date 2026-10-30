import mac from "../device/examples/01_mac.py?raw";
import snake from "../device/examples/02_snake.py?raw";
import slideshow from "../device/examples/03_slideshow.py?raw";
import weather from "../device/examples/04_weather.py?raw";
import inputs from "../device/examples/05_inputs.py?raw";
import usbSetup from "./usb-setup.html?raw";

export const samples = Object.freeze({
  mac: { name: "01_mac.py", source: mac },
  snake: { name: "02_snake.py", source: snake },
  slideshow: { name: "03_slideshow.py", source: slideshow },
  weather: { name: "04_weather.py", source: weather },
  inputs: { name: "05_inputs.py", source: inputs },
});

export const lessons = [
  {
    id: "welcome", title: "Meet your CrowPanel", navTitle: "Meet the hardware", minutes: 10, sample: "mac",
    summary: "Your board. Your browser. Two hours to build something.",
    content: `<p class="lesson-note">USB first. Wi-Fi only for weather.</p>`,
  },
  {
    id: "setup", title: "Prepare your computer", navTitle: "Host setup", minutes: 10, sample: "mac", layout: "guide",
    summary: "Connect your board without changing it.",
    content: usbSetup,
  },
  {
    id: "verify", title: "Check your board", navTitle: "Board check", minutes: 20, sample: "inputs", layout: "guide",
    summary: "One setup. Five controls. A little celebration.",
    content: `
      <ol class="task-steps">
        <li><strong>Factory check:</strong> use the demo controls to change the display. Blank or unresponsive? Stop and ask for help; do not erase.</li>
        <li><strong>Install MicroPython below:</strong> confirm flashing to prepare your new board. It erases firmware and files. Already on MicroPython? Skip flashing.</li>
        <li><strong>Start the check:</strong> install the workshop files, then press and release all five controls.</li>
      </ol>
      <details><summary>Board revision &amp; troubleshooting</summary>
        <p>These examples target the ESP32-S3R8 with a JD79661 panel. Use the official ESP32_GENERIC_S3 OCTSPIRAM firmware. Stop if your variant differs; USB IDs do not identify the display controller.</p>
        <p>The check replaces crowpanel.py, weather.py, slides.py, weather_ca.pem and 00_board_check.py. No main.py is created. Reconnect and retry after a partial installation.</p>
        <p>A BUSY error, missing control or blank screen is not success. The red LED alone is not a power test. For input-only troubleshooting, ask a facilitator to use device/examples/05_inputs.py; it needs no working display.</p>
      </details>`,
  },
  {
    id: "snake", title: "Make Snake respond", navTitle: "First program · Snake", minutes: 30, sample: "snake", layout: "code",
    summary: "Press starts automatic Snake. You wire up the controls.",
    content: `
      <div class="snake-preview" role="img" aria-label="Automatic Snake: square 8 by 8 board left, food near center, score, ready status and controls right. Press starts or replays after game over; Up counterclockwise -1 (12→9→6→3), Down clockwise +1 (12→3→6→9); Menu resets to ready, Back exits.">
        <svg viewBox="0 0 250 122" aria-hidden="true">
          <rect x="4" y="20" width="82" height="82" fill="white" stroke="currentColor"/>
          <path d="M15 21v80M25 21v80M35 21v80M45 21v80M55 21v80M65 21v80M75 21v80M5 31h80M5 41h80M5 51h80M5 61h80M5 71h80M5 81h80M5 91h80" fill="none" stroke="currentColor" stroke-opacity=".15" stroke-width=".5"/>
          <g fill="currentColor"><rect x="26" y="62" width="8" height="8"/><rect x="36" y="62" width="8" height="8"/><rect x="46" y="62" width="8" height="8"/></g>
          <circle cx="51" cy="65" r="1" fill="white"/><rect x="58" y="64" width="3" height="3" fill="currentColor"/>
          <g fill="currentColor" font-size="11">
            <text x="124" y="16">Score: 0</text><text x="124" y="30">READY</text>
            <text x="124" y="50">Press: start/replay</text><text x="124" y="63">Up: -1 counter</text>
            <text x="124" y="76">Down: +1 clockwise</text><text x="124" y="89">Menu: ready</text><text x="124" y="102">Back: exit</text>
          </g>
        </svg>
        <span>Press → start → steer ↻ / ↺</span>
      </div>
      <ul class="control-map">
        <li>↑ Up <span>↺ Counterclockwise · 12→9</span></li><li>↓ Down <span>↻ Clockwise · 12→3</span></li>
        <li>● Press <span>Start / replay</span></li><li>☰ Menu <span>Reset to ready</span></li>
        <li>↩ Back <span>Exit</span></li>
      </ul>
      <p>Find <code>handle_input</code>. Fill the <code>TODO</code> sections, then <strong>Run in RAM</strong>. The comments show what to call. For Press, if <code>game.over</code>, call <code>game.restart()</code>; then return <code>(game.start(), False)</code> to start or replay.</p>
      <div class="expected-result">Snake moves automatically. Steer, eat food, grow.</div>
      <p class="lesson-note">Game over? <strong>Press</strong> replays, or use <strong>Menu → Press</strong>. Stopped around 20 seconds? Check for a wall or body collision, not a 20-second cutoff. After the five-minute session ends, click <strong>Run in RAM</strong> again.</p>
      <p class="lesson-note">Reinstall workshop libraries via <a href="#verify">Board check</a> → Advanced install. No firmware reflash.</p>
      <details><summary>Layout, timing &amp; input during refresh</summary><p>A square 8×8 grid with 10px cells (80px inside, ~82px with border) sits left on the 250×122 screen; score, status and instructions sit right. Food is chosen center-first, with the initial food one cell ahead when that cell is adjacent to center. Up turns counterclockwise -1 (12→9→6→3); Down clockwise +1 (12→3→6→9). Press starts or replays after game over, not a single step.</p><p>Default <code>STEP_MS = 5000</code> is 5 seconds of stable viewing time after each completed refresh; physical full refresh can be slower and takes additional time. One step per completed frame (one cell), no catch-up bursts. Allow one 90-degree steering turn per movement frame; extra turns queue for following frames. No smooth, fast or partial refresh is promised; preserve the driver's minimum refresh interval.</p><p>The latest workshop libraries support optional <code>show(on_wait=...)</code> to collect debounced controls during blocking waits. The callback must not issue another display call or modify the canvas; the refresh waveform stays unchanged.</p></details>
      <p class="lesson-note">Stuck? <strong>Show full solution</strong> above the editor. Loading it asks before replacing your work.</p>`,
  },
  {
    id: "mac", title: "Get your Wi-Fi pass", navTitle: "Station MAC", minutes: 5, sample: "mac", layout: "code",
    summary: "Run → copy the station MAC → give it to IT.",
    content: `
      <div class="lesson-flow" aria-label="Network registration steps"><span>▶ Run</span><span>→</span><span>Copy MAC</span><span>→</span><span>Give to IT</span></div>
      <p>IT registers this board for <strong>Guest-AccessNG</strong>. No password is needed for the workshop’s open network.</p>
      <p class="lesson-note">This reads the station MAC without joining Wi-Fi. Registration isn’t a connection test; the network must support 2.4 GHz open access, without 802.1X or a captive portal.</p>`,
  },
  {
    id: "slideshow", title: "Control a slideshow", navTitle: "Slideshow", minutes: 15, sample: "slideshow", layout: "code",
    summary: "Three images. Two buttons. Make it your own.",
    content: `
      <div class="lesson-flow"><span>↑ Previous</span><span>🖼️ Crow · Circuit · Summit</span><span>↓ Next</span></div>
      <p>Run, then try Up and Down. Change the starting image or add a caption.</p>
      <div class="expected-result">One press, one image. No refresh while idle.</div>
      <details><summary>How images work</summary><p>slides.py holds packed monochrome images. Re-run the Board check to install updated artwork. Create your own offline with tools/convert_images.py. Wait for each full refresh before the next press.</p></details>`,
  },
  {
    id: "weather", title: "Put the weather on your desk", navTitle: "Weather", minutes: 20, sample: "weather", layout: "code",
    summary: "Guest-AccessNG → Sabre Springs → your display.",
    content: `
      <div class="lesson-flow"><span>📶 Join Wi-Fi</span><span>→</span><span>☀️ Fetch</span><span>→</span><span>Display °F</span></div>
      <p>Give IT your <a href="#mac">station MAC</a> first. The code already uses <code>WIFI_SSID = "Guest-AccessNG"</code> and <code>WIFI_PASSWORD = ""</code> for the workshop’s open network.</p>
      <p>For another approved network, edit those two variables. Run once and compare the screen with the console.</p>
      <p class="lesson-note">Private credentials in code are visible in the editor and included in downloads. Remove them before sharing. Never print secrets, store them in browser storage, or disable TLS verification.</p>
      <details><summary>No weather?</summary><p>Check IT registration, 2.4 GHz support, SSID, DNS and clock synchronization. Captive portals and enterprise 802.1X are not supported; MAC registration does not add that support. Keep weather_ca.pem installed and HTTPS verification enabled.</p></details>`,
  },
  {
    id: "finish", title: "What will you build next?", navTitle: "Next projects & cleanup", minutes: 10, sample: "snake", layout: "guide",
    summary: "A small screen, a lot of possibilities.",
    content: `
      <ul class="project-ideas">
        <li><span aria-hidden="true">🔔</span><div><strong>Desktop notifications</strong><p>A local USB helper sends a quiet status update from your computer.</p></div></li>
        <li><span aria-hidden="true">📅</span><div><strong>Calendar viewer</strong><p>Show your next meeting from an approved calendar feed. Keep tokens private.</p></div></li>
        <li><span aria-hidden="true">🔋</span><div><strong>A cable-free desk display</strong><p>Try a USB battery pack with low-current support. For an internal battery, check the exact board manual, voltage, connector polarity and charging support first. Never connect a bare cell without verified protection.</p></div></li>
        <li><span aria-hidden="true">🚦</span><div><strong>Build-status display</strong><p>Passed, running or needs attention—at a glance.</p></div></li>
        <li><span aria-hidden="true">🌱</span><div><strong>Desk companion</strong><p>A focus timer, plant reminder or daily pixel-art postcard.</p></div></li>
      </ul>
      <p><a href="#snake">Open the editor</a> → <strong>Make something new with Codex</strong> → describe your idea.</p>
      <details open><summary>Before you unplug</summary><p>Download your work. Remove private Wi-Fi credentials from drafts, downloads and any device files (including wifi_config.py or main.py if used). Choose Stop, then Disconnect. Drafts disappear when this tab closes.</p></details>
      <details><summary>Want it to start on power-up?</summary><p>Save as main.py only when ready: it overwrites the boot program and runs on every reset. Keep USB access to interrupt with Ctrl-C. Deleting credentials is not a forensic secure erase; follow your organization’s device-handling policy.</p></details>
      <details><summary>Optional: put the factory demo back</summary>
        <p>Finished experimenting? You can reinstall Elecrow’s published factory demo without an original backup. <strong>This replaces MicroPython and erases workshop files and saved credentials.</strong> Download any work you want to keep first.</p>
        <ol>
          <li>Choose <strong>Stop</strong>, then <strong>Disconnect</strong> here so the serial port is free.</li>
          <li>Confirm your exact board revision. For the workshop’s V1.2 JD79661 board, download the four files in <a href="https://github.com/Elecrow-RD/CrowPanel-ESP32-2.13-E-paper-HMI-Display-with-122-250/tree/11291e3e9a868be8943232b065f3e264dfaeeae3/factory_firmware/Firmware-V1.2" target="_blank" rel="noreferrer">Elecrow’s factory firmware V1.2 folder (opens in a new tab)</a>. If your revision differs or is unclear, ask the organizer for the matching package.</li>
          <li>On Windows, follow <a href="https://github.com/Elecrow-RD/CrowPanel-ESP32-2.13-E-paper-HMI-Display-with-122-250/blob/11291e3e9a868be8943232b065f3e264dfaeeae3/factory_firmware/readme.md" target="_blank" rel="noreferrer">Elecrow’s Flash Download Tool instructions (opens in a new tab)</a>. Get IT approval if required. Select ESP32-S3 and your board’s COM port; use <a href="https://github.com/Elecrow-RD/CrowPanel-ESP32-2.13-E-paper-HMI-Display-with-122-250/blob/11291e3e9a868be8943232b065f3e264dfaeeae3/factory_firmware/Firmware-V1.2/Burning%20Options.png" target="_blank" rel="noreferrer">the V1.2 burning settings (opens in a new tab)</a> and these file offsets: <code>main.ino.bootloader.bin → 0x0</code>, <code>main.ino.partitions.bin → 0x8000</code>, <code>boot_app0.bin → 0xe000</code>, <code>main.ino.bin → 0x10000</code>. Check all four files, then choose <strong>ERASE</strong> to clear the workshop installation. Wait for it to finish before choosing <strong>START</strong> to write the factory files. For macOS or Linux, ask the organizer for help with the same vendor package.</li>
          <li>Wait for the tool’s <strong>FINISH</strong> message, then press <strong>RESET</strong>. Use the demo controls and check for a fresh display change. A successful write alone does not verify the display; ask for help if it stays blank.</li>
        </ol>
        <p>This restores the published demo, not your board’s unique original settings. Use the vendor tool for these four separate binaries; the workshop’s MicroPython installer expects a combined image.</p>
      </details>`,
  },
];

export const totalMinutes = lessons.reduce((total, lesson) => total + lesson.minutes, 0);
