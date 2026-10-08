"""Optional language-model adapter for grounded answers.

Configured from the environment; nothing here is required for SmartStart to run.

* ``OPENAI_API_KEY`` (+ optional ``OPENAI_BASE_URL``) — any OpenAI-compatible chat API.
* ``ANTHROPIC_API_KEY`` — Anthropic Messages API.
* ``SMARTSTART_LLM_MODEL`` overrides the model; ``SMARTSTART_LLM=off`` disables the model.
"""

from __future__ import annotations

import json
import os
import re
from typing import Optional

import httpx

TIMEOUT = float(os.environ.get("SMARTSTART_LLM_TIMEOUT", "15"))


def config() -> Optional[dict]:
    if os.environ.get("SMARTSTART_LLM", "").lower() in {"off", "0", "false", "none"}:
        return None
    model = os.environ.get("SMARTSTART_LLM_MODEL", "").strip()
    if os.environ.get("OPENAI_API_KEY"):
        return {
            "provider": "openai",
            "model": model or "gpt-4o-mini",
            "base": os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
            "key": os.environ["OPENAI_API_KEY"],
        }
    if os.environ.get("ANTHROPIC_API_KEY"):
        return {
            "provider": "anthropic",
            "model": model or "claude-3-5-haiku-latest",
            "base": "https://api.anthropic.com/v1",
            "key": os.environ["ANTHROPIC_API_KEY"],
        }
    return None


def status() -> dict:
    cfg = config()
    if not cfg:
        return {"enabled": False, "provider": None, "model": None}
    return {"enabled": True, "provider": cfg["provider"], "model": cfg["model"]}


def _parse_json(text: str) -> Optional[dict]:
    m = re.search(r"\{.*\}", text or "", re.S)
    if not m:
        return None
    try:
        out = json.loads(m.group(0))
    except ValueError:
        return None
    return out if isinstance(out, dict) else None


def complete_json(system: str, user: str) -> Optional[dict]:
    """One JSON-object completion, or None when no model is configured or the call fails."""
    cfg = config()
    if not cfg:
        return None
    try:
        if cfg["provider"] == "openai":
            r = httpx.post(
                f"{cfg['base']}/chat/completions",
                headers={"Authorization": f"Bearer {cfg['key']}"},
                json={
                    "model": cfg["model"],
                    "temperature": 0,
                    "response_format": {"type": "json_object"},
                    "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                },
                timeout=TIMEOUT,
            )
            r.raise_for_status()
            text = r.json()["choices"][0]["message"]["content"]
        else:
            r = httpx.post(
                f"{cfg['base']}/messages",
                headers={"x-api-key": cfg["key"], "anthropic-version": "2023-06-01"},
                json={
                    "model": cfg["model"],
                    "max_tokens": 700,
                    "temperature": 0,
                    "system": system,
                    "messages": [{"role": "user", "content": user}],
                },
                timeout=TIMEOUT,
            )
            r.raise_for_status()
            text = "".join(b.get("text", "") for b in r.json().get("content", []))
    except (httpx.HTTPError, KeyError, IndexError, ValueError):
        return None
    return _parse_json(text)
