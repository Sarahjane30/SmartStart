"""What NIA and IRA couldn't answer, and what people said about the answers they gave.

* Gaps — every refusal, and every answer that only weakly matched a source, is grouped
  with similar questions and routed to the team that owns the closest approved source.
  A gap closes itself once an approved source answers it confidently.
* Reviews — a thumbs-down on an answer becomes a review task for each source it cited.
  The task closes when the owner marks it reviewed or a new version is approved.

Only the question, the asker's audience (employee, HR, IT, manager, Ops) and the answer
are kept — never who asked. Stored next to the source overlay (``SMARTSTART_KB_INSIGHTS``).
"""

from __future__ import annotations

import json
import logging
import os
import secrets
import threading
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from backend import knowledge_sources as ks

ROOT = Path(__file__).resolve().parents[1]
MAX_ANSWERS = 500
MAX_VARIANTS = 5
MAX_FLAGS = 50
MERGE_JACCARD = 0.75
MIN_TOKENS = 2

TEAMS = ("HR", "IT", "Finance", "Legal & Security", "Workplace", "Onboarding Ops")
TEAM_ROLE = {"HR": "HR", "IT": "IT"}
REASONS = {
    "not_helpful": "Didn't help",
    "out_of_date": "Out of date",
    "wrong": "Wrong",
    "missing": "Should be covered",
}
AUDIENCE_LABELS = {"EMPLOYEE": "Employees", "HR": "HR", "IT": "IT", "MANAGER": "Managers", "OPS": "Ops"}

_LOCK = threading.RLock()
_DATA: dict | None = None
_DATA_PATH: Path | None = None
_SYNCED_REVISION: int | None = None


def store_path() -> Path:
    return Path(os.environ.get("SMARTSTART_KB_INSIGHTS") or ROOT / "var" / "knowledge_insights.json")


def _empty() -> dict:
    return {"version": 1, "gaps": [], "reviews": [], "answers": {}, "votes": {}}


def _data() -> dict:
    global _DATA, _DATA_PATH
    path = store_path()
    if _DATA is None or _DATA_PATH != path:
        _DATA_PATH = path
        try:
            _DATA = {**_empty(), **json.loads(path.read_text(encoding="utf-8"))}
        except (OSError, ValueError):
            _DATA = _empty()
    return _DATA


def _save() -> None:
    # Losing a log entry must never stop an assistant from answering.
    path = store_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(_data(), indent=1), encoding="utf-8")
        os.replace(tmp, path)
    except OSError:
        logging.getLogger(__name__).warning("Couldn't save knowledge insights to %s", path, exc_info=True)


def reset(path: Optional[str] = None) -> None:
    global _DATA, _SYNCED_REVISION
    with _LOCK:
        if path is not None:
            os.environ["SMARTSTART_KB_INSIGHTS"] = path
        _DATA = None
        _SYNCED_REVISION = None


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_urlsafe(9)}"


def team_of(owner: Optional[str]) -> str:
    o = (owner or "").lower()
    if any(w in o for w in ("finance", "payroll", "procurement")):
        return "Finance"
    if any(w in o for w in ("security", "legal", "privacy", "compliance", "soc")):
        return "Legal & Security"
    if o.startswith("it ") or o.startswith("it/") or " it " in f" {o} " or "engineering" in o:
        return "IT"
    if any(w in o for w in ("hr", "people", "learning", "rewards")):
        return "HR"
    if "workplace" in o or "facilities" in o:
        return "Workplace"
    return "Onboarding Ops"


def team_for_role(role: str) -> Optional[str]:
    return {"HR": "HR", "IT": "IT", "OPS": "Onboarding Ops"}.get(role)


def can_act(role: str, team: str) -> bool:
    """HR and IT handle their own teams' items; Onboarding Ops handles everything else."""
    return role == "OPS" or TEAM_ROLE.get(team) == role


def _key(question: str) -> list[str]:
    from backend.grounded import _tokens

    return sorted(set(_tokens(question)))


def _jaccard(a: set, b: set) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


# --- Recording -------------------------------------------------------------------------


def _citations(g: dict) -> list[dict]:
    out = []
    for c in g.get("citations") or []:
        src = ks.approved(c["source_id"]) if c.get("kind") != "record" else None
        out.append({
            "source_id": c["source_id"], "title": c["title"], "section": c.get("section", ""),
            "owner": c.get("owner", ""), "kind": c.get("kind", "source"),
            "version": src.version if src else None,
        })
    return out


