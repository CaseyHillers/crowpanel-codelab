# Repository guide

## Architecture

- `site/`: static browser workshop. Vite bundles local assets; no runtime backend.
- `site/serial.js`: exclusive Web Serial connection and MicroPython raw REPL.
- Library installation and Board check restart the VM in raw REPL before writes,
  then evict only crowpanel/weather/slides/stocks/desk_message from the import cache. Raw restart
  skips main.py but runs existing boot.py; failures are not install success.
- Device controls offer confirmed destructive Reset device: stop an active run,
  raw soft reset, bounded recursive deletion of all writable device files,
  another soft reset, reinstall seven workshop files plus 00_board_check.py and
  verify imports. Preserve browser drafts and firmware. Clear verification;
  no automatic physical PASS. Partial failures must not report ready/success.
  device/diagnostics/reset_files.py is RAM-only, never installed on the board.
- `site/flash.js`: one-time prebuilt firmware installation; distinct port ownership.
  Successful MicroPython install shows a power-cycle dialog and persistent note:
  unplug/replug USB after writing, before Board check; never during writing.
- `site/code-editor.js`: locally bundled CodeMirror Python editor with textarea
  fallback. Preserve per-lesson drafts, downloads, keyboard focus escape and the
  Ctrl/⌘ + Enter run shortcut; never send source to a build service.
- `site/lessons.js`: host setup preserves factory firmware; `verify` is the single
  Board check, with factory checks before optional confirmed flashing. Workshop
  boards arrive fresh out of the box; no initial backup step. Finish offers
  optional restoration of Elecrow's published factory demo for the matching
  revision, with an erase warning and vendor instructions; no bundled recovery
  image or claim of verified physical restoration.
  The first coding lesson is 30-minute automatic Snake, then station MAC,
  slideshow, 20-minute Bluetooth desk message and Finish; no Hello or duplicate
  inputs course route. Keep station MAC; its Wi-Fi registration is optional for
  Bluetooth. Weather and Stocks are separate archived routes at the bottom,
  excluded from timed navigation and the course duration; #weather opens Weather.
  Keep the total at 120 minutes. Code lessons prioritize the editor; guide
  lessons hide it. No general completion tracking or automatic hardware PASS.
  Board check requires five observed complete cycles, a successful display
  marker and explicit user confirmation of the physical party screen before
  browser confetti. Keep browser emoji indicators as observations, not proof.
- `site/usb-setup.html`: concise OS-specific host guides and a copyable Codex
  prompt. `docs/usb-setup.md` is bundled as a downloadable Vite asset. Keep
  driver/IT approval separate from firmware installation; do not require CLI
  tools, bypass security, or infer a bridge model from VID/PID alone.
- `site/usb-check.js`: detect the host OS, select and validate a filtered USB
  serial port without opening it; Host setup's Next requires this check. Use
  Web Serial for the UART bridge, not WebUSB. Never auto-select or claim this
  check verifies the runtime, physical board or display.
- `device/examples/00_board_check.py`: Board check, bounded 60-second
  input polling with display instructions/summary outside polling. Keep all five
  debounced input edges, initially-held handling, display-error fallback and
  prompt KeyboardInterrupt behavior. `site/starter-inputs.js` parses only its
  exact event lines; indicators are observations, not hardware PASS. Initially
  held controls must release before a fresh press/release cycle counts. The
  e-paper party drawing is static with one final refresh, never an animation.
  `DISPLAY CELEBRATION SHOWN` is not physical display verification by itself.
  Board check's Next requires the user to confirm the physical party screen;
  sidebar links remain available for reading without hardware.
