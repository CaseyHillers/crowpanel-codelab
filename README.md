# CrowPanel lab — MicroPython in your browser

A two-hour, Codelab-style workshop for the **Elecrow CrowPanel 2.13-inch
ESP32-S3 e-paper HMI**. Learners read lessons, edit Python, install a prebuilt
runtime, and run code over USB from one static website. No compilation service,
cloud IDE, account, or runtime backend is required. Rust project sources have
been retired; existing ignored build caches and global toolchains are untouched.

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
| Setup | 15 | Flash MicroPython once; install the workshop libraries |
| Station MAC | 10 | Read the real Wi-Fi station MAC without joining a network |
| Hello world | 20 | Edit text and refresh the physical e-paper display |
| Slideshow | 25 | Cycle three original images with up/down buttons |
| Sabre Springs weather | 30 | Join Wi-Fi, sync time, retrieve verified HTTPS data |
| Finish | 10 | Download work, optionally save an explicit autostart program |

The editor uses a plain Python textarea. **Run in RAM** does not create
`main.py`. Stop interrupts long-running scripts. Saving as `main.py` is an
explicit, confirmed action because it runs at boot. Downloads are the way to
keep work: drafts and progress are in memory only and disappear on reload.

## Firmware and USB setup

**Installing firmware erases factory firmware, all device files, and saved
credentials. Back up anything you need first.** There is no factory recovery
image in this project. Installing a macOS driver or approving a system extension
is a separate user/IT action, not something this website performs.

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

**Current hardware status (October 27, 2026):** the installed WCH driver exposes
`/dev/cu.wchusbserial21410`. MicroPython v1.29.0 was flashed successfully, and its
UART REPL reports the octal-SPIRAM build and approximately 8 MB of free heap.
The workshop libraries are installed. The first hello-world run failed during
display initialization with an SSD1680 BUSY timeout; visible output, buttons,
and device-side weather remain unverified. A pre-installation flash snapshot is
saved locally under ignored `.backups/`; its verification limitations are
documented there. No `main.py` autostart program was installed.

## Device files and security

- `device/crowpanel.py`: SSD1680 full-refresh driver, 250 × 122 landscape.
- `device/slides.py`: original Crow, Circuit, and Summit bitmaps.
- `device/weather.py`: bounded Wi-Fi/NTP/HTTPS operations; fails closed on TLS
  errors, unsupported TLS configuration, stale clock, or malformed responses.
- `device/weather_ca.pem`: ISRG Root X2 trust anchor. The Open-Meteo chain was
  verified against this root on October 27, 2026. Renew the trust material if the
  provider changes chains; never work around it by disabling verification.
- `device/examples/`: the four editable lesson scripts.

The Wi-Fi form writes **plaintext `wifi_config.py` onto the device**, containing
`SSID` and `PASSWORD`. Credentials are not put in the sample editor, logs,
browser storage, firmware image, or repository. Use workshop credentials and
remove this file before sharing the device. USB access permits reading device
files; this is not a secrets vault. Avoid putting secrets into learner code.

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

Buttons are active low; display BUSY is active high with a 15-second timeout.
Full refreshes are spaced by at least two seconds. Drawing coordinates are
250 × 122; native RAM is 128 × 250. White is 1, black is 0, MSB-leftmost
`framebuf.MONO_HLSB`, with a 256-pixel landscape stride. The driver is based on
the vendor's SSD1680 initialization; **JD79661 variants are not verified**.

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
install libraries, print MAC, edit/run hello twice, cycle every slide both ways,
Stop the loop, fetch weather, test denied permissions/disconnects, then verify
autostart and remove workshop credentials. Check driver/controller variants on
every batch of hardware.

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
- Firmware: https://micropython.org/download/ESP32_GENERIC_S3/
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
