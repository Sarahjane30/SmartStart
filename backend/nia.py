"""NIA — New-Hire Intelligence Assistant (employer-side copilot).

NIA answers "what does the organization need to do?" for the signed-in employer.
It never builds its own view of the cohort: every answer is derived from the SAME
``RoleContext`` the Command Center uses (scope, bottlenecks, journey, risk,
priorities), plus the existing risk explanation and assignable-owner helpers.

Answers are deterministic and grounded — no free-text generation, so NIA cannot
invent people, tickets, owners, deadlines or policy. When data is missing she says so.
"""

from __future__ import annotations

import os
import re
from collections import Counter
from typing import Callable, Optional

from backend import onboarding_cases as cases
from backend.analytics import ANALYTICS_AS_OF
from backend.database import store
from backend.employee_experience import build_learning_track, course_library, learning_summary
from backend.intelligence import employer_at_risk_explanation
from backend.models import DocumentStatus, HardwareStatus, OnboardingState
from backend.owners import build_assignable_owners
from backend.role_context import (
    DOCS_BLOCKED_DAYS,
    ROLE_HR,
    ROLE_IT,
    ROLE_LABELS,
    ROLE_MANAGER,
    ROLE_OPS,
    JoinerFacts,
    RoleContext,
    access_items,
    is_resolved_for,
    lens_queue,
    role_actions,
)

NO_DATA = "I couldn't find that information in the approved SmartStart data, so I don't want to guess."
NO_ACCESS = "I can't show that information for your current access level."

# Independent mock source systems (separate apps — NIA only links out, never embeds).
SOURCE_SYSTEMS = {
    "iCIMS": {"label": "Open iCIMS", "port": 8100, "env": "NIA_ICIMS_URL", "domain": "Documents & offers"},
    "ServiceNow": {"label": "Open Service Desk", "port": 8200, "env": "NIA_SERVICENOW_URL", "domain": "Laptop & access"},
    "Jira": {"label": "Open Jira", "port": 8300, "env": "NIA_JIRA_URL", "domain": "Projects & tasks"},
}

STAGE_LABELS = {
    OnboardingState.OFFER_ACCEPTED: "Offer accepted",
    OnboardingState.DOCS_SUBMITTED: "Documents submitted",
    OnboardingState.IT_PROVISIONED: "IT provisioned",
    OnboardingState.DAY1_ORIENTED: "Day-1 complete",
    OnboardingState.PROJECT_READY: "Project ready",
}
STAGE_ORDER = list(OnboardingState)

SUGGESTIONS = {
    ROLE_HR: ["Show my priorities", "Who needs HR action?", "Why is someone at risk?", "Show pending documents"],
    ROLE_IT: ["Show SLA breaches", "What's blocking Day 1?", "Who is waiting for access?", "What should I fix first?"],
    ROLE_MANAGER: ["Who needs me?", "What should I do today?", "Who isn't project-ready?", "Show my joiners"],
    ROLE_OPS: ["Where are people stuck?", "What is causing delays?", "Which team needs attention?", "Show cohort risks"],
}

QUEUE_OWNER = {"HR": "HR (People Ops)", "IT": "IT Service Desk"}


# --- Grounded helpers ---------------------------------------------------------


def first(f: JoinerFacts) -> str:
    return f.joiner.name.split()[0]


def source_link(system: str) -> dict:
    meta = SOURCE_SYSTEMS[system]
    return {
        "system": system,
        "label": meta["label"],
        "url": os.environ.get(meta["env"]) or None,
        "port": meta["port"],
        "domain": meta["domain"],
    }


def record_refs(f: JoinerFacts) -> dict:
    """Mock-system record IDs share the joiner ordinal (see icims/servicenow/jira seeds)."""
    parts = f.id.split("-")
    seed, ordinal = parts[2], int(parts[3])
    return {
        "iCIMS": f"CAND-{seed}-{ordinal:03d}",
        "ServiceNow": f"RITM{seed}{ordinal:03d}",
        "Jira": f"ONB-{ordinal}",
    }


def blocker_info(f: JoinerFacts) -> dict:
    """Owner / source / stage for the joiner's current bottleneck (same engine as the dashboard)."""
    bn = f.bottleneck
    mgr = f.joiner.manager_name
    if bn is None:
        return {"owner": None, "source": "SmartStart", "stage": "Project", "queue": "Done"}
    if f.queue == "HR":
        return {"owner": QUEUE_OWNER["HR"], "source": "iCIMS", "stage": "HR", "queue": "HR"}
    if f.queue == "IT":
        return {"owner": QUEUE_OWNER["IT"], "source": "ServiceNow", "stage": "IT", "queue": "IT"}
    if "project" in bn.lower():
        return {"owner": mgr, "source": "Jira", "stage": "Project", "queue": "Manager"}
    return {"owner": mgr, "source": "SmartStart", "stage": "Manager", "queue": "Manager"}


def blocker_sentence(f: JoinerFacts) -> str:
    d, t, n = f.docs, f.ticket, first(f)
    bn = f.bottleneck or ""
    if bn.startswith("Documents pending"):
        return (
            f"{n}'s document packet is still pending in iCIMS ({d.form_count} forms, waiting "
            f"{d.waiting_days} day(s)), so onboarding can't move to the next stage yet"
        )
    if bn.startswith("Document rework"):
        return f"{n}'s documents were sent back for rework in iCIMS, so the HR step has to be redone"
    if bn.startswith("IT SLA"):
        return (
            f"{n}'s laptop ticket has breached SLA in ServiceNow — {t.lead_time_days} days against a "
            f"{t.sla_target_days}-day target, with hardware still {t.hardware_status.value}"
        )
    if bn.startswith("IT provisioning"):
        return (
            f"{n}'s laptop is still being provisioned in ServiceNow (hardware {t.hardware_status.value}, "
            f"{t.lead_time_days} of {t.sla_target_days} target days used)"
        )
    if bn.startswith("Awaiting Day-1"):
        return f"IT setup is complete, but {n}'s Day-1 orientation hasn't happened yet"
    if bn.startswith("Awaiting project"):
        return f"{n} has completed Day 1 but still has no project assignment in Jira"
    if bn.startswith("Offer-to-docs"):
        return f"{n}'s offer-to-docs handoff hasn't been completed yet"
    return f"{n} is Project Ready with no open blocker"


def impact_sentence(f: JoinerFacts) -> str:
    q = blocker_info(f)["stage"]
    if f.bottleneck is None:
        return "None — onboarding is complete."
    if q == "HR":
        return "Onboarding can't progress past the documents stage until this clears."
    if q == "IT":
        return "IT provisioning can't complete, which holds Day-1 orientation and project readiness."
    if q == "Manager":
        return "Project assignment can't start until Day-1 orientation is done."
    return "The joiner can't reach Project Ready until a project is assigned."


def start_phrase(f: JoinerFacts) -> str:
    days = (f.joiner.joining_date - ANALYTICS_AS_OF.date()).days
    date = f.joiner.joining_date.isoformat()
    if days > 0:
        return f"starts in {days} day(s) ({date})"
    if days == 0:
        return f"starts today ({date})"
    return f"started {-days} day(s) ago ({date})"


def health_phrase(f: JoinerFacts) -> str:
    return {"blocked": "blocked", "at_risk": "at risk", "on_track": "on track"}[f.health]


def priority_reasons(f: JoinerFacts, role: str = ROLE_OPS) -> list[str]:
    """Only signals that exist in SmartStart data — no invented urgency."""
    reasons: list[str] = []
    t, d = f.ticket, f.docs
    it_reason = f"laptop SLA breached ({t.lead_time_days}d vs {t.sla_target_days}d target)" if f.sla_open else None
    hr_reason = "documents in rework" if d.rework_flag else (
        f"document packet pending {d.waiting_days}d" if d.status == DocumentStatus.PENDING else None
    )
    ordered = [it_reason, hr_reason] if role in (ROLE_IT, ROLE_OPS) else [hr_reason, it_reason]
    if role == ROLE_MANAGER and f.joiner.current_state == OnboardingState.DAY1_ORIENTED:
        reasons.append("Day 1 complete with no project assignment")
    elif role == ROLE_MANAGER and f.joiner.current_state == OnboardingState.IT_PROVISIONED:
        reasons.append("laptop delivered, Day-1 orientation not done yet")
    reasons.extend(r for r in ordered if r)
    if f.health == "blocked" and not reasons:
        reasons.append("a journey step is blocked")
    if not f.ready:
        reasons.append(start_phrase(f))
    reasons.append(f"risk score {f.risk_score:.0f}")
    return reasons


def role_lens(f: JoinerFacts, role: str) -> Optional[dict]:
    """The part of this joiner's journey the viewer's role owns (None when nothing is theirs)."""
    d, t = f.docs, f.ticket
    if role == ROLE_HR and f.queue == "HR":
        issue = "Document rework" if d.rework_flag else (
            f"Documents pending {d.waiting_days}d" if d.status == DocumentStatus.PENDING else "Offer-to-docs handoff"
        )
        return {"issue": issue, "owner": QUEUE_OWNER["HR"], "source": "iCIMS", "stage": "HR", "queue": "HR"}
    if role == ROLE_IT and f.access_open and not f.ready:
        issue = (
            f"Laptop SLA breached ({t.lead_time_days}d vs {t.sla_target_days}d)"
            if f.sla_open else f"Laptop {t.hardware_status.value.lower()} · access pending"
        )
        return {"issue": issue, "owner": QUEUE_OWNER["IT"], "source": "ServiceNow", "stage": "IT", "queue": "IT"}
    if role == ROLE_MANAGER:
        if f.joiner.current_state == OnboardingState.IT_PROVISIONED:
            return {"issue": "Day-1 orientation due", "owner": f.joiner.manager_name, "source": "SmartStart", "stage": "Manager", "queue": "Manager"}
        if f.joiner.current_state == OnboardingState.DAY1_ORIENTED:
            return {"issue": "Project assignment pending", "owner": f.joiner.manager_name, "source": "Jira", "stage": "Project", "queue": "Manager"}
    return None


