"""Your desk display project. Edit the message or add your own drawing.

Run in RAM first. This makes one slow full refresh; it does not autostart.
Keep passwords and private information out of browser-saved projects.
"""

from crowpanel import CrowPanel, WHITE

panel = CrowPanel(controller="jd79661")
panel.fill(WHITE)
panel.text("My desk display", 8, 16)
panel.text("Make something yours.", 8, 40)
panel.show()
print("Refresh completed. Check your physical display.")
