import network
from crowpanel import CrowPanel

station = network.WLAN(network.STA_IF)
station.active(True)
address = ":".join("%02X" % octet for octet in station.config("mac"))
print("Wi-Fi station MAC:", address)
panel = CrowPanel()
panel.text("Wi-Fi station MAC", 8, 20)
panel.text(address, 8, 48)
panel.text("Register this address", 8, 80)
panel.show()