def viewer_info(f: JoinerFacts, role: str) -> dict:
    lens = role_lens(f, role)
    if lens:
        return lens
    info = blocker_info(f)
    return {**info, "issue": f.bottleneck or "No open blocker"}


def poss(name: str) -> str:
    return f"{name}'" if name.endswith("s") else f"{name}'s"


def _cap(s: str) -> str:
    return s[:1].upper() + s[1:]


def recommendation(f: JoinerFacts, role: str) -> str:
    info = viewer_info(f, role)
    src = info["source"]
    action = role_actions(f, role)[0]
    if action["kind"] in ("done", "info"):
        if f.bottleneck is None:
            return "No action needed — onboarding is complete."
        return f"Nothing is waiting on you — {info['owner']} owns the current step in {src}."
    where = f" in {src}" if src != "SmartStart" else " in SmartStart"
    return f"{action['label']}{where}."


# --- Reply builder ------------------------------------------------------------


class Reply:
    def __init__(self, ctx: RoleContext, intent: str, text: str = ""):
        self.ctx = ctx
        self.intent = intent
        self.text = text
        self.blocks: list[dict] = []
        self.sources: list[str] = []
        self.suggestions: list[str] = []
        self.focus: Optional[str] = None

    def source(self, system: str) -> None:
        if system and system not in self.sources:
            self.sources.append(system)

    def facts(self, rows: list[tuple[str, str]], title: str = "") -> None:
        self.blocks.append({"type": "facts", "title": title, "rows": [{"label": k, "value": v} for k, v in rows if v]})

    def bullets(self, items: list[str], title: str = "") -> None:
        if items:
            self.blocks.append({"type": "bullets", "title": title, "items": items})

    def joiners(self, facts: list[JoinerFacts], title: str = "", note: Callable[[JoinerFacts], str] | None = None) -> None:
        role = self.ctx.role
        items = []
        for f in facts:
            info = viewer_info(f, role)
            if info["source"] != "SmartStart" and f.bottleneck:
                self.source(info["source"])
            items.append({
                "id": f.id,
                "name": f.joiner.name,
                "subtitle": f"{f.joiner.role_type.value} · {f.joiner.department}"
                + ("" if role == ROLE_MANAGER else f" · {f.joiner.manager_name}"),
                "stage": STAGE_LABELS[f.joiner.current_state],
                "health": f.health,
                "issue": info["issue"],
                "overall": f.bottleneck if f.bottleneck and info["queue"] != f.queue else None,
                "owner": info["owner"],
                "source": info["source"] if f.bottleneck else None,
                "risk_score": round(f.risk_score),
                "note": note(f) if note else role_actions(f, role)[0]["label"],
                "journey": f.journey,
            })
        self.blocks.append({"type": "joiners", "title": title, "items": items})

    def link(self, system: str, record: str = "") -> None:
        self.source(system)
        link = source_link(system)
        link["record"] = record
        self.blocks.append({"type": "link", **link})

    def confirm(self, payload: dict) -> None:
        self.blocks.append({"type": "confirm", **payload})

    def to_dict(self) -> dict:
        return {
            "intent": self.intent,
            "role": self.ctx.role,
            "text": self.text,
            "blocks": self.blocks,
            "sources": self.sources or ["SmartStart"],
            "suggestions": self.suggestions or SUGGESTIONS[self.ctx.role][:3],
            "focus_joiner_id": self.focus,
            "synthetic": True,
        }


# --- Name resolution (scoped) -------------------------------------------------


def _find_people(ctx: RoleContext, text: str) -> tuple[list[JoinerFacts], bool]:
    """Visible joiners named in the text, plus whether a hidden joiner was named instead."""
    low = text.lower()
    full_hits = [f for f in ctx.visible if re.search(rf"\b{re.escape(f.joiner.name.lower())}\b", low)]
    if full_hits:
        return full_hits, False
    first_hits = [f for f in ctx.visible if re.search(rf"\b{re.escape(first(f).lower())}\b", low)]
    if first_hits:
        return first_hits, False
    visible_ids = {f.id for f in ctx.visible}
    for j in store.list_joiners():
        if j.id in visible_ids:
            continue
        if re.search(rf"\b{re.escape(j.name.lower())}\b", low) or re.search(
            rf"\b{re.escape(j.name.split()[0].lower())}\b", low
        ):
            return [], True
    return [], False


_PRONOUN = re.compile(r"\b(she|he|her|him|his|they|them|their|this|that|it|this person|this joiner)\b")


# --- Intents ------------------------------------------------------------------


def _counts(ctx: RoleContext) -> dict:
    # Health buckets describe everyone; action lists skip work the viewer already resolved.
    everyone = ctx.visible
    v = [f for f in everyone if not is_resolved_for(f, ctx.role)]
    return {
        "docs_pending": [f for f in v if f.docs.status == DocumentStatus.PENDING],
        "rework": [f for f in v if f.docs.rework_flag],
        "docs_near": [
            f for f in v
            if f.docs.status == DocumentStatus.PENDING and f.docs.waiting_days == DOCS_BLOCKED_DAYS - 1
        ],
        "sla": [f for f in v if f.sla_open],
        "sla_near": [
            f for f in v
            if f.ticket.hardware_status != HardwareStatus.DELIVERED
            and not f.ticket.sla_breached
            and f.ticket.lead_time_days == f.ticket.sla_target_days
        ],
        "access": [f for f in v if f.access_open and not f.ready],
        "hardware": [f for f in v if f.ticket.hardware_status != HardwareStatus.DELIVERED],
        "day1": [f for f in v if f.joiner.current_state == OnboardingState.IT_PROVISIONED],
        "project": [f for f in v if f.joiner.current_state == OnboardingState.DAY1_ORIENTED],
        "ready": [f for f in everyone if f.ready],
        "blocked": [f for f in everyone if f.health == "blocked"],
        "at_risk": [f for f in everyone if f.health == "at_risk"],
        "on_track": [f for f in everyone if f.health == "on_track"],
    }


def _queue_split(ctx: RoleContext) -> Counter:
    return Counter(f.queue for f in ctx.visible if f.queue in ("HR", "IT", "Manager"))


def welcome(ctx: RoleContext) -> dict:
    name = (ctx.user.get("display_name") or "there").split()[0]
    c = _counts(ctx)
    r = Reply(ctx, "welcome")
    top = ctx.actionable[0] if ctx.actionable else None
    n = len(ctx.actionable)
    if ctx.role == ROLE_HR:
        r.text = f"Hi {name} 👋\nYou have **{n} HR action(s)** needing attention."
        r.bullets([
            f"{len(c['docs_pending'])} document packet(s) pending in iCIMS",
            f"{len(c['rework'])} document(s) in rework",
            *( [f"{len(c['docs_near'])} packet(s) will count as blocked at {DOCS_BLOCKED_DAYS} days waiting"] if c["docs_near"] else [] ),
        ])
    elif ctx.role == ROLE_IT:
        r.text = f"Hi {name} 👋\n**{n} IT action(s)** need attention."
        r.bullets([
            f"🔴 {len(c['sla'])} laptop(s) have breached SLA",
            f"🟠 {len(c['sla_near'])} laptop(s) at the SLA target (breach tomorrow if not delivered)",
            f"🟡 {len(c['access'])} joiner(s) waiting for VPN / app access",
        ])
    elif ctx.role == ROLE_MANAGER:
        r.text = (
            f"Hi {name} 👋\nYou have **{len(ctx.visible)} joiner(s)**. "
            f"{len(c['on_track'])} on track, {n} need your action."
        )
        if c["project"]:
            f = c["project"][0]
            r.bullets([f"{f.joiner.name} has completed Day 1 but is still waiting for a project assignment."])
    else:
        split = _queue_split(ctx)
        q, qn = split.most_common(1)[0] if split else ("None", 0)
        r.text = (
            f"Hi {name} 👋\nAcross the cohort: **{len(ctx.visible)} joiners** — "
            f"{len(c['on_track'])} on track, {len(c['at_risk'])} at risk, {len(c['blocked'])} blocked."
        )
        r.bullets([f"The {q} queue currently holds the largest share of open bottlenecks ({qn} joiner(s))."])
    if top and ctx.role != ROLE_OPS:
        r.text += f"\nYour highest-priority item: **{top.joiner.name}** — {role_actions(top, ctx.role)[0]['label']}."
    elif top:
        r.text += f"\nHighest-risk joiner: **{top.joiner.name}** ({top.bottleneck})."
    r.text += "\nWhat would you like to look at?"
    r.suggestions = SUGGESTIONS[ctx.role]
    out = r.to_dict()
    out["proactive"] = proactive(ctx)
    out["assistant"] = {"name": "NIA", "title": "New-Hire Intelligence Assistant", "role_label": ROLE_LABELS[ctx.role]}
    return out


