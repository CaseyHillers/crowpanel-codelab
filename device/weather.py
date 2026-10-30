"""Shared Wi-Fi/verified HTTPS and optional weather; DNS uses the resolver timeout."""

import errno
import json
import network
import ntptime
import socket
import ssl
import time


_HOST = "api.open-meteo.com"
_FIELDS = (
    "temperature_2m", "relative_humidity_2m", "apparent_temperature",
    "weather_code", "wind_speed_10m",
)
_PATH = (
    "/v1/forecast?latitude=32.9528&longitude=-117.094&current="
    + ",".join(_FIELDS)
    + "&temperature_unit=fahrenheit&wind_speed_unit=mph"
    + "&timezone=America%2FLos_Angeles"
)
_MAX_RESPONSE = 16 * 1024
_MAX_HEADERS = 4096


def _timeout_ms(timeout):
    if not isinstance(timeout, (int, float)) or not 0.001 <= timeout <= 120:
        raise ValueError("timeout must be between 0.001 and 120 seconds")
    return int(timeout * 1000)


def _remaining(started, timeout_ms):
    remaining = timeout_ms - time.ticks_diff(time.ticks_ms(), started)
    if remaining <= 0:
        raise OSError("operation timed out")
    return remaining


def _pause(started, timeout_ms):
    time.sleep_ms(min(20, _remaining(started, timeout_ms)))


def _require_clock():
    if time.gmtime()[0] < 2026:
        raise OSError("clock is before 2026; run from the browser Stocks lesson to set UTC, or set machine.RTC before HTTPS")


def connect(ssid, password, timeout=15):
    """Return a connected station; stop association on failure or timeout."""
    timeout_ms = _timeout_ms(timeout)
    started = time.ticks_ms()
    station = network.WLAN(network.STA_IF)
    try:
        station.active(True)
        if station.isconnected():
            return station
        station.config(reconnects=0)
        station.connect(ssid, password)
        while not station.isconnected():
            if station.status() < 0:
                raise OSError("Wi-Fi connection failed")
            time.sleep_ms(min(100, _remaining(started, timeout_ms)))
        _remaining(started, timeout_ms)
        return station
    except BaseException:
        try:
            station.disconnect()
        except OSError:
            pass
        try:
            station.active(False)
        except OSError:
            pass
        raise


def sync_time(timeout=5):
    """Run one timeout-limited NTP attempt and return the UTC gmtime tuple."""
    timeout_ms = _timeout_ms(timeout)
    started = time.ticks_ms()
    previous_timeout = ntptime.timeout
    try:
        ntptime.timeout = timeout_ms / 1000
        ntptime.settime()
    finally:
        ntptime.timeout = previous_timeout
    _remaining(started, timeout_ms)
    _require_clock()
    return time.gmtime()


def _would_block(error):
    return bool(error.args) and error.args[0] in (errno.EAGAIN, errno.EINPROGRESS)


def _write_all(stream, data, started, timeout_ms):
    offset = 0
    while offset < len(data):
        _remaining(started, timeout_ms)
        try:
            count = stream.write(data[offset:])
        except OSError as error:
            if not _would_block(error):
                raise
            count = None
        _remaining(started, timeout_ms)
        if count is None:
            _pause(started, timeout_ms)
        elif count <= 0 or count > len(data) - offset:
            raise OSError("HTTPS write failed")
        else:
            offset += count


def _read(stream, count, started, timeout_ms):
    while True:
        _remaining(started, timeout_ms)
        try:
            chunk = stream.read(count)
        except OSError as error:
            if not _would_block(error):
                raise
            chunk = None
        _remaining(started, timeout_ms)
        if chunk is not None:
            return chunk
        _pause(started, timeout_ms)


def _parse_headers(headers):
    lines = headers.split(b"\r\n")
    status = lines[0].split(b" ", 2)
    if len(status) < 2 or status[0] not in (b"HTTP/1.0", b"HTTP/1.1"):
        raise ValueError("invalid HTTP status line")
    if status[1] != b"200":
        raise ValueError("weather server did not return HTTP 200")
    length = None
    for line in lines[1:]:
        if b":" not in line:
            raise ValueError("invalid HTTP header")
        name, value = line.split(b":", 1)
        name = name.lower()
        value = value.strip()
        if name == b"transfer-encoding":
            raise ValueError("transfer encoding, including chunked, is unsupported")
        if name == b"content-encoding" and value.lower() != b"identity":
            raise ValueError("compressed HTTPS responses are unsupported")
        if name == b"content-length":
            if length is not None or not value or any(
                character < 48 or character > 57 for character in value
            ):
                raise ValueError("invalid or duplicate Content-Length")
            if len(value) > 5:
                raise ValueError("HTTPS response exceeds 16 KiB")
            length = int(value)
    return length