- `device/examples/02_snake.py`: automatic Snake `handle_input` TODO scaffold;
  `02_snake_solution.py` is the full solution. Press starts, not a single step;
  Up ↺ counterclockwise -1 (12→9→6→3), Down ↻ clockwise +1 (12→3→6→9), Menu
  resets to ready, Back exits. Square 8×8 grid (~82px) at (4,20) on 250×122;
  food starts one move ahead, then favors free cells nearest the center.
  score/status/instructions right. Default `STEP_MS=5000` is 5 seconds of stable viewing time after
  each completed refresh; physical refresh takes additional time. Never schedule
  back-to-back moves just because the previous refresh consumed the interval.
  Press replays after collision (Menu then Press also works); the bounded
  five-minute session ends with explicit console guidance to Run in RAM again.
  Show a Press replay label
  on game over, and log refresh errors without swallowing them.
  Keep the 16-event refresh queue bounded: Back wins, Menu clears stale events,
  and a later Press survives Menu and displaces steering when the queue is full.
  One step per completed frame (one cell), no catch-up bursts. Allow one
  90-degree steering turn per movement frame; extra turns queue for following frames.
  Only a successful steering handler consumes the frame's turn; Back/Menu/Press
  remain immediate, and Menu clears deferred turns. Never promise
  smooth, fast or partial refresh. Preserve bounded input polling and minimum
  refresh spacing. Ask before replacing a learner's draft. Keep 30/120 minutes.
  Optional `show(on_wait=...)` collects debounced controls during blocking waits;
  the callback must not issue another display call or modify the canvas. Keep
  the waveform unchanged. Users must reinstall latest workshop libraries through
  Board check → advanced install, not reflash, to use the callback.
  Snake checks `SUPPORTS_WAIT_CALLBACK` before passing the keyword. Older drivers
  fall back to plain `show()` with an honest input-limit/upgrade warning; never
  swallow driver TypeErrors or retry a failed physical refresh.
- `site/codex-prompts.js`: verified API/pin/refresh guidance for manual coding
  prompts. Never automatically include drafts or credentials, contact an AI
  backend, run generated code, flash, or save main.py through this helper.
  Default to automatic Snake; generic generated code must not animate unbounded
  or bypass minimum refresh spacing. Preserve the optional callback constraints.
- `site/public/hardware/`: isolated welcome scroll story and full CAD appendix,
  local meshes, fallback image, and provenance. Preserve Three.js/source notices.
  Both use scripts-only sandboxes, not simulators. `site/hardware-story.js`
  sends scroll progress with source-checked ready/error messages.
- Welcome is a full-viewport sticky stage, without the course shell. Its HTML
  copy crossfades with the same scroll progress as the CAD animation through
  `site/story-copy.js`; inactive chapters are inert. Reduced motion uses four
  discrete poses and captions, without translation. Keep Start accessible.
- `site/public/prints/`: exact three desk-kit STLs, quantities, hashes, and
  separate provenance. Enclosure physical fit verified by Casey Hillers, who
  confirms ownership of all included print files and has provided permission to
  distribute them free to download and share. Preserve upstream provenance and
  attributions; do not infer an attribution waiver or new license terms. Keep
  third-party Elecrow reference geometry permissions and Three.js licenses separate.
- `device/crowpanel.py`: explicit SSD1680/JD79661 full-refresh presets, landscape
  250 × 122, native RAM 128 × 250. Samples select the vendor V1.2 JD79661 preset;
  visible output was confirmed on the replacement board, initially mirrored.
  JD79661 uses ascending native rows; SSD1680 retains reversed rows. Corrected
  orientation was subsequently confirmed by the user on that board. Never infer the controller from USB identity
  or auto-switch protocols after a timeout. JD refresh must assert BUSY before
  completion; a permanently idle BUSY pin is not success.
- `device/weather.py`: shared bounded connect/fetch_json with verified HTTPS,
  plus the standalone Sabre Springs weather API/sample and optional sync_time.
- `device/desk_message.py` and `device/examples/04_desk_message.py`: bounded
  five-minute BLE receiver, independent of USB serial. USB powers the board and
  starts the receiver; message sending needs no Wi-Fi/NTP. Browser Web Bluetooth
  chooses the matching physical Desk-ABC123 name using the custom service.
  Back/Stop clean up Bluetooth. Accept printable ASCII/newlines, at most 112
  bytes fitting four wrapped lines of 28. Packets are at most 20 bytes:
  BEGIN [1,id,length], DATA [2,id,up to 18 payload bytes], COMMIT [3,id].
  Bound incoming packets to 16 and pending display messages to one. Keep two
  seconds of stable viewing after each completed refresh; never refresh in IRQ.
  shown:id means driver-reported completion, not physical display proof.
  The unauthenticated nearby service must carry no secrets/private messages.
  USE_BLUETOOTH=False shows edited START_MESSAGE once over USB, including on
  firmware without Bluetooth. No physical BLE verification is claimed.
  Existing learners use Board check → Advanced install, not reflash.
