# CrowPanel lab — MicroPython in your browser

A two-hour, Codelab-style workshop for the **Elecrow CrowPanel 2.13-inch
ESP32-S3 e-paper HMI**. Learners read lessons, edit Python, install a prebuilt
runtime, and run code over USB from one static website. No compilation service,
cloud IDE, account, or runtime backend is required. Rust project sources have
been retired; existing ignored build caches and global toolchains are untouched.

## Interactive hardware introduction

The welcome lesson is a scroll-driven hardware story: display examples, rear
controls, USB/Wi-Fi, then the optional enclosure and desk stand. Processor labels
are deliberately omitted; no Arm-based component has been verified on this board.
Screen artwork is illustrative, never actual Python output. The landing page is
a full-viewport stage: captions fade and move with the model as you scroll,
rather than sitting in a static column. Start the workshop is always available;
course navigation returns on the next page.

The self-contained viewer and embedded geometry live in `site/public/hardware/`.
They are served locally with the site: no CAD backend, third-party CDN, or account
is required. The story and full viewer load only on their respective routes and
unload on navigation. Reduced-motion users get discrete poses and captions without
translation. All narrative text
remains readable without WebGL, with a still reference in the appendix.

The **Hardware & 3D prints** appendix (`#appendix`) sits outside the timed course.
It retains all CAD controls, keyboard navigation, assembly/exploded/print modes,
and a full-size link. `site/public/prints/` contains the three original STL files:
front (print one), back (one), and stand foot (two identical, not mirrored).
Print notes, source attribution, distribution permission, and SHA-256 hashes
ship alongside them. No bulk-print layouts or hardware reference STLs are imported.

This is a hardware reference, not a simulator or a live display preview. The
CAD screen does not show Python output; the enclosure's physical fit has been
verified by Casey Hillers. Electrical facts come from the board documentation, not
mesh appearance. Source provenance and separate third-party notices are recorded
in `site/public/hardware/README.md` and `THREEJS-LICENSE.txt`.
Casey Hillers confirms ownership of all included print files and has provided
permission to distribute them: the included STLs are free to download and share.
This does not waive attribution or relicense the STLs as MIT; preserve upstream
provenance and notices. Elecrow reference geometry and Three.js remain separate
third-party assets; confirm Elecrow geometry redistribution permission before
public publication. The repository's MIT license does not grant rights to that
geometry.

## Start locally

Use Node 22.12+ (Node 24 recommended):

```sh
npm ci
npm run dev
```

Open the localhost URL in desktop Chrome or Edge. The reading/editing portions
work without hardware; USB requires Web Serial, a secure context, an allowed
browser/device policy, and a working USB serial driver. No external fonts,
analytics, or runtime CDN dependencies are used. If the corporate network blocks
npm, configure an approved registry mirror; do not put registry credentials in
this repository. The initial lockfile was downloaded using registry.npmmirror.com.

## The 120-minute course

| Lesson | Minutes | Outcome |
| --- | ---: | --- |
| Welcome | 10 | Understand the board and browser workflow |
| Host setup | 10 | Follow the detected OS guide and select a matching device in the browser USB check |
| Board check | 20 | Check factory operation, install MicroPython if needed, then observe all five controls and confirm the party screen |
| First program · Snake | 30 | Complete the automatic Snake control TODOs, with a full solution available |
| Station MAC | 5 | Read the real Wi-Fi station MAC without joining a network |
| Slideshow | 15 | Cycle three original images with up/down buttons |
| Sabre Springs weather | 20 | Join Wi-Fi, sync time, retrieve verified HTTPS data |
| Finish | 10 | Explore future projects, download work, remove private credentials and disconnect |

The welcome page keeps the 3D parallax hardware story. Host preparation comes
next; factory verification precedes any firmware erase. Already-MicroPython
boards skip flashing. The factory check has no forced pass checkbox: stop and
ask for help when a fresh board is blank instead of destroying the baseline.

