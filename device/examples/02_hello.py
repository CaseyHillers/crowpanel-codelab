from crowpanel import CrowPanel, BLACK

message = "Hello, world!"
panel = CrowPanel(controller="jd79661")
panel.rect(0, 0, 250, 122, BLACK)
panel.text(message, 16, 40)
panel.text("Made with MicroPython", 16, 64)
panel.show()
print("Refresh sequence completed; check the physical display:", message)