- `device/stocks.py`: keyless TradingView public website endpoint for NASDAQ ARM,
  last available one-minute quote in USD, paired with provider minute UTC time.
  The observed feed is 15-minute delayed; do not promise real-time prices or
  label retrieval time as quote time. Convert Unix 1970 timestamps on both
  1970/2000-epoch MicroPython ports. One fetch/one refresh, no background polling.
  Endpoint may rate-limit/change; no guaranteed stable API or open market-data
  license is implied by an open-source client. Keep source/delay/time visible.
  stocks_ca.pem is Amazon Root CA 1 from the official Amazon Trust repository;
  never disable TLS. Host HTTPS was validated; board stock/Wi-Fi output was not.
  Existing learners install the latest files via Board check → Advanced install,
  not reflash. Seven files: crowpanel.py/weather.py/slides.py/weather_ca.pem/stocks.py/stocks_ca.pem/desk_message.py.
  Archived Weather and Stocks Run in RAM seed machine.RTC from computer UTC over USB before
  running editor code. The sample does not call NTP; sync_time remains optional
  for standalone use where allowed. Preserve TLS/stale-clock validation, UTC
  conversion, editable drafts and no clock writes to device files. Standalone
  downloads/main.py need RTC setup separately after loss of power.
- `device/examples/04_stocks.py`: editable inline `WIFI_SSID = "Guest-AccessNG"`
  and `WIFI_PASSWORD = ""` defaults for open workshop Wi-Fi; no wifi_config.py
  dependency. There is no separate app Wi-Fi form. Private replacements are
  visible in the editor and downloads; never browser storage or logs.
- `device/examples/`: learner-editable Python scripts, run in RAM by default.
- `device/examples/05_inputs.py`: display-independent five-control diagnostic;
  standalone facilitator troubleshooting, not a separate course route;
  direct pull-up GPIOs, debounced press/release edges, 60-second count summary.
  Do not gate input testing on a successful display refresh or include BOOT/RESET
  among ordinary application inputs. Idle readings/mocked tests are not proof
  that physical controls work.
- `device/diagnostics/jd79661_reference.py`: RAM-only vendor-sequence comparison;
  explicit hardware/bitbang transport, OLD/NEW clear and two refreshes. Success
  keeps GPIO7 high after sleep to match the reference application; errors cut
  power. Physical output is unverified; preserve bounded BUSY checks and do not
  silently substitute this experimental path for the production driver.
- `device/slides.py`: generated by `tools/convert_images.py`; white=1, black=0,
  MSB-leftmost `framebuf.MONO_HLSB`, 256-pixel stride.

## Checks

- `npm ci`, `npm test`, `npm run build`.
- `.venv/bin/python -m unittest discover -s tests -v`.
- `.venv/bin/python tools/convert_images.py --demo` regenerates the artwork.
- Serve with `npm run dev`; Pages deployment is a separate explicit operation.

## Guardrails

- Never log Wi-Fi credentials or persist them in browser storage. Inline stock
  settings are explicitly learner-editable; private credentials will be visible
  in editor drafts and downloads. Warn learners to remove them before sharing,
  including any device files/legacy wifi_config.py. Drafts stay in tab memory.
  Saving `main.py` needs explicit consent; deletion is not forensic secure erase.
- Firmware installation replaces factory firmware. Require confirmation before flash.
- Preserve verified TLS and time synchronization; never disable verification.
- Wi-Fi examples support 2.4 GHz Personal/open networks, not enterprise 802.1X.
  MAC registration does not imply corporate-network compatibility.
- Preserve offline hello, slideshow, and station MAC functionality.
- Finish includes future projects and USB battery-pack low-current checks.
  Internal batteries need exact-board voltage, connector polarity, charging and
  protection verification; never recommend an unprotected bare cell.
- Driver pins/protocol must be vendor-backed; reference links belong in README.
- Do not claim flash, hardware, USB-driver, or deployment success without validation.
- VID 1a86/PID 7522 alone does not identify an exact bridge model.
- Both USB choosers filter to 1a86:7522 and validate that identity before opening.
  Other USB revisions need explicit support; matching IDs do not authenticate a board.
- Project Rust sources have been retired. Do not remove global user toolchains.