The single **Board check** (`#verify`) combines setup and the five-control check.
With explicit flash consent, the pinned official firmware installer
runs in-browser if needed. The check copies the four libraries plus
`00_board_check.py` and runs in RAM without creating `main.py`. Input polling is
bounded to 60 seconds; display refreshes stay outside the polling loop.
Browser emoji indicators observe complete debounced press/release cycles, one
for each of Up, Down, Press, Menu and Back. Browser confetti requires all five
observed cycles, the successful `DISPLAY CELEBRATION SHOWN` marker, and explicit
user confirmation that the physical party screen is visible. Neither counts
nor the marker alone prove physical display operation. The e-paper celebration
is a static party drawing with one final refresh, not animated confetti.

The first coding lesson is 30-minute automatic Snake (`#snake`). Complete the
`handle_input` TODO scaffold in `02_snake.py`: **Press starts**, not a single step;
**Up ↺ counterclockwise -1** (12→9→6→3), **Down ↻ clockwise +1** (12→3→6→9),
**Menu resets to ready**, **Back exits**. A square 8×8 grid (~82px) occupies
the left of the 250×122 screen; score, status and instructions sit right.
Default `STEP_MS=5000` is 5 seconds of stable viewing time **after** each completed refresh; the
physical refresh takes additional time. This prevents continuous refresh flashing.
Advance one step per completed frame (one cell), with no catch-up bursts.
Allow one 90-degree steering turn per movement frame; extra turns queue for following frames.
No smooth, fast or partial refresh is
promised; preserve the driver's minimum refresh interval.
Food starts one move ahead, then favors free cells near the center.
After a collision, **Press** plays again (or **Menu → Press** resets and starts).
A RAM session lasts up to five minutes plus an in-progress refresh; after it
ends, click **Run in RAM** again. A collision pauses movement, not input polling;
there is no 20-second session cutoff.
The console distinguishes ready, game over, session ended and display errors.
**Show full solution** provides `02_snake_solution.py`, asking before replacing
learner work. To use optional `show(on_wait=...)`, reinstall the latest workshop
libraries via **Board check → advanced install**, **not reflash**. This callback
collects debounced controls during blocking waits; it must not issue another
display call or modify the canvas. The refresh waveform stays unchanged.
Snake also runs with older installed drivers using plain `show()`, with a
console warning: inputs cannot be collected during refresh until the libraries
are updated. Hold a control until the refresh ends on those drivers.
Library installation and Board check restart the MicroPython VM before copying
files, then refresh the three workshop imports. Raw-REPL restart skips
`main.py`; MicroPython still runs an existing `boot.py`. Failed restart or import
reload is not installation success.
Hello and the independent input diagnostic are not timed course routes; the
diagnostic remains available below. The course still totals 120 minutes.

Finish suggests notifications, a calendar viewer, a build-status display and a
desk companion. For a cable-free display, check USB battery-pack low-current
support. Before an internal battery, verify the exact board manual, voltage,
connector polarity, charging support and cell protection; never connect an
unprotected bare cell.

Code lessons dedicate most desktop width to a locally bundled CodeMirror Python
editor, with syntax highlighting, line numbers, four-space indentation and
undo/redo. Tab moves focus; Ctrl/⌘ + Enter runs. A textarea remains the fallback
if editor initialization fails. Brief tasks and expected results sit alongside;
longer troubleshooting stays in disclosures. The USB diagram and display-change
illustration are guides, not live hardware output.

Each code lesson also has **Make something new with Codex** below the editor.
Learners describe an idea and copy a prompt containing the verified hardware API,
pin map, e-paper refresh constraints and safe weather/slide examples. The prompt
does not automatically include editor drafts, Wi-Fi credentials or device IDs;
no AI API or build service is called. Learners review generated Python before
pasting and running it. Generated code is not guaranteed safe or correct.

**Run in RAM** does not create
`main.py`. Stop interrupts long-running scripts. Saving as `main.py` is an
explicit, confirmed action because it runs at boot. Downloads are the way to
keep work: drafts are in memory only and disappear on reload. Lessons have no
general lesson-completion tracking; use Previous/Next or the sidebar. Host setup
requires the USB check; Board check requires observed cycles, the display marker
and explicit visual confirmation, not an automatic hardware PASS.

## Firmware and USB setup