def proactive(ctx: RoleContext) -> list[dict]:
    """At most two meaningful, dismissible nudges — never a stream of interruptions."""
    c = _counts(ctx)
    out: list[dict] = []
    if ctx.role in (ROLE_HR, ROLE_OPS):
        out.extend(_case_nudges(ctx))
    if ctx.role in (ROLE_IT, ROLE_MANAGER):
        for e in cases.inbox(ctx.role, ctx.manager_id, ctx.visible)[:1]:
            out.append({
                "id": f"case-{e['id']}", "joiner_id": e["joiner_id"], "kind": "reminder",
                "text": e["text"] if e["kind"] == "routed" else f"NIA reminder (HR onboarding case): {e['text']}",
            })
    if ctx.role == ROLE_HR and len(out) < 2:
        pending = sorted(c["docs_pending"], key=lambda f: f.joiner.joining_date)
        for f in pending[:1]:
            days = (f.joiner.joining_date - ANALYTICS_AS_OF.date()).days
            text = (
                f"{poss(f.joiner.name)} document packet is still pending and they {start_phrase(f)}."
                if days >= 0 else
                f"{f.joiner.name} {start_phrase(f)} but their document packet is still pending in iCIMS."
            )
            out.append({"id": f"hr-docs-{f.id}", "joiner_id": f.id, "text": text})
    elif ctx.role == ROLE_IT:
        for f in sorted(c["sla"], key=lambda f: -f.ticket.lead_time_days)[:1]:
            out.append({"id": f"it-sla-{f.id}", "joiner_id": f.id,
                        "text": f"{poss(f.joiner.name)} laptop has breached SLA and may affect their project readiness."})
    elif ctx.role == ROLE_MANAGER:
        for f in c["project"][:1]:
            out.append({"id": f"mgr-proj-{f.id}", "joiner_id": f.id,
                        "text": f"{f.joiner.name} is Day-1 complete but still has no project assignment."})
    else:
        split = _queue_split(ctx)
        if split:
            q, qn = split.most_common(1)[0]
            out.append({"id": f"ops-queue-{q}-{qn}", "joiner_id": None,
                        "text": f"The {q} queue is responsible for the largest share of active bottlenecks ({qn} of {sum(split.values())})."})
    return out[:2]


def _case_nudges(ctx: RoleContext) -> list[dict]:
    """New iCIMS hires first; otherwise one nudge for accepted offers still waiting on a plan."""
    fresh = cases.detected_for_review(ctx.visible)
    out = []
    for f in fresh[:1]:
        plan = cases.build_plan(f)
        out.append({
            "id": f"case-new-{f.id}-{plan['detected']['event']}",
            "joiner_id": f.id,
            "kind": "detected",
            "title": "New joiner detected 🎉",
            "text": f"I've prepared {poss(first(f))} onboarding plan.",
            "fields": [
                {"label": "", "value": f"{f.joiner.name} — {plan['position']}"},
                {"label": "Start date", "value": f"{plan['start_label']} ({plan['when']})"},
                {"label": "Manager", "value": f.joiner.manager_name},
            ],
            "cta_label": "Review plan",
            "cta_q": f"Review {poss(f.joiner.name)} onboarding plan",
        })
    if not out:
        waiting = [f for f in ctx.visible if cases.case_status(f) == "review"]
        if waiting:
            f = sorted(waiting, key=lambda f: f.joiner.joining_date)[0]
            out.append({
                "id": f"case-review-{len(waiting)}-{f.id}",
                "joiner_id": f.id,
                "kind": "case",
                "text": f"{len(waiting)} accepted offer(s) have an onboarding plan ready for your review — "
                        f"starting with {f.joiner.name}. Nothing is sent to IT or managers until you approve.",
                "cta_label": "Review plans",
                "cta_q": "Show onboarding plans waiting for review",
            })
    return out


def briefing(ctx: RoleContext) -> Reply:
    c = _counts(ctx)
    r = Reply(ctx, "briefing")
    n = len(ctx.actionable)
    if ctx.role == ROLE_HR:
        r.text = f"**Your HR onboarding briefing.** {n} HR action(s) open across {len(ctx.visible)} joiners."
        upcoming = [f"{poss(f.joiner.name)} packet has waited {f.docs.waiting_days}d — it counts as blocked at {DOCS_BLOCKED_DAYS}d." for f in c["docs_near"]]
        status = Counter(cases.case_status(f) for f in ctx.visible)
        soon = sorted((f for f in ctx.visible if 0 <= cases.days_to_start(f) <= 14 and not f.ready),
                      key=lambda f: f.joiner.joining_date)
        followups = [e for e in cases._LOG if e["kind"] == "reminder"]
        r.facts([
            ("Plans to review", f"{status['review']}"),
            ("Cases in progress", f"{status['active']}"),
            ("Ready to close", f"{status['complete']}"),
            ("Starting in the next 2 weeks", (f"{len(soon)} — " + ", ".join(
                f"{f.joiner.name} ({cases.long_date(f.joiner.joining_date)})" for f in soon[:3])
                + (f" +{len(soon) - 3}" if len(soon) > 3 else "")) if soon else "No one"),
            ("NIA follow-ups sent", f"{sum(1 for e in followups if e['audience'] == 'IT')} to IT · "
                                    f"{sum(1 for e in followups if e['audience'] == 'Manager')} to managers — not you"),
        ], "Onboarding cases")
    elif ctx.role == ROLE_IT:
        r.text = f"**Your IT briefing.** {n} IT action(s): {len(c['sla'])} SLA breach(es), {len(c['hardware'])} laptop(s) not delivered."
        upcoming = [f"{poss(f.joiner.name)} ticket is at {f.ticket.lead_time_days}d of a {f.ticket.sla_target_days}d target." for f in c["sla_near"]]
    elif ctx.role == ROLE_MANAGER:
        r.text = f"**Your team briefing.** {n} of your {len(ctx.visible)} joiner(s) need action."
        upcoming = [f"{f.joiner.name} {start_phrase(f)} and is at {STAGE_LABELS[f.joiner.current_state]}." for f in ctx.visible
                    if not f.ready and 0 <= (f.joiner.joining_date - ANALYTICS_AS_OF.date()).days <= 14]
    else:
        active_bn = Counter(f.bottleneck for f in ctx.visible if f.bottleneck)
        r.text = f"**Cohort briefing.** {len(active_bn)} active bottleneck types across {len(ctx.visible)} joiners."
        upcoming = [f"{f.joiner.name} is at risk ({f.bottleneck}, score {f.risk_score:.0f})." for f in c["at_risk"][:3]]
    r.facts([
        ("Needs attention", f"{n} joiner(s)"),
        ("Blocked", f"{len([f for f in ctx.visible if f.health == 'blocked'])}"),
        ("Most important blocker", f"{ctx.actionable[0].joiner.name} — {ctx.actionable[0].bottleneck}" if ctx.actionable else "None"),
    ], "What's happening")
    r.bullets(upcoming[:3] or ["Nothing new is about to cross a threshold."], "Upcoming risk")
    r.bullets([f"{f.joiner.name}: {recommendation(f, ctx.role)}" for f in ctx.actionable[:3]], "Recommended next actions")
    for f in ctx.actionable[:3]:
        src = blocker_info(f)["source"]
        if src != "SmartStart":
            r.source(src)
    r.focus = ctx.actionable[0].id if ctx.actionable else None
    return r


def priorities(ctx: RoleContext) -> Reply:
    r = Reply(ctx, "priorities")
    if not ctx.actionable:
        r.text = "Nothing needs your action right now — every joiner in your view is clear of your queue."
        return r
    top = ctx.actionable[0]
    info = viewer_info(top, ctx.role)
    r.text = f"Start with **{top.joiner.name}**. " + _cap("; ".join(priority_reasons(top, ctx.role))) + "."
    r.facts([
        ("Issue", info["issue"]),
        ("Overall blocker", top.bottleneck if top.bottleneck and info["issue"] != top.bottleneck and role_lens(top, ctx.role) else ""),
        ("Current stage", STAGE_LABELS[top.joiner.current_state]),
        ("Owner", info["owner"] or "—"),
        ("Source", info["source"]),
        ("Impact", impact_sentence(top)),
        ("Recommended action", recommendation(top, ctx.role)),
    ])
    if info["source"] != "SmartStart":
        r.link(info["source"], record_refs(top)[info["source"]])
    rest = ctx.actionable[1:5]
    if rest:
        r.joiners(rest, "Then")
    r.focus = top.id
    r.suggestions = [f"Why is {first(top)} at risk?", "Where do I fix this?", f"Assign {first(top)}'s issue"]
    return r


def explain(ctx: RoleContext, f: JoinerFacts) -> Reply:
    r = Reply(ctx, "explain")
    r.focus = f.id
    info = blocker_info(f)
    if f.bottleneck is None:
        r.text = f"**{f.joiner.name}** is Project Ready — there's no open blocker."
        r.facts([("Current stage", "Project ready"), ("Risk score", f"{f.risk_score:.0f} (predictor)")])
        return r
    if f.health == "on_track":
        r.text = (
            f"**{f.joiner.name}** isn't currently flagged as at risk (score {f.risk_score:.0f}). "
            f"The open step: {blocker_sentence(f)}."
        )
    else:
        r.text = f"**{f.joiner.name}** is {health_phrase(f)} because {blocker_sentence(f)}."
    try:
        drivers = employer_at_risk_explanation(f.id).get("why", [])
    except KeyError:
        drivers = []
    r.facts([
        ("Current stage", STAGE_LABELS[f.joiner.current_state]),
        ("Blocker", f.bottleneck),
        ("Owner", info["owner"]),
        ("Source", info["source"]),
        ("Impact", impact_sentence(f)),
        ("Risk score", f"{f.risk_score:.0f}"),
    ])
    r.bullets(drivers, "Risk drivers (SmartStart predictor)")
    mine = {ROLE_HR: "HR", ROLE_IT: "IT", ROLE_MANAGER: "Manager"}.get(ctx.role)
    lens = role_lens(f, ctx.role)
    if mine and info["queue"] != mine and lens:
        r.bullets([
            f"The overall blocker is owned by {info['owner']}, but {mine} also has open work here: "
            f"{lens['issue']} — {recommendation(f, ctx.role)}"
        ], "For you")
    elif mine and info["queue"] != mine:
        who = info["owner"]
        extra = ""
        if ctx.role == ROLE_MANAGER and info["queue"] in ("HR", "IT"):
            extra = f" Once that clears, you'll run Day-1 orientation with mentor {f.joiner.mentor_name}."
        r.bullets([f"This isn't a {mine} blocker — {who} owns it, so nothing is waiting on you right now.{extra}"], "For you")
    else:
        r.bullets([recommendation(f, ctx.role)], "Recommended action")
    if info["source"] != "SmartStart":
        r.link(info["source"], record_refs(f)[info["source"]])
    r.suggestions = [f"Give me a complete picture of {first(f)}", "Where do I fix this?", f"Can {first(f)} start their project?"]
    return r