def _read_response(stream, started, timeout_ms, current_conditions=True):
    response = bytearray()
    body_start = None
    length = None
    while True:
        if body_start is not None and length is not None:
            received = len(response) - body_start
            if received > length:
                raise ValueError("HTTP body exceeds Content-Length")
            if received == length:
                break
        if len(response) >= _MAX_RESPONSE:
            raise ValueError("HTTPS response exceeds 16 KiB")
        chunk = _read(stream, min(512, _MAX_RESPONSE - len(response)), started, timeout_ms)
        if not chunk:
            if body_start is None or (
                length is not None and len(response) - body_start != length
            ):
                raise ValueError("truncated HTTP response")
            break
        response.extend(chunk)
        if body_start is None:
            marker = response.find(b"\r\n\r\n")
            if marker >= 0:
                body_start = marker + 4
                if body_start > _MAX_HEADERS:
                    raise ValueError("HTTP headers exceed 4 KiB")
                length = _parse_headers(bytes(response[:marker]))
                if length is not None and body_start + length > _MAX_RESPONSE:
                    raise ValueError("HTTPS response exceeds 16 KiB")
            elif len(response) >= _MAX_HEADERS:
                raise ValueError("HTTP headers exceed 4 KiB")
    document = json.loads(response[body_start:].decode("utf-8"))
    if not isinstance(document, dict):
        raise ValueError("HTTPS response must be an object")
    if not current_conditions:
        return document
    current = document.get("current")
    if not isinstance(current, dict) or not all(field in current for field in _FIELDS):
        raise ValueError("weather response is missing current conditions")
    return current


def _close(stream):
    if stream is not None:
        try:
            stream.close()
        except OSError:
            pass


def fetch_weather(timeout=10):
    """Return Open-Meteo's current dict for Sabre Springs in Fahrenheit/mph.

    Requires a 2026-or-newer clock and weather_ca.pem in the working directory.
    TLS requires mbedTLS CERT_REQUIRED/server_hostname checks and a PEM cafile.
    HTTP headers and body together are limited to 16 KiB; chunking is rejected.
    DNS is subject to the port's resolver timeout, not the socket deadline.
    """
    return _fetch_json(_HOST, _PATH, "weather_ca.pem", timeout, True)


def fetch_json(host, path, cafile, timeout=10):
    """Fetch a bounded HTTPS JSON object with certificate/hostname verification.

    Used by the stock lesson too. No redirects, compression or chunked bodies.
    DNS retains the firmware resolver's own timeout.
    """
    return _fetch_json(host, path, cafile, timeout, False)


def _fetch_json(host, path, cafile, timeout, current_conditions):
    timeout_ms = _timeout_ms(timeout)
    if (not isinstance(host, str) or not host or len(host) > 253
            or any(not ("a" <= char <= "z" or "A" <= char <= "Z"
                        or "0" <= char <= "9" or char in ".-") for char in host)
            or not isinstance(path, str) or not path.startswith("/")
            or any(ord(char) < 33 or ord(char) > 126 for char in path)):
        raise ValueError("invalid HTTPS host or path")
    started = time.ticks_ms()
    _require_clock()
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.verify_mode = ssl.CERT_REQUIRED
    context.load_verify_locations(cafile=cafile)
    addresses = socket.getaddrinfo(host, 443, socket.AF_INET, socket.SOCK_STREAM)
    _remaining(started, timeout_ms)
    if not addresses:
        raise OSError("weather hostname did not resolve")
    family, kind, protocol, _, address = addresses[0]
    raw = None
    stream = None
    try:
        raw = socket.socket(family, kind, protocol)
        raw.settimeout(_remaining(started, timeout_ms) / 1000)
        raw.connect(address)
        _remaining(started, timeout_ms)
        raw.setblocking(False)
        stream = context.wrap_socket(
            raw, server_hostname=host, do_handshake_on_connect=False,
        )
        request = (
            "GET " + path + " HTTP/1.0\r\nHost: " + host
            + "\r\nConnection: close\r\nAccept: application/json"
            + "\r\nAccept-Encoding: identity\r\n\r\n"
        ).encode("utf-8")
        _write_all(stream, request, started, timeout_ms)
        return _read_response(stream, started, timeout_ms, current_conditions)
    finally:
        try:
            _close(stream)
        finally:
            _close(raw)
