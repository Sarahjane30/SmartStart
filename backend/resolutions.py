"""In-memory ledger of bottlenecks an employer marked resolved (synthetic, cleared on regenerate).

Resolutions are keyed by (joiner, owning queue: HR / IT / Manager) so IT resolving a laptop
issue does not hide HR's document work for the same joiner. Each entry remembers the
bottleneck it was recorded against; if the joiner's bottleneck changes, it no longer applies.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

_RESOLVED: dict[tuple[str, str], dict] = {}
_REOPENED: dict[tuple[str, str], dict] = {}


def clear() -> None:
    _RESOLVED.clear()
    _REOPENED.clear()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def resolve(
    joiner_id: str, queue: str, bottleneck: str, by: str, role: str, note: str = "", issue: str = ""
) -> dict:
    entry = {
        "queue": queue, "bottleneck": bottleneck, "issue": issue or bottleneck,
        "by": by, "role": role, "at": _now(), "note": note,
    }
    _RESOLVED[(joiner_id, queue)] = entry
    _REOPENED.pop((joiner_id, queue), None)
    return entry


def reopen(joiner_id: str, queue: str, by: str, role: str, note: str = "") -> Optional[dict]:
    prev = _RESOLVED.pop((joiner_id, queue), None)
    if prev is None:
        return None
    entry = {**prev, "by": by, "role": role, "at": _now(), "note": note}
    _REOPENED[(joiner_id, queue)] = entry
    return entry


def _current(ledger: dict, joiner_id: str, bottleneck: Optional[str]) -> dict[str, dict]:
    if not bottleneck:
        return {}
    return {
        q: e for (jid, q), e in ledger.items()
        if jid == joiner_id and e["bottleneck"] == bottleneck
    }


def resolved_for(joiner_id: str, bottleneck: Optional[str]) -> dict[str, dict]:
    return _current(_RESOLVED, joiner_id, bottleneck)


def reopened_for(joiner_id: str, bottleneck: Optional[str]) -> dict[str, dict]:
    return _current(_REOPENED, joiner_id, bottleneck)
