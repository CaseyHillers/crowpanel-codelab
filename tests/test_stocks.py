import importlib.util
import math
from pathlib import Path
import runpy
import time
import types
import unittest
from unittest.mock import Mock, call, patch


ROOT = Path(__file__).resolve().parents[1]
HOST = "scanner.tradingview.com"
PATH = (
    "/symbol?symbol=NASDAQ%3AARM&fields=close%7C1%2Ctime%7C1%2Ccurrency"
    "%2Cupdate_mode%2Cdescription%2Cexchange&no_404=true"
)


class StocksTests(unittest.TestCase):
    def setUp(self):
        self.payload = {
            "close|1": 205.91,
            "currency": "USD",
            "description": "ARM Holdings PLC Sponsored ADR",
            "exchange": "NASDAQ",
            "time|1": 1793390340,
            "update_mode": "delayed_streaming_900",
        }
        self.fetch_json = Mock(side_effect=lambda *args, **kwargs: self.payload.copy())
        self.connect = Mock()
        self.time = types.SimpleNamespace(gmtime=time.gmtime)
        spec = importlib.util.spec_from_file_location("stocks_under_test", ROOT / "device/stocks.py")
        self.stocks = importlib.util.module_from_spec(spec)
        with patch.dict("sys.modules", {
            "weather": types.SimpleNamespace(connect=self.connect, fetch_json=self.fetch_json),
            "time": self.time,
        }):
            spec.loader.exec_module(self.stocks)

    def test_delayed_arm_quote_uses_verified_bounded_request_and_preserves_quote_time(self):
        result = self.stocks.fetch_quote(timeout=3)
        self.fetch_json.assert_called_once_with(HOST, PATH, cafile="stocks_ca.pem", timeout=3)
        self.assertEqual(result, {
            "symbol": "ARM", "price": 205.91, "currency": "USD",
            "quote_time": 1793390340, "delay_minutes": 15, "source": "TradingView",
        })
        self.assertIs(self.stocks.connect, self.connect)

    def test_streaming_quote_is_labeled_with_zero_delay(self):
        self.payload["update_mode"] = "streaming"
        self.assertEqual(self.stocks.fetch_quote()["delay_minutes"], 0)
        self.fetch_json.assert_called_once_with(HOST, PATH, cafile="stocks_ca.pem", timeout=10)

    def test_old_timestamp_is_preserved_without_claiming_current_price(self):
        self.payload["time|1"] = 1700000000
        self.assertEqual(self.stocks.fetch_quote()["quote_time"], 1700000000)

    def test_unexpected_security_currency_or_delay_is_rejected(self):
        cases = {
            "exchange": ["NYSE", "", None],
            "description": ["ARM", "Another company", "", None],
            "currency": ["GBP", "usd", "", None],
            "update_mode": ["delayed_streaming_600", "endofday", "", None],
        }
        for field, values in cases.items():
            original = self.payload[field]
            for value in values:
                with self.subTest(field=field, value=value):
                    self.payload[field] = value
                    with self.assertRaises(ValueError):
                        self.stocks.fetch_quote()
            self.payload[field] = original

    def test_invalid_prices_are_not_displayable_quotes(self):
        for price in [None, True, False, "205.91", 0, -1, math.nan, math.inf, -math.inf]:
            with self.subTest(price=price):
                self.payload["close|1"] = price
                with self.assertRaises(ValueError):
                    self.stocks.fetch_quote()

    def test_invalid_quote_timestamps_are_rejected(self):
        for timestamp in [None, True, False, "1793390340", 1793390340.0, 0, -1]:
            with self.subTest(timestamp=timestamp):
                self.payload["time|1"] = timestamp
                with self.assertRaises(ValueError):
                    self.stocks.fetch_quote()

    def test_missing_or_non_object_response_fails_closed(self):
        original = self.payload.copy()
        for field in original:
            with self.subTest(missing=field):
                self.payload = {key: value for key, value in original.items() if key != field}
                with self.assertRaises(ValueError):
                    self.stocks.fetch_quote()
        for response in [None, [], "ARM", 205.91]:
            with self.subTest(response=response):
                self.fetch_json.side_effect = None
                self.fetch_json.return_value = response
                with self.assertRaises(ValueError):
                    self.stocks.fetch_quote()

    def test_quote_timestamp_formats_the_same_utc_minute_for_both_supported_epochs(self):
        quote = self.stocks.fetch_quote()
        for epoch_year in (1970, 2000):
            with self.subTest(epoch_year=epoch_year):
                offset = 946684800 if epoch_year == 2000 else 0
                self.time.gmtime = lambda seconds: time.gmtime(seconds + offset)
                self.assertEqual(self.stocks.format_quote_time(quote), "2026-10-30 19:59")

    def test_unknown_device_epoch_fails_instead_of_showing_the_wrong_date(self):
        self.time.gmtime = lambda seconds: (1980, 1, 1, 0, 0, 0, 1, 1)
        with self.assertRaises(ValueError):
            self.stocks.format_quote_time(self.stocks.fetch_quote())

    def test_request_failure_propagates_without_retry(self):
        self.fetch_json.side_effect = OSError("TLS failed")
        with self.assertRaisesRegex(OSError, "TLS failed"):
            self.stocks.fetch_quote()
        self.fetch_json.assert_called_once()


