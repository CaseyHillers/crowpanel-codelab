from crowpanel import CrowPanel
from weather import connect, sync_time, fetch_weather
from wifi_config import SSID, PASSWORD

print("Connecting to Wi-Fi (credentials hidden)...")
station = connect(SSID, PASSWORD)
print("Wi-Fi connected. Synchronizing the clock...")
sync_time()
print("Fetching Sabre Springs weather over verified HTTPS...")
current = fetch_weather()
panel = CrowPanel()
panel.text("Sabre Springs", 8, 8)
panel.text("%.1f F / feels %.1f F" % (
    current["temperature_2m"], current["apparent_temperature"]), 8, 30)
panel.text("Humidity %d%%" % current["relative_humidity_2m"], 8, 48)
panel.text("Wind %.1f mph" % current["wind_speed_10m"], 8, 66)
panel.text(current["time"].replace("T", " "), 8, 86)
panel.text("Weather: Open-Meteo", 8, 106)
panel.show()
print("Weather refreshed:", current)