def _find_gap(gaps: list[dict], key: list[str]) -> Optional[dict]:
    ks_ = set(key)
    best, best_j = None, 0.0
    for gap in gaps:
        j = 1.0 if gap["key"] == key else _jaccard(ks_, set(gap["key"]))
        if j > best_j:
            best, best_j = gap, j
    return best if best_j >= MERGE_JACCARD else None


def _note_gap(question: str, audience: str, assistant: str, g: dict, kind: str, at: str) -> Optional[str]:
    key = _key(question)
    if len(key) < MIN_TOKENS:
        return None
    gaps = _data()["gaps"]
    closest = g.get("closest") if kind == "refused" else next(
        ({"source_id": c["source_id"], "title": c["title"], "section": c.get("section", ""), "owner": c["owner"]}
         for c in g.get("citations") or [] if c.get("kind") != "record"),
        g.get("closest"),
    )
    gap = _find_gap(gaps, key)
    if gap is None:
        gap = {
            "id": _id("gap"), "key": key, "question": question, "variants": [], "count": 0,
            "kinds": {}, "audiences": {}, "assistants": {}, "first_seen": at, "flagged": 0,
            "status": "open", "resolution": None,
        }
        gaps.append(gap)
    elif gap["status"] == "answered":
        gap.update(status="open", resolution=None)
    gap["question"] = question
    if question not in gap["variants"]:
        gap["variants"] = ([question] + gap["variants"])[:MAX_VARIANTS]
    gap["count"] += 1
    for field, value in (("kinds", kind), ("audiences", audience), ("assistants", assistant)):
        gap[field][value] = gap[field].get(value, 0) + 1
    gap["last_seen"] = at
    if closest:
        gap["closest"] = {k: closest.get(k) for k in ("source_id", "title", "section", "owner")}
    gap["team"] = team_of((gap.get("closest") or {}).get("owner"))
    return gap["id"]


def record(question: str, audience: str, assistant: str, g: dict) -> dict:
    """Log an answer a person actually saw. Adds ``answer_id`` so they can rate it."""
    question = " ".join(str(question or "").split())[:300]
    if not question:
        return g
    at = _now()
    with _LOCK:
        d = _data()
        cites = _citations(g)
        only_record = bool(cites) and all(c["kind"] == "record" for c in cites)
        kind = None
        if not g.get("grounded"):
            kind = "refused"
        elif g.get("strength") == "weak" and not only_record:
            kind = "weak"
        gap_id = _note_gap(question, audience, assistant, g, kind, at) if kind else None
        aid = _id("ans")
        d["answers"][aid] = {
            "question": question, "audience": audience, "assistant": assistant,
            "grounded": bool(g.get("grounded")), "answer": (g.get("answer") or "")[:800],
            "citations": cites, "gap_id": gap_id, "at": at, "vote": None, "reason": None,
        }
        if len(d["answers"]) > MAX_ANSWERS:
            for old in sorted(d["answers"], key=lambda k: d["answers"][k]["at"])[: len(d["answers"]) - MAX_ANSWERS]:
                del d["answers"][old]
        _save()
    g["answer_id"] = aid
    return g


# --- Feedback --------------------------------------------------------------------------


def _review_for(sid: str, cite: dict) -> dict:
    reviews = _data()["reviews"]
    task = next((r for r in reviews if r["source_id"] == sid and r["status"] == "open"), None)
    if task is None:
        task = {
            "id": _id("rev"), "source_id": sid, "title": cite["title"], "owner": cite["owner"],
            "team": team_of(cite["owner"]), "status": "open", "created": _now(), "flags": [],
            "resolution": None,
        }
        reviews.append(task)
    return task


def _unflag(aid: str) -> None:
    for task in _data()["reviews"]:
        if task["status"] == "open":
            task["flags"] = [f for f in task["flags"] if f["answer_id"] != aid]
    _data()["reviews"] = [r for r in _data()["reviews"] if r["status"] != "open" or r["flags"]]


def _tally(sid: str, vote: Optional[str], delta: int) -> None:
    if vote not in ("up", "down"):
        return
    v = _data()["votes"].setdefault(sid, {"up": 0, "down": 0})
    v[vote] = max(0, v[vote] + delta)


