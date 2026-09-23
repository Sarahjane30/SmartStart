"""Shared window flags for IRA floating widgets."""

from __future__ import annotations

import sys

from PySide6.QtCore import Qt


def companion_window_flags() -> Qt.WindowType:
    """Always-on-top frameless companion.

    On Windows, avoid Qt.Tool — Tool windows often stay invisible in the
    taskbar and are easy to miss behind the browser.
    """
    flags = Qt.WindowType.FramelessWindowHint | Qt.WindowType.WindowStaysOnTopHint
    if sys.platform.startswith("win"):
        flags |= Qt.WindowType.Window
    else:
        flags |= Qt.WindowType.Tool
    return flags
