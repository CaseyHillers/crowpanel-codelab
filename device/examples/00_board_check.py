from machine import Pin
from time import sleep_ms, ticks_diff, ticks_ms

from crowpanel import CrowPanel


RUN_MS = 60_000
DEBOUNCE_MS = 30
POLL_MS = 5
CONTROLS = (("Up", 6), ("Down", 4), ("Press", 5), ("Menu", 2), ("Back", 1))


def show_screen(panel, lines):
    panel.fill()
    for index, line in enumerate(lines):
        panel.text(line, 0, index * 14)
    panel.show()


def show_celebration(panel):
    panel.fill()
    for horizontal, vertical in ((14, 10), (78, 18), (149, 8), (224, 16),
                                 (24, 98), (91, 105), (161, 98), (226, 104)):
        for offset in range(7):
            panel.pixel(horizontal + offset, vertical + offset, panel.BLACK)
            panel.pixel(horizontal + 12 - offset, vertical + offset, panel.BLACK)
    for horizontal, vertical in ((44, 16), (115, 10), (190, 22),
                                 (55, 108), (124, 100), (195, 110)):
        panel.rect(horizontal, vertical, 8, 4, panel.BLACK, fill=True)
    panel.text("LET'S CELEBRATE!", 65, 44)
    panel.text("5 press+release cycles", 41, 60)
    panel.text("Confirm by sight.", 57, 76)
    panel.show()


def run(duration_ms=RUN_MS):
    power_led = Pin(19, Pin.OUT, value=1)
    print("Board check: press and release Up, Down, Press, Menu, and Back.")
    print("Use the Up/Down/Press control and the Menu and Back buttons.")
    print("Each stable press is counted once; holding does not repeat.")
    print("Initially held controls must be released before a new press counts.")
    print("Runs for up to %g seconds, or until all five are pressed and released." % (
        duration_ms / 1000,
    ))
    print("Ctrl-C/browser Stop interrupts. Watch the console for input events.")
    panel = None
    try:
        panel = CrowPanel(controller="jd79661")
        show_screen(panel, (
            "BOARD CHECK",
            "Press and release",
            "Up / Down / Press",
            "Menu / Back",
            "Watch console for events.",
            "Hold does not repeat.",
            "Ctrl-C / Stop to stop.",
        ))
    except OSError as error:
        print("Display unavailable; continue the console input test:", error)
        panel = None

    controls = []
    for name, number in CONTROLS:
        pin = Pin(number, Pin.IN, Pin.PULL_UP)
        initial = pin.value()
        controls.append({
            "name": name, "pin": pin, "stable": initial, "candidate": initial,
            "changed_at": ticks_ms(), "presses": 0, "completed": False,
        })

    started_at = ticks_ms()
    while ticks_diff(ticks_ms(), started_at) < duration_ms:
        now = ticks_ms()
        for control in controls:
            reading = control["pin"].value()
            if reading != control["candidate"]:
                control["candidate"] = reading
                control["changed_at"] = now
            elif reading != control["stable"] and ticks_diff(
                now, control["changed_at"]
            ) >= DEBOUNCE_MS:
                control["stable"] = reading
                if reading == 0:
                    control["presses"] += 1
                    print("INPUT %s PRESSED" % control["name"])
                else:
                    if control["presses"] > 0:
                        control["completed"] = True
                    print("INPUT %s RELEASED" % control["name"])
        if all(control["completed"] for control in controls):
            break
        remaining_ms = duration_ms - ticks_diff(ticks_ms(), started_at)
        if remaining_ms > 0:
            sleep_ms(min(POLL_MS, remaining_ms))

    counts = {control["name"]: control["presses"] for control in controls}
    print("END: observed stable press counts")
    for name, _ in CONTROLS:
        print("%s: observed presses=%d" % (name, counts[name]))
    print("These are observations only, not a hardware PASS. Check each control yourself.")
    if panel is not None:
        try:
            if all(control["completed"] for control in controls):
                show_celebration(panel)
                print("DISPLAY CELEBRATION SHOWN")
                print("Please confirm the celebration by sight; refresh is not physical display verification.")
            else:
                show_screen(panel, ["END"] + [
                    "%s: %d" % (name, counts[name]) for name, _ in CONTROLS
                ] + ["Observed counts only."])
        except OSError as error:
            print("Display summary unavailable; use the console counts:", error)
    return counts


if __name__ == "__main__":
    run()
