# 2. Key-free CrowPanel stock watchlist

Target: CrowPanel 2.13 ESP32-S3, JD79661, landscape 250x122. These are two complete application entry files with identical behavior; use one deployment mode at a time.

## Included files

- `ram/04_stocks.py`: paste the entire file into the workshop editor and select **Run in RAM**. No file writes, autostart installation or firmware changes. An existing startup file is left intact and can resume on a later boot.
- `startup/main.py`: paste the entire file into the workshop editor and explicitly select **Save as main.py** after backing up the previous main.py. Saving replaces the startup application; it need not run immediately. Use Run in RAM to preview, or perform an intentional power cycle when ready to test cold startup. This source does not copy or install itself.
- `tests/check_watchlist.py`: offline CPython simulation; no board, network or credentials required. CPython is for the optional maintainer test only, never for running the application itself.
- `VALIDATION.md`: observed hardware evidence, remaining checks and display workaround.

## Existing workshop dependencies

The board must already have MicroPython, `crowpanel.py`, `weather.py`, `stocks.py`, and `stocks_ca.pem` from the workshop. Firmware supplies `time`, `math`, `network` and `ntptime`. No new Python packages, compiler or firmware installation is required for this application.

Required verified interfaces:

```python
from crowpanel import CrowPanel, WHITE
from weather import connect, sync_time, fetch_json
from stocks import format_quote_time
connect(ssid, password, timeout=15)
sync_time(timeout=5)
fetch_json(host, path, cafile="stocks_ca.pem", timeout=30)
format_quote_time(quote)
CrowPanel(controller="jd79661").show(on_wait=callback)
```

The installed driver supported `show(on_wait=...)`. For an older workshop library, use the workshop's Board check -> advanced install -> reinstall latest workshop libraries, with explicit learner approval; do not reflash as a ticker setup step. This package contains application changes, not replacement copies of the workshop's driver, HTTPS helper or trust certificate.

## Setup

Edit `WATCHLIST` near the top before running/saving. Default: `["ARM", "QCOM", "GOOG"]`. Supports one to ten uppercase NASDAQ symbols (letters, digits, dot and hyphen); duplicate entries are removed. Schema/identity failures are reported per symbol. Other exchanges and currencies are not supported. This is source-based configuration, not an on-device text-entry wizard. In startup mode, configuration persists in main.py; quotes and selection are held only in RAM.

Public workshop Wi-Fi defaults are `Guest-AccessNG` with an empty password. Obtain required station registration through the updated MAC-registration link and IT policy. Do not paste private network secrets into this source; for a private network, use an existing device-local `wifi_config` module and change the imports/call accordingly. Never commit that private module.

## Behavior

- Fetch all symbols on start and every 15 minutes from the previous request-cycle start.
- Up/down wheel inputs select cached quotes, wrapping around the watchlist.
- Menu requests all symbols again; requests coalesce with a 60-second cooldown between cycle starts. Menu restarts the automatic schedule.
- Back exits; the workshop Stop button/Ctrl-C interrupts execution.
- Independently debounce active-low inputs for 30 ms; held inputs need release before another press. Rollover-safe ticks and 5 ms polling.
- Display provider quote UTC minute, checked UTC minute, USD price, source, reported delay and failed-check status. Retain the last successful value independently for each symbol; mark it stale after failure.
- Run NTP before the first quote request and resync on a fetch cycle at least six hours later. Failed NTP does not bypass clock/certificate verification. Guest networking must allow NTP and the verified HTTPS endpoint.
- Finish network work and disable Wi-Fi before display refresh. Use a fresh public CrowPanel object for every refresh, with at least ten seconds after the previous completed refresh. Coalesce screen changes; no partial/fast refresh.
- The wait callback only collects input edges; it never draws. Brief presses during blocking Wi-Fi/NTP/HTTPS calls can be missed. Back may wait for an in-flight request to return.

## Data source and limitations

Uses the existing key-free TradingView public website endpoint on `scanner.tradingview.com`, a verified `stocks_ca.pem` connection and strict response identity/value/delay checks. No key, account, paid plan or cloud service is introduced. Website endpoints have no stability guarantee; Casey should review provider terms and traffic expectations before workshop-wide distribution.

ARM, QCOM and GOOG each reported **15-minute-delayed** minute quotes during testing. Refreshing on Menu does not remove the provider delay. The display does not promise live prices. Only `streaming` and `delayed_streaming_900` modes are accepted; other schemas/modes fail safely. Older market-close quotes can remain unchanged even after a successful check; the quote timestamp is shown separately from the check time.

## Maintainer validation

From this directory, using an existing desktop Python installation:

```text
python tests/check_watchlist.py ram/04_stocks.py
python tests/check_watchlist.py startup/main.py
```

These simulate the scheduler, debounce, navigation, request coalescing, outage retention and display constraints. See VALIDATION.md for physical observations and remaining acceptance checks. Neither test writes to a board.

## Integration suggestions

Integrate the RAM file as a workshop sample and provide the startup file as an explicitly opt-in standalone variant. Keep public helper contracts and the workshop CA verification unchanged. Consider moving the local `fetch_symbol` function into a backwards-compatible public stocks helper in a separate reviewed change; do not invent a symbol argument on the existing ARM-only `fetch_quote` function.
