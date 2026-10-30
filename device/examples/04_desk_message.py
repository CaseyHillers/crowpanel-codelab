"""Send a non-private message to your desk over Bluetooth Low Energy.

Run this over USB first, then choose the matching Desk-XXXXXX name in the
browser's Bluetooth chooser. Keep USB plugged in for power. No Wi-Fi needed.
Nearby people can connect while this five-minute receiver is running.
"""

from desk_message import run

START_MESSAGE = "Hello from my desk!"
# If browser Bluetooth is unavailable, set False and edit START_MESSAGE.
# Run in RAM will then show your message once over USB instead.
USE_BLUETOOTH = True

run(initial_message=START_MESSAGE, use_bluetooth=USE_BLUETOOTH)
