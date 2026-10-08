"""Approved knowledge sources for NIA and IRA — the only text either assistant may answer from.

Built-in sources ship with the code (policy library, employer playbooks, the
app/team/process catalog and the IRA FAQ). People with edit rights save drafts
over any source or create new ones; a draft is never used for answers until
Onboarding Ops approves it. Approved revisions, drafts, retirements and the
history are kept in a JSON file so changes survive restarts and need no code
change.
"""

from __future__ import annotations

import json
import os
import re
import threading
from dataclasses import dataclass, field, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parent.parent
POLICY_DIR = ROOT / "ira" / "knowledge_base"
PLAYBOOK_DIR = Path(__file__).resolve().parent / "playbooks"

AUDIENCES = ("EMPLOYEE", "HR", "IT", "MANAGER", "OPS")
EMPLOYER = ("HR", "IT", "MANAGER", "OPS")
EDIT_ROLES = {"HR", "IT", "OPS"}
APPROVE_ROLES = {"OPS"}
ORIGIN_LABELS = {
    "policy": "Policy library",
    "playbook": "Employer playbook",
    "catalog": "Apps & teams catalog",
    "faq": "IRA FAQ",
    "custom": "Added in SmartStart",
}

_LOCK = threading.RLock()


@dataclass(frozen=True)
class Revision:
    title: str
    category: str
    owner: str
    audience: tuple[str, ...]
    body: str
    keywords: tuple[str, ...] = ()
    actions: tuple[str, ...] = ()
    updated: str = ""
    by: str = "SmartStart"
    at: str = ""
    note: str = ""

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "category": self.category,
            "owner": self.owner,
            "audience": list(self.audience),
            "body": self.body,
            "keywords": list(self.keywords),
            "actions": list(self.actions),
            "updated": self.updated,
            "by": self.by,
            "at": self.at,
            "note": self.note,
        }

    @staticmethod
    def from_dict(d: dict) -> "Revision":
        return Revision(
            title=d["title"],
            category=d.get("category", "General"),
            owner=d.get("owner", ""),
            audience=tuple(d.get("audience") or AUDIENCES),
            body=d.get("body", ""),
            keywords=tuple(d.get("keywords") or ()),
            actions=tuple(d.get("actions") or ()),
            updated=d.get("updated", ""),
            by=d.get("by", ""),
            at=d.get("at", ""),
            note=d.get("note", ""),
        )


@dataclass(frozen=True)
class Section:
    heading: str
    text: str


@dataclass(frozen=True)
class Source:
    id: str
    origin: str
    version: int
    rev: Revision
    sections: tuple[Section, ...] = field(default_factory=tuple)

    @property
    def title(self) -> str:
        return self.rev.title


# --- Parsing ------------------------------------------------------------------


def _split_list(raw: str) -> tuple[str, ...]:
    return tuple(p.strip() for p in raw.split(",") if p.strip())


def _front_matter(raw: str) -> tuple[dict[str, str], str]:
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n", raw, re.S)
    if not m:
        return {}, raw
    meta: dict[str, str] = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            meta[k.strip().lower()] = v.strip()
    return meta, raw[m.end():]


def sections_of(body: str, title: str = "") -> tuple[Section, ...]:
    out: list[Section] = []
    for block in re.split(r"^##\s+", body.strip(), flags=re.M):
        block = block.strip()
        if not block:
            continue
        heading, _, text = block.partition("\n")
        text = " ".join(text.split())
        if not text:
            text, heading = " ".join(heading.split()), title or "Overview"
        out.append(Section(heading=heading.strip(), text=text))
    return tuple(out)


def _audience(raw: str, default: tuple[str, ...]) -> tuple[str, ...]:
    picked = tuple(a for a in (x.upper() for x in _split_list(raw)) if a in AUDIENCES)
    return picked or default


# --- Built-in sources ----------------------------------------------------------


