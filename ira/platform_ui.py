"""Platform-specific UI helpers for reliable Windows rendering."""

from __future__ import annotations

import sys

IS_WINDOWS = sys.platform.startswith("win")


def use_layered_effects() -> bool:
    """Drop shadows + translucent windows break on some Windows DPI setups."""
    return not IS_WINDOWS
