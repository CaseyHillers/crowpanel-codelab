# Browser workshop notices

## Runtime and installer

MicroPython is a separate project, distributed under the MIT license. The
workshop bundles the official ESP32_GENERIC_S3 SPIRAM_OCT v1.29.0 release;
its original license is included at firmware/LICENSE-MicroPython.txt. The firmware is not
represented as tested on this particular panel revision. Check the board variant
before flashing. Official source and license:
https://github.com/micropython/micropython/blob/master/LICENSE

The browser installer uses the project's pinned `esptool-js` dependency. Its
license and transitive dependency notices are copied into notices/ during
the static build. No installer implementation is vendored in these UI files.
https://github.com/espressif/esptool-js

## Interface design

Direction: framed sheet, app builder, seed 135731182, from
`.taste-skill/direction.json`. No redraw. The interface's question is “What do I
try next, and what happened on my board?” Lesson instructions sit beside real
device controls, a plain Python textarea and a serial console. The signature
element is an explicitly illustrative 250 × 122 e-paper layout, never presented
as a live device image or simulator.

The dealt IBM Plex faces are intentionally not downloaded or bundled: no local
font assets were available, and reliable enterprise/offline operation is the
primary purpose. System UI and system monospace are an explicit typography
exception. The UI makes no external font, image or analytics requests. Firmware
downloads and device-side weather requests are separate, explicit network
operations. No stock photography, icons, third-party font files or other visual
assets are bundled.

Course drafts and completion checks live only in JavaScript memory for the
current tab. There is no localStorage, IndexedDB or server-side draft storage.
Wi-Fi credentials are transferred only to the device, where `wifi_config.py`
contains plaintext. Remove that file before lending or returning the device.