def _markdown_sources(directory: Path, origin: str, default_audience: tuple[str, ...]) -> list[Source]:
    out: list[Source] = []
    if not directory.is_dir():
        return out
    for path in sorted(directory.glob("*.md")):
        meta, body = _front_matter(path.read_text(encoding="utf-8"))
        rev = Revision(
            title=meta.get("title", path.stem),
            category=meta.get("category", "Policy"),
            owner=meta.get("owner", "Policy owner"),
            audience=_audience(meta.get("audience", ""), default_audience),
            body=body.strip(),
            keywords=_split_list(meta.get("keywords", "")),
            actions=_split_list(meta.get("actions", "")),
            updated=meta.get("updated", ""),
        )
        out.append(Source(id=f"{origin}:{path.stem}", origin=origin, version=1, rev=rev))
    return out


def _catalog_sources() -> list[Source]:
    from backend.knowledge import ENTITIES

    out = []
    for ent in ENTITIES.values():
        body = f"## Summary\n{ent.summary}"
        if ent.navigate_hint:
            body += f"\n\n## Next step\n{ent.navigate_hint}"
        rev = Revision(
            title=ent.name,
            category=ent.department,
            owner=ent.owner,
            audience=AUDIENCES,
            body=body,
            keywords=ent.keywords,
            actions=ent.actions,
            updated=ent.source_updated,
        )
        out.append(Source(id=f"catalog:{ent.id}", origin="catalog", version=1, rev=rev))
    return out


def _faq_sources() -> list[Source]:
    from ira.faq import FAQ

    out = []
    for question, answer, keywords in FAQ:
        slug = re.sub(r"[^a-z0-9]+", "-", question.lower()).strip("-")[:48]
        rev = Revision(
            title=question,
            category="FAQ",
            owner="SmartStart",
            audience=("EMPLOYEE",),
            body=f"## {question}\n{answer}",
            keywords=keywords,
            updated="Sep 2026",
        )
        out.append(Source(id=f"faq:{slug}", origin="faq", version=1, rev=rev))
    return out


_BUILTIN: dict[str, Source] | None = None


def _builtins() -> dict[str, Source]:
    global _BUILTIN
    if _BUILTIN is None:
        found = (
            _markdown_sources(POLICY_DIR, "policy", AUDIENCES)
            + _markdown_sources(PLAYBOOK_DIR, "playbook", EMPLOYER)
            + _catalog_sources()
            + _faq_sources()
        )
        _BUILTIN = {s.id: s for s in found}
    return _BUILTIN


# --- Managed overlay (drafts, approvals, retirements) ----------------------------

_OVERLAY: dict[str, dict] | None = None
_OVERLAY_PATH: Path | None = None
REVISION = 0


def store_path() -> Path:
    return Path(os.environ.get("SMARTSTART_KB_STORE") or ROOT / "var" / "knowledge_sources.json")


def _overlay() -> dict[str, dict]:
    global _OVERLAY, _OVERLAY_PATH
    path = store_path()
    if _OVERLAY is None or _OVERLAY_PATH != path:
        _OVERLAY_PATH = path
        try:
            _OVERLAY = json.loads(path.read_text(encoding="utf-8")).get("sources", {})
        except (OSError, ValueError):
            _OVERLAY = {}
    return _OVERLAY


def _save() -> None:
    global REVISION
    path = store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps({"version": 1, "sources": _overlay()}, indent=2), encoding="utf-8")
    os.replace(tmp, path)
    REVISION += 1


def reset(path: Optional[str] = None) -> None:
    """Forget the in-memory overlay (tests point it at a temp file)."""
    global _OVERLAY, REVISION
    with _LOCK:
        if path is not None:
            os.environ["SMARTSTART_KB_STORE"] = path
        _OVERLAY = None
        REVISION += 1


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%b %Y")


def _with_sections(src: Source) -> Source:
    return replace(src, sections=sections_of(src.rev.body, src.rev.title))


def _resolve(sid: str, *, drafts: bool) -> Optional[Source]:
    entry = _overlay().get(sid, {})
    base = _builtins().get(sid)
    if entry.get("retired"):
        return None
    rev_d = (drafts and entry.get("draft")) or entry.get("approved")
    if rev_d:
        origin = base.origin if base else "custom"
        return _with_sections(Source(id=sid, origin=origin, version=int(entry.get("version", 1)), rev=Revision.from_dict(rev_d)))
    return _with_sections(base) if base else None


