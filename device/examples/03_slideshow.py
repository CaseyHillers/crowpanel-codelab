import time
from crowpanel import CrowPanel, WHITE
from slides import SLIDES, WIDTH, HEIGHT, STRIDE

panel = CrowPanel(controller="jd79661")
index = 0
previous = (1, 1)
changed = True
print("Use UP/DOWN to change images. Stop in the browser to exit.")
while True:
    if changed:
        name, bitmap = SLIDES[index]
        panel.fill(WHITE)
        panel.image(bitmap, WIDTH, HEIGHT, stride=STRIDE)
        panel.text("%d/%d %s" % (index + 1, len(SLIDES), name), 4, 110)
        panel.show()
        print("Slide:", name)
        changed = False
    current = (panel.up.value(), panel.down.value())
    if current != previous:
        time.sleep_ms(40)
        stable = (panel.up.value(), panel.down.value())
        if stable == current:
            if previous[0] and not current[0]:
                index = (index - 1) % len(SLIDES)
                changed = True
            elif previous[1] and not current[1]:
                index = (index + 1) % len(SLIDES)
                changed = True
            previous = current
    time.sleep_ms(20)
