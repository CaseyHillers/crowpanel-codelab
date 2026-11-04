"""Key-free NASDAQ watchlist startup application.
Edit WATCHLIST, back up the existing main.py, then explicitly save as main.py.

TradingView's public website endpoint has no stability guarantee. Quotes are
last available minute prices, may be delayed, and are not a live trading feed.
"""
import time
import math
import network
import ntptime
from crowpanel import CrowPanel, WHITE
from weather import connect, sync_time, fetch_json
from stocks import format_quote_time

# Setup: NASDAQ ticker symbols, in the order shown by the wheel.
WATCHLIST = ["ARM", "QCOM", "GOOG"]
WIFI_SSID = "Guest-AccessNG"
WIFI_PASSWORD = ""
UPDATE_MS = 15 * 60 * 1000
MIN_REFRESH_MS = 10000
MANUAL_COOLDOWN_MS = 60000
RESYNC_MS = 6 * 60 * 60 * 1000


def validate_watchlist(symbols):
    if not isinstance(symbols, (list, tuple)) or not 1 <= len(symbols) <= 10:
        raise ValueError("Use one to ten NASDAQ symbols")
    result = []
    for symbol in symbols:
        if (not isinstance(symbol, str) or not 1 <= len(symbol) <= 10
                or any(c not in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-" for c in symbol)):
            raise ValueError("Use uppercase NASDAQ ticker symbols")
        if symbol not in result:
            result.append(symbol)
    return result


def fetch_symbol(symbol):
    path = ("/symbol?symbol=NASDAQ%3A" + symbol
            + "&fields=name%2Cclose%7C1%2Ctime%7C1%2Ccurrency"
            + "%2Cupdate_mode%2Cdescription%2Cexchange&no_404=true")
    data = fetch_json("scanner.tradingview.com", path,
                      cafile="stocks_ca.pem", timeout=30)
    if (not isinstance(data, dict) or data.get("name") != symbol
            or data.get("exchange") != "NASDAQ" or data.get("currency") != "USD"):
        raise ValueError("Unexpected quote identity")
    price, stamp = data.get("close|1"), data.get("time|1")
    if (isinstance(price, bool) or not isinstance(price, (int, float))
            or not math.isfinite(price) or price <= 0
            or isinstance(stamp, bool) or not isinstance(stamp, int) or stamp <= 0):
        raise ValueError("Invalid quote values")
    mode = data.get("update_mode")
    if mode not in ("streaming", "delayed_streaming_900"):
        raise ValueError("Unknown quote delay")
    return {"symbol": symbol, "price": price, "currency": "USD",
            "quote_time": stamp, "delay_minutes": 15 if mode != "streaming" else 0,
            "source": "TradingView"}


HISTORY_LIMIT = 32


def remember_quote(history, quote):
    """Retain distinct provider minutes, never retrieval times or invented points."""
    point = (quote["quote_time"], quote["price"])
    if history and point[0] < history[-1][0]:
        raise ValueError("Quote time moved backwards")
    if history and point[0] == history[-1][0]:
        history[-1] = point
    else:
        history.append(point)
        if len(history) > HISTORY_LIMIT:
            del history[:-HISTORY_LIMIT]


def chart_points(history, x, y, width, height):
    """Scale real elapsed provider time and the retained price range."""
    if not history:
        return []
    first, last = history[0][0], history[-1][0]
    low = min(point[1] for point in history)
    high = max(point[1] for point in history)
    return [(x + (int((stamp - first) / (last - first) * (width - 1))
                   if last != first else (width - 1) // 2),
             y + (int((high - price) / (high - low) * (height - 1))
                   if high != low else (height - 1) // 2))
            for stamp, price in history]


def draw_line(panel, start, end):
    """Integer line drawing using only the public pixel API."""
    x, y = start
    end_x, end_y = end
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


def price_label(price):
    label = "%.2f" % price
    return label if len(label) <= 12 else "%.4g" % price


def render_quote(panel, symbol, position, total, entry, checked, failed, pending, history):
    """Compose one frame; the run loop alone owns the physical refresh."""
    panel.fill(WHITE)
    panel.rect(0, 0, 250, 12, 0, fill=True)
    panel.text("%s NASDAQ %d/%d" % (symbol, position, total), 4, 2, WHITE)
    if entry:
        quote, minute = entry
        price = "$" + price_label(quote["price"]) + " USD"
        # A second one-pixel impression gives the price visual weight.
        panel.text(price, 4, 17)
        panel.text(price, 5, 17)
        if len(history) > 1:
            change = (history[-1][1] / history[0][1] - 1) * 100
            label = "%+.1f%% RAM" % change
            if math.isfinite(change) and len(price) * 8 + 8 + len(label) * 8 <= 242:
                panel.text(label, 246 - len(label) * 8, 17)
        points = chart_points(history, 5, 33, 178, 35)
        if points:
            # The border and range labels make auto-scaling explicit.
            panel.rect(3, 31, 182, 39)
            for start, end in zip(points, points[1:]):
                draw_line(panel, start, end)
            end_x, end_y = points[-1]
            panel.rect(end_x - 1, end_y - 1, 3, 3, 0, fill=True)
            high = max(point[1] for point in history)
            low = min(point[1] for point in history)
            for value, y in ((high, 33), (low, 60)):
                label = price_label(value)
                if len(label) > 7:
                    label = "%.0e" % value
                panel.text(label, 190, y)
        if len(history) < 2:
            caption = "Waiting for more quotes"
        elif high == low:
            caption = "%d quotes in RAM | flat" % len(history)
        else:
            caption = "%d quotes in RAM | auto scale" % len(history)
        panel.text(caption, 4, 72)
        delay = "Delay:%dm" % quote["delay_minutes"]
        panel.text("TradingView | " + delay, 4, 83)
        panel.text("Quote " + minute + " UTC", 4, 94)
    else:
        panel.text("Quote unavailable", 4, 22)
        panel.text("Menu: retry after cooldown", 4, 43)
        panel.text("History starts with a quote", 4, 61)
        panel.text("TradingView | delay unknown", 4, 83)
        panel.text("Quote time unavailable", 4, 94)
    status = "Check " + (checked or "--:-- UTC")
    if failed:
        status += " STALE"
    if pending:
        status += " queued"
    panel.text(status, 4, 104)
    panel.text("Wheel:pick Menu:ask Back:exit", 4, 114)


class Controls:
    """Collect edges only; also safe as a display wait callback."""
    def __init__(self, panel):
        self.pins = [panel.up, panel.down, panel.menu, panel.back]
        self.steps = 0
        self.refresh = False
        self.exit = False
        self.baseline()

    def baseline(self):
        self.stable = [pin.value() for pin in self.pins]
        self.candidate = self.stable[:]
        self.since = [time.ticks_ms()] * len(self.pins)
        self.armed = [value == 1 for value in self.stable]

    def poll(self):
        now = time.ticks_ms()
        for i, pin in enumerate(self.pins):
            value = pin.value()
            if value != self.candidate[i]:
                self.candidate[i] = value
                self.since[i] = now
            elif value != self.stable[i] and time.ticks_diff(now, self.since[i]) >= 30:
                self.stable[i] = value
                if value == 1:
                    self.armed[i] = True
                elif self.armed[i]:
                    self.armed[i] = False
                    if i == 0:
                        self.steps -= 1
                    elif i == 1:
                        self.steps += 1
                    elif i == 2:
                        self.refresh = True
                    else:
                        self.exit = True


def run():
    symbols = validate_watchlist(WATCHLIST)
    controls = Controls(CrowPanel(controller="jd79661"))
    quotes, checked, failed = {}, {}, {}
    histories = {symbol: [] for symbol in symbols}
    selected = 0
    pending = True
    last_attempt = last_sync = last_refresh = shown = None
    print("Key-free watchlist:", ", ".join(symbols))
    print("Wheel: select | Menu: refresh all | Back: exit")
    print("15-minute checks; Menu requests coalesce with a 60-second cooldown.")
    print("Quotes may be delayed. Brief presses during network requests may be missed.")
    while True:
        controls.poll()
        if controls.exit:
            print("Ticker stopped.")
            return
        if controls.steps:
            selected = (selected + controls.steps) % len(symbols)
            controls.steps = 0
        if controls.refresh:
            pending = True
            controls.refresh = False
            print("Menu refresh queued.")
        now = time.ticks_ms()
        elapsed = None if last_attempt is None else time.ticks_diff(now, last_attempt)
        due = elapsed is None or elapsed >= UPDATE_MS
        if due or (pending and elapsed >= MANUAL_COOLDOWN_MS):
            pending = False
            last_attempt = now
            phase = "Wi-Fi"
            try:
                connect(WIFI_SSID, WIFI_PASSWORD, timeout=15)
                phase = "UTC sync"
                if last_sync is None or time.ticks_diff(now, last_sync) >= RESYNC_MS:
                    ntptime.host = "pool.ntp.org"
                    sync_time(timeout=5)
                    last_sync = time.ticks_ms()
                for symbol in symbols:
                    controls.poll()
                    if controls.exit:
                        break
                    try:
                        quote = fetch_symbol(symbol)
                        minute = format_quote_time(quote)
                        utc = time.gmtime()
                        remember_quote(histories[symbol], quote)
                        quotes[symbol] = (quote, minute)
                        checked[symbol] = "%02d:%02d UTC" % (utc[3], utc[4])
                        failed[symbol] = False
                        print("QUOTE OK:", symbol, quote["price"], minute,
                              "delay minutes:", quote["delay_minutes"])
                    except (OSError, ValueError):
                        failed[symbol] = True
                        print("Quote failed:", symbol, "(last value retained)")
            except (OSError, ValueError):
                for symbol in symbols:
                    failed[symbol] = True
                print(phase, "failed; quotes retained, automatic retry in 15 minutes.")
            finally:
                network.WLAN(network.STA_IF).active(False)
                # Ignore ambiguous presses/holds spanning a blocking network call.
                controls.baseline()
            print("Network cycle complete; Wi-Fi off.")
            continue
        symbol = symbols[selected]
        entry = quotes.get(symbol)
        history = histories[symbol]
        frame = (symbol, entry, checked.get(symbol), bool(failed.get(symbol)),
                 pending, tuple(history))
        now = time.ticks_ms()
        if frame != shown and (last_refresh is None
                              or time.ticks_diff(now, last_refresh) >= MIN_REFRESH_MS):
            # New public object per refresh: tested workaround for this panel.
            panel = CrowPanel(controller="jd79661")
            render_quote(panel, symbol, selected + 1, len(symbols), entry,
                         checked.get(symbol), failed.get(symbol), pending, history)
            panel.show(on_wait=controls.poll)
            last_refresh = time.ticks_ms()
            shown = frame
            print("DISPLAY:", symbol)
        time.sleep_ms(5)


if __name__ == "__main__":
    try:
        run()
    except KeyboardInterrupt:
        print("Watchlist ticker interrupted.")
