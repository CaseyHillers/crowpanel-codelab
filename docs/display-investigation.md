# Display investigation: comparison with a working workshop

## Evidence and updates through October 28, 2026

### Snake refresh scheduling (October 28, 2026)

Snake starts automatic movement with Press and uses a square grid. Up turns
counterclockwise -1 (12→9→6→3); Down clockwise +1 (12→3→6→9). Movement is one
cell per frame, with at most one successful 90-degree steering turn per movement
frame; extra turns queue for following frames. Previously, queued turns could
combine before a move, causing a double turn or reversal. This is reproduced in
tests; the reported physical two-cell jump has not been verified on hardware.
The loop now
defers extra steering while processing Back/Menu/Press immediately; Menu clears
deferred turns. The rapid-two-turn regression checks one-cell frames without
neck reversal. It requests one frame per
scheduled move, without separate refreshes for steering. The driver accepts an
optional `show(on_wait=...)` callback so the game can collect debounced input
while initialization, throttling and BUSY waits run. This does not change the
controller commands, waveform, two-second minimum refresh interval, BUSY
verification or power cleanup. Physical full-refresh time can exceed the game’s
default `STEP_MS = 5000`; missed time never produces catch-up movement bursts.
That 5-second stable viewing interval starts **after** each refresh completes, allowing a stable image
and input polling before the next move. Previously, counting refresh time toward
the interval allowed a slow frame to be followed almost immediately by another
refresh, which could look like continuous black/white flashing. This scheduling
bug is reproduced with a simulated slow refresh; the reported physical striped
screen has not been reproduced on hardware. No waveform changes were made.
The smaller 8×8 (~82px) grid starts food one step ahead of the snake, then uses
nearest-center free cells. Game over shows `Press: replay`; Press restarts and
starts again, while Menu still resets to ready.
The session now lasts five minutes (previously 120 seconds); there is no
20-second cutoff. Running straight into a wall stops movement but keeps inputs
active, which must not be mistaken for a hardware freeze. A simulated replay
after 25 seconds and a full five-minute idle session verify this lifecycle.
The session limit and errors now print explicit recovery instructions
in the serial console. After expiry, buttons no longer control the stopped
program: click Run in RAM again.
Replay polling also preserves Press events collected after Menu during a refresh.
Menu clears stale queued inputs, and a full steering queue cannot exclude start
or reset; Back still takes priority. Regression tests cover held and released
Press cycles, queue saturation, and replay after collision.

Snake checks the driver's `SUPPORTS_WAIT_CALLBACK` capability before passing
`on_wait`. Older installed drivers use plain `show()` instead of failing with
an unexpected-keyword TypeError. The console explains that inputs during refresh
are unavailable and directs participants to **Board check → Advanced install**
to update the workshop libraries, without reflashing firmware. Driver exceptions
still propagate; a failed physical refresh is never retried as a compatibility
fallback.

The pinned V1.2 `EPD_Init.cpp` below includes a `lut_DU()` loader with tables
labelled “DU 300ms”, but its display-image function calls GC instead. Its
`EPD_PartUpdate()` and `EPD_Update_Fast()` still use SSD1680-style update
commands, not the JD79661 `0x17, 0xA5` update. Those names and the “300ms” comment
are not a validated fast JD79661 workflow. Do not silently replace GC, remove
the refresh interval or borrow another controller’s partial-update commands.
DU old/new-image handling, cadence, ghosting and actual speed need a separate
explicit hardware experiment before becoming a workshop default.

### Replacement-board evidence

The user confirmed the replacement board works with its factory firmware.
After a verified full-flash backup and MicroPython installation, the production
JD79661 Hello World refresh completed, and the user confirmed visible but
mirrored text. The driver now maps JD79661 landscape x to ascending native
rows, leaving the existing SSD1680 mapping unchanged. An asymmetric-pixel
regression checks the transmitted image; the user subsequently confirmed the
corrected display looks good. The original board observations below are separate.

### Original board

The user reports successfully testing all five application controls with the
display-independent input lesson. This verifies those controls by user
observation, not the display or every component on the board.

The user's display has not visibly refreshed with our MicroPython driver, the
restored original firmware, or Elecrow's published V1.2 factory package. The
factory-package checksum matched before boot; UART reached an application
wakeup message. This does not establish that factory display initialization
completed, and it does not prove a hardware defect.

The user supplied `CrowPanel-Workshop-Source-2026-10-27.zip` from a coworker with
a working display. Archive SHA-256:
`a12c78a73fc41f58d3c0cee026c8750877822f0e9766cf7f0422e782582aca8f`.
It contains Arduino/PlatformIO source, not a prebuilt working firmware image.
We inspected the source without running its companion services or build hooks,
and without copying the supplied project into this repository.

## What matches

All seven files in the supplied `firmware/lib/ElecrowEPD/` driver/font set match
Elecrow's `example/arduino-v1.2/main/` byte for byte at vendor commit
`11291e3e9a868be8943232b065f3e264dfaeeae3`. Its executable BUSY loop waits while
GPIO9 is low; a contradictory comment must not be used to reverse polarity.

Our JD79661 preset has the same 12 initialization command/payload pairs and
five 56-byte GC waveform tables. Display pins and hardware reset timings also
match. This is evidence of protocol agreement, not proof of electrical behavior.

