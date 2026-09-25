"""Shared window flags for IRA floating widgets."""

from __future__ import annotations

import sys

from PySide6.QtCore import Qt


def companion_window_flags() -> Qt.WindowType:
    """Always-on-top frameless companion that floats over other apps.

    Qt.Tool + WindowStaysOnTopHint keeps the orb/panel above browsers and
    editors so it stays useful as a desktop companion (especially Windows).
    NoDropShadowWindowHint avoids a rectangular DWM shadow that reads as
    square corners around the circular bubble.
    """
    flags = (
        Qt.WindowType.FramelessWindowHint
        | Qt.WindowType.WindowStaysOnTopHint
        | Qt.WindowType.Tool
    )
    if sys.platform.startswith("win"):
        flags |= Qt.WindowType.NoDropShadowWindowHint
    return flags
