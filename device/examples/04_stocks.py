"""Show the last available ARM minute quote, not a live trading display.

Edit these Wi-Fi settings for an approved 2.4 GHz Personal/open network.
An empty password selects the workshop's open network. MAC registration does
not add enterprise 802.1X or captive-portal support. Remove private credentials
before sharing this file. Run in RAM in the Stocks lesson sets UTC over USB;
standalone use needs an accurate RTC set separately after loss of power.
"""

from crowpanel import CrowPanel
from stocks import connect, fetch_quote, format_quote_time

WIFI_SSID = "Guest-AccessNG"
WIFI_PASSWORD = ""

print("Connecting to Wi-Fi (credentials hidden)...")
station = connect(WIFI_SSID, WIFI_PASSWORD, timeout=15)
print("Fetching ARM quote over verified HTTPS; no NTP...")
quote = fetch_quote()
quote_minute = format_quote_time(quote)

panel = CrowPanel(controller="jd79661")
panel.text("ARM / NASDAQ", 8, 8)
panel.text("$%.2f USD" % quote["price"], 8, 28)
panel.text("%d min delayed" % quote["delay_minutes"]
           if quote["delay_minutes"] else "Last available quote", 8, 48)
panel.text("Quote minute UTC:", 8, 66)
panel.text(quote_minute, 8, 84)
panel.text("Source: TradingView", 8, 104)
panel.show()
print("ARM quote drawn; check the physical display:", quote)
print("Quote minute UTC:", quote_minute, "Run again for another quote.")
