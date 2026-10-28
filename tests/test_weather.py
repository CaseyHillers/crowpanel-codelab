import errno
import importlib.util
import json
from pathlib import Path
import runpy
import types
import unittest
from unittest.mock import Mock, call, patch


ROOT = Path(__file__).resolve().parents[1]


class Clock:
    def __init__(self):
        self.now = (1 << 30) - 50
        self.year = 2026

    def ticks_ms(self):
        return self.now % (1 << 30)

    def ticks_diff(self, end, start):
        return (end - start + (1 << 29)) % (1 << 30) - (1 << 29)

    def sleep_ms(self, duration):
        self.now += duration

    def gmtime(self):
        return (self.year, 10, 27, 12, 0, 0, 1, 300)


class WeatherTests(unittest.TestCase):
    def setUp(self):
        self.clock = Clock()
        self.station = Mock()
        self.station.isconnected.return_value = False
        self.station.status.return_value = 1
        self.network = types.SimpleNamespace(STA_IF=0, WLAN=Mock(return_value=self.station))
        self.ntptime = types.SimpleNamespace(timeout=1, settime=Mock())
        self.raw = Mock()
        self.stream = Mock()
        self.context = Mock(spec_set=("verify_mode", "load_verify_locations", "wrap_socket"))
        self.context.wrap_socket.return_value = self.stream
        self.ssl = types.SimpleNamespace(
            PROTOCOL_TLS_CLIENT=1, CERT_REQUIRED=2,
            SSLContext=Mock(return_value=self.context),
        )
        self.socket = types.SimpleNamespace(
            AF_INET=2, SOCK_STREAM=1,
            getaddrinfo=Mock(return_value=[(2, 1, 6, "", ("192.0.2.1", 443))]),
            socket=Mock(return_value=self.raw),
        )
        self.sent = bytearray()
        self.reply = bytearray()
        self.read_delay = 0
        self.fragment_size = 512
        self.stream.write.side_effect = self.write
        self.stream.read.side_effect = self.read
        spec = importlib.util.spec_from_file_location("weather_under_test", ROOT / "device/weather.py")
        self.weather = importlib.util.module_from_spec(spec)
        with patch.dict("sys.modules", {
            "network": self.network, "ntptime": self.ntptime, "time": self.clock,
            "socket": self.socket, "ssl": self.ssl,
        }):
            spec.loader.exec_module(self.weather)

    def write(self, data):
        self.sent.extend(data)
        return len(data)

    def read(self, count):
        self.clock.now += self.read_delay
        count = min(count, self.fragment_size)
        result = bytes(self.reply[:count])
        del self.reply[:count]
        return result

    def response(self, body=None, headers=(), status=b"HTTP/1.0 200 OK", length=True):
        if body is None:
            body = json.dumps({"current": self.current()}).encode()
        header_lines = [status] + list(headers)
        if length:
            header_lines.append(b"Content-Length: " + str(len(body)).encode())
        self.reply = bytearray(b"\r\n".join(header_lines) + b"\r\n\r\n" + body)

    def current(self):
        return {
            "time": "2026-10-27T12:00", "temperature_2m": 72.5,
            "relative_humidity_2m": 44, "apparent_temperature": 71.2,
            "weather_code": 1, "wind_speed_10m": 4.3,
        }

    def assert_closed(self):
        self.stream.close.assert_called_once_with()
        self.raw.close.assert_called_once_with()

    def test_connect_returns_existing_station_without_reconnecting(self):
        self.station.isconnected.return_value = True
        self.assertIs(self.weather.connect("ssid", "secret"), self.station)
        self.station.connect.assert_not_called()

    def test_connect_waits_for_ip_and_returns_station(self):
        self.station.isconnected.side_effect = [False, False, True]
        self.assertIs(self.weather.connect("ssid", "secret"), self.station)
        self.station.connect.assert_called_once_with("ssid", "secret")
        self.station.config.assert_called_once_with(reconnects=0)
        self.station.disconnect.assert_not_called()

    def test_connect_timeout_handles_tick_wrap_and_stops_retries(self):
        with self.assertRaises(OSError):
            self.weather.connect("ssid", "secret", timeout=0.2)
        self.station.disconnect.assert_called_once_with()
        self.assertEqual(self.station.active.call_args.args, (False,))
        self.assertLessEqual(self.clock.now - ((1 << 30) - 50), 200)

    def test_connect_failure_stops_immediately_without_logging_credentials(self):
        self.station.status.return_value = -3
        with self.assertRaises(OSError) as raised:
            self.weather.connect("private-ssid", "private-secret")
        self.assertNotIn("private", str(raised.exception))
        self.station.disconnect.assert_called_once_with()

    def test_sync_time_sets_bounded_timeout_and_restores_global(self):
        self.ntptime.settime.side_effect = lambda: self.assertEqual(self.ntptime.timeout, 3)
        result = self.weather.sync_time(timeout=3)
        self.assertEqual(result[0], 2026)
        self.assertEqual(self.ntptime.timeout, 1)
        self.ntptime.settime.assert_called_once_with()

    def test_sync_failure_propagates_and_restores_timeout(self):
        self.ntptime.settime.side_effect = OSError("NTP timeout")
        with self.assertRaisesRegex(OSError, "NTP timeout"):
            self.weather.sync_time()
        self.assertEqual(self.ntptime.timeout, 1)

    def test_sync_updates_an_initially_invalid_clock(self):
        self.clock.year = 2000
        self.ntptime.settime.side_effect = lambda: setattr(self.clock, "year", 2026)
        self.assertEqual(self.weather.sync_time()[0], 2026)

    def test_sync_rejects_old_clock_and_late_result(self):
        self.clock.year = 2025
        with self.assertRaises(OSError):
            self.weather.sync_time()
        self.clock.year = 2026
        self.ntptime.settime.side_effect = lambda: self.clock.sleep_ms(1001)
        with self.assertRaises(OSError):
            self.weather.sync_time(timeout=1)
        self.assertEqual(self.ntptime.timeout, 1)

    def test_invalid_timeout_is_rejected_before_network_activity(self):
        for timeout in [0, -1, float("inf"), float("nan"), "forever"]:
            for function, arguments in [
                (self.weather.connect, ("ssid", "secret")),
                (self.weather.sync_time, ()), (self.weather.fetch_weather, ()),
            ]:
                with self.subTest(function=function.__name__, timeout=timeout):
                    with self.assertRaises(ValueError):
                        function(*arguments, timeout=timeout)
        self.network.WLAN.assert_not_called()
        self.socket.socket.assert_not_called()

    def test_fetch_requires_current_clock_before_tls_or_dns(self):
        self.clock.year = 2025
        with self.assertRaises(OSError):
            self.weather.fetch_weather()
        self.ssl.SSLContext.assert_not_called()
        self.socket.getaddrinfo.assert_not_called()

    def test_verified_https_request_returns_current_dictionary(self):
        self.response()
        self.assertEqual(self.weather.fetch_weather(), self.current())
        self.ssl.SSLContext.assert_called_once_with(self.ssl.PROTOCOL_TLS_CLIENT)
        self.assertEqual(self.context.verify_mode, self.ssl.CERT_REQUIRED)
        self.context.load_verify_locations.assert_called_once_with(cafile="weather_ca.pem")
        self.context.wrap_socket.assert_called_once_with(
            self.raw, server_hostname="api.open-meteo.com", do_handshake_on_connect=False,
        )
        self.raw.settimeout.assert_called_once()
        self.assertGreater(self.raw.settimeout.call_args.args[0], 0)
        self.raw.setblocking.assert_called_once_with(False)
        request = bytes(self.sent)
        self.assertIn(b"latitude=32.9528&longitude=-117.094", request)
        self.assertIn(b"temperature_unit=fahrenheit", request)
        self.assertIn(b"wind_speed_unit=mph", request)
        self.assertIn(b" HTTP/1.0\r\nHost: api.open-meteo.com\r\n", request)
        self.assertIn(b"Connection: close\r\n", request)
        self.assert_closed()

    def test_fragmented_http11_response_and_eof_delimited_body(self):
        self.response(status=b"HTTP/1.1 200 OK", length=False)
        self.fragment_size = 1
        self.assertEqual(self.weather.fetch_weather(), self.current())
        self.assert_closed()

    def test_partial_nonblocking_writes_and_reads_retry_within_deadline(self):
        self.response()
        normal_write = self.write
        write_count = [0]

        def partial_write(data):
            write_count[0] += 1
            if write_count[0] == 1:
                return None
            return normal_write(data[:7])

        normal_read = self.read
        read_count = [0]

        def pending_read(count):
            read_count[0] += 1
            if read_count[0] == 1:
                raise OSError(errno.EAGAIN)
            return normal_read(count)

        self.stream.write.side_effect = partial_write
        self.stream.read.side_effect = pending_read
        self.assertEqual(self.weather.fetch_weather(), self.current())
        self.assertTrue(bytes(self.sent).endswith(b"\r\n\r\n"))
        self.assert_closed()

    def test_certificate_or_hostname_failure_never_falls_back(self):
        self.stream.write.side_effect = OSError("certificate hostname mismatch")
        with self.assertRaisesRegex(OSError, "certificate hostname mismatch"):
            self.weather.fetch_weather()
        self.assertEqual(self.context.verify_mode, self.ssl.CERT_REQUIRED)
        self.context.wrap_socket.assert_called_once()
        self.assert_closed()

    def test_ca_failure_does_not_open_socket(self):
        self.context.load_verify_locations.side_effect = OSError("missing CA")
        with self.assertRaisesRegex(OSError, "missing CA"):
            self.weather.fetch_weather()
        self.socket.socket.assert_not_called()

    def test_empty_or_late_dns_result_does_not_open_socket(self):
        self.socket.getaddrinfo.return_value = []
        with self.assertRaises(OSError):
            self.weather.fetch_weather()
        self.socket.getaddrinfo.side_effect = lambda *arguments: (
            self.clock.sleep_ms(1001) or [(2, 1, 6, "", ("192.0.2.1", 443))]
        )
        with self.assertRaises(OSError):
            self.weather.fetch_weather(timeout=1)
        self.socket.socket.assert_not_called()

    def test_connect_and_wrap_failures_close_raw_socket(self):
        for operation in [self.raw.connect, self.context.wrap_socket]:
            with self.subTest(operation=operation):
                self.raw.close.reset_mock()
                operation.side_effect = OSError("failed")
                with self.assertRaises(OSError):
                    self.weather.fetch_weather()
                self.raw.close.assert_called_once_with()
                operation.side_effect = None

    def test_non_200_chunking_compression_and_malformed_http_are_rejected(self):
        responses = [
            b"HTTP/1.0 302 Found\r\nContent-Length: 0\r\n\r\n",
            b"HTTP/1.0 500 Failed\r\n\r\n{}",
            b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n",
            b"HTTP/1.0 200 OK\r\nContent-Encoding: gzip\r\n\r\n{}",
            b"NOTHTTP 200 OK\r\n\r\n{}",
            b"HTTP/1.0 200 OK\r\nBad header\r\n\r\n{}",
            b"HTTP/1.0 200 OK\r\nContent-Length: -1\r\n\r\n",
            b"HTTP/1.0 200 OK\r\nContent-Length: 2\r\nContent-Length: 2\r\n\r\n{}",
            b"HTTP/1.0 200 OK\r\nContent-Length: 10\r\n\r\n{}",
            b"HTTP/1.0 200 OK\r\nContent-Length: 1\r\n\r\n{}",
            b"HTTP/1.0 200 OK\r\n",
        ]
        for response in responses:
            with self.subTest(response=response):
                self.stream.close.reset_mock()
                self.raw.close.reset_mock()
                self.reply = bytearray(response)
                with self.assertRaises(ValueError):
                    self.weather.fetch_weather()
                self.assert_closed()

    def test_declared_and_streamed_oversize_responses_are_rejected(self):
        for length in [True, False]:
            with self.subTest(length=length):
                self.response(body=b" " * 17000, length=length)
                with self.assertRaises(ValueError):
                    self.weather.fetch_weather()
                self.assertGreater(len(self.reply), 0)

    def test_oversized_headers_are_rejected(self):
        self.reply = bytearray(b"HTTP/1.0 200 OK\r\nX-Padding: " + b"a" * 5000)
        with self.assertRaises(ValueError):
            self.weather.fetch_weather()
        self.assert_closed()

    def test_missing_invalid_and_non_dictionary_current_are_rejected(self):
        for body in [b"not json", b"[]", b"{}", b'{"current":null}',
                     b'{"current":[]}', b'{"current":{}}']:
            with self.subTest(body=body):
                self.response(body=body)
                with self.assertRaises(ValueError):
                    self.weather.fetch_weather()

    def test_stalled_and_slow_trickle_requests_share_one_deadline(self):
        self.stream.read.side_effect = lambda count: None
        with self.assertRaises(OSError):
            self.weather.fetch_weather(timeout=0.1)
        self.assert_closed()
        self.stream.read.side_effect = self.read
        self.fragment_size = 1
        self.read_delay = 25
        self.response()
        with self.assertRaises(OSError):
            self.weather.fetch_weather(timeout=0.1)

    def test_stalled_tls_handshake_or_write_hits_deadline_and_closes(self):
        self.stream.write.side_effect = None
        self.stream.write.return_value = None
        with self.assertRaises(OSError):
            self.weather.fetch_weather(timeout=0.1)
        self.assert_closed()

    def test_cleanup_still_closes_raw_when_tls_close_fails(self):
        self.response()
        self.stream.close.side_effect = OSError("already closed")
        self.assertEqual(self.weather.fetch_weather(), self.current())
        self.assert_closed()


