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


def weather_condition(code):
    """Group Open-Meteo's WMO codes without guessing unknown conditions."""
    if not isinstance(code, int) or isinstance(code, bool):
        return "unknown", "Unknown weather"
    if code == 0:
        return "clear", "Clear"
    if code in (1, 2):
        return "partly_cloudy", "Mostly clear" if code == 1 else "Partly cloudy"
    if code == 3:
        return "cloudy", "Overcast"
    if code in (45, 48):
        return "fog", "Fog"
    if code in (51, 53, 55, 56, 57):
        return "drizzle", "Freezing drizzle" if code in (56, 57) else "Drizzle"
    if code in (61, 63, 65, 66, 67, 80, 81, 82):
        return "rain", "Freezing rain" if code in (66, 67) else "Rain"
    if code in (71, 73, 75, 77, 85, 86):
        return "snow", "Snow"
    if code in (95, 96, 99):
        return "thunder", "Thunderstorm"
    return "unknown", "Unknown weather"


# Five-column, seven-row bitmap digits make the temperature readable at a glance.
_DIGITS = {
    "0": (14, 17, 19, 21, 25, 17, 14),
    "1": (4, 12, 4, 4, 4, 4, 14),
    "2": (14, 17, 1, 2, 4, 8, 31),
    "3": (30, 1, 1, 14, 1, 1, 30),
    "4": (2, 6, 10, 18, 31, 2, 2),
    "5": (31, 16, 16, 30, 1, 1, 30),
    "6": (14, 16, 16, 30, 17, 17, 14),
    "7": (31, 1, 2, 4, 8, 8, 8),
    "8": (14, 17, 17, 14, 17, 17, 14),
    "9": (14, 17, 17, 15, 1, 1, 14),
    "-": (0, 0, 0, 31, 0, 0, 0),
    ".": (0, 0, 0, 0, 0, 12, 12),
    "?": (14, 17, 1, 2, 4, 0, 4),
}


def _large_text(panel, message, x, y, scale=3):
    for character in message:
        for row, bits in enumerate(_DIGITS[character]):
            for column in range(5):
                if bits & (16 >> column):
                    panel.rect(x + column * scale, y + row * scale,
                               scale, scale, 0, fill=True)
        x += 6 * scale


def _line(panel, x, y, end_x, end_y):
    """Draw one bounded integer line through the public pixel API."""
    dx, dy = abs(end_x - x), -abs(end_y - y)
    step_x = 1 if x < end_x else -1
    step_y = 1 if y < end_y else -1
    error = dx + dy
    while True:
        panel.pixel(x, y, 0)
        if x == end_x and y == end_y:
            return
        twice = 2 * error
        if twice >= dy:
            error += dy
            x += step_x
        if twice <= dx:
            error += dx
            y += step_y


def _disk(panel, x, y, radius, color):
    for row in range(-radius, radius + 1):
        half_width = int((radius * radius - row * row) ** 0.5)
        panel.rect(x - half_width, y + row, half_width * 2 + 1, 1,
                   color, fill=True)