def employee_360(ctx: RoleContext, f: JoinerFacts) -> Reply:
    r = Reply(ctx, "employee_360")
    r.focus = f.id
    j, d, t = f.joiner, f.docs, f.ticket
    perms = ctx.permissions
    info = blocker_info(f)
    idx = STAGE_ORDER.index(j.current_state)
    r.text = f"**{j.name}** — {STAGE_LABELS[j.current_state]}, {health_phrase(f)}."
    r.facts([
        ("Role", j.role_type.value),
        ("Department", j.department),
        ("Manager", j.manager_name),
        ("Mentor", j.mentor_name),
        ("Start date", f"{j.joining_date.isoformat()} ({start_phrase(f).split(' (')[0]})"),
    ], "Profile")
    r.facts([
        ("Current stage", STAGE_LABELS[j.current_state]),
        ("Progress", f"Step {idx + 1} of {len(STAGE_ORDER)} · {f.days} days since offer"),
        ("Risk", f"{f.risk_score:.0f} · {health_phrase(f)}"),
    ], "Onboarding")
    docs_value = "Rework requested" if d.rework_flag else d.status.value
    if perms.get("view_documents") == "full":
        docs_value += f" · {d.form_count} forms · waiting {d.waiting_days}d"
    r.facts([("Documents", docs_value), ("Source", "iCIMS")], "HR")
    access = access_items(t)
    hw_value = t.hardware_status.value + (" · SLA breached" if f.sla_open else "")
    if perms.get("view_it_ticket") == "full":
        hw_value += f" · {t.ticket_id} · {t.lead_time_days}d / {t.sla_target_days}d target"
    r.facts([
        ("Hardware", hw_value),
        ("Access", f"{access[0]['status']} · {', '.join(a['name'] for a in access[:5])}"),
        ("Source", "ServiceNow"),
    ], "IT")
    state = j.current_state
    day1 = "Done" if idx >= STAGE_ORDER.index(OnboardingState.DAY1_ORIENTED) else ("Due now" if state == OnboardingState.IT_PROVISIONED else "Not yet")
    project = "Assigned · Project ready" if f.ready else ("Not assigned yet" if state == OnboardingState.DAY1_ORIENTED else "After Day 1")
    r.facts([("Day 1", day1), ("Mentor", j.mentor_name), ("Project", f"{project} (Jira)")], "Manager")
    r.facts([
        ("Current blocker", f.bottleneck or "None"),
        ("Owner", info["owner"] or "—"),
        ("Source", info["source"]),
        ("Next action", recommendation(f, ctx.role)),
    ], "Right now")
    if perms.get("view_learning"):
        ls = learning_summary(f.id)
        r.facts([
            ("Completion", f"{ls['completion_pct']:.0f}% · {ls['completed_count']} of {ls['total_count']} modules"),
            ("Now on", ls["current"] or "Nothing available right now"),
            ("Added by managers", f"{ls['assigned_count']} ({ls['assigned_open']} open)" if ls["assigned_count"] else ""),
        ], "Learning")
    for s in ("iCIMS", "ServiceNow", "Jira"):
        r.source(s)
    r.suggestions = [f"Why is {first(f)} at risk?", f"Can {first(f)} start their project?", "Where do I fix this?"]
    return r


LEARNING_RE = re.compile(r"learning|course|module|training|lesson")
_STATUS_WORD = {"complete": "done", "in_progress": "in progress", "available": "up next", "locked": "locked"}


def learning_for(ctx: RoleContext, f: JoinerFacts) -> Reply:
    r = Reply(ctx, "learning")
    r.focus = f.id
    track = build_learning_track(f.id)
    ls = learning_summary(f.id)
    now = f" and is on **{ls['current']}** now" if ls["current"] else ""
    r.text = (
        f"**{f.joiner.name}** has completed {ls['completed_count']} of {ls['total_count']} learning modules "
        f"({ls['completion_pct']:.0f}%){now}."
    )
    if ls["overdue"]:
        r.text += f" Overdue: {', '.join(ls['overdue'])}."
    r.bullets([
        f"{m.title} — {_STATUS_WORD[m.status.value]}" + (f" (added by {m.assigned_by})" if m.assigned_by else "")
        for m in track.modules
    ], track.track_name)
    r.suggestions = [f"Give me a complete picture of {first(f)}", "Who is behind on learning?"]
    if ctx.permissions.get("manage_learning"):
        lib = course_library(f.id)
        if lib:
            r.suggestions.insert(0, f"Add {lib[0]['title']} to {poss(first(f))} learning")
    return r


def team_learning(ctx: RoleContext) -> Reply:
    r = Reply(ctx, "learning:team")
    rows = sorted((learning_summary(f.id) | {"f": f} for f in ctx.visible), key=lambda x: (x["completion_pct"], x["f"].joiner.name))
    if not rows:
        r.text = "There's no one in your view yet."
        return r
    avg = sum(x["completion_pct"] for x in rows) / len(rows)
    behind = [x for x in rows if x["completion_pct"] < 30]
    scope = "your team" if ctx.role == ROLE_MANAGER else "the cohort"
    r.text = (
        f"Average learning completion across {scope} is **{avg:.0f}%**. "
        + (f"{len(behind)} joiner(s) are under 30%, lowest first:" if behind else "No one is under 30%.")
    )
    r.bullets([
        f"{x['f'].joiner.name} — {x['completion_pct']:.0f}% ({x['completed_count']}/{x['total_count']})"
        + (f", now on {x['current']}" if x["current"] else "")
        for x in (behind or rows)[:6]
    ])
    r.focus = rows[0]["f"].id
    r.suggestions = [f"How is {first(rows[0]['f'])}'s learning going?"]
    if ctx.permissions.get("manage_learning"):
        r.suggestions.append(f"Add a course for {first(rows[0]['f'])}")
    return r


def prepare_course(ctx: RoleContext, text: str, f: Optional[JoinerFacts]) -> Reply:
    r = Reply(ctx, "add_course")
    if not ctx.permissions.get("manage_learning"):
        r.text = NO_ACCESS
        return r
    if f is None:
        r.text = "Which joiner should I add the course for?"
        return r
    r.focus = f.id
    lib = course_library(f.id)
    low = text.lower()
    match = next((c for c in lib if c["title"].lower() in low), None) or next(
        (c for c in lib if c["id"] in re.findall(r"[a-z]+", low)), None
    )
    words = set(re.findall(r"[a-z]+", low))
    have = next(
        (m for m in build_learning_track(f.id).modules
         if m.title.lower() in low or m.id.rsplit("-", 1)[-1] in words),
        None,
    )
    if match is None and have is not None:
        r.text = f"**{have.title}** is already in {poss(first(f))} learning ({_STATUS_WORD[have.status.value]})."
        r.suggestions = [f"How is {poss(first(f))} learning going?", f"Add a course for {first(f)}"]
        return r
    if match is None:
        r.text = f"Which course should I add to {poss(first(f))} learning? These approved courses aren't in it yet:"
        r.bullets([f"{c['title']} — {c['category']} · {c['duration_minutes']} min" for c in lib[:6]])
        r.suggestions = [f"Add {c['title']} to {poss(first(f))} learning" for c in lib[:3]]
        return r
    r.text = f"You are about to add **{match['title']}** ({match['duration_minutes']} min) to **{poss(f.joiner.name)}** learning."
    r.confirm({
        "action": "add_course",
        "joiner_id": f.id,
        "joiner_name": f.joiner.name,
        "course_id": match["id"],
        "course_title": match["title"],
        "confirm_label": "Add course",
        "note": "It appears in their Learning tab with a notification. Nothing changes until you confirm.",
    })
    return r


def can_start_project(ctx: RoleContext, f: JoinerFacts) -> Reply:
    r = Reply(ctx, "cross_system")
    r.focus = f.id
    j = f.joiner
    hr, it, mgr, proj = f.journey
    status = {"done": "complete", "active": "in progress", "blocked": "blocked", "waiting": "not started", "attention": "needs attention"}
    if f.ready:
        r.text = f"**Yes.** {j.name} is Project Ready — documents, IT, Day 1 and project assignment are all complete."
    else:
        done = [label for label, s in (("documents", hr), ("IT provisioning", it), ("Day 1", mgr)) if s["status"] == "done"]
        lead = "**Not yet.** "
        if done:
            lead += f"{j.name} has completed {', '.join(done)}, but "
        else:
            lead += f"{j.name} "
        lead += {
            "HR": "their document step isn't finished.",
            "IT": "their laptop / access provisioning isn't finished.",
            "Manager": "Day-1 orientation hasn't happened yet.",
            "Project": "doesn't have a project assignment yet.",
        }[blocker_info(f)["stage"]]
        r.text = lead
    r.facts([
        ("iCIMS · documents", f"{status[hr['status']]} — {hr['detail']}"),
        ("ServiceNow · laptop & access", f"{status[it['status']]} — {it['detail']}"),
        ("SmartStart · Day 1", f"{status[mgr['status']]} — {mgr['detail']}"),
        ("Jira · project", f"{status[proj['status']]} — {proj['detail']}"),
    ], "Checked across systems")
    if not f.ready:
        info = blocker_info(f)
        r.facts([
            ("Current blocker", f.bottleneck),
            ("Owner", info["owner"]),
            ("Source", info["source"]),
            ("Recommended action", recommendation(f, ctx.role)),
        ])
        if info["source"] != "SmartStart":
            r.link(info["source"], record_refs(f)[info["source"]])
    for s in ("iCIMS", "ServiceNow", "Jira"):
        r.source(s)
    return r


