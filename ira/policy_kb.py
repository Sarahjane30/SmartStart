"""Approved policy library — HR, Finance, Legal, Information Security.

Markdown files in ``ira/knowledge_base`` are the baseline sources IRA may quote.
Each file has a small front-matter header and ``## Section`` blocks; retrieval
scores sections so answers stay short and cite the exact policy.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

KB_DIR = Path(__file__).resolve().parent / "knowledge_base"

_STOP = {
    "a", "an", "the", "is", "are", "am", "was", "be", "do", "does", "did", "i", "me", "my",
    "we", "our", "you", "your", "it", "to", "of", "in", "on", "for", "at", "by", "with",
    "and", "or", "what", "whats", "which", "who", "how", "when", "where", "why", "can",
    "could", "should", "would", "will", "get", "there", "this", "that", "about", "any",
    "have", "has", "if", "from", "as", "so", "up", "day", "days", "much", "many", "need",
    "tell", "please", "know", "s", "t", "ira", "waters", "company",
}

_POLICY_INTENT = (
    "policy", "policies", "allowed", "can i ", "may i ", "am i eligible", "eligible",
    "entitle", "how much", "how many", "limit", "when will", "when do i get", "what time",
    "rule", "reimburs", "claim", "report ", "what if i clicked", "is it ok", "am i allowed",
    "declare", "guideline", "standard",
)


def _stem(tok: str) -> str:
    for suf in ("ing", "ies", "es", "ed", "s"):
        if len(tok) > 4 and tok.endswith(suf):
            tok = tok[: -len(suf)] + ("y" if suf == "ies" else "")
            break
    # Prefix match keeps reimburse / reimbursed / reimbursable together.
    return tok[:7]


def _tokens(text: str) -> list[str]:
    return [_stem(t) for t in re.findall(r"[a-z0-9]+", text.lower()) if t not in _STOP]


@dataclass
class PolicySection:
    heading: str
    body: str
    tokens: list[str] = field(default_factory=list)
    head_tokens: set[str] = field(default_factory=set)


@dataclass
class PolicyDoc:
    slug: str
    title: str
    category: str
    owner: str
    updated: str
    keywords: tuple[str, ...]
    sections: list[PolicySection]
    keyword_tokens: tuple[tuple[str, ...], ...] = ()


@dataclass
class PolicyHit:
    doc: PolicyDoc
    section: PolicySection
    score: float
    keyword_match: str | None
    multiword_match: bool


def _parse(path: Path) -> PolicyDoc | None:
    raw = path.read_text(encoding="utf-8")
    meta: dict[str, str] = {}
    body = raw
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n", raw, re.S)
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip().lower()] = v.strip()
        body = raw[m.end():]
    sections: list[PolicySection] = []
    for block in re.split(r"^##\s+", body, flags=re.M):
        block = block.strip()
        if not block:
            continue
        heading, _, text = block.partition("\n")
        text = " ".join(text.split())
        if not text:
            continue
        sections.append(
            PolicySection(
                heading=heading.strip(),
                body=text,
                tokens=_tokens(heading + " " + text),
                head_tokens=set(_tokens(heading)),
            )
        )
    if not sections:
        return None
    keywords = tuple(k.strip() for k in meta.get("keywords", "").split(",") if k.strip())
    return PolicyDoc(
        slug=path.stem,
        title=meta.get("title", path.stem),
        category=meta.get("category", "Policy"),
        owner=meta.get("owner", "Policy owner"),
        updated=meta.get("updated", ""),
        keywords=keywords,
        sections=sections,
        keyword_tokens=tuple(tuple(_tokens(k)) for k in keywords),
    )


@lru_cache(maxsize=1)
def load_policies() -> tuple[PolicyDoc, ...]:
    if not KB_DIR.is_dir():
        return ()
    docs = [d for d in (_parse(p) for p in sorted(KB_DIR.glob("*.md"))) if d]
    return tuple(docs)


@lru_cache(maxsize=1)
def _idf() -> dict[str, float]:
    sections = [s for d in load_policies() for s in d.sections]
    n = max(1, len(sections))
    df: dict[str, int] = {}
    for s in sections:
        for t in set(s.tokens):
            df[t] = df.get(t, 0) + 1
    return {t: math.log(1 + n / c) for t, c in df.items()}


def has_policy_intent(query: str) -> bool:
    q = f" {query.lower().strip()} "
    return any(k in q for k in _POLICY_INTENT)


def search_policies(query: str, *, limit: int = 1) -> list[PolicyHit]:
    q_tokens = _tokens(query)
    if not q_tokens:
        return []
    q_set = set(q_tokens)
    idf = _idf()
    hits: list[PolicyHit] = []
    for doc in load_policies():
        best_kw: str | None = None
        best_kw_len = 0
        for kw, kw_toks in zip(doc.keywords, doc.keyword_tokens):
            if kw_toks and set(kw_toks) <= q_set and len(kw_toks) > best_kw_len:
                best_kw, best_kw_len = kw, len(kw_toks)
        doc_boost = 2.5 * best_kw_len if best_kw else 0.0
        title_toks = set(_tokens(doc.title))
        for sec in doc.sections:
            tf: dict[str, int] = {}
            for t in sec.tokens:
                tf[t] = tf.get(t, 0) + 1
            score = 0.0
            for t in q_set:
                if t in tf:
                    score += idf.get(t, 1.0) * (1 + math.log(tf[t]))
                if t in sec.head_tokens:
                    score += 2.0 * idf.get(t, 1.0)
                if t in title_toks:
                    score += 0.5
            if score <= 0 and not best_kw:
                continue
            hits.append(
                PolicyHit(
                    doc=doc,
                    section=sec,
                    score=score + doc_boost,
                    keyword_match=best_kw,
                    multiword_match=best_kw_len >= 2,
                )
            )
    hits.sort(key=lambda h: h.score, reverse=True)
    return hits[:limit]


def best_policy(query: str, *, strict: bool) -> PolicyHit | None:
    """Return a confident hit, or None.

    ``strict`` — only when the query clearly asks about a policy topic, so personal
    and navigation intents keep priority. Non-strict is the fallback before
    "no approved source".
    """
    hits = search_policies(query, limit=1)
    if not hits:
        return None
    hit = hits[0]
    if strict:
        if not hit.keyword_match:
            return None
        if not (hit.multiword_match or has_policy_intent(query) or hit.score >= 9.0):
            return None
        if not hit.multiword_match and _coverage(hit, query) < 0.5:
            return None
        return hit if hit.score >= 4.0 else None
    if hit.keyword_match or (set(_tokens(query)) & hit.section.head_tokens):
        if not hit.multiword_match and _coverage(hit, query) < 0.5:
            return None
        return hit if hit.score >= 3.5 else None
    return None


def _coverage(hit: PolicyHit, query: str) -> float:
    """Share of the query's meaningful words (idf-weighted) that the matched policy actually talks about."""
    q_set = set(_tokens(query))
    if not q_set:
        return 0.0
    idf = _idf()
    unseen = max(idf.values(), default=1.0)
    known = set(hit.section.tokens) | set(_tokens(hit.doc.title)) | {t for kw in hit.doc.keyword_tokens for t in kw}
    total = sum(idf.get(t, unseen) for t in q_set)
    covered = sum(idf.get(t, unseen) for t in q_set if t in known)
    return covered / total if total else 0.0


def _first_sentences(text: str, n: int = 3) -> str:
    parts = re.split(r"(?<=[.!?])\s+", text)
    return " ".join(parts[:n]).strip()


def format_policy_answer(hit: PolicyHit, query: str = "") -> str:
    doc = hit.doc
    updated = f" · Updated {doc.updated}" if doc.updated else ""
    q = query.lower()
    if any(w in q for w in ("where", "find", "show me", "open")) and any(
        w in q for w in ("policy", "guide", "standard")
    ):
        covers = ", ".join(s.heading for s in doc.sections[:5])
        return (
            f"I found the approved {doc.title}, owned by {doc.owner}.\n"
            f"It covers: {covers}.\n"
            f"Ask me about any of these and I’ll quote the exact section.\n"
            f"Source: {doc.title} · {doc.owner}{updated}"
        )
    return (
        f"{_first_sentences(hit.section.body)}\n"
        f"Source: {doc.title} › {hit.section.heading} · {doc.owner}{updated}"
    )


def answer_from_policies(query: str, *, strict: bool) -> str | None:
    hit = best_policy(query, strict=strict)
    return format_policy_answer(hit, query) if hit else None
