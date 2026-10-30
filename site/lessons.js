import mac from "../device/examples/01_mac.py?raw";
import snake from "../device/examples/02_snake.py?raw";
import slideshow from "../device/examples/03_slideshow.py?raw";
import stocks from "../device/examples/04_stocks.py?raw";
import weather from "../device/examples/04_weather.py?raw";
import message from "../device/examples/04_desk_message.py?raw";
import project from "../device/examples/my_project.py?raw";
import inputs from "../device/examples/05_inputs.py?raw";
import usbSetup from "./usb-setup.html?raw";

export const samples = Object.freeze({
  mac: { name: "01_mac.py", source: mac },
  snake: { name: "02_snake.py", source: snake },
  slideshow: { name: "03_slideshow.py", source: slideshow },
  stocks: { name: "04_stocks.py", source: stocks },
  weather: { name: "04_weather.py", source: weather },
  message: { name: "04_desk_message.py", source: message },
  project: { name: "my_project.py", source: project },
  inputs: { name: "05_inputs.py", source: inputs },
});

export const lessons = [
  {
    id: "welcome", title: "Meet your CrowPanel", navTitle: "Meet the hardware", minutes: 10, sample: "mac",
    summary: "Your board. Your browser. Two hours to build something.",
    content: `<p class="lesson-note">USB first. Send a desk message over Bluetooth; no Wi-Fi needed.</p>`,
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
        <p>The check replaces crowpanel.py, weather.py, slides.py, weather_ca.pem, stocks.py, stocks_ca.pem, desk_message.py and 00_board_check.py. No main.py is created. Reconnect and retry after a partial installation.</p>
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
    summary: "Run → copy the station MAC → register your device.",
    content: `
      <div class="lesson-flow" aria-label="Network registration steps"><span>▶ Run</span><span>→</span><span>Copy MAC</span><span>→</span><span>Register device</span></div>
      <p>Run the code and copy the station MAC from the console. Open <a href="http://go/wifi-setup" target="_blank" rel="noreferrer">go/wifi-setup (opens in a new tab)</a> and add that MAC address to register your board for <strong>Guest-AccessNG</strong>. No password is needed for the workshop’s open network.</p>
      <p class="lesson-note">Wi-Fi registration is not needed for the Bluetooth message project.</p>
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
    id: "message", title: "Send a message to your desk", navTitle: "Bluetooth message", minutes: 20, sample: "message", layout: "code",
    summary: "Type in your browser. Read it on your desk.",
    content: `
      <p>No Wi-Fi and no internet connection are needed for this project. Keep the board connected by USB for power and to run its receiver.</p>
      <ol class="task-steps">
        <li>Choose <strong>Run in RAM</strong> to start the receiver. It shows a name such as <strong>Desk-ABC123</strong> on the board. Wait for that screen, then choose <strong>Choose Bluetooth board…</strong> in the message controls.</li>
        <li>Select the <strong>same name shown on your physical display</strong>. Each nearby workshop board has its own name; do not choose someone else’s board.</li>
        <li>Type a short message, choose <strong>Send message</strong>, and wait for the slow e-paper refresh. Check the actual screen: a browser acknowledgement does not prove the physical display updated.</li>
      </ol>
      <p>Make it yours: edit <code>START_MESSAGE</code> in the Python sample, or change the text you send below. Plain English letters, numbers, punctuation and line breaks work; emoji and other non-ASCII characters need a custom font. Messages fit up to four wrapped lines of 28 characters, with 112 characters total.</p>
      <p class="lesson-note">The receiver has a five-minute session. Use <strong>Run in RAM</strong> again after it ends. Press <strong>Back</strong> or choose <strong>Stop</strong> to end the receiver early. Disconnect Bluetooth only closes the browser’s link.</p>
      <p class="lesson-note">Nearby people can send text while the receiver is running. Don’t send private messages, credentials or corporate information.</p>
      <p class="lesson-note">Installed workshop files earlier? Use <a href="#verify">Board check</a> → Advanced install to add the message library; no firmware reflash.</p>
      <details><summary>Bluetooth unavailable?</summary><p>Use desktop Chrome or Edge with Bluetooth enabled, on HTTPS or localhost. Browser support and managed-computer policy can restrict Web Bluetooth. Ask IT or a facilitator if it is blocked; do not bypass managed settings.</p><p>You can still customize the screen over USB: set <code>USE_BLUETOOTH = False</code>, edit <code>START_MESSAGE</code>, then choose <strong>Run in RAM</strong>. This draws your message once without Bluetooth. It does not test the Bluetooth connection.</p></details>`,
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
      <p><a href="#project">Continue in Your project</a> to save your own Python files in this browser.</p>
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
  {
    id: "weather", title: "Put the weather on your desk", navTitle: "Weather", minutes: 20, archived: true, sample: "weather", layout: "code",
    summary: "Archived Wi-Fi project · Sabre Springs weather.",
    content: `
      <p class="lesson-note">Archived Wi-Fi project · outside the two-hour course. Corporate networks may restrict this connection.</p>
      <p>Register your device using its <a href="#mac">station MAC</a> first. The sample uses <code>WIFI_SSID = "Guest-AccessNG"</code> and <code>WIFI_PASSWORD = ""</code> for the workshop’s open network.</p>
      <p>For another approved network, edit those two variables. Run once and compare the screen with the console.</p>
      <p>This lesson’s <strong>Run in RAM</strong> sets the board’s clock from your computer over USB. Check that your computer’s date and time are correct. NTP is not required; HTTPS certificate verification stays enabled.</p>
      <p class="lesson-note">Private credentials in code are visible in the editor and included in downloads. Remove them before sharing. Never print secrets, store them in browser storage, or disable TLS verification.</p>
      <details><summary>No weather?</summary><p>Check IT registration, 2.4 GHz support, SSID, DNS and your computer’s clock. Clock synchronization uses USB here. After a power cycle, use Run in RAM in this lesson again to set the clock. Downloaded scripts and main.py need an accurate UTC RTC set separately. Captive portals and enterprise 802.1X are not supported; MAC registration does not add that support. Keep weather_ca.pem installed and HTTPS verification enabled.</p></details>`,
  },
  {
    id: "stocks", title: "Put ARM’s stock price on your desk", navTitle: "ARM stock price", minutes: 20, archived: true, sample: "stocks", layout: "code",
    summary: "Guest-AccessNG → NASDAQ:ARM → your display.",
    content: `
      <p class="lesson-note">Archived Wi-Fi project · outside the two-hour course.</p>
      <div class="lesson-flow"><span>📶 Join Wi-Fi</span><span>→</span><span>ARM quote</span><span>→</span><span>Display USD</span></div>
      <p>Register your device using its <a href="#mac">station MAC</a> first. The code already uses <code>WIFI_SSID = "Guest-AccessNG"</code> and <code>WIFI_PASSWORD = ""</code> for the workshop’s open network.</p>
      <p>For another approved network, edit those two variables. Run once and compare the screen with the console.</p>
      <p>The display shows ARM’s <strong>NASDAQ</strong> quote in USD from <a href="https://www.tradingview.com/symbols/NASDAQ-ARM/" target="_blank" rel="noreferrer">TradingView (opens in a new tab)</a>. Quotes are <strong>delayed by 15 minutes</strong>, not real-time. The timestamp marks the last available one-minute bar in UTC; it can be from an earlier session when the market is closed.</p>
      <p>This script fetches once and refreshes the display once; no automatic polling. It allows up to 30 seconds for the HTTPS request, including DNS, connection setup and TLS. Change a label or the layout, then use <strong>Run in RAM</strong> again when you want another quote.</p>
      <p>This lesson’s <strong>Run in RAM</strong> sets the board’s clock from your computer over USB. Check that your computer’s date and time are correct. NTP is not required on the guest network; HTTPS certificate verification stays enabled.</p>
      <p class="lesson-note">Already installed workshop files earlier? Use <a href="#verify">Board check</a> → Advanced install to install the latest stock libraries and certificate; no firmware reflash.</p>
      <p class="lesson-note">Private credentials in code are visible in the editor and included in downloads. Remove them before sharing. Never print secrets, store them in browser storage, or disable TLS verification.</p>
      <details><summary>No quote?</summary><p>Check IT registration, 2.4 GHz support, SSID, DNS and your computer’s clock. Clock synchronization uses USB here. After a power cycle, use Run in RAM in this lesson again to set the clock. Downloaded scripts and main.py need an accurate UTC RTC set separately; they cannot read your computer’s clock on their own. Captive portals and enterprise 802.1X are not supported; MAC registration does not add that support. Keep stocks_ca.pem installed and HTTPS verification enabled.</p><p>A TLS handshake/request write timeout means no verified response was received; a longer wait does not guarantee success. A certificate error must not be bypassed. If comparing networks, power-cycle the board before switching to your hotspot so an existing Wi-Fi association is not reused. TradingView’s public website endpoint needs no API key, but it may rate-limit or change. If a request fails, read the console and try again later; never substitute an invented price. The quote timestamp describes the data’s minute, not the time you clicked Run.</p></details>`,
  },
];

export const totalMinutes = lessons.filter(lesson => !lesson.archived).reduce((total, lesson) => total + lesson.minutes, 0);

// Independent workspace: outside the timed course and its Previous/Next sequence.
export const projectPage = {
  id: "project", title: "Your project", sample: "project", layout: "code",
  summary: "Keep building with the same editor and device controls.",
  content: `<p>Start with the sample or your own Python. Name your file, edit, then choose <strong>Save in browser</strong> to return to it later. You can keep several projects here.</p>
    <p>Projects stay in this browser profile on this site. They do not sync to other computers; clearing site data removes them, and private browsing may discard them. Download a .py copy for a lasting backup.</p>
    <p><strong>Do not save Wi-Fi passwords, credentials or private information here.</strong> Browser storage is plaintext and accessible to scripts on this site. Lesson drafts still stay in tab memory.</p>
    <p>Use <strong>Run in RAM</strong> to try your code. Saving in the browser does not write to the board or run anything. Use <a href="#verify">Board check</a> first if you need to install the workshop libraries.</p>
    <details><summary>Display tips</summary><p>Built-in text uses an 8×8 ASCII font on a 250×122 screen. A full refresh is slow. Draw once or only when content changes, and wait at least two seconds after each completed refresh before starting another. Keep interactive loops bounded and use Stop to interrupt them.</p></details>`,
};