The Host setup lesson includes macOS, Windows, and Linux serial-port/driver
guides, with a copyable Codex troubleshooting prompt and a downloadable full
guide. See `docs/usb-setup.md` for detailed steps and official sources. The
macOS instructions include approving the WCH DriverKit extension when it is
installed but waiting for user approval. Install drivers only when needed.
Neither USB setup nor the helper prompt requires Python CLI tools or flashing.
The detected desktop OS guide opens automatically; other guides stay available.
Real macOS screenshots are cropped to the relevant WCH settings. The browser
checker uses Web Serial (not WebUSB), validates `1a86:7522` without opening the
port, and unlocks Host setup's Next button. It does not prove MicroPython or the
screen works. Sidebar navigation remains available for reading without hardware.

**Installing firmware erases factory firmware, all device files, and saved
credentials.** Workshop boards are supplied fresh out of the box; no initial
backup is required. Finish includes optional instructions for reinstalling
Elecrow's published factory demo for the matching board revision; no factory
recovery image is bundled in this project. Installing a macOS driver or approving a system extension
is a separate user/IT action, not something this website performs.

After a successful MicroPython install, a dialog and persistent installer note
ask learners to unplug the ESP32's USB cable and plug it back in, then choose
**Connect device → Connect & check board**. Never unplug during writing.

For recovery after a failed installation or a running lesson, connect the board
and choose **Device → Reset device…**. After explicit confirmation, it stops the
current program, restarts MicroPython, deletes all writable device files and
folders (including `boot.py`, `main.py` and saved credentials), restarts the VM
again, and reinstalls the four workshop files plus `00_board_check.py`. It checks
library imports but does not run the display or confirm physical controls.
Run **Board check** next. Editor drafts stay in tab memory. MicroPython firmware
stays installed; this is separate from factory-demo restoration. Deletion is not
forensic secure erase. A timeout or failed deletion/write/import is incomplete;
reconnect and retry. If the runtime cannot respond, try the physical RESET
button and reconnect, then ask a facilitator if needed.

The site includes the official combined image:

- MicroPython **v1.29.0**, released **August 24, 2026**.
- `ESP32_GENERIC_S3-SPIRAM_OCT-20260824-v1.29.0.bin` at flash offset **0**.
- ESP32-S3R8 / octal PSRAM, supported by the vendor schematic; 8 MB flash.
- Size **1,786,704 bytes**; SHA-256
  `ab24eadfe3ef0e6ee38834d730e648def7cd82f3fa51ee0bbc59c29a6e1bd176`.
- Generic S3 firmware enables UART0 REPL for external USB-to-UART bridges.

The browser verifies the bundled image's size/hash before connecting the
bootloader and refuses detected chips other than ESP32-S3. A local combined
`.bin` can be selected, but the user is responsible for its provenance and memory
variant. A `.uf2` or `.app-bin` is not appropriate at offset 0. The installer
releases the port before the Python workspace connects. Only one serial client
may own the device at a time. If automatic bootloader entry fails, follow the
board manufacturer's boot/reset procedure and retry; do not guess GPIO wiring.

Both **Connect device** and **Erase & flash** use Web Serial filters for the
observed USB VID/PID **1a86:7522** and reject other identities before opening.
This removes Bluetooth, unrelated USB identities, and non-USB serial devices
from the picker. It does not uniquely identify a CrowPanel: unplug unrelated
adapters with the same ID. Other hardware revisions require explicitly reviewed
USB support; the interface ID does not identify the fitted display controller.

**Replacement-board status (October 27, 2026):** the user confirmed its factory
display works. After backing up all 8 MB and verifying the checksum, MicroPython
and the workshop files were installed and verified. The JD79661 hello-world
refresh completed and the user confirmed visible text, but horizontally
mirrored. JD79661 now uses ascending native rows to correct the horizontal
mapping; SSD1680 retains its previous mapping. The user subsequently confirmed
the corrected display looks good. No `main.py` was installed. This validates
that replacement board, not every panel revision.