def draw_weather_icon(panel, kind, x, y, size=64):
    """Draw a monochrome condition symbol inside the requested square."""
    def point(value):
        return value * (size - 1) // 63

    def line(x0, y0, x1, y1):
        _line(panel, x + point(x0), y + point(y0),
              x + point(x1), y + point(y1))

    def disk(cx, cy, radius, color=0):
        _disk(panel, x + point(cx), y + point(cy),
              max(1, point(radius)), color)

    def box(x0, y0, x1, y1, color=0):
        panel.rect(x + point(x0), y + point(y0),
                   point(x1) - point(x0) + 1, point(y1) - point(y0) + 1,
                   color, fill=True)

    def sun(cx, cy, radius):
        disk(cx, cy, radius)
        disk(cx, cy, radius - 2, 1)
        near, far = radius + 5, radius + 9
        for dx, dy in ((0, 1), (1, 0), (0, -1), (-1, 0)):
            line(cx + dx * near, cy + dy * near,
                 cx + dx * far, cy + dy * far)
        near, far = radius + 1, radius + 5
        for dx, dy in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
            line(cx + dx * near, cy + dy * near,
                 cx + dx * far, cy + dy * far)

    def cloud():
        # Overlapping disks and a base give one continuous cloud outline.
        for cx, cy, radius in ((17, 32, 11), (31, 25, 15), (47, 32, 11)):
            disk(cx, cy, radius)
        box(17, 31, 47, 43)
        for cx, cy, radius in ((17, 32, 9), (31, 25, 13), (47, 32, 9)):
            disk(cx, cy, radius, 1)
        box(17, 32, 47, 41, 1)

    if kind == "clear":
        sun(31, 31, 12)
    elif kind in ("partly_cloudy", "cloudy", "fog", "drizzle", "rain", "snow", "thunder"):
        if kind == "partly_cloudy":
            sun(20, 20, 10)
        cloud()
        if kind == "fog":
            for y0 in (51, 57, 63):
                line(6, y0, 58, y0)
        elif kind in ("drizzle", "rain"):
            for x0 in (18, 34, 50):
                bottom = 55 if kind == "drizzle" else 62
                line(x0, 51, x0 - (1 if kind == "drizzle" else 5), bottom)
                line(x0 + 1, 51, x0 + (0 if kind == "drizzle" else -4), bottom)
        elif kind == "snow":
            for cx, cy in ((16, 56), (33, 57), (51, 55)):
                line(cx - 4, cy, cx + 4, cy)
                line(cx, cy - 4, cx, cy + 4)
                line(cx - 3, cy - 3, cx + 3, cy + 3)
                line(cx - 3, cy + 3, cx + 3, cy - 3)
        elif kind == "thunder":
            for shift in (0, 1, 2):
                line(35 + shift, 47, 26 + shift, 55)
                line(26 + shift, 55, 34 + shift, 55)
                line(34 + shift, 55, 27 + shift, 63)
            line(15, 51, 11, 60)
            line(52, 51, 48, 60)
    else:
        scale = max(1, size // 12)
        _large_text(panel, "?", x + (size - 5 * scale) // 2,
                    y + (size - 7 * scale) // 2, scale)


def render_weather(panel, current):
    """Compose the frame; run() owns the single physical refresh."""
    kind, label = weather_condition(current.get("weather_code"))
    panel.fill(1)
    panel.rect(0, 0, 250, 14, 0, fill=True)
    panel.text("Sabre Springs", 5, 3, 1)
    panel.text("WEATHER", 189, 3, 1)
    draw_weather_icon(panel, kind, 8, 22, size=72)
    panel.rect(95, 22, 1, 73, 0, fill=True)

    temperature = "%.1f" % current["temperature_2m"]
    if len(temperature) <= 7 and all(c in _DIGITS for c in temperature):
        _large_text(panel, temperature, 110, 21)
        panel.text("F", 113 + len(temperature) * 18, 33)
    else:
        # Keep unexpected/extreme numeric values visible without clipping.
        panel.text(("%.4g F" % current["temperature_2m"])[:17], 110, 27)
    panel.text(label, 110, 48)
    panel.text(("Feels %.1fF" % current["apparent_temperature"])[:17], 110, 61)
    panel.text(("Humidity %d%%" % current["relative_humidity_2m"])[:17], 110, 74)
    panel.text(("Wind %.1f mph" % current["wind_speed_10m"])[:17], 110, 87)
    panel.rect(4, 99, 242, 1, 0, fill=True)
    panel.text(current["time"].replace("T", " ")[:19], 4, 103)
    panel.text("Local", 206, 103)
    panel.text("Open-Meteo", 4, 114)
    panel.text("F / mph", 190, 114)


def run():
    print("Connecting to Wi-Fi (credentials hidden)...")
    station = connect(WIFI_SSID, WIFI_PASSWORD, timeout=15)
    print("Wi-Fi connected. Using the device clock set before this run; no NTP.")
    print("Fetching Sabre Springs weather over verified HTTPS...")
    try:
        current = fetch_weather(timeout=30)
    finally:
        # Finish network activity before powering the e-paper display.
        station.active(False)
    print("Wi-Fi off. Drawing weather...")
    panel = CrowPanel(controller="jd79661")
    render_weather(panel, current)
    panel.show()
    print("Weather refresh sequence completed; check the physical display:", current)


if __name__ == "__main__":
    run()
