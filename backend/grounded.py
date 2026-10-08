"""Grounded answers for NIA and IRA — retrieval over approved sources, with citations.

1. Retrieve: rank every approved passage the asker's audience may see (BM25 plus
   heading / keyword boosts), together with any record passages the caller adds
   (the joiner's own SmartStart record for IRA, a scoped joiner for NIA).
2. Gate: if the best passage doesn't cover the question, refuse and name the
   owning team instead of guessing.
3. Answer: with a configured language model, it may only use the numbered
   passages and must cite them; uncited sentences and unknown citations are
   dropped. Without a model, the best sentences are quoted with their citations.

Neither path can take actions. Anything that needs doing comes back as a
suggestion for a person to choose.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Iterable, Optional

from backend import knowledge_sources as ks
from backend import llm
from ira.policy_kb import _STOP

_FILLER = {
    "make", "makes", "happen", "happens", "really", "exactly", "actually", "also", "just", "like",
    "kind", "sort", "thing", "things", "anything", "something", "everything", "someone", "anyone",
    "us", "they", "them", "their", "its", "into", "than", "then", "too", "very", "not", "no", "yes",
    "ok", "okay", "hi", "hello", "hey", "pls", "thanks", "thank", "explain", "mean", "means", "tell",
}
_STOPWORDS = (_STOP - {"day", "days"}) | _FILLER


def _stem(tok: str) -> str:
    for suf in ("ing", "ies", "es", "ed", "s"):
        if len(tok) > 4 and tok.endswith(suf):
            tok = tok[: -len(suf)] + ("y" if suf == "ies" else "")
            break
    # Eight characters keep reimburse / reimbursed / reimbursable together without
    # folding "ServiceNow" into "service".
    return tok[:8]


def _tokens(text: str) -> list[str]:
    return [_stem(t) for t in re.findall(r"[a-z0-9]+", text.lower()) if t not in _STOPWORDS]


K1, B = 1.2, 0.5
UNSEEN_WEIGHT = 0.6
RECORD_WEIGHT = 0.85
# Catalog entries are short pointers ("see the Leave guide"); the documents they point at should win.
ORIGIN_WEIGHT = {"catalog": 0.75, "faq": 0.9}
LENIENT = (3.0, 0.6)
STRICT = (4.5, 0.75)
MODEL_GATE = (1.5, 0.34)
NEAR_MISS = (3.0, 0.42)

ASSISTANT = {"EMPLOYEE": "IRA", "HR": "NIA", "IT": "NIA", "MANAGER": "NIA", "OPS": "NIA"}
ASKER = {
    "EMPLOYEE": "a new joiner (employee)",
    "HR": "an HR / People Ops partner",
    "IT": "an IT Service Desk engineer",
    "MANAGER": "a hiring manager",
    "OPS": "an Onboarding Operations lead",
}


@dataclass(frozen=True)
class Chunk:
    source_id: str
    title: str
    heading: str
    text: str
    owner: str
    category: str
    updated: str
    origin: str
    actions: tuple[str, ...]
    tokens: tuple[str, ...]
    head: frozenset
    kw: frozenset
    phrases: tuple[tuple[str, ...], ...]
    kind: str = "source"
    titled: frozenset = frozenset()


def _chunk(src: ks.Source, sec: ks.Section) -> Chunk:
    rev = src.rev
    kw: set[str] = set()
    phrases = []
    for k in rev.keywords:
        toks = tuple(_tokens(k))
        kw.update(toks)
        if len(toks) >= 2:
            phrases.append(toks)
    return Chunk(
        source_id=src.id,
        title=rev.title,
        heading=sec.heading,
        text=sec.text,
        owner=rev.owner,
        category=rev.category,
        updated=rev.updated,
        origin=src.origin,
        actions=rev.actions,
        tokens=tuple(_tokens(f"{sec.heading} {sec.text}")),
        head=frozenset(_tokens(sec.heading)),
        kw=frozenset(kw),
        phrases=tuple(phrases),
        titled=frozenset(_tokens(rev.title)),
    )


def _chunks(src: ks.Source) -> list[Chunk]:
    # Catalog and FAQ entries are a few lines each; splitting them would let a stray
    # "Next step" line outrank the entry's own summary.
    if src.origin in ("catalog", "faq") and len(src.sections) > 1:
        whole = ks.Section(heading=src.rev.title, text=" ".join(s.text for s in src.sections))
        return [_chunk(src, whole)]
    return [_chunk(src, sec) for sec in src.sections]


def record_chunk(source_id: str, title: str, sentences: Iterable[str], *, heading: str = "On record") -> Optional[Chunk]:
    text = " ".join(s.strip() for s in sentences if s and s.strip())
    if not text:
        return None
    return Chunk(
        source_id=source_id,
        title=title,
        heading=heading,
        text=text,
        owner="SmartStart",
        category="Record",
        updated="live",
        origin="record",
        actions=(),
        tokens=tuple(_tokens(f"{heading} {text}")),
        head=frozenset(_tokens(heading)),
        kw=frozenset(),
        phrases=(),
        kind="record",
    )


class Index:
    def __init__(self, chunks: list[Chunk]):
        self.chunks = chunks
        self.n = max(1, len(chunks))
        df: dict[str, int] = {}
        for c in chunks:
            for t in set(c.tokens) | c.kw | c.titled:
                df[t] = df.get(t, 0) + 1
        self.df = df
        self.avg = sum(len(c.tokens) for c in chunks) / self.n if chunks else 1.0
        self.unseen = UNSEEN_WEIGHT * math.log(1 + (self.n + 0.5) / 1.5)

    def idf(self, t: str) -> float:
        d = self.df.get(t, 0)
        if not d:
            return self.unseen
        return math.log(1 + (self.n - d + 0.5) / (d + 0.5))

    def score(self, c: Chunk, q: set[str], q_seq: tuple[str, ...]) -> float:
        tf: dict[str, int] = {}
        for t in c.tokens:
            tf[t] = tf.get(t, 0) + 1
        norm = K1 * (1 - B + B * len(c.tokens) / self.avg)
        s = 0.0
        for t in q:
            w = self.idf(t)
            f = tf.get(t, 0)
            if f:
                s += w * f * (K1 + 1) / (f + norm)
            if t in c.head:
                s += 1.0 * w
            if t in c.titled:
                s += 1.0 * w
            elif t in c.kw:
                s += 0.8 * w
        named = c.titled & q
        if named:
            s += 1.5 * sum(self.idf(t) for t in named) * len(named) / len(c.titled)
        joined = " ".join(q_seq)
        for p in c.phrases:
            if " ".join(p) in joined:
                s += 3.0
        return s * (RECORD_WEIGHT if c.kind == "record" else ORIGIN_WEIGHT.get(c.origin, 1.0))

    def coverage(self, c: Chunk, q: set[str]) -> float:
        total = sum(self.idf(t) for t in q)
        if not total:
            return 0.0
        have = set(c.tokens) | c.kw | c.head | c.titled
        return sum(self.idf(t) for t in q & have) / total


_CACHE: dict[tuple, Index] = {}


def _index(audience: str, drafts: bool) -> Index:
    key = (ks.REVISION, audience, drafts)
    idx = _CACHE.get(key)
    if idx is None:
        chunks = [
            c
            for src in ks.approved_sources(drafts=drafts)
            if ks.audience_ok(src, audience)
            for c in _chunks(src)
        ]
        _CACHE.clear()
        idx = _CACHE[key] = Index(chunks)
    return idx


def retrieve(query: str, audience: str, *, extra: Iterable[Optional[Chunk]] = (), drafts: bool = False, k: int = 5):
    idx = _index(audience, drafts)
    q_seq = tuple(_tokens(query))
    q = set(q_seq)
    if not q:
        return idx, q, []
    pool = idx.chunks + [c for c in extra if c]
    scored = [(idx.score(c, q, q_seq), c) for c in pool]
    scored = [(s, c) for s, c in scored if s > 0]
    scored.sort(key=lambda t: -t[0])
    return idx, q, scored[:k]


# --- Answer building ---------------------------------------------------------------

_SENT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9“\"(])")


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in _SENT.split(text) if s.strip()]


def _cite(c: Chunk, n: int) -> dict:
    return {
        "n": n,
        "source_id": c.source_id,
        "title": c.title,
        "section": c.heading,
        "owner": c.owner,
        "category": c.category,
        "updated": c.updated,
        "origin": c.origin,
        "origin_label": "Your live record" if c.kind == "record" else ks.ORIGIN_LABELS.get(c.origin, c.origin),
        "kind": c.kind,
        "excerpt": c.text if len(c.text) <= 600 else c.text[:597].rsplit(" ", 1)[0] + "…",
    }


def source_line(c: dict) -> str:
    if c["kind"] == "record":
        return f"Source: {c['title']}"
    updated = f" · Updated {c['updated']}" if c.get("updated") else ""
    return f"Source: {c['title']} › {c['section']} · {c['owner']}{updated}"


def _actions(cites: list[dict], chunks: list[Chunk]) -> list[dict]:
    out: list[dict] = []
    seen: set[str] = set()
    for c in cites:
        if c["kind"] == "record" or c["source_id"] in seen:
            continue
        seen.add(c["source_id"])
        out.append({"kind": "open_source", "label": f"Read: {c['title']}", "source_id": c["source_id"]})
    for ch in chunks:
        for a in ch.actions[:2]:
            out.append({"kind": "next_step", "label": a, "owner": ch.owner})
        if ch.actions:
            break
    return out[:4]


def _pick(idx: Index, q: set[str], c: Chunk, n: int = 2) -> list[str]:
    sents = _sentences(c.text)
    if len(sents) <= max(n, 3 if n > 1 else 1):
        return sents
    scored = [(sum(idx.idf(t) for t in q & set(_tokens(s))), i) for i, s in enumerate(sents)]
    best = sorted(scored, key=lambda t: (-t[0], t[1]))[:n]
    if best[0][0] == 0:
        return sents[:n]
    keep = sorted(i for s, i in best if s > 0)
    return [sents[i] for i in keep]


def _extractive(idx: Index, q: set[str], hits: list[tuple[float, Chunk]]) -> tuple[str, list[Chunk]]:
    top_s, top = hits[0]
    parts = [(_pick(idx, q, top), top)]
    covered = q & set(top.tokens)
    for s, c in hits[1:4]:
        if s < 0.5 * top_s or (c.source_id, c.heading) == (top.source_id, top.heading):
            continue
        if c.origin in ("catalog", "faq") and top.origin not in ("catalog", "faq"):
            continue
        new = (q & set(c.tokens)) - covered
        if sum(idx.idf(t) for t in new) < 0.25 * sum(idx.idf(t) for t in q):
            continue
        parts.append((_pick(idx, new, c, 1), c))
        break
    text = " ".join(" ".join(sents) + f" [{i}]" for i, (sents, _c) in enumerate(parts, 1))
    return text, [c for _s, c in parts]


_SYSTEM = """You are {name}, the onboarding assistant inside SmartStart (a synthetic Waters sandbox).
Answer the question using ONLY the numbered sources below. Rules:
1. End every sentence with the marker of the source it came from, e.g. [1] or [1][2].
2. If the sources do not answer the question, return {{"answer": "NO_ANSWER", "citations": []}}.
3. Never add facts, numbers, names, dates or policy details that are not in the sources. No outside knowledge.
4. You cannot approve, send, grant, book or change anything. If something must be done, say who does it and where, as a recommendation for a person.
5. At most 4 short sentences, plain text, no headings or lists.
Return only JSON: {{"answer": "...", "citations": [numbers you used]}}"""


def _model(query: str, audience: str, hits: list[tuple[float, Chunk]]) -> Optional[tuple[str, list[Chunk]]]:
    passages = [c for _s, c in hits[:5]]
    listing = "\n\n".join(
        f"[{i}] {c.title} › {c.heading} (owner: {c.owner})\n{c.text}" for i, c in enumerate(passages, 1)
    )
    out = llm.complete_json(
        _SYSTEM.format(name=ASSISTANT.get(audience, "NIA")),
        f"Question: {query}\nAsked by: {ASKER.get(audience, 'an employee')}\n\nSources:\n{listing}",
    )
    if out is None:
        return None
    answer = " ".join(str(out.get("answer", "")).split())
    if not answer or answer.upper().startswith("NO_ANSWER"):
        return "", []
    kept, order = [], []
    for sent in _sentences(answer):
        nums = [int(n) for n in re.findall(r"\[(\d+)\]", sent)]
        valid = [n for n in nums if 1 <= n <= len(passages)]
        if not valid:
            continue
        for n in valid:
            if n not in order:
                order.append(n)
        kept.append(re.sub(r"\s*\[(\d+)\]", lambda m: f"[{m.group(1)}]" if 1 <= int(m.group(1)) <= len(passages) else "", sent))
    if not kept:
        return "", []
    renum = {old: new for new, old in enumerate(order, 1)}
    text = " ".join(kept)
    text = re.sub(r"\[(\d+)\]", lambda m: f" [{renum[int(m.group(1))]}]", text)
    text = re.sub(r"\s+", " ", text).replace(" .", ".").strip()
    return text, [passages[o - 1] for o in order]


def _plain(marked: str) -> str:
    return re.sub(r"\s*\[\d+\]", "", marked).strip()


def _refusal(idx: Index, q: set[str], hits: list[tuple[float, Chunk]], audience: str) -> dict:
    owner = None
    if hits:
        s, c = hits[0]
        if c.kind != "record" and s >= NEAR_MISS[0] and idx.coverage(c, q) >= NEAR_MISS[1]:
            owner = c.owner
    text = "I don't have an approved source that answers that, so I won't guess."
    if owner:
        text += f" The closest approved material is owned by {owner}, so they're the right people to ask."
    elif audience == "EMPLOYEE":
        text += " I can answer from approved onboarding, IT, HR, finance, security and workplace sources."
    else:
        text += " I answer from SmartStart records and the approved onboarding playbooks and policies."
    return {
        "grounded": False,
        "answer": text,
        "text": text,
        "citations": [],
        "actions": [{"kind": "ask_owner", "label": f"Ask {owner}", "owner": owner}] if owner else [],
        "owner_hint": owner,
        "engine": "retrieval",
        "model": None,
        "notice": "No approved source covers this question.",
    }


def answer(
    query: str,
    audience: str,
    *,
    extra: Iterable[Optional[Chunk]] = (),
    drafts: bool = False,
    strict: bool = False,
    use_model: bool = True,
) -> dict:
    """Answer from approved sources only, or refuse. Never acts."""
    idx, q, hits = retrieve(query, audience, extra=list(extra), drafts=drafts)
    if not hits:
        return _refusal(idx, q, hits, audience)
    if hits[0][1].origin == "catalog":
        full = next(
            (h for h in hits[1:] if h[1].origin not in ("catalog", "faq", "record")
             and h[0] >= 0.6 * hits[0][0] and idx.coverage(h[1], q) >= 0.99),
            None,
        )
        if full:
            hits = [full] + [h for h in hits if h is not full]
    top_s, top = hits[0]
    cov = idx.coverage(top, q)
    min_s, min_cov = STRICT if strict else LENIENT
    confident = top_s >= min_s and cov >= min_cov
    cfg = llm.config() if use_model else None
    engine, model = "retrieval", None
    marked, used = "", []
    if cfg and not strict and top_s >= MODEL_GATE[0] and cov >= MODEL_GATE[1]:
        got = _model(query, audience, hits)
        if got is not None:
            engine, model = "model", cfg["model"]
            marked, used = got
            if not used:
                return {**_refusal(idx, q, hits, audience), "engine": engine, "model": model}
    if not used:
        if not confident:
            return _refusal(idx, q, hits, audience)
        marked, used = _extractive(idx, q, hits)
        engine, model = "retrieval", None
    cites = [_cite(c, i) for i, c in enumerate(used, 1)]
    plain = _plain(marked)
    lines = [plain] + [source_line(c) for c in cites]
    n_src = len({c["source_id"] for c in cites})
    return {
        "grounded": True,
        "answer": marked,
        "text": "\n".join(lines),
        "citations": cites,
        "actions": _actions(cites, used),
        "owner_hint": used[0].owner if used else None,
        "engine": engine,
        "model": model,
        "confidence": round(min(1.0, cov), 2),
        "notice": f"Answered only from {n_src} approved source{'s' if n_src != 1 else ''}.",
    }


# --- IRA (employee) -------------------------------------------------------------------


def employee_record(ctx: Optional[dict]) -> Optional[Chunk]:
    if not ctx:
        return None
    emp = ctx.get("employee") or {}
    it = ctx.get("it") or {}
    docs = ctx.get("documents") or {}
    learn = ctx.get("learning") or {}
    lines = []
    if emp.get("manager_name"):
        lines.append(f"Your hiring manager is {emp['manager_name']}.")
    if emp.get("mentor_name"):
        lines.append(f"Your mentor is {emp['mentor_name']}.")
    if emp.get("joining_date"):
        lines.append(f"Your first day is {str(emp['joining_date'])[:10]}.")
    if docs.get("status"):
        lines.append(f"Your onboarding documents are {docs['status']}.")
    if it.get("hardware_status"):
        ticket = f" on ServiceNow ticket {it['ticket_id']}" if it.get("ticket_id") else ""
        lines.append(f"Your laptop status is {it['hardware_status']}{ticket}.")
    if it.get("software_access"):
        lines.append("Your approved software is " + ", ".join(it["software_access"]) + ".")
    if learn.get("track_name"):
        lines.append(f"Your learning track is {learn['track_name']}, {learn.get('completion_pct', 0)}% complete.")
    return record_chunk("record:me", "Your SmartStart record", lines, heading="Your onboarding record")


def ira_hook(query: str, ctx: Optional[dict], refuse: bool) -> Optional[dict]:
    g = answer(query, "EMPLOYEE", extra=[employee_record(ctx)])
    if not g["grounded"] and not refuse:
        return None
    return g


def install() -> None:
    import ira.brain as brain

    brain.GROUNDED_HOOK = ira_hook


def status() -> dict:
    lib = ks.library()
    return {"model": llm.status(), "sources": lib["counts"]["approved"], "drafts": lib["counts"]["drafts"]}
