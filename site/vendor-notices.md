# Browser workshop notices

## Runtime and installer

MicroPython is a separate project, distributed under the MIT license. The
workshop bundles the official ESP32_GENERIC_S3 SPIRAM_OCT v1.29.0 release;
its original license is included at firmware/LICENSE-MicroPython.txt. The runtime
and JD79661 display example were tested on one replacement board; this does not
certify other hardware revisions. Check the board variant before flashing.
Official source and license:
https://github.com/micropython/micropython/blob/master/LICENSE

The browser installer uses the project's pinned `esptool-js` dependency. Its
license and transitive dependency notices are copied into notices/ during
the static build. No installer implementation is vendored in these UI files.
https://github.com/espressif/esptool-js

## Python editor

CodeMirror 6, its Python language support and Lezer parser are locally bundled
under their MIT licenses. The build copies their licenses and those of their
runtime dependencies into notices/. Editing and highlighting require no CDN,
account, backend or network service. Source:
https://github.com/codemirror

## Interface design

Direction: framed sheet, developer-tool builder, seed 593721118, from
`.taste-skill/direction.json`. No redraw. The interface's question is “What do I
try next, and what happened on my board?” Lesson instructions sit beside real
device controls, a wide Python editor and a serial console. The introduction's
3D hardware story, host USB diagram and factory-refresh illustration explain
the hardware without pretending to be live device output or a simulator.

The dealt IBM Plex faces are intentionally not downloaded or bundled: no local
font assets were available, and reliable enterprise/offline operation is the
primary purpose. System UI and system monospace are an explicit typography
exception. The UI makes no external font, image or analytics requests. Firmware
downloads and device-side archived stock/weather requests are separate, explicit network
operations. No stock photography, icon packs or third-party font files are
bundled. Local macOS setup screenshots supplied by Casey Hillers are included;
their provenance is recorded in `guides/macos/README.md`.

Course drafts live only in JavaScript memory for the
current tab. There is no localStorage, IndexedDB or server-side draft storage.
Archived stock lesson defaults are inline `WIFI_SSID = "Guest-AccessNG"` and
`WIFI_PASSWORD = ""` for the open workshop network, not a separate config file.
There is no separate app Wi-Fi form. Optional private credentials edited into
the code are visible in the editor and included in downloads; never put them in
browser storage or logs. Remove them from drafts, downloads and any device files
(including legacy `wifi_config.py` or explicitly saved `main.py`) before sharing.
Device files are plaintext and USB-readable; deletion is not forensic erasure.

The 120-minute course has one Board check, then 30-minute automatic Snake with
a TODO scaffold and full solution, station MAC, slideshow, Bluetooth desk message
and Finish. Weather and Stocks appear in a separate archived section at the
bottom, excluded from the 120 minutes. Station MAC remains available; Wi-Fi
registration is not needed for Bluetooth.
Hello and the standalone display-independent input diagnostic are not separate
course routes. Browser emoji indicators observe input cycles; confetti requires
five complete cycles, a successful display marker and explicit user confirmation
of the physical party screen. The e-paper party drawing has one final static
refresh, not animation. Finish's battery ideas require safe compatibility checks,
not an assumption that any pack or bare cell is suitable.

## Bluetooth desk message

The workshop's own `desk_message.py` uses MicroPython Bluetooth and a custom
BLE service; `site/desk-message.js` uses Web Bluetooth independently of USB
serial. API references:

- https://docs.micropython.org/en/latest/library/bluetooth.html
- https://developer.chrome.com/docs/capabilities/bluetooth
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API

No Bluetooth helper package or third-party message service is bundled. Keep USB
connected for power and to start the five-minute receiver; match the physical
`Desk-ABC123` name in the browser chooser. Messages need no Wi-Fi or NTP.
Back/Stop clean up the receiver, while Disconnect Bluetooth closes only the
browser link. The unauthenticated nearby service is for non-private ASCII text,
up to 112 bytes fitting four wrapped lines of 28. Do not send secrets or
corporate information.

The custom protocol uses at most 20-byte packets: BEGIN `[1,id,length]`, DATA
`[2,id,up to 18 payload bytes]`, and COMMIT `[3,id]`. The receiver bounds its
packet queue to 16 and pending display message to one, allowing at least two
seconds of stable viewing after each completed full refresh. `shown:id` means
driver-reported refresh completion, not proof of physical display output.
Physical BLE operation has not been verified on a board.

The USB fallback sets `USE_BLUETOOTH=False` and draws edited `START_MESSAGE`
once, including without firmware Bluetooth support. Existing learners install
the latest seven workshop files through Board check → Advanced install, not
reflash. Managed-browser restrictions must be respected.

## Archived ARM quote source and trust certificate

The archived Stocks lesson makes one verified HTTPS request to TradingView's
public website endpoint and one display refresh per run, without background
polling or an API key. It shows the last available NASDAQ:ARM one-minute quote
in USD, its provider minute timestamp in UTC and the reported delay. The
observed source uses a 15-minute delay; this is not a promise of real-time data.
The website endpoint may rate-limit or change and is not a guaranteed stable
official API. Source provenance:

- https://www.tradingview.com/symbols/NASDAQ-ARM/
- https://github.com/shner-elmo/TradingView-Screener
- https://scanner.tradingview.com/symbol?symbol=NASDAQ%3AARM&fields=close%7C1%2Ctime%7C1%2Ccurrency%2Cupdate_mode%2Cdescription%2Cexchange&no_404=true

The client's open-source code license does not license the market data. The
workshop does not bundle the client, and the workshop's MIT license does not
grant new rights over TradingView quotes.

`stocks_ca.pem` is Amazon Root CA 1 from
https://www.amazontrust.com/repository/AmazonRootCA1.pem, SHA-256 fingerprint
`8ECDE6884F3D87B1125BA31AC3FCB13D7016DE7F57CC904FE1CB97C6AE98196E`.
Host HTTPS verification succeeded against this root on October 30, 2026; this
does not establish Wi-Fi or physical display operation on the learner's board.
Archived Stocks and Weather set UTC from the computer over USB before Run in
RAM, so they do not need NTP and retain HTTPS verification. `#weather` opens
the separate archived Weather lesson; neither project counts toward the course.

## Hardware introduction

The welcome scroll story and hardware appendix import the self-contained desk-kit CAD viewer from the
supplied `crowpanel-20deg-desk-kit-2026-10-15` directory. Local copies, adaptation
details, and geometry provenance are recorded in `hardware/README.md`. The viewer
includes Three.js 0.160.1 under its original MIT notice in
`hardware/THREEJS-LICENSE.txt`. These files ship unchanged by the asset bundler;
the workshop's MIT license does not establish a new license for vendor geometry.

The viewer is isolated in an iframe with scripts allowed but without same-origin,
USB, or device access. It makes no external asset requests. The welcome story's
screen artwork and desk are illustrative additions, not live device output.
Scroll messages carry only numeric progress and reduced-motion preference;
receivers validate the source window. Casey Hillers has verified the enclosure's
physical fit.

Three exact STL files are bundled under `prints/`, with quantities and SHA-256
checksums. `prints/README.md` records attribution to Lucas Souza and the supplied
package's separate modifications/stand. Casey Hillers confirms ownership of the
included print files and permits free download and sharing. Preserve their
provenance and attribution. This permission does not cover the separate Elecrow
hardware reference geometry or replace third-party software licenses.
