from machine import Pin
from time import sleep_ms, ticks_diff, ticks_ms


RUN_MS = 60_000
DEBOUNCE_MS = 25
POLL_MS = 5
CONTROLS = (("Up", 6), ("Down", 4), ("Press", 5), ("Menu", 2), ("Back", 1))


def run(duration_ms=RUN_MS):
    print("Input diagnostic: no display, SPI, or display power is used.")
    print("Test Up (GPIO6), Down (GPIO4), Press (GPIO5), Menu (GPIO2), Back (GPIO1).")
    print("Press and release each control; try holding and simultaneous presses.")
    print("BOOT and RESET are not part of this ordinary input test; leave them alone.")
    print("Active-low inputs: 0 = pressed, 1 = released (internal pull-ups).")
    print("Runs for %g seconds; Ctrl-C/browser Stop can interrupt." % (duration_ms / 1000))
    print("Initial readings are baselines, not debounced edges or counted presses.")
    controls = []
    for name, number in CONTROLS:
        pin = Pin(number, Pin.IN, Pin.PULL_UP)
        initial = pin.value()
        controls.append({
            "name": name, "pin": pin, "stable": initial, "candidate": initial,
            "changed_at": ticks_ms(), "presses": 0, "releases": 0,
        })
        print("Initial %s: %s (raw=%d)" % (
            name, "PRESSED" if initial == 0 else "RELEASED", initial,
        ))

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
                edge = "presses" if reading == 0 else "releases"
                control[edge] += 1
                print("%s: %s" % (
                    control["name"], "PRESSED" if reading == 0 else "RELEASED",
                ))
        sleep_ms(POLL_MS)

    print("Finished. Debounced edge counts (initial states excluded):")
    for control in controls:
        print("%s: presses=%d releases=%d" % (
            control["name"], control["presses"], control["releases"],
        ))
    print("Counts are observations, not a hardware PASS; check every control yourself.")


if __name__ == "__main__":
    run()
