"""Offline behavior simulation: no board, network, or credentials."""
import sys
import types
import runpy

clock = [0]
wifi = [False]
fetches, displays = [], []
# Initial held Menu must be ignored. Navigation includes a rejected bounce.
events = {"menu": [(0, 0), (100, 1), (200, 0), (250, 1),
                   (400, 0), (450, 1)],
          "down": [(0, 1), (500, 0), (510, 1), (600, 0), (650, 1),
                   (970000, 0), (970050, 1), (980000, 0), (980050, 1)],
          "up": [(0, 1)], "back": [(0, 1)]}

def pin_value(name):
    value = 1
    for at, level in events[name]:
        if at <= clock[0]:
            value = level
    return value

def sleep(ms):
    clock[0] += ms
    if clock[0] > 990100:
        raise KeyboardInterrupt

class Panel:
    def __init__(self, **kw):
        self.used = False
        self.lines = []
        for name in events:
            setattr(self, name, types.SimpleNamespace(value=lambda n=name: pin_value(n)))
    def fill(self, *args):
        pass
    def text(self, line, x, y, color=0):
        assert 0 <= x and x + len(line) * 8 <= 250, line
        assert 0 <= y and y + 8 <= 122, line
        self.lines.append(line)
    def rect(self, x, y, width, height, color=0, fill=False):
        assert 0 <= x and 0 <= y and width > 0 and height > 0
        assert x + width <= 250 and y + height <= 122
    def pixel(self, x, y, color=0):
        assert isinstance(x, int) and isinstance(y, int)
        assert 0 <= x < 250 and 0 <= y < 122
    def show(self, on_wait):
        assert not self.used and not wifi[0]
        self.used = True
        displays.append((clock[0], self.lines[:]))
        on_wait()

def fetch(host, path, cafile, timeout):
    assert host == "scanner.tradingview.com" and cafile == "stocks_ca.pem"
    symbol = path.split("NASDAQ%3A")[1].split("&")[0]
    fetches.append((clock[0], symbol))
    if clock[0] >= 960000 and symbol == "QCOM":
        raise OSError("simulated outage")
    # The manual check corrects the same provider minute, so it must not add
    # a point. The next automatic check advances ARM but regresses GOOG.
    stamp = 1793653140
    if clock[0] >= 960000:
        stamp += 900 if symbol == "ARM" else -60
    return {"name": symbol, "exchange": "NASDAQ", "currency": "USD",
            "close|1": 123.45 if clock[0] == 0 else 125.50, "time|1": stamp,
            "update_mode": "delayed_streaming_900"}

sys.modules["time"] = types.SimpleNamespace(ticks_ms=lambda: clock[0],
    ticks_diff=lambda a,b: (a-b+2**29) % 2**30-2**29,
    sleep_ms=sleep, gmtime=lambda: (2026,11,2,22,0,0,0,306))
sys.modules["crowpanel"] = types.SimpleNamespace(CrowPanel=Panel, WHITE=1)
sys.modules["network"] = types.SimpleNamespace(STA_IF=0,
    WLAN=lambda _: types.SimpleNamespace(active=lambda v: wifi.__setitem__(0,v)))
sys.modules["ntptime"] = types.SimpleNamespace()
sys.modules["weather"] = types.SimpleNamespace(fetch_json=fetch,
    connect=lambda *a,**k: wifi.__setitem__(0,True), sync_time=lambda **k: None)
sys.modules["stocks"] = types.SimpleNamespace(format_quote_time=lambda q: "2026-11-02 20:59")
from pathlib import Path
source = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / "ram" / "04_stocks.py"
runpy.run_path(str(source), run_name="__main__")
assert fetches == [(t,s) for t in (0,60000,960000) for s in ("ARM","QCOM","GOOG")], fetches
assert any(lines[0].startswith("QCOM") for _,lines in displays), displays
assert any("STALE" in line for _,lines in displays for line in lines), displays
# Corrections replace the first point; only a genuinely newer minute adds one.
assert any(lines[0].startswith("ARM") and "$125.50 USD" in lines
           and any("2 quotes in RAM" in line for line in lines)
           for _, lines in displays), displays
assert any(lines[0].startswith("GOOG") and any("STALE" in line for line in lines)
           and any("Waiting for more" in line for line in lines)
           for _, lines in displays), displays
assert all(b[0]-a[0]>=10000 for a,b in zip(displays,displays[1:]))
print("PASS: held-button baseline, debounce, navigation, coalesced Menu requests,")
print("60-second cooldown, 15-minute schedule, stale cache, fresh panels and Wi-Fi off.")
print("PASS: same-minute corrections, distinct-minute history, rejected older quotes and canvas bounds.")
