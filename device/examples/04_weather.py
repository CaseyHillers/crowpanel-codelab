"""Edit the Wi-Fi settings below for an approved 2.4 GHz network.

An empty password selects the open workshop network (no Wi-Fi password).
MAC registration does not add enterprise 802.1X support; captive portals
are not handled. Do not share this script with private credentials in it.
"""

from crowpanel import CrowPanel
from weather import connect, sync_time, fetch_weather

WIFI_SSID = "Guest-AccessNG"
WIFI_PASSWORD = ""

print("Connecting to Wi-Fi (credentials hidden)...")
station = connect(WIFI_SSID, WIFI_PASSWORD, timeout=15)
print("Wi-Fi connected. Synchronizing the clock...")
sync_time()
print("Fetching Sabre Springs weather over verified HTTPS...")
current = fetch_weather()
panel = CrowPanel(controller="jd79661")
panel.text("Sabre Springs", 8, 8)
panel.text("%.1f F / feels %.1f F" % (
    current["temperature_2m"], current["apparent_temperature"]), 8, 30)
panel.text("Humidity %d%%" % current["relative_humidity_2m"], 8, 48)
panel.text("Wind %.1f mph" % current["wind_speed_10m"], 8, 66)
panel.text(current["time"].replace("T", " "), 8, 86)
panel.text("Weather: Open-Meteo", 8, 106)
panel.show()
print("Weather refresh sequence completed; check the physical display:", current)
