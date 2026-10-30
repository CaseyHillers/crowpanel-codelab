"""Destructive workshop recovery; run in RAM only after explicit consent.

Clears the writable MicroPython filesystem, not the firmware image. Deletion
is not forensic secure erase. The browser reinstalls workshop files afterward.
"""

import os


def reset_files(max_entries=2048, max_depth=16):
    remaining = [max_entries]

    def clear_directory(path, depth):
        if depth > max_depth:
            raise RuntimeError("Device reset stopped: directory depth limit reached")
        entries = []
        for entry in os.ilistdir(path):
            remaining[0] -= 1
            if remaining[0] < 0:
                raise RuntimeError("Device reset stopped: file count limit reached")
            name, kind = entry[0], entry[1]
            if name in (".", "..") or "/" in name:
                raise RuntimeError("Device reset stopped: invalid directory entry")
            entries.append((name, kind))
        # Snapshot before deleting: mutating a live directory iterator can skip
        # entries on some filesystems.
        for name, kind in entries:
            child = path.rstrip("/") + "/" + name
            if kind & 0xF000 == 0x4000:
                clear_directory(child, depth + 1)
                os.rmdir(child)
            else:
                os.remove(child)

    failed = False
    try:
        clear_directory("/", 0)
        os.sync()
    except OSError:
        failed = True
    if failed:
        # Raise outside the handler so exception chaining cannot expose a path.
        raise RuntimeError("Device reset incomplete: filesystem operation failed")
    print("WORKSHOP FILES CLEARED")


if __name__ == "__main__":
    reset_files()