**Original-board investigation (October 27, 2026):** the installed WCH driver exposes
`/dev/cu.wchusbserial21410`. MicroPython v1.29.0 was flashed successfully, and its
UART REPL reports the octal-SPIRAM build and approximately 8 MB of free heap.
The workshop libraries are installed. The first hello-world run failed during
display initialization with an SSD1680 BUSY timeout. GPIO9 settles high after a
hardware reset, consistent with JD79661 idle polarity, but not proof of chip ID.
The new JD79661 preset follows the vendor V1.2 protocol. Initial hardware and
low-speed software SPI diagnostics did not observe BUSY assert in response to
refresh/power-on commands. The user reports no visible image despite the earlier
unguarded script printing success. The guarded driver has now been installed on
the board: its hello-world test correctly fails with `JD79661 refresh did not
assert BUSY`, rather than treating a permanently idle pin as success. **The
display is not working yet; controller identity and the panel power/data path
still need verification.** Buttons and device-side weather are also unverified.
For a user-approved factory diagnostic, the MicroPython files and full 8 MB flash
were backed up under ignored `.backups/`; the full snapshot matched the device's
MD5. The original pre-installation factory snapshot was then restored, its full
8 MB MD5 verified before boot, and the board reset. The user reports that the
restored original firmware also leaves the screen blank, including after a cold
power cycle. A 25-second serial capture reached the factory application's
wakeup message without reporting a panic, brownout, or invalid image header;
this does not prove display initialization completed or that the panel is faulty.
With further user approval, Elecrow's published `Firmware-V1.2` demo was then
installed using its four documented offsets with old settings cleared. The
complete 8 MB image checksum matched before boot; a 30-second serial capture
reached the application wakeup message with no observed panic, brownout, or
invalid image header. The user confirms that the V1.2 demo's screen never flashed
and remains blank,
although the red LED changed during restart.** Neither this result nor the serial
startup message identifies the panel controller or proves a hardware defect.
The user does not recall seeing any display output before the first firmware
change. With explicit user approval, the verified full MicroPython snapshot was
subsequently restored to enable input testing. **The board currently runs
MicroPython v1.29.0 OCTSPIRAM again**, with the original workshop files restored
and no `main.py`. All five user-input GPIOs read high when initially sampled;
the user subsequently verified all five controls using the input lesson.
Display power was left off during that input test.
The new `05_inputs.py` file was installed without creating an autostart program;
a two-second on-device smoke test completed with all five inputs released and
zero observed edges, which does not validate physical presses.
The display remains unresolved. Comparison with a supplied working workshop
found concrete startup/transport differences still needing a controlled hardware
test; see [display investigation](docs/display-investigation.md). Do not treat
the blank factory-demo result alone as proof of a defective panel.
The RAM-only reference sequence has since been run: hardware SPI timed out on
the clear refresh, while per-byte software SPI observed BUSY assertion/release
for both refreshes. The user still saw no image. A repeat with ten-second pauses
before the next commands and no intervening prints measured only 21 us of
observed-low time per refresh after command transmission; these observations
are not proof of a physical refresh. The user confirms that the repeated static
pattern also left the screen completely blank. No boot program was installed
and no display fix is verified. The supplied coworker ZIP contains source only;
the exact known-working compiled application has not been tested on this board.
Backup details and limitations are documented
locally in `.backups/README.md`. No `main.py` autostart program was installed.

## Device files and security

### Startup LED

`device/boot.py` enables the red PWR LED (GPIO19) whenever MicroPython starts.
When installing it on an existing board, back up and preserve its existing
`boot.py` contents, appending this initialization rather than replacing custom
startup code. The display driver also leaves the LED on; panel power (GPIO7)
remains separately controlled. This indicates firmware has started, not a
continuous health check or confirmation that the e-paper works. No `main.py`
or automatic display refresh is needed.

### Display-independent input check

For facilitator-led troubleshooting, run `device/examples/05_inputs.py` in RAM.
This standalone diagnostic has no separate course route and needs no display.
It reads Up (GPIO6), Down (GPIO4), dial Press (GPIO5), Menu/Home (GPIO2), and
Back/Exit (GPIO1) directly, with internal pull-ups and independent 25 ms debounce.
It does not import the display driver or touch SPI/panel power. Press and release
each control, then check the per-control counts after the 60-second run.
The initial readings are baselines, not counted presses; zero counts are not a
hardware pass. BOOT and RESET are excluded because they control startup/reset.
For terminal use: `.venv/bin/mpremote connect /dev/cu.wchusbserial21410 run device/examples/05_inputs.py`.

