"""IRA local config — remembers widget position and selected employee."""

from __future__ import annotations

import json
from pathlib import Path

CONFIG_DIR = Path.home() / ".smartstart-ira"
CONFIG_PATH = CONFIG_DIR / "config.json"

DEFAULTS = {
    "smartstart_base_url": "http://127.0.0.1:8000",
    "employee_id": None,
    "bubble_x": None,
    "bubble_y": None,
    "always_on_top": True,
}


def load_config() -> dict:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    if not CONFIG_PATH.exists():
        save_config(dict(DEFAULTS))
        return dict(DEFAULTS)
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        data = {}
    merged = dict(DEFAULTS)
    merged.update({k: v for k, v in data.items() if k in DEFAULTS})
    return merged


def save_config(data: dict) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def update_config(**kwargs) -> dict:
    cfg = load_config()
    cfg.update(kwargs)
    save_config(cfg)
    return cfg
