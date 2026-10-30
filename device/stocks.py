"""One verified HTTPS quote for NASDAQ:ARM from TradingView's public endpoint.

This website endpoint has no stability guarantee. Never invent a quote or
retry indefinitely when the source rejects a request or changes its schema.
"""

import math
import time
from weather import connect, fetch_json

_HOST = "scanner.tradingview.com"
_PATH = (
    "/symbol?symbol=NASDAQ%3AARM&fields=close%7C1%2Ctime%7C1%2Ccurrency"
    "%2Cupdate_mode%2Cdescription%2Cexchange&no_404=true"
)


def fetch_quote(timeout=10):
    """Return a last-available minute quote; quote_time is Unix UTC seconds."""
    data = fetch_json(_HOST, _PATH, cafile="stocks_ca.pem", timeout=timeout)
    if (not isinstance(data, dict) or data.get("exchange") != "NASDAQ"
            or data.get("description") != "ARM Holdings PLC Sponsored ADR"
            or data.get("currency") != "USD"):
        raise ValueError("stock response does not identify NASDAQ ARM in USD")
    price = data.get("close|1")
    timestamp = data.get("time|1")
    mode = data.get("update_mode")
    if (isinstance(price, bool) or not isinstance(price, (int, float))
            or not math.isfinite(price) or price <= 0
            or isinstance(timestamp, bool) or not isinstance(timestamp, int)
            or timestamp <= 0):
        raise ValueError("stock response has an invalid price or quote time")
    if mode not in ("delayed_streaming_900", "streaming"):
        raise ValueError("stock response has an unsupported delay mode")
    return {
        "symbol": "ARM", "price": price, "currency": "USD",
        "quote_time": timestamp,
        "delay_minutes": 15 if mode == "delayed_streaming_900" else 0,
        "source": "TradingView",
    }


def format_quote_time(quote):
    """Format the provider's minute timestamp in UTC on 1970/2000-epoch ports."""
    epoch = time.gmtime(0)[0]
    if epoch not in (1970, 2000):
        raise ValueError("unsupported device epoch for stock quote time")
    seconds = quote["quote_time"] - (946684800 if epoch == 2000 else 0)
    utc = time.gmtime(seconds)
    return "%04d-%02d-%02d %02d:%02d" % utc[:5]