def recommend_for(ctx: RoleContext, f: JoinerFacts) -> Reply:
    r = Reply(ctx, "recommend")
    r.focus = f.id
    acts = role_actions(f, ctx.role)
    info = blocker_info(f)
    primary = acts[0]
    if primary["kind"] in ("done", "info"):
        r.text = f"Nothing is waiting on you for **{f.joiner.name}** right now — {blocker_sentence(f)}."
        if ctx.role == ROLE_MANAGER and info["queue"] in ("HR", "IT"):
            r.text += f" Once {info['owner']} finishes, your next step is Day-1 orientation with mentor {f.joiner.mentor_name}."
    else:
        r.text = f"For **{f.joiner.name}**: {primary['label'].lower()}" + (f" — {primary['detail']}." if primary["detail"] else ".")
    r.bullets([f"{a['label']} — {a['detail']}" if a["detail"] else a["label"] for a in acts], "Your actions")
    r.facts([("Current blocker", f.bottleneck or "None"), ("Owner", info["owner"] or "—"), ("Source", info["source"])])
    if info["source"] != "SmartStart" and primary["kind"] not in ("done",):
        r.link(info["source"], record_refs(f)[info["source"]])
    return r


def navigate(ctx: RoleContext, text: str, f: Optional[JoinerFacts]) -> Reply:
    r = Reply(ctx, "navigate")
    low = text.lower()
    system = None
    if re.search(r"laptop|hardware|device|access|vpn|ticket|service ?desk|servicenow|ritm", low):
        system = "ServiceNow"
    elif re.search(r"document|docs|packet|paperwork|offer|icims|candidate", low):
        system = "iCIMS"
    elif re.search(r"project|task|jira|story|board", low):
        system = "Jira"
    elif re.search(r"day[- ]?1|orientation|mentor", low):
        system = "SmartStart"
    elif f is not None:
        system = blocker_info(f)["source"]
    if system is None:
        r.text = "Tell me which joiner or which kind of record — documents live in iCIMS, laptops and access in the Service Desk, projects in Jira."
        for s in SOURCE_SYSTEMS:
            r.link(s)
        return r
    if f is not None:
        r.focus = f.id
    who = f"{first(f)}'s " if f else ""
    if system == "SmartStart":
        r.text = f"{who.capitalize() or ''}Day-1 orientation and mentor confirmation are tracked in SmartStart — open the joiner in the Command Center and use the action area."
        r.source("SmartStart")
        return r
    record = record_refs(f)[system] if f else ""
    phrase = {
        "ServiceNow": f"{who}laptop and access request is in the Service Desk",
        "iCIMS": f"{who}document packet is managed in iCIMS",
        "Jira": "Project assignments are handled in Jira" if not f else f"{who}onboarding story is in Jira",
    }[system]
    phrase = phrase[0].upper() + phrase[1:]
    r.text = phrase + (f" (record **{record}**)." if record else ".")
    if f is not None:
        owner = {"ServiceNow": QUEUE_OWNER["IT"], "iCIMS": QUEUE_OWNER["HR"], "Jira": f.joiner.manager_name}[system]
        r.facts([("Owner", owner), ("Status", {"ServiceNow": f.journey[1], "iCIMS": f.journey[0], "Jira": f.journey[3]}[system]["detail"])])
    r.link(system, record)
    return r


def what_if(ctx: RoleContext, text: str, f: Optional[JoinerFacts]) -> Reply:
    r = Reply(ctx, "what_if")
    low = text.lower()
    topic = None
    if re.search(r"laptop|hardware|device|access|vpn|it\b", low):
        topic = "IT"
    elif re.search(r"document|docs|packet|paperwork", low):
        topic = "HR"
    elif re.search(r"project|assignment|jira", low):
        topic = "Project"
    elif re.search(r"day[- ]?1|orientation|mentor", low):
        topic = "Manager"
    if topic is None:
        r.text = NO_DATA + " I can reason about documents, laptop/access, Day-1 orientation or project assignment."
        return r
    rules = {
        "HR": ("the documents stage can't clear, so onboarding can't progress past it and IT provisioning stays behind documents.", "HR (People Ops)", "iCIMS"),
        "IT": ("the IT provisioning stage can't complete, so Day-1 orientation and project readiness wait too.", "IT Service Desk", "ServiceNow"),
        "Manager": ("the joiner stays at IT provisioned and project assignment can't begin.", "Hiring manager", "SmartStart"),
        "Project": ("the joiner stays at Day-1 complete and can't reach Project Ready.", "Hiring manager", "Jira"),
    }
    consequence, owner, source = rules[topic]
    idx = {"HR": 0, "IT": 1, "Manager": 2, "Project": 3}[topic]
    if f is None:
        r.text = f"Per the SmartStart workflow, if that step isn't done, {consequence}"
        r.facts([("Owner", owner), ("Source", source)])
        r.source(source)
        return r
    r.focus = f.id
    stage = f.journey[idx]
    if stage["status"] == "done":
        r.text = f"That wouldn't change anything for **{f.joiner.name}** — {stage['detail'].lower()} already."
        return r
    if topic in ("Manager", "Project"):
        owner = f.joiner.manager_name
    r.text = f"If that doesn't happen for **{f.joiner.name}**, {consequence}"
    rows = [("Current state", f"{stage['label']}: {stage['detail']}"), ("Owner", owner), ("Source", source)]
    if not f.ready:
        rows.append(("Start date", start_phrase(f)))
    r.facts(rows)
    r.bullets(["SmartStart doesn't define consequences beyond the onboarding stages (like start-date changes), so I won't speculate further."])
    if source != "SmartStart":
        r.link(source, record_refs(f)[source])
    return r


def cohort(ctx: RoleContext, text: str) -> Reply:
    low = text.lower()
    r = Reply(ctx, "cohort")
    active = [f for f in ctx.visible if f.bottleneck]
    bn = Counter(f.bottleneck for f in active)
    split = _queue_split(ctx)
    scope = "your team" if ctx.role == ROLE_MANAGER else "the cohort"
    if not active:
        r.text = f"No one in {scope} is stuck right now."
        return r
    top, topn = bn.most_common(1)[0]
    if re.search(r"which team|team needs|compare|hr vs|vs it", low):
        pressure = Counter(f.queue for f in active if f.health != "on_track" and f.queue in ("HR", "IT", "Manager"))
        q, qn = (pressure.most_common(1)[0] if pressure else split.most_common(1)[0])
        r.text = (
            f"The **{q}** queue needs the most attention — {qn} of its {split.get(q, 0)} open bottleneck(s) "
            f"are blocked or at risk."
        )
        busiest, bn_n = split.most_common(1)[0]
        if busiest != q:
            r.text += (
                f" The {busiest} queue holds more items overall ({bn_n}), but "
                f"{bn_n - pressure.get(busiest, 0)} of those are still on track."
            )
        r.facts([(k, str(pressure.get(k, 0))) for k in ("HR", "IT", "Manager")], "Blocked or at risk by owner")
    elif re.search(r"caus|delay|slow|most", low):
        q, qn = split.most_common(1)[0]
        avg = sum(f.days for f in active if f.queue == q) / max(qn, 1)
        r.text = (
            f"The largest bottleneck is **{top}** ({topn} joiner(s)). By owner, the **{q}** queue holds the most "
            f"open bottlenecks ({qn} of {len(active)}), averaging {avg:.0f} days since offer."
        )
    else:
        r.text = f"Most joiners in {scope} are stuck at **{top}** ({topn} of {len(active)} with an open bottleneck)."
    r.facts([(k, str(v)) for k, v in bn.most_common()], "Where people are stuck")
    r.facts([(q, str(split.get(q, 0))) for q in ("HR", "IT", "Manager")], "Open bottlenecks by owner")
    worst = sorted([f for f in active if f.health != "on_track"], key=lambda f: -f.risk_score)[:3]
    if worst:
        r.joiners(worst, "Highest-risk joiners")
    r.suggestions = ["Show cohort risks", "Which team needs attention?", "What should I work on first?"]
    return r


LISTS: list[tuple[str, str, str, Callable[[RoleContext, dict], list[JoinerFacts]]]] = [
    ("sla", r"\bsla\b|breach", "laptop(s) have breached SLA", lambda ctx, c: c["sla"]),
    ("access", r"\baccess\b|\bvpn\b", "joiner(s) waiting for VPN / app access", lambda ctx, c: c["access"]),
    ("waiting_it", r"waiting (for|on) it\b|blocked by it|it queue", "joiner(s) waiting on IT", lambda ctx, c: [f for f in ctx.visible if f.queue == "IT"]),
    ("rework", r"rework", "joiner(s) with documents in rework", lambda ctx, c: c["rework"]),
    ("docs", r"document|\bdocs\b|paperwork|packet", "joiner(s) haven't completed documents", lambda ctx, c: c["docs_pending"] + [f for f in c["rework"] if f not in c["docs_pending"]]),
    ("not_ready", r"(not|n't|isn't|aren't) project[- ]?ready|not ready", "joiner(s) aren't project-ready", lambda ctx, c: [f for f in ctx.visible if not f.ready]),
    ("no_project", r"project", "joiner(s) finished Day 1 without a project assignment", lambda ctx, c: c["project"]),
    ("day1", r"day[- ]?1|orientation|mentor", "joiner(s) are ready for Day-1 orientation (confirm mentor)", lambda ctx, c: c["day1"]),
    ("hardware", r"laptop|hardware|device", "laptop(s) not delivered yet", lambda ctx, c: c["hardware"]),
    ("manager", r"manager action|waiting (for|on) (the )?manager", "joiner(s) waiting on manager action", lambda ctx, c: [f for f in ctx.visible if f.queue == "Manager"]),
    ("hr_action", r"hr action|need hr|needs hr", "joiner(s) need HR action", lambda ctx, c: [f for f in ctx.visible if f.queue == "HR"]),
    ("blocked", r"blocked|stalled", "joiner(s) are blocked", lambda ctx, c: c["blocked"]),
    ("risk", r"at risk|risks|risky|high risk", "joiner(s) are blocked or at risk", lambda ctx, c: c["blocked"] + c["at_risk"]),
    ("on_track", r"on track", "joiner(s) are on track", lambda ctx, c: c["on_track"]),
    ("mine", r"my joiners|show joiners|my team|show my|all joiners|list joiners", "joiner(s) in your view", lambda ctx, c: list(ctx.visible)),
]


