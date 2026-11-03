"""Sabre Springs weather. Edit Wi-Fi settings for an approved 2.4 GHz network.
Empty password = open network. No enterprise 802.1X or captive portals.
Run in RAM in the Weather lesson sets UTC over USB; no NTP needed.
Standalone use needs accurate machine.RTC after power loss, or sync_time()
where NTP is allowed. Keep HTTPS verified; remove secrets before sharing.
"""

from crowpanel import CrowPanel
from weather import connect, fetch_weather

WIFI_SSID = "Guest-AccessNG"
WIFI_PASSWORD = ""

print("Connecting to Wi-Fi (credentials hidden)...")
station = connect(WIFI_SSID, WIFI_PASSWORD, timeout=15)
print("Wi-Fi connected. Using the device clock set before this run; no NTP.")
print("Fetching Sabre Springs weather over verified HTTPS...")
# Allow the same bounded HTTPS budget as the stock ticker, including TLS.
current = fetch_weather(timeout=30)
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