def vote(answer_id: str, value: str, reason: Optional[str] = None, comment: str = "") -> dict:
    if value not in ("up", "down"):
        raise ValueError("Vote up or down.")
    if value == "down":
        reason = reason if reason in REASONS else "not_helpful"
    else:
        reason = None
    comment = " ".join(str(comment or "").split())[:300]
    with _LOCK:
        d = _data()
        ans = d["answers"].get(answer_id)
        if ans is None:
            raise KeyError(answer_id)
        sources = list(dict.fromkeys(c["source_id"] for c in ans["citations"] if c["kind"] != "record"))
        for sid in sources:
            _tally(sid, ans["vote"], -1)
        if ans["vote"] == "down" and ans.get("gap_id") and not ans["grounded"]:
            gap = next((x for x in d["gaps"] if x["id"] == ans["gap_id"]), None)
            if gap:
                gap["flagged"] = max(0, gap["flagged"] - 1)
        _unflag(answer_id)
        ans.update(vote=value, reason=reason, comment=comment, voted_at=_now())
        for sid in sources:
            _tally(sid, value, 1)
        routed: list[str] = []
        if value == "down":
            if sources:
                for sid in sources:
                    cite = next(c for c in ans["citations"] if c["source_id"] == sid)
                    task = _review_for(sid, cite)
                    task["flags"] = ([{
                        "answer_id": answer_id, "reason": reason, "comment": comment,
                        "question": ans["question"], "answer": ans["answer"], "section": cite["section"],
                        "audience": ans["audience"], "assistant": ans["assistant"],
                        "version": cite["version"], "at": ans["voted_at"],
                    }] + task["flags"])[:MAX_FLAGS]
                    routed.append(task["owner"])
            elif ans.get("gap_id"):
                gap = next((x for x in d["gaps"] if x["id"] == ans["gap_id"]), None)
                if gap:
                    gap["flagged"] += 1
                    if gap["status"] != "open":
                        gap.update(status="open", resolution=None)
                    routed.append((gap.get("closest") or {}).get("owner") or gap["team"])
        _save()
    owners = list(dict.fromkeys(routed))
    if value == "up":
        msg = "Thanks — that tells the owners this answer works."
    elif owners:
        msg = f"Thanks — sent to {', '.join(owners)} to review."
    else:
        msg = "Thanks — noted."
    return {"answer_id": answer_id, "vote": value, "reason": reason, "routed_to": owners, "message": msg}


# --- Keeping it current ----------------------------------------------------------------


def _sync() -> None:
    """Close gaps an approved source now answers well, and reviews a new version supersedes."""
    global _SYNCED_REVISION
    if _SYNCED_REVISION == ks.REVISION:
        return
    from backend.grounded import answer

    changed = False
    d = _data()
    for gap in d["gaps"]:
        if gap["status"] != "open":
            continue
        aud = Counter(gap["audiences"]).most_common(1)[0][0] if gap["audiences"] else "EMPLOYEE"
        g = answer(gap["question"], aud, use_model=False)
        if g["grounded"] and g["strength"] == "strong":
            top = g["citations"][0]
            src = ks.approved(top["source_id"])
            gap.update(status="answered", resolution={
                "at": _now(), "by": None, "source_id": top["source_id"], "title": top["title"],
                "section": top["section"], "version": src.version if src else None,
                "note": f"Now answered from {top['title']} › {top['section']}",
            })
            changed = True
    for task in d["reviews"]:
        if task["status"] != "open":
            continue
        src = ks.approved(task["source_id"])
        flagged_at = max((f["version"] or 0) for f in task["flags"]) if task["flags"] else 0
        if src is None:
            note = "Source retired, so NIA and IRA no longer answer from it."
        elif src.version > flagged_at:
            note = f"Updated to version {src.version}."
        else:
            continue
        task.update(status="resolved", resolution={"at": _now(), "by": None, "note": note,
                                                   "version": src.version if src else None})
        changed = True
    if changed:
        _save()
    _SYNCED_REVISION = ks.REVISION


def _gap_view(gap: dict, role: str) -> dict:
    kinds = gap["kinds"]
    return {
        "id": gap["id"], "question": gap["question"], "variants": gap["variants"][1:],
        "count": gap["count"], "refused": kinds.get("refused", 0), "weak": kinds.get("weak", 0),
        "flagged": gap.get("flagged", 0),
        "audiences": [{"id": a, "label": AUDIENCE_LABELS.get(a, a), "count": n}
                      for a, n in Counter(gap["audiences"]).most_common()],
        "assistants": sorted(gap["assistants"]),
        "first_seen": gap["first_seen"], "last_seen": gap["last_seen"],
        "closest": gap.get("closest"), "team": gap["team"], "status": gap["status"],
        "resolution": gap.get("resolution"), "can_act": can_act(role, gap["team"]),
    }