def list_answer(ctx: RoleContext, key: str, label: str, rows: list[JoinerFacts], question: str) -> Reply:
    r = Reply(ctx, f"list:{key}")
    if re.search(r"how many|count|number of", question.lower()):
        r.text = f"**{len(rows)}** {label}."
    else:
        r.text = f"**{len(rows)}** {label}." if rows else f"No one — 0 {label}."
    if rows:
        order = {f.id: i for i, f in enumerate(ctx.actionable)}
        rows = sorted(rows, key=lambda f: (order.get(f.id, 999), -f.risk_score))
        note = None
        if key == "sla":
            note = lambda f: f"{f.ticket.lead_time_days}d vs {f.ticket.sla_target_days}d · {record_refs(f)['ServiceNow']}"
        elif key == "docs":
            note = lambda f: ("Rework" if f.docs.rework_flag else f"Pending {f.docs.waiting_days}d") + f" · {record_refs(f)['iCIMS']}"
        elif key == "access":
            note = lambda f: f"{access_items(f.ticket)[0]['status']} · {len(access_items(f.ticket))} items"
        elif key == "day1":
            note = lambda f: f"Mentor {f.joiner.mentor_name}"
        elif key == "not_ready":
            note = lambda f: STAGE_LABELS[f.joiner.current_state]
        r.joiners(rows[:8], "", note)
        if len(rows) > 8:
            r.bullets([f"+{len(rows) - 8} more — open the Joiners view to see everyone."])
        r.focus = rows[0].id
        if key in ("sla", "hardware", "access"):
            r.link("ServiceNow")
        elif key in ("docs", "rework"):
            r.link("iCIMS")
        elif key == "no_project":
            r.link("Jira")
    return r


def prepare_assign(ctx: RoleContext, text: str, f: Optional[JoinerFacts], owner_q: str) -> Reply:
    r = Reply(ctx, "assign")
    if f is None:
        r.text = "Which joiner should I prepare the assignment for?"
        return r
    r.focus = f.id
    if not f.bottleneck:
        r.text = f"{f.joiner.name} has no open bottleneck to assign — they're Project Ready."
        return r
    owners = build_assignable_owners(f.id).owners
    match = None
    if owner_q:
        q = owner_q.lower().strip()
        match = next((o for o in owners if o.name.lower() == q), None) or next(
            (o for o in owners if q.split()[0] in o.name.lower().split()), None
        )
    if match is None:
        rec = [o for o in owners if o.recommended] or owners
        r.text = (
            f"I couldn't find **{owner_q}** on the assignable list for {first(f)}'s {f.queue} bottleneck. "
            if owner_q else f"Who should own {first(f)}'s {f.queue} bottleneck ({f.bottleneck})? "
        ) + "Suggested owners:"
        r.bullets([f"{o.name} — {o.title} ({o.team})" for o in rec[:4]])
        r.suggestions = [f"Assign {first(f)}'s issue to {o.name}" for o in rec[:3]]
        return r
    r.text = (
        f"You are about to assign **{poss(f.joiner.name)}** {f.queue} bottleneck "
        f"({f.bottleneck}) to **{match.name}** ({match.team})."
    )
    r.confirm({
        "action": "assign",
        "joiner_id": f.id,
        "joiner_name": f.joiner.name,
        "owner_id": match.id,
        "owner_name": match.name,
        "owner_team": match.team,
        "confirm_label": "Confirm assignment",
        "note": "Uses the Command Center Assign action. Nothing changes until you confirm.",
    })
    return r


def prepare_resolve(ctx: RoleContext, f: Optional[JoinerFacts]) -> Reply:
    r = Reply(ctx, "resolve")
    if f is None:
        r.text = "Which joiner's bottleneck should I prepare to resolve?"
        return r
    r.focus = f.id
    if not f.bottleneck:
        r.text = f"{f.joiner.name} has no open bottleneck to resolve."
        return r
    if is_resolved_for(f, ctx.role):
        entry = f.resolved[lens_queue(f, ctx.role)]
        r.text = (
            f"{poss(f.joiner.name)} bottleneck is already marked resolved (by {entry['by']}). "
            f"If they still need help, I can reopen it."
        )
        r.suggestions = [f"{first(f)} still needs help"]
        return r
    info = blocker_info(f)
    r.text = f"You are about to mark **{poss(f.joiner.name)}** bottleneck ({f.bottleneck}) as resolved in SmartStart."
    r.confirm({
        "action": "resolve",
        "joiner_id": f.id,
        "joiner_name": f.joiner.name,
        "confirm_label": "Confirm resolve",
        "note": f"This does not close the {info['source']} record — do that in {info['source']} itself."
        if info["source"] != "SmartStart" else "Marks the SmartStart bottleneck resolved only.",
    })
    return r


def prepare_reopen(ctx: RoleContext, f: Optional[JoinerFacts]) -> Reply:
    r = Reply(ctx, "reopen")
    if f is None:
        r.text = "Which joiner still needs help?"
        return r
    r.focus = f.id
    entry = f.resolved.get(lens_queue(f, ctx.role)) or next(iter(f.resolved.values()), None)
    if entry is None:
        r.text = f"{poss(f.joiner.name)} bottleneck isn't marked resolved, so it's still in your queue and alerts."
        return r
    r.text = (
        f"You are about to reopen **{poss(f.joiner.name)}** {entry['queue']} issue ({entry.get('issue') or entry['bottleneck']}). "
        f"It will return to alerts and the action queue as *still needs help*."
    )
    r.confirm({
        "action": "reopen",
        "joiner_id": f.id,
        "joiner_name": f.joiner.name,
        "confirm_label": "Reopen — still needs help",
        "note": f"Resolved earlier by {entry['by']}.",
    })
    return r


# --- HR onboarding cases ----------------------------------------------------------


def _can_run_cases(ctx: RoleContext) -> bool:
    return bool(ctx.permissions.get("manage_cases"))


def case_plan(ctx: RoleContext, f: JoinerFacts) -> Reply:
    r = Reply(ctx, "case:plan")
    r.focus = f.id
    plan = cases.build_plan(f)
    n = first(f)
    k = plan["counts"]
    if plan["status"] == "review":
        r.text = (
            f"I've prepared **{k['total']} onboarding requirements** for {f.joiner.name} based on "
            f"{poss(n)} role ({plan['position']}) and employment type ({f.joiner.role_type.value}).\n"
            f"{k['auto']} were determined automatically."
            + (f" **{k['confirm']} need your confirmation.**" if k["confirm"] else " Nothing needs confirming.")
        )
    else:
        r.text = (
            f"**{poss(f.joiner.name)} onboarding plan** — {plan['status_label'].lower()}. "
            f"{k['done']} of {k['total']} requirements are done ({plan['progress_pct']}%)."
        )
    r.blocks.append({"type": "case_plan", **plan, "can_approve": plan["status"] == "review" and _can_run_cases(ctx)})
    r.source("iCIMS")
    r.source("ServiceNow")
    r.suggestions = (
        [f"Show {poss(n)} documents", f"Draft a welcome email for {n}"]
        if plan["status"] == "review"
        else [f"How's {poss(n)} onboarding?", f"Show {poss(n)} documents", "What am I waiting for?"]
    )
    return r


def case_status(ctx: RoleContext, f: JoinerFacts) -> Reply:
    r = Reply(ctx, "case:status")
    r.focus = f.id
    plan = cases.build_plan(f)
    att = cases.hr_attention(f)
    n = first(f)
    if plan["status"] == "complete":
        return case_complete(ctx, f)
    if plan["status"] == "closed":
        r.text = f"**{poss(f.joiner.name)}** onboarding case is closed — Project Ready, no outstanding actions."
        return r
    k = plan["counts"]
    r.text = f"**{f.joiner.name}** is **{plan['progress_pct']}%** through onboarding ({k['done']} of {k['total']} requirements)."
    followups = [
        {"text": e["text"], "to": e["to"], "at": e["at"], "kind": e["kind"]}
        for e in reversed(cases.log_for(f.id)) if e["kind"] in ("reminder", "routed", "message")
    ][:4]
    r.blocks.append({
        "type": "case_status",
        "joiner_id": f.id,
        "name": f.joiner.name,
        "position": plan["position"],
        "start_label": plan["start_label"],
        "when": plan["when"],
        "manager": plan["manager"],
        "status": plan["status"],
        "status_label": plan["status_label"],
        "progress_pct": plan["progress_pct"],
        "steps": cases.journey_steps(f),
        "attention": att,
        "followups": followups,
    })
    r.source("iCIMS")
    r.source("ServiceNow")
    sug = []
    if plan["status"] == "review":
        sug.append(f"Review {poss(n)} onboarding plan")
    if f.docs.status == DocumentStatus.PENDING or f.docs.rework_flag:
        sug.append(f"Send {n} a reminder about the documents")
    elif cases.days_to_start(f) > 0:
        sug.append(f"Draft Day-1 instructions for {n}")
    else:
        sug.append(f"Draft a first-week check-in for {n}")
    sug += [f"Show {poss(n)} onboarding plan", "What am I waiting for?"]
    r.suggestions = sug
    return r


def case_complete(ctx: RoleContext, f: JoinerFacts) -> Reply:
    r = Reply(ctx, "case:complete")
    r.focus = f.id
    done = cases.completion(f)
    r.text = f"🎉 **{f.joiner.name} is Project Ready.**"
    r.blocks.append({
        "type": "case_complete",
        "joiner_id": f.id,
        "name": f.joiner.name,
        "items": done["items"],
        "days": done["days"],
        "learning_left": done["learning_left"],
        "can_close": _can_run_cases(ctx),
    })
    r.suggestions = ["Which cases are ready to close?", "What am I waiting for?"]
    return r