class StocksExampleTests(unittest.TestCase):
    def setUp(self):
        self.operations = Mock()
        self.operations.fetch_quote.return_value = {
            "symbol": "ARM", "price": 205.91, "currency": "USD",
            "quote_time": 1793390340, "delay_minutes": 15, "source": "TradingView",
        }

        self.operations.format_quote_time.return_value = "2026-10-30 19:59"

    def run_sample(self):
        with patch.dict("sys.modules", {
            "stocks": self.operations,
            "crowpanel": types.SimpleNamespace(CrowPanel=self.operations.CrowPanel),
            "wifi_config": None,
            "ntptime": None,
        }), patch("builtins.print") as output:
            runpy.run_path(str(ROOT / "device/examples/04_stocks.py"))
        return output

    def test_open_network_fetches_once_then_draws_once_without_ntp_or_secret_logs(self):
        output = self.run_sample()
        self.assertEqual(self.operations.mock_calls[:2], [
            call.connect("Guest-AccessNG", "", timeout=15),
            call.fetch_quote(timeout=30),
        ])
        self.operations.sync_time.assert_not_called()
        self.operations.CrowPanel.assert_called_once_with(controller="jd79661")
        self.operations.format_quote_time.assert_called_once_with(self.operations.fetch_quote.return_value)
        self.operations.CrowPanel.return_value.show.assert_called_once_with()
        self.assertNotIn("Guest-AccessNG", str(output.call_args_list))
        labels = " ".join(str(args[0]) for args, _ in self.operations.CrowPanel.return_value.text.call_args_list)
        self.assertIn("ARM", labels)
        self.assertIn("205.91", labels)
        self.assertIn("USD", labels)
        self.assertIn("TradingView", labels)
        self.assertIn("15", labels)
        self.assertIn("UTC", labels)

    def test_connection_failure_prevents_fetch_and_display(self):
        self.operations.connect.side_effect = OSError("unavailable")
        with self.assertRaisesRegex(OSError, "unavailable"):
            self.run_sample()
        self.operations.fetch_quote.assert_not_called()
        self.operations.CrowPanel.assert_not_called()

    def test_quote_failure_prevents_display(self):
        self.operations.fetch_quote.side_effect = ValueError("invalid quote")
        with self.assertRaisesRegex(ValueError, "invalid quote"):
            self.run_sample()
        self.operations.CrowPanel.assert_not_called()


if __name__ == "__main__":
    unittest.main()