def _review_view(task: dict, role: str) -> dict:
    reasons = Counter(f["reason"] for f in task["flags"])
    return {
        "id": task["id"], "source_id": task["source_id"], "title": task["title"], "owner": task["owner"],
        "team": task["team"], "status": task["status"], "created": task["created"],
        "reasons": [{"id": r, "label": REASONS[r], "count": n} for r, n in reasons.most_common()],
        "flags": [{**f, "audience_label": AUDIENCE_LABELS.get(f["audience"], f["audience"]),
                   "reason_label": REASONS.get(f["reason"], f["reason"])} for f in task["flags"]],
        "resolution": task.get("resolution"), "can_act": can_act(role, task["team"]),
    }


def _sort_key(item: dict) -> tuple:
    return (-(item.get("count") or len(item.get("flags", []))), item.get("last_seen") or item.get("created") or "")


def overview(role: str) -> dict:
    with _LOCK:
        _sync()
        d = _data()
        gaps = [_gap_view(g, role) for g in d["gaps"]]
        reviews = [_review_view(r, role) for r in d["reviews"]]
    mine = team_for_role(role)
    teams = []
    for team in TEAMS:
        tg = sorted((g for g in gaps if g["team"] == team and g["status"] == "open"), key=_sort_key)
        tr = sorted((r for r in reviews if r["team"] == team and r["status"] == "open"), key=_sort_key)
        if tg or tr:
            teams.append({"team": team, "mine": team == mine or (role == "OPS" and team not in TEAM_ROLE),
                          "gaps": tg, "reviews": tr, "open": len(tg) + len(tr)})
    teams.sort(key=lambda t: (not t["mine"], -t["open"]))
    closed_gaps = sorted((g for g in gaps if g["status"] != "open"),
                         key=lambda g: (g["resolution"] or {}).get("at", ""), reverse=True)[:12]
    closed_reviews = sorted((r for r in reviews if r["status"] != "open"),
                            key=lambda r: (r["resolution"] or {}).get("at", ""), reverse=True)[:12]
    return {
        "teams": teams,
        "closed_gaps": closed_gaps,
        "closed_reviews": closed_reviews,
        "counts": {
            "gaps": sum(g["status"] == "open" for g in gaps),
            "reviews": sum(r["status"] == "open" for r in reviews),
            "mine": sum(t["open"] for t in teams if t["mine"]),
            "answered": sum(g["status"] == "answered" for g in gaps),
        },
        "my_team": mine,
        "reasons": REASONS,
    }


def pending_for(role: str) -> int:
    if team_for_role(role) is None:
        return 0
    with _LOCK:
        _sync()
        d = _data()
        return sum(
            1 for item in d["gaps"] + d["reviews"]
            if item["status"] == "open" and can_act(role, item["team"])
            and (role != "OPS" or item["team"] not in TEAM_ROLE)
        )


def source_feedback(sid: str) -> dict:
    with _LOCK:
        _sync()
        d = _data()
        v = d["votes"].get(sid, {"up": 0, "down": 0})
        task = next((r for r in d["reviews"] if r["source_id"] == sid and r["status"] == "open"), None)
        gaps = sum(1 for g in d["gaps"] if g["status"] == "open" and (g.get("closest") or {}).get("source_id") == sid)
        return {
            "helpful": v["up"], "not_helpful": v["down"],
            "review": _review_view(task, "OPS") if task else None,
            "near_gaps": gaps,
        }


def _require(role: str, team: str) -> None:
    if role not in ks.EDIT_ROLES:
        raise PermissionError("Only HR, IT and Onboarding Ops can work these items.")
    if not can_act(role, team):
        raise PermissionError(f"This belongs to the {team} team — Onboarding Ops can pick it up.")


def dismiss_gap(gap_id: str, *, role: str, user: str, note: str = "") -> dict:
    with _LOCK:
        gap = next((g for g in _data()["gaps"] if g["id"] == gap_id), None)
        if gap is None:
            raise KeyError(gap_id)
        _require(role, gap["team"])
        gap.update(status="dismissed", resolution={
            "at": _now(), "by": user, "note": " ".join(note.split())[:200] or "Out of scope for NIA and IRA.",
        })
        _save()
        return _gap_view(gap, role)


def resolve_review(review_id: str, *, role: str, user: str, note: str = "") -> dict:
    with _LOCK:
        task = next((r for r in _data()["reviews"] if r["id"] == review_id), None)
        if task is None:
            raise KeyError(review_id)
        if task["status"] != "open":
            raise ValueError("This review is already closed.")
        _require(role, task["team"])
        task.update(status="resolved", resolution={
            "at": _now(), "by": user, "note": " ".join(note.split())[:200] or "Reviewed — no change needed.",
        })
        _save()
        return _review_view(task, role)