def approved_sources(*, drafts: bool = False) -> list[Source]:
    """Every source the assistants may answer from (approved, not retired)."""
    with _LOCK:
        ids = list(_builtins()) + [i for i in _overlay() if i not in _builtins()]
        return [s for s in (_resolve(i, drafts=drafts) for i in ids) if s]


def approved(sid: str) -> Optional[Source]:
    with _LOCK:
        return _resolve(sid, drafts=False)


# --- Catalog bridge (rules in backend.knowledge read edited entities) -------------


def entity_view(ent):
    """The catalog entity as currently approved — None when retired."""
    sid = f"catalog:{ent.id}"
    with _LOCK:
        entry = _overlay().get(sid)
        if not entry:
            return ent
        if entry.get("retired"):
            return None
        if not entry.get("approved"):
            return ent
        rev = Revision.from_dict(entry["approved"])
    secs = {s.heading.lower(): s.text for s in sections_of(rev.body, rev.title)}
    summary = secs.get("summary") or next(iter(secs.values()), ent.summary)
    return replace(
        ent,
        name=rev.title,
        summary=summary,
        owner=rev.owner,
        navigate_hint=secs.get("next step", ""),
        keywords=tuple(k.lower() for k in rev.keywords),
        source_updated=rev.updated or ent.source_updated,
    )


# --- Library management -----------------------------------------------------------


def _status(sid: str) -> str:
    entry = _overlay().get(sid, {})
    if entry.get("retired"):
        return "retired"
    if entry.get("approved") or sid in _builtins():
        return "approved"
    return "draft"


def _summary(sid: str) -> dict:
    entry = _overlay().get(sid, {})
    base = _builtins().get(sid)
    rev_d = entry.get("approved") or (base.rev.to_dict() if base else entry.get("draft"))
    rev = Revision.from_dict(rev_d)
    draft = entry.get("draft")
    return {
        "id": sid,
        "origin": base.origin if base else "custom",
        "origin_label": ORIGIN_LABELS[base.origin if base else "custom"],
        "title": rev.title,
        "category": rev.category,
        "owner": rev.owner,
        "audience": list(rev.audience),
        "updated": rev.updated,
        "status": _status(sid),
        "version": int(entry.get("version", 1 if base else 0)),
        "has_draft": bool(draft),
        "draft_by": (draft or {}).get("by"),
        "edited": bool(entry.get("approved")),
        "sections": len(sections_of(rev.body, rev.title)),
    }


def library() -> dict:
    with _LOCK:
        ids = list(_builtins()) + [i for i in _overlay() if i not in _builtins()]
        rows = [_summary(i) for i in ids]
    counts = {
        "approved": sum(r["status"] == "approved" for r in rows),
        "drafts": sum(r["has_draft"] for r in rows),
        "retired": sum(r["status"] == "retired" for r in rows),
        "edited": sum(r["edited"] for r in rows),
    }
    return {"sources": rows, "counts": counts, "total": len(rows)}


def detail(sid: str) -> dict:
    with _LOCK:
        if sid not in _builtins() and sid not in _overlay():
            raise KeyError(sid)
        entry = _overlay().get(sid, {})
        base = _builtins().get(sid)
        live = entry.get("approved") or (base.rev.to_dict() if base else None)
        out = _summary(sid)
        out.update(
            approved=live,
            draft=entry.get("draft"),
            history=list(reversed(entry.get("history", []))),
            builtin=base is not None,
            approved_sections=[{"heading": s.heading, "text": s.text} for s in sections_of(live["body"], live["title"])] if live else [],
        )
        return out