def case_documents(ctx: RoleContext, f: JoinerFacts) -> Reply:
    r = Reply(ctx, "case:documents")
    r.focus = f.id
    if ctx.permissions.get("view_documents") != "full":
        d = f.docs
        r.text = f"{poss(f.joiner.name)} document packet is **{'in rework' if d.rework_flag else d.status.value.lower()}** in iCIMS. Document details are limited to HR."
        return r
    docs = cases.documents(f)
    r.text = {
        "pending": f"**{f.joiner.name} — documents.** The packet is still open in iCIMS.",
        "rework": f"**{f.joiner.name} — documents.** iCIMS returned the packet for a correction.",
        "complete": f"**{f.joiner.name} — documents.** Everything is verified.",
    }[docs["state"]]
    r.blocks.append({"type": "documents", "joiner_id": f.id, "name": f.joiner.name, **docs})
    r.link("iCIMS", record_refs(f)["iCIMS"])
    r.suggestions = (
        [f"Send {first(f)} a reminder about the documents", "Who hasn't finished their documents?"]
        if docs["state"] != "complete" else [f"How's {poss(first(f))} onboarding?"]
    )
    return r


DRAFT_KINDS: list[tuple[str, str]] = [
    ("it_escalation", r"escalat\w*|it escalation"),
    ("manager_reminder", r"(remind|nudge|chase|email|message)\w* .*\bmanager\b|manager reminder"),
    ("mentor_intro", r"mentor intro|introduc\w* .*mentor|mentor introduction"),
    ("day1", r"day[- ]?1 (instructions?|email|info|details|note|message)|first[- ]day (instructions?|email|note)"),
    ("first_week", r"first[- ]week|check[- ]?in"),
    ("welcome", r"welcome (email|message|note|mail)|send .*welcome|draft .*welcome"),
    ("doc_reminder", r"(remind|nudge|chase)\w* .*(document|docs|paperwork|packet|forms)|document reminder|reminder about .*(document|docs)"),
]


def _draft_kind(low: str) -> Optional[str]:
    return next((k for k, pat in DRAFT_KINDS if re.search(pat, low)), None)


def case_draft(ctx: RoleContext, f: Optional[JoinerFacts], kind: str) -> Reply:
    r = Reply(ctx, f"case:draft:{kind}")
    label = cases.COMMS[kind]
    if f is None:
        r.text = f"Who should I draft the {label.lower()} for?"
        return r
    r.focus = f.id
    n = first(f)
    if kind == "doc_reminder" and f.docs.status == DocumentStatus.COMPLETE and not f.docs.rework_flag:
        r.text = f"{poss(f.joiner.name)} documents are already verified in iCIMS — there's nothing to remind {n} about."
        r.suggestions = [f"Draft Day-1 instructions for {n}", f"How's {poss(n)} onboarding?"]
        return r
    if kind == "it_escalation" and f.ticket.hardware_status == HardwareStatus.DELIVERED:
        r.text = f"{poss(f.joiner.name)} laptop is already delivered — there's nothing to escalate to IT."
        return r
    d = cases.draft(f, kind, ctx.user.get("display_name") or "People Ops")
    sent_before = [e for e in cases.sent_messages(f.id) if e["topic"] == kind]
    about = "" if d["to"]["audience"] == "Employee" else f" about {f.joiner.name}"
    r.text = (
        f"I've drafted the **{label}** for {d['to']['name']}{about}. "
        "Edit anything you like — nothing is sent until you confirm."
    )
    if sent_before:
        r.text += f"\nNote: a {label.lower()} was already sent on {sent_before[-1]['at'][:10]} by {sent_before[-1]['by']}."
    r.blocks.append({
        "type": "draft",
        "joiner_id": f.id,
        "joiner_name": f.joiner.name,
        "kind": kind,
        "label": label,
        **d,
        "note": "Simulated delivery: SmartStart logs the message on the case"
                + (" and shows it in the joiner's notifications." if d["to"]["audience"] == "Employee" else "."),
    })
    r.suggestions = [f"How's {poss(n)} onboarding?", f"Show {poss(n)} onboarding plan"]
    return r


def case_bulk_doc_reminders(ctx: RoleContext) -> Reply:
    r = Reply(ctx, "case:bulk_reminders")
    c = _counts(ctx)
    rows = c["docs_pending"] + [f for f in c["rework"] if f not in c["docs_pending"]]
    rows.sort(key=lambda f: f.joiner.joining_date)
    if not rows:
        r.text = "Everyone's documents are complete — there's no one to remind."
        return r
    sender = ctx.user.get("display_name") or "People Ops"
    items = []
    for f in rows:
        d = cases.draft(f, "doc_reminder", sender)
        items.append({
            "joiner_id": f.id,
            "name": f.joiner.name,
            "address": d["to"]["address"],
            "detail": "Correction required" if f.docs.rework_flag else f"Packet pending {f.docs.waiting_days}d",
            "subject": d["subject"],
        })
    sample = cases.draft(rows[0], "doc_reminder", sender)
    r.text = (
        f"I've prepared **{len(rows)} document reminders** — one per joiner whose iCIMS packet is incomplete. "
        "Each is personalised (pending packets and corrections get different wording). Untick anyone you'd rather skip."
    )
    r.blocks.append({
        "type": "drafts",
        "kind": "doc_reminder",
        "label": cases.COMMS["doc_reminder"],
        "items": items,
        "preview_name": rows[0].joiner.name,
        "preview": sample["body"],
    })
    r.source("iCIMS")
    return r


def case_waiting(ctx: RoleContext) -> Reply:
    r = Reply(ctx, "case:waiting")
    mine, employee, it, mgr = [], [], [], []
    for f in ctx.visible:
        st = cases.case_status(f)
        if st == "closed":
            continue
        if st in ("review", "complete"):
            mine.append(f)
        elif f.docs.status == DocumentStatus.PENDING or f.docs.rework_flag:
            employee.append(f)
        elif f.ticket.hardware_status != HardwareStatus.DELIVERED:
            it.append(f)
        elif not f.ready:
            mgr.append(f)
    r.text = (
        f"You're waiting on **{len(employee)} joiner(s)** for documents, **IT** for {len(it)} laptop(s), and "
        f"**managers** for {len(mgr)} Day-1 or project step(s). "
        + (f"**{len(mine)} item(s) are waiting on you.**" if mine else "Nothing else is waiting on you.")
    )

    def names(rows: list[JoinerFacts], note: Callable[[JoinerFacts], str]) -> list[str]:
        return [f"{f.joiner.name} — {note(f)}" for f in rows[:5]] + ([f"+{len(rows) - 5} more"] if len(rows) > 5 else [])

    r.bullets(names(mine, lambda f: cases.hr_attention(f)["headline"]), "Waiting on you")
    r.bullets(names(employee, lambda f: "correction required" if f.docs.rework_flag else f"packet pending {f.docs.waiting_days}d"), "Waiting on the joiner (documents)")
    r.bullets(names(it, lambda f: ("SLA breached" if f.sla_open else f"laptop {f.ticket.hardware_status.value.lower()}") + " · NIA follows up with IT"), "Waiting on IT")
    r.bullets(names(mgr, lambda f: f"{f.joiner.manager_name} · {'Day-1 orientation' if f.joiner.current_state == OnboardingState.IT_PROVISIONED else 'first project'}"), "Waiting on managers")
    r.suggestions = ["Remind everyone whose documents are incomplete", "Show onboarding plans waiting for review", "Who joins next week?"]
    return r


def case_upcoming(ctx: RoleContext, text: str) -> Reply:
    r = Reply(ctx, "case:upcoming")
    low = text.lower()
    today = cases.TODAY
    monday = today.fromordinal(today.toordinal() - today.weekday())
    if "next week" in low:
        lo, hi, label = monday.toordinal() + 7, monday.toordinal() + 13, "next week"
    elif "this week" in low:
        lo, hi, label = today.toordinal(), monday.toordinal() + 6, "this week"
    else:
        lo, hi, label = today.toordinal(), today.toordinal() + 14, "in the next 2 weeks"
    rows = sorted((f for f in ctx.visible if lo <= f.joiner.joining_date.toordinal() <= hi), key=lambda f: f.joiner.joining_date)
    span = f"{cases.long_date(today.fromordinal(lo))} – {cases.long_date(today.fromordinal(hi))}"
    if rows:
        r.text = f"**{len(rows)} joiner(s)** start {label} ({span})."
        r.joiners(rows, "", lambda f: f"Starts {cases.long_date(f.joiner.joining_date)} · {cases.hr_attention(f)['headline']}")
        r.focus = rows[0].id
    else:
        later = sorted((f for f in ctx.visible if f.joiner.joining_date.toordinal() > hi), key=lambda f: f.joiner.joining_date)
        r.text = f"No one starts {label} ({span})."
        if later:
            nxt = later[0]
            r.text += f" The next start is **{nxt.joiner.name}** on {cases.long_date(nxt.joiner.joining_date)}."
            r.focus = nxt.id
            r.suggestions = [f"How's {poss(first(nxt))} onboarding?", f"Draft Day-1 instructions for {first(nxt)}"]
    return r


def case_list(ctx: RoleContext, which: str) -> Reply:
    r = Reply(ctx, f"case:list:{which}")
    rows = [f for f in ctx.visible if which == "all" or cases.case_status(f) == which]
    rows.sort(key=lambda f: f.joiner.joining_date)
    label = {"review": "onboarding plan(s) waiting for your review", "complete": "case(s) ready to close",
             "active": "case(s) in progress", "all": "onboarding case(s)"}[which]
    empty = {"review": "No onboarding plans are waiting for your review.", "complete": "No cases are ready to close.",
             "active": "No cases are in progress.", "all": "There are no onboarding cases in your view."}[which]
    r.text = f"**{len(rows)}** {label}." if rows else empty
    if which == "review" and rows:
        r.text += " Nothing goes to IT or managers until you approve a plan."
    items = []
    for f in rows[:8]:
        plan = cases.build_plan(f)
        att = cases.hr_attention(f)
        items.append({
            "joiner_id": f.id, "name": f.joiner.name, "position": plan["position"],
            "start_label": plan["start_label"], "when": plan["when"], "status": plan["status"],
            "status_label": plan["status_label"], "progress_pct": plan["progress_pct"],
            "level": att["level"], "headline": att["headline"],
            "q": (f"Review {poss(f.joiner.name)} onboarding plan" if plan["status"] == "review"
                  else f"How's {poss(f.joiner.name)} onboarding?"),
        })
    if items:
        r.blocks.append({"type": "cases", "title": "", "items": items})
        r.focus = rows[0].id
    if len(rows) > 8:
        r.bullets([f"+{len(rows) - 8} more"])
    return r