Vendor source:
https://github.com/Elecrow-RD/CrowPanel-ESP32-2.13-E-paper-HMI-Display-with-122-250/tree/11291e3e9a868be8943232b065f3e264dfaeeae3/example/arduino-v1.2/main

## Differences recorded before the replacement-board test

| Area | Supplied working-workshop source | Current MicroPython driver |
| --- | --- | --- |
| Refresh sequence | Init, clear OLD and NEW RAM, refresh white, write image, refresh image, sleep | Init, write NEW RAM/image, refresh once, sleep |
| Clear data | `0x10` and `0x13`, each 4,000 bytes of `0xff` | No explicit OLD RAM clear |
| First image LUT phase | Alternate R22/R23 assignment after the clear cycle | Normal assignment on first image |
| Transport | Software SPI, MSB first, CS released after every byte | 4 MHz hardware SPI, CS held across a payload |
| Power lifecycle | GPIO7 high before initialization and retained after sleep | GPIO7 cut low after sleep and on error |
| BUSY verification | Waits only while BUSY is low; may return immediately if always high | Requires low assertion within one second, then high completion within 15 seconds |
| Native bitmap position | Vendor `USE_HORIZONTIAL=2`: native row `249 - x` | Original mapping: native row `249 - x`; replacement-board correction uses row `x` for JD79661 |

The clear/refresh cycle and LUT phase are a concrete software difference worth
testing. Framing and power behavior also differ. None is yet established as the
cause of the blank screen. The native column reversal changes image orientation;
it does not account for an absent BUSY assertion. The one-second assertion limit
is our diagnostic choice, not a timing guarantee demonstrated by the vendor.

## Controlled next test

Use a standalone RAM-only diagnostic that bypasses our canvas and replays the
supplied startup sequence with a fixed mixed black/white bitmap. First use our
hardware SPI transport. If that does not produce a refresh, explicitly select
the vendor's per-byte software transport for a separate run. Never automatically
switch controllers or transports after a timeout.

The prepared diagnostic is `device/diagnostics/jd79661_reference.py`; it imports
neither the production display driver nor the coworker's application. With the
browser disconnected, run the hardware-SPI comparison from the repository root:

```sh
.venv/bin/mpremote connect /dev/cu.wchusbserial21410 run device/diagnostics/jd79661_reference.py
```

For a separate software-SPI comparison, load the file under a non-main namespace
so its default entry point does not run, then select `run(transport="bitbang")`.
Each refresh has separate 15-second assertion and completion deadlines. Successful
completion deliberately leaves GPIO7 high after sleep to match the reference;
errors or interruption cut GPIO7 low.

Require bounded assertion and completion observations for each refresh, report
them separately, and ask the user to check the physical panel. A permanently
idle BUSY pin is not success. Stop on a failed refresh, and disable panel power
on errors or interruption. On successful sleep, retain power as the supplied
workshop does so that the comparison tests that lifecycle too.

Do not reflash firmware or write an autostart program for this comparison. The
browser must release its serial connection before a terminal diagnostic can run.
Further isolation, if needed, is to run the same reference on the coworker's
board or obtain the exact known-working offline binary with confirmation before
flashing. Neither test has been performed yet.

## Reference-sequence runs on the user's board

After the user disconnected Edge on October 27, 2026, both reference modes were
run in RAM without flashing or installing an autostart program:

- Hardware SPI: the first (white clear) refresh did not assert BUSY within
  15 seconds. The diagnostic stopped before drawing the pattern and cut GPIO7
  low. Output is saved privately in `.backups/reference-hardware-20261027.log`.
- Per-byte bit-banged SPI: the diagnostic observed BUSY assertion and release
  for both the clear and pattern refreshes, then sent sleep and retained GPIO7
  high to match the reference. Each reported assertion/completion wait rounded
  to 0 ms; this is not a measured full refresh duration or proof of visible
  output. Output is saved privately in `.backups/reference-bitbang-20261027.log`.

The user reports that the first software-SPI run produced no visible image.
Software transport/timing remains a candidate; do not
promote the diagnostic into the production driver or declare the panel working
solely from these pin observations. Repeated controlled tests would be needed
to attribute a visible difference to a particular change.

At the user's request, the software-SPI pattern was repeated directly in RAM
without a remote-filesystem mount. This repeat waited for idle before each
refresh, avoided console prints between BUSY assertion/completion observations,
and waited ten seconds after each before issuing the next command. It left
MicroPython and device files unchanged. Both pre-refresh BUSY readings were 1.
Assertion was observed 330 us and 313 us after command start respectively; each
subsequent observed-low interval was 21 us. These very short observations are
not evidence of a full physical refresh or measurements of the complete pulse.
The diagnostic then slept and retained GPIO7 high, without an autostart program.
The user confirms that the repeated pattern also left the screen completely
blank. No display success has been observed with either transport. Output is saved privately in
`.backups/reference-repeat-20261027.log`; the host-only runner is
`.backups/repeat_reference.py`.

## Remaining decisive comparison

Do not keep changing LUTs or interpreting short BUSY observations as a repair.
The strongest remaining software/hardware discriminator is the exact same
known-working offline firmware binary tested on both physical boards, with
backups and explicit permission before any flash. The supplied ZIP contains
source only; we have not run that exact compiled application on this board.
If the identical binary visibly works on the coworker's board but not this
one, panel variant compatibility or the display hardware/power path becomes
the primary follow-up with Elecrow. That still does not identify a particular
failed component without further evidence.