### Installed files

- `device/crowpanel.py`: SSD1680/JD79661 full-refresh presets, 250 × 122 landscape.
- `device/slides.py`: original Crow, Circuit, and Summit bitmaps.
- `device/weather.py`: bounded Wi-Fi/NTP/HTTPS operations; fails closed on TLS
  errors, unsupported TLS configuration, stale clock, or malformed responses.
- `device/weather_ca.pem`: ISRG Root X2 trust anchor. The Open-Meteo chain was
  verified against this root on October 27, 2026. Renew the trust material if the
  provider changes chains; never work around it by disabling verification.
- `device/examples/`: the Board check, Snake TODO scaffold and full solution,
  station MAC, slideshow and weather scripts, plus standalone diagnostics and Hello.

Weather uses editable inline defaults `WIFI_SSID = "Guest-AccessNG"` and
`WIFI_PASSWORD = ""`; the empty password means an open network. The exercise
does not read `wifi_config.py`; there is no separate app Wi-Fi form.
Learners may enter private credentials for another approved network, but those
values are visible in the editor and included in downloaded Python. Drafts stay
only in tab memory, never browser storage. Never print or log secrets. Remove
private credentials from drafts, downloads and any device files before sharing,
including legacy `wifi_config.py` or explicitly saved `main.py` if used. USB
access permits reading device files; this is not a secrets vault. Saving
`main.py` still requires explicit consent, and deletion is not forensic erasure.

Wi-Fi examples use 2.4 GHz Personal/open networks. Enterprise 802.1X and captive
portal login are not implemented. Registering a MAC alone does not guarantee
corporate-network compatibility. NTP and the HTTPS endpoint must be reachable;
an approved workshop hotspot may be simpler. HTTPS socket operations are bounded;
DNS resolution uses the firmware resolver's own timeout. Large/chunked responses
are rejected rather than accepted unsafely. Weather data is for Sabre Springs,
San Diego (32.9528, -117.094), with Fahrenheit, mph, and Los Angeles local time.

## Hardware contract

| Signal | GPIO |
| --- | ---: |
| SPI SCK / MOSI | 12 / 11 |
| Display CS / DC / RESET / BUSY | 14 / 13 / 10 / 9 |
| Display power / LED | 7 / 19 |
| Up / down / press | 6 / 4 / 5 |
| Menu / back | 2 / 1 |

Buttons are active low. SSD1680 BUSY is active high; JD79661 BUSY is active low,
with a 15-second busy-release timeout. JD79661 additionally requires BUSY to
assert within one second after the refresh command, otherwise it fails closed
and cuts panel power without sending sleep commands to a pending refresh.
Full refreshes are spaced by at least two seconds. Drawing coordinates are
250 × 122; native RAM is 128 × 250. White is 1, black is 0, MSB-leftmost
`framebuf.MONO_HLSB`, with a 256-pixel landscape stride. The driver is based on
the vendor's original SSD1680 and `example/arduino-v1.2/main/EPD_Init.cpp`
JD79661 full-refresh sequences (vendor commit
`11291e3e9a868be8943232b065f3e264dfaeeae3`). JD79661 uses its own initialization,
native RAM transfer, five 56-byte waveform tables with alternating 22/23 polarity,
`17 A5` auto power-on/refresh/power-off, and `07 A5` deep sleep—not SSD1680 commands
with an inverted BUSY check. Cleanup preserves the primary error and cuts power.

Samples explicitly use `CrowPanel(controller="jd79661")` for the vendor V1.2
display protocol; verified older panels use `controller="ssd1680"`. The no-argument
constructor retains the original SSD1680 behavior for compatibility. Do not
auto-detect a controller from BUSY level alone, bypass a timeout, or cycle both
protocols blindly. Confirm the fitted panel against its markings/vendor records.
**The JD79661 implementation has protocol tests but visible output is not yet
verified on this board.** Reinstall workshop libraries after upgrading; an old
device copy of `crowpanel.py` will not gain new controller support from page reload.