def case_close(ctx: RoleContext, f: Optional[JoinerFacts]) -> Reply:
    if f is None:
        return case_list(ctx, "complete")
    if cases.case_status(f) == "complete":
        return case_complete(ctx, f)
    r = Reply(ctx, "case:close")
    r.focus = f.id
    if cases.case_status(f) == "closed":
        r.text = f"{poss(f.joiner.name)} case is already closed."
    else:
        r.text = f"{poss(f.joiner.name)} case can't be closed yet — {cases.hr_attention(f)['reason'] or 'onboarding is still in progress.'}"
        r.suggestions = [f"How's {poss(first(f))} onboarding?"]
    return r


def my_followups(ctx: RoleContext) -> Reply:
    r = Reply(ctx, "case:inbox")
    rows = cases.inbox(ctx.role, ctx.manager_id, ctx.visible)
    who = "IT" if ctx.role == ROLE_IT else "you"
    if not rows:
        r.text = f"NIA hasn't sent {who} any onboarding follow-ups that still apply."
        return r
    r.text = f"**{len(rows)} onboarding follow-up(s)** from HR's cases are waiting on {who}:"
    r.bullets([e["text"] for e in rows[:8]])
    r.focus = rows[0]["joiner_id"]
    return r


CASE_PLAN_RE = re.compile(r"\bonboard\b|onboarding plan|\bplan\b")
CASE_STATUS_RE = re.compile(r"onboarding (going|status|progress)|how('?s| is| are)\b|status of|how far|progress")
CASE_LIST_RE = re.compile(r"(open|my|all|onboarding|active) cases|case list|plans? (waiting|to review|pending|for review)|ready to close|cases? (to|ready)")
WAITING_RE = re.compile(r"what am i waiting|what('?m| am) i waiting|waiting (for|on) (what|whom|who)|what('?s| is) outstanding|my dependencies")
UPCOMING_RE = re.compile(r"who('?s)? (joins|starts|is starting|is joining|starting|joining)|(joining|starting|starts?|joins?) (next|this) week|upcoming (joiners|starts)|new (joiners|starters)")
BULK_RE = re.compile(r"remind (everyone|everybody|all|them all)|chase (everyone|everybody|all)")
DOCS_RE = re.compile(r"document|\bdocs\b|paperwork|packet")


def case_intent(ctx: RoleContext, text: str, low: str, target: Optional[JoinerFacts]) -> Optional[Reply]:
    """HR onboarding-assistant intents. None means 'not a case question'."""
    if ctx.role in (ROLE_IT, ROLE_MANAGER):
        if re.search(r"follow[- ]?ups?|reminders?|what has nia sent|from hr|routed to me", low):
            return my_followups(ctx)
        return None
    if ctx.role not in (ROLE_HR, ROLE_OPS):
        return None
    if BULK_RE.search(low) and DOCS_RE.search(low):
        return case_bulk_doc_reminders(ctx)
    kind = _draft_kind(low)
    if kind:
        return case_draft(ctx, target, kind)
    if re.search(r"close .*case|close (the )?onboarding", low):
        return case_close(ctx, target)
    if WAITING_RE.search(low):
        return case_waiting(ctx)
    if UPCOMING_RE.search(low):
        return case_upcoming(ctx, text)
    if CASE_LIST_RE.search(low):
        if "close" in low:
            return case_list(ctx, "complete")
        if re.search(r"review|waiting|pending|plans?", low):
            return case_list(ctx, "review")
        return case_list(ctx, "all")
    if target is None:
        return None
    if CASE_PLAN_RE.search(low):
        return case_plan(ctx, target)
    if DOCS_RE.search(low) and not re.search(r"\bwhy\b|who ", low):
        return case_documents(ctx, target)
    if CASE_STATUS_RE.search(low) and not re.search(r"learning|course|module", low):
        return case_status(ctx, target)
    return None


REFUSE = re.compile(
    r"approve|change (her|his|their) (salary|pay|data|record|details|permissions?)|update (her|his|their) record|"
    r"delete|grant (me|myself)|change permissions?|edit (her|his|their)|close (the |her |his |their )?ticket|approve leave"
)


def ask(ctx: RoleContext, message: str, focus_joiner_id: Optional[str] = None) -> dict:
    text = (message or "").strip()
    low = text.lower()
    if not text:
        return welcome(ctx)

    assign_m = re.search(r"\bassign\b(.*?)(?:\bto\b\s+(.+))?$", low)
    owner_q = ""
    name_text = text
    if assign_m and assign_m.group(2) and not LEARNING_RE.search(low):
        owner_q = assign_m.group(2).strip(" .?!")
        name_text = text[: low.rfind(" to ")]

    people, hidden = _find_people(ctx, name_text)
    focus = ctx.facts(focus_joiner_id) if focus_joiner_id else None
    target: Optional[JoinerFacts] = people[0] if len(people) == 1 else None
    if target is None and not people and focus is not None and (_PRONOUN.search(low) or not hidden):
        target = focus

    if hidden and not people:
        r = Reply(ctx, "denied", NO_ACCESS)
        r.suggestions = SUGGESTIONS[ctx.role][:3]
        return r.to_dict()
    if len(people) > 1 and not re.search(r"\bassign\b", low):
        r = Reply(ctx, "clarify", "I found more than one match — which person do you mean?")
        r.joiners(people[:5])
        r.suggestions = [f"Give me a complete picture of {p.joiner.name}" for p in people[:3]]
        return r.to_dict()

    named = target if (people or _PRONOUN.search(low)) else None
    case_reply = case_intent(ctx, text, low, named)
    if case_reply is not None:
        return case_reply.to_dict()

    if REFUSE.search(low):
        r = Reply(ctx, "refuse", (
            "I can't do that. NIA doesn't change HR records, employee data, permissions or approvals, "
            "and won't close source-system tickets. I can prepare an assignment or open the right system for you."
        ))
        if target:
            src = blocker_info(target)["source"]
            if src != "SmartStart":
                r.link(src, record_refs(target)[src])
            r.focus = target.id
        return r.to_dict()

    if LEARNING_RE.search(low):
        if not ctx.permissions.get("view_learning"):
            return Reply(ctx, "denied", NO_ACCESS).to_dict()
        if re.search(r"\b(add|assign|enrol|enroll|give)\b", low):
            return prepare_course(ctx, text, target).to_dict()
        if target:
            return learning_for(ctx, target).to_dict()
        return team_learning(ctx).to_dict()

    if re.search(r"brief(ing)?|my day|summary|summari[sz]e|catch me up", low):
        return briefing(ctx).to_dict()
    if assign_m:
        return prepare_assign(ctx, text, target, owner_q).to_dict()
    if re.search(r"still needs? help|reopen|re-open|not (actually )?resolved|unresolve", low):
        return prepare_reopen(ctx, target).to_dict()
    if re.search(r"\bresolve\b|mark .* resolved|mark resolved", low):
        return prepare_resolve(ctx, target).to_dict()
    if re.search(r"what happens if|what if|\bif\b.*(isn't|is not|not ready|doesn't|does not|remains|stays|never|don't)", low):
        return what_if(ctx, text, target).to_dict()
    cohort_q = target is None and re.search(r"stuck|bottleneck|delay|slow", low)
    if not cohort_q and re.search(r"where (do|can|should) i|where is|where are|which system|open (icims|service ?desk|servicenow|jira)|where.*(fix|check|assign|find)", low):
        return navigate(ctx, text, target).to_dict()
    if target and re.search(r"can .* start|ready (to|for) (start|the project|project)|start (their|her|his|the)? ?project|is .* project[- ]?ready", low):
        return can_start_project(ctx, target).to_dict()
    if target and re.search(r"complete picture|full picture|tell me (about|everything)|360|overview|profile|everything about|how is|status of|update on", low):
        return employee_360(ctx, target).to_dict()
    if target and re.search(r"\bwhy\b|blocked|at risk|high risk|stuck|delayed|what'?s wrong", low):
        return explain(ctx, target).to_dict()
    if target and re.search(r"what should i do|next step|what do i do|how (do|can) i help|what'?s next|recommend", low):
        return recommend_for(ctx, target).to_dict()
    if re.search(r"\bwhy\b.*(someone|anyone|joiner|people)", low):
        if ctx.actionable:
            return explain(ctx, ctx.actionable[0]).to_dict()
    if target and people:
        return employee_360(ctx, target).to_dict()
    if re.search(r"stuck|bottleneck|caus|breaking|which team|compare|slow|where .* (delay|problem)|most delay", low):
        return cohort(ctx, text).to_dict()
    c = _counts(ctx)
    for key, pattern, label, pick in LISTS:
        if re.search(pattern, low):
            if key == "no_project" and not re.search(r"no |without|doesn't|don't|haven't|hasn't|missing|pending|assign|need", low):
                continue
            return list_answer(ctx, key, label, pick(ctx, c), text).to_dict()
    if re.search(r"attention|priorit|first|urgent|needs? me|need my|what should i|today|work on|focus|top|most important|fix first", low):
        return priorities(ctx).to_dict()

    r = Reply(ctx, "unknown", NO_DATA)
    r.bullets([
        "Ask about a joiner by name (\"Why is Sarah at risk?\", \"Give me a complete picture of Sarah\")",
        "Ask for your priorities, briefing, or a list (SLA breaches, pending documents, no project)",
    ], "Here's what I can help with")
    r.suggestions = SUGGESTIONS[ctx.role]
    return r.to_dict()
