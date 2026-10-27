import mac from "../device/examples/01_mac.py?raw";
import hello from "../device/examples/02_hello.py?raw";
import slideshow from "../device/examples/03_slideshow.py?raw";
import weather from "../device/examples/04_weather.py?raw";

export const samples = Object.freeze({
  mac: { name: "01_mac.py", source: mac },
  hello: { name: "02_hello.py", source: hello },
  slideshow: { name: "03_slideshow.py", source: slideshow },
  weather: { name: "04_weather.py", source: weather },
});

export const lessons = [
  {
    id: "welcome", title: "Welcome to the lab", navTitle: "Welcome", minutes: 10, sample: "mac",
    summary: "Four small programs. One e-paper display. Everything runs from this browser.",
    content: `
      <h2>What you’ll build</h2>
      <p>Start with your board’s Wi-Fi identity, write a message to its e-paper display, turn a few images into a button-controlled slideshow, then fetch the weather. You’ll edit real Python and run it on an ESP32-S3, not in a simulator.</p>
      <p>This is a two-hour guided lab. Read a step, change the sample in the editor, run it over USB and look at your board. No Rust toolchain, terminal setup, cloud account or application server is needed.</p>
      <h2>Before you begin</h2>
      <ul>
        <li>A <strong>CrowPanel 2.13-inch ESP32-S3 e-paper board</strong>, a USB data cable and a computer. A charge-only cable will power the display but won’t give you a serial port.</li>
        <li>A desktop browser with Web Serial support, such as Chrome or Edge, on an HTTPS site or localhost. Other browsers can still read the course and edit or download samples.</li>
        <li>Permission to erase the board’s existing firmware. Back up anything you need; flashing is destructive.</li>
        <li>For the last exercise only: an approved 2.4 GHz WPA2-Personal or open Wi-Fi network with internet access. The first three exercises work without Wi-Fi.</li>
      </ul>
      <div class="lesson-callout"><p><strong>Hardware check, not a promise.</strong> The target schematic identifies ESP32-S3R8 with 8 MB flash. Display-controller revisions, USB enumeration and the full course still need validation on your physical board. A serial connection does not prove that the panel works.</p></div>
      <h2>How this workspace behaves</h2>
      <p><strong>Run in RAM</strong> executes the editor without saving a boot program. <strong>Stop</strong> sends Ctrl-C. <strong>Download .py</strong> saves your work to this computer. Saving as <code>main.py</code> is a separate, confirmed action because it makes the program start at every reset.</p>
      <p>Your drafts and completion checks last only in this tab. Switching lessons preserves each draft; refreshing or closing the page loses it. No drafts or Wi-Fi credentials go to browser storage. Download work you want to keep.</p>
      <h2>Your first checkpoint</h2>
      <p>Find your USB data cable, identify the board and read the setup step before connecting. Mark this step complete when you’re ready. Nothing is marked complete automatically.</p>`,
  },
  {
    id: "setup", title: "Set up your board", navTitle: "Board setup", minutes: 15, sample: "mac",
    summary: "Install MicroPython once, then add three libraries and the weather trust certificate.",
    content: `
      <h2>1. Prepare the USB connection</h2>
      <ol>
        <li>Connect the board with a data cable. Close Arduino, Thonny, terminal monitors and other browser tabs that might hold the serial port.</li>
        <li>Check your OS for a new serial device. If no port appears, try a known data cable and another USB port before installing a driver. A USB vendor/product ID alone does not identify the exact bridge chip.</li>
        <li>Use the official MicroPython <strong>ESP32_GENERIC_S3 OCTSPIRAM</strong> build for the schematic’s S3R8. If your board differs, stop and verify its memory variant. Do not use a plain ESP32 or C3 binary.</li>
      </ol>
      <h2>2. Flash the runtime</h2>
      <p>The installer below uses its own serial connection. Disconnect the Python workspace first. Its confirmation names the erase operation; do not continue if you need the factory firmware or files.</p>
      <p>If the installer cannot enter the ROM bootloader automatically, follow your board’s documented BOOT/reset sequence, then retry. A cancelled port picker or a download failure is not a successful flash. If your network blocks the firmware request, choose the official full <code>.bin</code> file locally.</p>
      <h2>3. Reconnect and install libraries</h2>
      <p>After a successful flash, reset or reconnect the board if needed, choose <strong>Connect device</strong>, then install the files below. The installer writes <code>crowpanel.py</code>, <code>weather.py</code>, <code>slides.py</code> and <code>weather_ca.pem</code>; you’ll run the example scripts from the editor in later steps.</p>
      <div class="lesson-callout"><p><strong>Already running the course’s MicroPython image?</strong> Skip the erase step, connect and install the libraries. Connecting alone does not check the firmware version. Running a script takes control of the MicroPython REPL and may interrupt a boot program.</p></div>
      <h2>Checkpoint</h2>
      <p>Only mark this step complete once the actual flash (if needed) and library writes have succeeded. If you’re reading without hardware, leave the checkbox clear and continue exploring.</p>`,
  },
  {
    id: "mac", title: "Read the station MAC", navTitle: "1. Station MAC", minutes: 10, sample: "mac",
    summary: "Make the smallest useful request to your board, without joining a network.",
    content: `
      <h2>1. Run the sample</h2>
      <p>Connect the device and read <code>01_mac.py</code> in the editor. It asks MicroPython for the station interface’s MAC address: the hardware identity used when the board joins Wi-Fi. Choose <strong>Run in RAM</strong> and read the serial console.</p>
      <p>The result should be six hexadecimal byte pairs. The exact value belongs to your board; the course does not invent an example address or claim to read one before you connect.</p>
      <h2>2. Make one change</h2>
      <ol>
        <li>Add a print label so you can distinguish your output from a previous run.</li>
        <li>Run again. Compare the address, not just the label.</li>
        <li>Disconnect, reset the board and reconnect. Run once more: the same station interface should report the same hardware address.</li>
      </ol>
      <h2>What to notice</h2>
      <p>The board does not need an SSID, a password or internet access to report its MAC. The station address is not the access-point interface’s address. If your network team asks for a MAC, give them the one from the interface you’ll actually use.</p>
      <div class="lesson-callout"><p><strong>Registration is not authentication.</strong> Registering a MAC does not make an ESP32 compatible with an enterprise 802.1X network. Use an approved workshop network; don’t try to bypass network policy.</p></div>
      <h2>If there is no output</h2>
      <p>Check that the connection says Connected, close other serial clients and press Stop before retrying. If the REPL cannot be reached, disconnect and reconnect. Wrong firmware or an unresponsive USB bridge needs setup troubleshooting, not invented MAC output.</p>
      <h2>Checkpoint</h2>
      <p>You can explain which interface the address belongs to and reproduce it after a reset. Download your edited script, then mark this step complete.</p>`,
  },
  {
    id: "hello", title: "Hello, e-paper", navTitle: "2. Hello, e-paper", minutes: 20, sample: "hello",
    summary: "Draw into a framebuffer, then make one deliberate display refresh.",
    content: `
      <h2>1. Put a message on the panel</h2>
      <p>Read <code>02_hello.py</code>, then run it. The example constructs a <code>CrowPanel</code>, clears its framebuffer, draws text and calls <code>show()</code>. Wait for the physical e-paper refresh to finish before running again.</p>
      <p>The landscape drawing area is <strong>250 × 122 pixels</strong>, with <code>(0, 0)</code> at the top left. X increases rightward and Y downward. The browser preview is only an illustration; it does not show what your board rendered.</p>
      <h2>2. Make it yours</h2>
      <ol>
        <li>Change the greeting to a short name or message. Keep it short enough for the built-in font and the display width.</li>
        <li>Move the text by changing its X and Y coordinates. Leave room for the full glyph height before Y = 122.</li>
        <li>Add an outlined rectangle with <code>panel.rect(x, y, width, height, BLACK)</code>. Draw it before <code>panel.show()</code>.</li>
        <li>Run once more. Confirm the text and rectangle moved on the actual panel, not just in the editor.</li>
      </ol>
      <h2>The display contract</h2>
      <p>The course library exposes <code>fill</code>, <code>text</code>, <code>rect</code>, <code>image</code> and <code>show</code>. Its framebuffer uses <code>WHITE = 1</code> and <code>BLACK = 0</code>. Drawing changes RAM; <code>show()</code> transfers it to the display. Don’t put full refreshes in a tight loop.</p>
      <table class="pin-table"><caption>Board wiring used by this course</caption><thead><tr><th scope="col">Signal</th><th scope="col">GPIO</th></tr></thead><tbody><tr><td>SPI clock / MOSI</td><td>12 / 11</td></tr><tr><td>Chip select / data-command</td><td>14 / 13</td></tr><tr><td>Reset / busy</td><td>10 / 9</td></tr><tr><td>Panel power</td><td>7</td></tr></tbody></table>
      <h2>If the screen stays unchanged</h2>
      <p>An e-paper panel can retain an old picture without running code. Check the console for an exception, confirm the libraries were installed, then check the board revision and busy/power wiring against its vendor documentation. A controller mismatch is not fixed by rapidly retrying refreshes. Stop if the hardware does not match.</p>
      <h2>Checkpoint</h2>
      <p>You have changed both text and geometry on the physical panel and can explain why <code>show()</code> is separate from drawing. Mark complete after you observe that result.</p>`,
  },
  {
    id: "slideshow", title: "Build a slideshow", navTitle: "3. Slideshow", minutes: 25, sample: "slideshow",
    summary: "Give a tiny display a useful interface: slides, buttons and a way back.",
    content: `
      <h2>1. Read the event loop</h2>
      <p>Open <code>03_slideshow.py</code> in the editor. Follow how the program chooses a slide, draws it with <code>image()</code> and refreshes only when something changes. The built-in images come from the installed <code>slides.py</code> file, not a browser service.</p>
      <p>Run the example. It is an interactive program and may keep running until you choose <strong>Stop</strong>. A running console is not a hung web page; Stop sends Ctrl-C to the board.</p>
      <h2>2. Try the physical controls</h2>
      <table class="pin-table"><caption>Button inputs (active low)</caption><thead><tr><th scope="col">Button</th><th scope="col">GPIO</th></tr></thead><tbody><tr><td>Up</td><td>6</td></tr><tr><td>Down</td><td>4</td></tr><tr><td>Press</td><td>5</td></tr><tr><td>Menu</td><td>2</td></tr><tr><td>Back</td><td>1</td></tr></tbody></table>
      <p><code>panel.up</code> and <code>panel.down</code> are Pin objects: <code>.value() == 0</code> means pressed, not released. This sample uses up/down only. The other three inputs are available for your own extensions; they do not have built-in slideshow actions. Keep the sample’s debounce and edge handling when you edit the loop.</p>
      <ol>
        <li>Move forward through every slide, then try moving past the last one. Confirm wrapping to the first.</li>
        <li>Move backward from the first. Confirm wrapping to the last.</li>
        <li>Hold a button briefly. Compare one deliberate press with repeated taps and trace the edge handling in the sample.</li>
      </ol>
      <h2>3. Change a slide’s caption</h2>
      <p>Stop the program before editing. Add a short text caption after the sample’s image draw and before its refresh, using the same drawing API as the hello exercise. Keep it inside the 250 × 122 drawing area and avoid covering the useful part of the image. Run and test both directions again.</p>
      <h2>Why button handling matters</h2>
      <p>A button can report many pressed samples during one human press. Without edge detection or debounce, one tap can skip multiple slides. E-paper updates are slow: keep the loop responsive without sending a display refresh on every iteration.</p>
      <h2>Checkpoint</h2>
      <p>Your caption is readable, first/last navigation wraps in both directions and you can stop the loop from the browser. Download the edited script before continuing.</p>`,
  },
  {
    id: "weather", title: "Fetch the weather", navTitle: "4. Weather", minutes: 30, sample: "weather",
    summary: "Connect the board to Wi-Fi and turn a real HTTPS response into a display.",
    content: `
      <h2>1. Keep credentials out of your code</h2>
      <p>The example <code>04_weather.py</code> reads <code>SSID</code> and <code>PASSWORD</code> from <code>wifi_config.py</code> on the device. Use the form below instead of pasting credentials into the editor, console or a shared script. Writing the file does not itself join the network.</p>
      <p>The browser sends this file directly over USB. It is plaintext on the board: anyone with access to its filesystem may read it. The form is not a secrets vault. Use workshop credentials, clear the fields when done and remove the file before handing the board to someone else.</p>
      <h2>2. Follow the request</h2>
      <ol>
        <li>Make sure all three libraries and <code>weather_ca.pem</code> are installed, then write the Wi-Fi config with the form below.</li>
        <li>Read the sample’s network setup, clock synchronization and weather call before you run it. The weather sample uses Open-Meteo for Sabre Springs.</li>
        <li>Run it and watch the console. Network association, time sync and HTTPS retrieval are separate operations; use the actual error to identify which one failed.</li>
        <li>Wait for the response and the panel refresh. Compare the location and units shown by the sample; do not mistake the browser’s illustration for fetched weather.</li>
      </ol>
      <h2>3. Make one useful change</h2>
      <p>Stop first if the sample is still running. Change a heading or the placement of one weather value, keeping its units visible. If the sample exposes coordinates, try another location with valid latitude and longitude. Fetch deliberately, not in a rapid polling loop.</p>
      <div class="lesson-callout"><p><strong>Keep HTTPS verification enabled.</strong> A synchronized clock and the trust material required by <code>weather.py</code> are part of setup, not optional error suppression. Follow that module’s certificate instructions. Do not use an unverified TLS connection or switch to HTTP to make the demo appear to work.</p></div>
      <h2>Troubleshoot one layer at a time</h2>
      <ul>
        <li><strong>Cannot join Wi-Fi:</strong> check 2.4 GHz, credentials and network policy. A corporate captive portal or 802.1X network is not the same as WPA2-Personal.</li>
        <li><strong>No time or DNS:</strong> check internet access and whether the network blocks NTP or DNS. The board does not inherit this computer’s VPN connection.</li>
        <li><strong>Certificate error:</strong> check the device clock and configured CA data; TLS interception may require enterprise-specific trust setup.</li>
        <li><strong>Request timeout or invalid JSON:</strong> check the service and the console. Don’t substitute fabricated weather or mark the exercise complete.</li>
      </ul>
      <h2>Checkpoint</h2>
      <p>You have observed real weather on the device, kept credentials out of the downloaded script and can explain one network failure mode. Offline? You can read and edit the sample, but don’t claim a completed weather fetch.</p>`,
  },
  {
    id: "finish", title: "Keep your project", navTitle: "Finish & cleanup", minutes: 10, sample: "hello",
    summary: "Take your work with you, and leave the device safe to reuse.",
    content: `
      <h2>Download before you close</h2>
      <p>Visit each exercise and choose <strong>Download .py</strong> for the drafts you want to keep. Each lesson has its own in-memory draft; there is no automatic disk save. A page refresh or a closed tab discards those drafts and your completion checks.</p>
      <h2>Choose how the board starts</h2>
      <p>Running in RAM does not install a boot script. To keep one program on the board, open the editor’s <strong>Run automatically on boot</strong> disclosure and choose <strong>Save as main.py</strong>. Read the confirmation: it overwrites the existing file and makes the program start on reset.</p>
      <p>If an autostart loop makes recovery difficult, reconnect over USB and stop it with Ctrl-C using this workspace or a MicroPython serial terminal. Once stopped, remove or rename <code>main.py</code> from a REPL. Keep a backup before changing a boot program.</p>
      <h2>Remove secrets from a shared board</h2>
      <p>Before returning or sharing the board, remove <code>wifi_config.py</code> using a trusted MicroPython file tool, or temporarily replace the editor contents with the cleanup below and run it. Download your current draft first. The cleanup ignores only a missing-file error and reports other failures.</p>
      <pre><code>import os
try:
    os.remove("wifi_config.py")
except OSError as error:
    if error.args[0] != 2:
        raise
print("Wi-Fi config removed or already absent")</code></pre>
      <p>Deleting a file is not a forensic secure erase of flash. Follow your organization’s device-handling rules when sensitive credentials were used.</p>
      <h2>What you now know</h2>
      <ul><li>How to connect to MicroPython and read a station MAC.</li><li>How framebuffer drawing differs from a physical e-paper refresh.</li><li>How to build a button-controlled loop without constantly refreshing the display.</li><li>How network association, time, TLS and JSON fit into a weather application.</li></ul>
      <h2>Final checkpoint</h2>
      <p>Save your downloads, stop any running script and disconnect the serial port. Mark this step complete when your files and board are ready to leave the workshop. The checkboxes record your assessment, not automated hardware certification.</p>`,
  },
];

export const totalMinutes = lessons.reduce((total, lesson) => total + lesson.minutes, 0);