class WeatherExampleTests(unittest.TestCase):
    def setUp(self):
        self.operations = Mock()
        self.operations.fetch_weather.return_value = {
            "time": "2026-10-27T12:00", "temperature_2m": 72.5,
            "relative_humidity_2m": 44, "apparent_temperature": 71.2,
            "wind_speed_10m": 4.3,
        }

    def run_sample(self):
        with patch.dict("sys.modules", {
            "weather": self.operations,
            "crowpanel": types.SimpleNamespace(CrowPanel=self.operations.CrowPanel),
            "wifi_config": None,
        }), patch("builtins.print") as output:
            runpy.run_path(str(ROOT / "device/examples/04_weather.py"))
        return output

    def test_open_workshop_default_syncs_before_fetch_without_wifi_config(self):
        output = self.run_sample()
        self.assertEqual(self.operations.mock_calls[:4], [
            call.connect("Guest-AccessNG", "", timeout=15),
            call.sync_time(), call.fetch_weather(),
            call.CrowPanel(controller="jd79661"),
        ])
        self.operations.CrowPanel.return_value.show.assert_called_once_with()
        self.assertNotIn("Guest-AccessNG", str(output.call_args_list))

    def test_connection_or_clock_failure_prevents_fetch_and_display(self):
        for operation in ("connect", "sync_time"):
            with self.subTest(operation=operation):
                self.setUp()
                getattr(self.operations, operation).side_effect = OSError("unavailable")
                with self.assertRaises(OSError):
                    self.run_sample()
                if operation == "connect":
                    self.operations.sync_time.assert_not_called()
                self.operations.fetch_weather.assert_not_called()
                self.operations.CrowPanel.assert_not_called()


if __name__ == "__main__":
    unittest.main()