## Develop and verify

```sh
npm test
npm run build
npm run preview
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m unittest discover -s tests -v
.venv/bin/python tools/convert_images.py --demo
```

JavaScript tests exercise raw-REPL framing, cancellation, concurrency, source/file
transfer, and disconnects using fake streams. Python tests check image conversion,
panel geometry/protocol behavior, and weather failure/security paths with mocks.
See `assets/README.md` for custom image conversion. Pillow is a host tool only.

Before calling the workshop ready, test on the actual board: flash and reconnect,
run the Board check, observe all five complete cycles and explicitly confirm the
static party screen before browser confetti. Complete Snake's TODOs, try its full
solution without losing work, print MAC, cycle every slide both ways, Stop the
loop, fetch weather, and test denied permissions/disconnects. Verify autostart
only with explicit consent, then remove private credentials from drafts,
downloads and device files. Check driver/controller variants on every batch.

## Publish to GitHub Pages

The local `main` branch tracks `origin/main` at
https://github.com/CaseyHillers/crowpanel-codelab.

Review and commit changes before pushing `main`.
In the repository's **Settings → Pages**, choose **GitHub Actions** as the source.
The intended site address is https://caseyhillers.github.io/crowpanel-codelab/.
`.github/workflows/pages.yml` installs
dependencies, tests, bundles, and deploys `dist/`. Vite uses relative asset paths
so repository subpaths work. GitHub Actions builds static JavaScript assets only;
it never compiles learner programs or handles device credentials. The published
HTTPS page connects directly to the learner's local serial port after consent.

## License

The original workshop code and documentation are licensed under the **MIT
License**, copyright 2026 Casey Hillers. See `LICENSE`. The static build includes
a copy at `dist/LICENSE.txt`.

Third-party firmware, dependencies, certificates, and weather data retain their
own licenses and attribution requirements. In particular, the MIT project
license does not replace the Apache-2.0 license of `esptool-js` or the bundled
firmware's third-party notices.

## Sources and notices

- Board source/schematic: https://github.com/Elecrow-RD/CrowPanel-ESP32-2.13-E-paper-HMI-Display-with-122-250
- JD79661 initialization/LUTs: https://github.com/Elecrow-RD/CrowPanel-ESP32-2.13-E-paper-HMI-Display-with-122-250/blob/11291e3e9a868be8943232b065f3e264dfaeeae3/example/arduino-v1.2/main/EPD_Init.cpp
- JD79661 BUSY/auto-sequence commands: vendor `Datasheet/EK79029DS-JD79661_Datasheet.pdf`, sections 8.2.10 and 9.1.
- Firmware: https://micropython.org/download/ESP32_GENERIC_S3/
- Optional factory demo restoration (Windows tool and revision-specific packages): https://github.com/Elecrow-RD/CrowPanel-ESP32-2.13-E-paper-HMI-Display-with-122-250/blob/11291e3e9a868be8943232b065f3e264dfaeeae3/factory_firmware/readme.md
- UART config: https://github.com/micropython/micropython/blob/v1.29.0/ports/esp32/boards/ESP32_GENERIC_S3/mpconfigboard.h
- Raw REPL: https://docs.micropython.org/en/latest/reference/repl.html
- Framebuffer: https://docs.micropython.org/en/latest/library/framebuf.html
- TLS: https://docs.micropython.org/en/latest/library/ssl.html
- Installer: https://github.com/espressif/esptool-js
- Weather: https://open-meteo.com/en/docs (Open-Meteo, CC BY 4.0 attribution)
- Trust root: https://letsencrypt.org/certs/isrg-root-x2.pem

MicroPython's license accompanies the binary in `site/public/firmware/`.
Its ports include third-party components with their own licenses, referenced in
that license file and the upstream ESP-IDF source. npm dependency license files
are copied into the distribution by the build script. See also
`site/vendor-notices.md` for interface and runtime provenance.