def _clean(fields: dict) -> Revision:
    title = " ".join(str(fields.get("title", "")).split())
    owner = " ".join(str(fields.get("owner", "")).split())
    body = str(fields.get("body", "")).replace("\r\n", "\n").strip()
    category = " ".join(str(fields.get("category", "") or "General").split())
    if not 3 <= len(title) <= 120:
        raise ValueError("Give the source a title between 3 and 120 characters.")
    if not owner or len(owner) > 80:
        raise ValueError("Name the team that owns this source.")
    if not 20 <= len(body) <= 20000:
        raise ValueError("The source text must be between 20 and 20,000 characters.")
    audience = tuple(a for a in (str(x).upper() for x in fields.get("audience") or ()) if a in AUDIENCES)
    if not audience:
        raise ValueError("Pick at least one audience who may be answered from this source.")
    kw = fields.get("keywords") or ()
    kw = _split_list(kw) if isinstance(kw, str) else tuple(str(k).strip() for k in kw if str(k).strip())
    actions = fields.get("actions") or ()
    actions = _split_list(actions) if isinstance(actions, str) else tuple(str(a).strip() for a in actions if str(a).strip())
    return Revision(
        title=title,
        category=category[:40],
        owner=owner,
        audience=tuple(a for a in AUDIENCES if a in audience),
        body=body,
        keywords=kw[:30],
        actions=actions[:5],
        note=" ".join(str(fields.get("note", "")).split())[:200],
    )


def _history(entry: dict, action: str, user: str, note: str = "") -> None:
    entry.setdefault("history", []).append(
        {"action": action, "by": user, "at": _now(), "version": int(entry.get("version", 0)), "note": note}
    )


def _require(role: str, allowed: set[str], what: str) -> None:
    if role not in allowed:
        raise PermissionError(what)


def save_draft(sid: Optional[str], fields: dict, *, role: str, user: str) -> dict:
    _require(role, EDIT_ROLES, "Only HR, IT and Onboarding Ops can edit knowledge sources.")
    rev = _clean(fields)
    with _LOCK:
        ov = _overlay()
        if sid is None:
            slug = re.sub(r"[^a-z0-9]+", "-", rev.title.lower()).strip("-")[:48] or "source"
            sid, n = f"custom:{slug}", 2
            while sid in ov or sid in _builtins():
                sid, n = f"custom:{slug}-{n}", n + 1
            ov[sid] = {"version": 0}
            action = "created"
        elif sid not in ov and sid not in _builtins():
            raise KeyError(sid)
        else:
            action = "drafted"
        entry = ov.setdefault(sid, {"version": 1 if sid in _builtins() else 0})
        if entry.get("retired"):
            raise ValueError("Restore this source before editing it.")
        entry["draft"] = replace(rev, by=user, at=_now()).to_dict()
        _history(entry, action, user, rev.note)
        _save()
    return detail(sid)


def approve(sid: str, *, role: str, user: str) -> dict:
    _require(role, APPROVE_ROLES, "Only Onboarding Ops can approve knowledge sources.")
    with _LOCK:
        entry = _overlay().get(sid)
        if not entry or not entry.get("draft"):
            raise ValueError("There is no draft waiting for approval.")
        rev = Revision.from_dict(entry["draft"])
        entry["approved"] = replace(rev, updated=_today(), at=_now()).to_dict()
        entry["approved_by"] = user
        entry["draft"] = None
        entry["version"] = int(entry.get("version", 0)) + 1
        _history(entry, "approved", user, rev.note)
        _save()
    return detail(sid)


def discard(sid: str, *, role: str, user: str) -> dict:
    _require(role, EDIT_ROLES, "Only HR, IT and Onboarding Ops can edit knowledge sources.")
    with _LOCK:
        entry = _overlay().get(sid)
        if not entry or not entry.get("draft"):
            raise ValueError("There is no draft to discard.")
        entry["draft"] = None
        _history(entry, "discarded", user)
        if not entry.get("approved") and sid not in _builtins():
            del _overlay()[sid]
            _save()
            return {"id": sid, "deleted": True}
        _save()
    return detail(sid)


def retire(sid: str, *, role: str, user: str, restore: bool = False) -> dict:
    _require(role, APPROVE_ROLES, "Only Onboarding Ops can retire or restore knowledge sources.")
    with _LOCK:
        if sid not in _builtins() and sid not in _overlay():
            raise KeyError(sid)
        entry = _overlay().setdefault(sid, {"version": 1})
        if not restore and not (entry.get("approved") or sid in _builtins()):
            raise ValueError("Only an approved source can be retired.")
        entry["retired"] = not restore
        _history(entry, "restored" if restore else "retired", user)
        _save()
    return detail(sid)


def audience_ok(src: Source, audience: str) -> bool:
    return audience in src.rev.audience
