"""Role context — one scoped, role-aware view over the shared synthetic cohort.

Every employer persona (HR, IT, Manager, Ops) reads the SAME store, state machine,
bottleneck inference and risk engine. This module only decides:

* which joiners a signed-in user may see (``visible_joiners``),
* which of those they should act on (``actionable_joiners``),
* how bottlenecks, alerts and analytics are framed for that role.

``build_role_context(session)`` is the reusable entry point (NIA will reuse it).
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import Iterable, Optional

from fastapi import HTTPException

from backend.analytics import ANALYTICS_AS_OF, queue_for_bottleneck
from backend.database import DataStore, store
from backend.models import (
    Alert,
    AlertsResponse,
    DocumentStatus,
    DocumentSubmission,
    EmployerRole,
    HardwareStatus,
    ITProvisioningTicket,
    Joiner,
    OnboardingState,
)
from backend import resolutions
from backend.predictor import build_predictions
from backend.synthetic_engine import days_in_pipeline, infer_bottleneck

AT_RISK_SCORE = 45.0
DOCS_BLOCKED_DAYS = 3

ROLE_HR = "HR"
ROLE_IT = "IT"
ROLE_MANAGER = "MANAGER"
ROLE_OPS = "OPS"

_PERSONA_TO_ROLE = {"HR": ROLE_HR, "IT": ROLE_IT, "Manager": ROLE_MANAGER, "Ops": ROLE_OPS}

ROLE_LABELS = {
    ROLE_HR: "HR",
    ROLE_IT: "IT Service Desk",
    ROLE_MANAGER: "Hiring Manager",
    ROLE_OPS: "Onboarding Ops",
}

ROLE_QUESTIONS = {
    ROLE_HR: "What does HR need to act on right now?",
    ROLE_IT: "Which joiners need IT provisioning, access or SLA attention?",
    ROLE_MANAGER: "Are my joiners ready for Day 1 and their first project?",
    ROLE_OPS: "Where is onboarding breaking down across the organization?",
}

# Queue lenses each role may request from /api/dashboard, /api/alerts, /api/analytics.
ALLOWED_VIEWS = {
    ROLE_OPS: (EmployerRole.ALL, EmployerRole.HR, EmployerRole.IT, EmployerRole.MANAGER),
    ROLE_HR: (EmployerRole.ALL, EmployerRole.HR),
    ROLE_IT: (EmployerRole.ALL, EmployerRole.IT),
    ROLE_MANAGER: (EmployerRole.ALL, EmployerRole.MANAGER),
}

NAV = {
    ROLE_HR: [
        {"id": "dashboard", "label": "Dashboard"},
        {"id": "actions", "label": "My Actions"},
        {"id": "joiners", "label": "Joiners"},
        {"id": "alerts", "label": "Alerts"},
        {"id": "analytics", "label": "Analytics"},
    ],
    ROLE_IT: [
        {"id": "dashboard", "label": "Dashboard"},
        {"id": "actions", "label": "IT Requests"},
        {"id": "joiners", "label": "Joiners"},
        {"id": "alerts", "label": "Alerts"},
        {"id": "analytics", "label": "Analytics"},
    ],
    ROLE_MANAGER: [
        {"id": "dashboard", "label": "Dashboard"},
        {"id": "joiners", "label": "My Joiners"},
        {"id": "actions", "label": "My Actions"},
        {"id": "learning", "label": "Learning"},
        {"id": "alerts", "label": "Alerts"},
    ],
    ROLE_OPS: [
        {"id": "dashboard", "label": "Dashboard"},
        {"id": "alerts", "label": "Alerts"},
        {"id": "analytics", "label": "Analytics"},
        {"id": "roles", "label": "Roles & systems"},
    ],
}

PRIORITIES = {
    ROLE_HR: [
        "Chase pending iCIMS document packets",
        "Clear document rework loops",
        "Complete offer-to-docs handoffs so IT can provision",
    ],
    ROLE_IT: [
        "Escalate laptop tickets that breached SLA",
        "Ship configured laptops before Day 1",
        "Grant VPN and application access",
    ],
    ROLE_MANAGER: [
        "Run Day-1 orientation and confirm the mentor",
        "Assign a Jira project once Day 1 is done",
        "Review first-week tasks for each joiner",
    ],
    ROLE_OPS: [
        "Unblock joiners stuck in any queue",
        "Balance HR vs IT vs Manager bottlenecks",
        "Watch at-risk joiners before they stall",
    ],
}


# --- Per-joiner facts (shared by every role) ---------------------------------


@dataclass(frozen=True)
class JoinerFacts:
    joiner: Joiner
    docs: DocumentSubmission
    ticket: ITProvisioningTicket
    bottleneck: Optional[str]
    queue: str
    days: int
    risk_score: float
    journey: list[dict]
    blocked: bool
    health: str
    # queue (HR / IT / Manager) -> resolution entry recorded against the current bottleneck
    resolved: dict = field(default_factory=dict)
    reopened: dict = field(default_factory=dict)

    @property
    def id(self) -> str:
        return self.joiner.id

    @property
    def ready(self) -> bool:
        return self.joiner.current_state == OnboardingState.PROJECT_READY

    @property
    def sla_open(self) -> bool:
        return self.ticket.sla_breached and self.ticket.hardware_status != HardwareStatus.DELIVERED

    @property
    def access_open(self) -> bool:
        return self.ticket.hardware_status != HardwareStatus.DELIVERED


def _hr_stage(docs: DocumentSubmission) -> dict:
    if docs.rework_flag:
        return {"status": "blocked", "detail": "Document rework loop"}
    if docs.status == DocumentStatus.PENDING:
        if docs.waiting_days >= DOCS_BLOCKED_DAYS:
            return {"status": "blocked", "detail": f"Docs pending {docs.waiting_days}d"}
        return {"status": "active", "detail": f"Docs pending · {docs.form_count} forms"}
    return {"status": "done", "detail": "Documents complete"}


def _it_stage(docs: DocumentSubmission, ticket: ITProvisioningTicket) -> dict:
    hw = ticket.hardware_status
    if hw == HardwareStatus.DELIVERED:
        return {"status": "done", "detail": "Laptop delivered · access granted"}
    if ticket.sla_breached:
        return {
            "status": "blocked",
            "detail": f"SLA breached · {ticket.lead_time_days}d vs {ticket.sla_target_days}d",
        }
    if hw == HardwareStatus.CONFIGURED:
        return {"status": "active", "detail": "Laptop configured · awaiting delivery"}
    if docs.status == DocumentStatus.PENDING:
        return {"status": "waiting", "detail": "Waiting on HR documents"}
    return {"status": "active", "detail": "Laptop provisioning in progress"}


def _manager_stage(joiner: Joiner) -> dict:
    state = joiner.current_state
    if state in (OnboardingState.DAY1_ORIENTED, OnboardingState.PROJECT_READY):
        return {"status": "done", "detail": f"Day 1 done · mentor {joiner.mentor_name}"}
    if state == OnboardingState.IT_PROVISIONED:
        return {"status": "active", "detail": f"Day-1 orientation due · mentor {joiner.mentor_name}"}
    return {"status": "waiting", "detail": "Waiting on HR / IT"}


def _project_stage(joiner: Joiner, upstream_blocked: bool) -> dict:
    state = joiner.current_state
    if state == OnboardingState.PROJECT_READY:
        return {"status": "done", "detail": "Project ready"}
    if state == OnboardingState.DAY1_ORIENTED:
        return {"status": "attention", "detail": "Project assignment pending (Jira)"}
    if upstream_blocked:
        return {"status": "attention", "detail": "Project start at risk (upstream delay)"}
    return {"status": "waiting", "detail": "Not started"}


def build_journey(joiner: Joiner, docs: DocumentSubmission, ticket: ITProvisioningTicket) -> list[dict]:
    """HR ✓ / IT 🟡 / Manager ✓ / Project ⚠ strip — identical for every role."""
    hr = _hr_stage(docs)
    it = _it_stage(docs, ticket)
    mgr = _manager_stage(joiner)
    upstream_blocked = "blocked" in (hr["status"], it["status"])
    project = _project_stage(joiner, upstream_blocked)
    return [
        {"stage": "HR", "label": "Documents & handoff", **hr},
        {"stage": "IT", "label": "Laptop & access", **it},
        {"stage": "Manager", "label": "Day 1 & mentor", **mgr},
        {"stage": "Project", "label": "Project readiness", **project},
    ]


def access_items(ticket: ITProvisioningTicket) -> list[dict]:
    """VPN + app access derived from the ServiceNow ticket (access ships with the laptop)."""
    if ticket.hardware_status == HardwareStatus.DELIVERED:
        status = "Granted"
    elif ticket.hardware_status == HardwareStatus.CONFIGURED:
        status = "Provisioning"
    else:
        status = "Requested"
    return [{"name": name, "status": status} for name in _access_names(ticket)]


def _access_names(ticket: ITProvisioningTicket) -> list[str]:
    return ["VPN", *[a for a in ticket.software_access if a.upper() != "VPN"]]


def joiner_facts(joiner: Joiner, db: DataStore | None = None) -> Optional[JoinerFacts]:
    db = db or store
    docs = db.get_documents(joiner.id)
    ticket = db.get_ticket_for_joiner(joiner.id)
    if docs is None or ticket is None:
        return None
    bottleneck = infer_bottleneck(joiner.current_state, docs, ticket)
    try:
        risk = float(build_predictions(joiner.id, db=db).overall_risk_score)
    except (KeyError, TypeError):
        risk = 0.0
    journey = build_journey(joiner, docs, ticket)
    blocked = any(s["status"] == "blocked" for s in journey)
    ready = joiner.current_state == OnboardingState.PROJECT_READY
    if blocked:
        health = "blocked"
    elif not ready and risk >= AT_RISK_SCORE:
        health = "at_risk"
    else:
        health = "on_track"
    return JoinerFacts(
        joiner=joiner,
        docs=docs,
        ticket=ticket,
        bottleneck=bottleneck,
        queue=queue_for_bottleneck(bottleneck) if bottleneck else "Done",
        days=days_in_pipeline(joiner, now=ANALYTICS_AS_OF),
        risk_score=round(risk, 1),
        journey=journey,
        blocked=blocked,
        health=health,
        resolved=resolutions.resolved_for(joiner.id, bottleneck),
        reopened=resolutions.reopened_for(joiner.id, bottleneck),
    )


def lens_queue(f: JoinerFacts, role: str) -> str:
    """The owner queue a role's work on this joiner belongs to (Ops acts on the joiner's own queue)."""
    return {ROLE_HR: "HR", ROLE_IT: "IT", ROLE_MANAGER: "Manager"}.get(role, f.queue)


def is_resolved_for(f: JoinerFacts, role: str) -> bool:
    return lens_queue(f, role) in f.resolved


# --- Role actions (what each role can do on one joiner) ----------------------


def _action(label: str, detail: str = "", kind: str = "primary", severity: str = "medium") -> dict:
    return {"label": label, "detail": detail, "kind": kind, "severity": severity}


def _severity(f: JoinerFacts) -> str:
    if f.blocked or f.risk_score >= 70:
        return "high"
    if f.risk_score >= AT_RISK_SCORE:
        return "medium"
    return "low"


def role_actions(f: JoinerFacts, role: str) -> list[dict]:
    sev = _severity(f)
    j, d, t = f.joiner, f.docs, f.ticket
    out: list[dict] = []
    if role == ROLE_HR:
        if d.status == DocumentStatus.PENDING:
            out.append(_action(
                "Chase iCIMS document packet",
                f"{d.form_count} forms · waiting {d.waiting_days}d",
                severity=sev,
            ))
        if d.rework_flag:
            out.append(_action("Resolve document rework", "Packet sent back for corrections", severity=sev))
        if f.bottleneck == "Offer-to-docs handoff":
            out.append(_action("Complete offer-to-docs handoff", "Confirm the packet so IT can provision", severity=sev))
        if not out:
            out.append(_action("HR steps complete", "Documents done — nothing for HR right now", kind="done", severity="low"))
        return out
    if role == ROLE_IT:
        if f.sla_open:
            out.append(_action(
                f"Escalate laptop ticket {t.ticket_id}",
                f"{t.lead_time_days}d vs {t.sla_target_days}d SLA target",
                severity="high",
            ))
        elif t.hardware_status == HardwareStatus.PENDING:
            out.append(_action("Start laptop provisioning", f"Ticket {t.ticket_id}", severity=sev))
        elif t.hardware_status == HardwareStatus.CONFIGURED:
            out.append(_action("Ship configured laptop", f"Ticket {t.ticket_id}", severity=sev))
        if f.access_open:
            names = _access_names(t)
            apps = ", ".join(names[:4])
            more = len(names) - 4
            out.append(_action(
                "Grant VPN + app access",
                apps + (f" +{more}" if more > 0 else ""),
                kind="secondary",
                severity=sev,
            ))
        if not out:
            out.append(_action("IT setup complete", "Laptop delivered · access granted", kind="done", severity="low"))
        return out
    if role == ROLE_MANAGER:
        state = j.current_state
        if state == OnboardingState.IT_PROVISIONED:
            out.append(_action("Run Day-1 orientation", "Laptop is ready — book the welcome session", severity=sev))
            out.append(_action(f"Confirm mentor {j.mentor_name}", "Introduce the mentor before Day 1", kind="secondary", severity=sev))
        elif state == OnboardingState.DAY1_ORIENTED:
            out.append(_action("Assign Jira project", "Day 1 is done — the joiner needs a first project", severity=sev))
        elif state == OnboardingState.PROJECT_READY:
            out.append(_action("Project ready", "Joiner is working on their first project", kind="done", severity="low"))
        else:
            out.append(_action(
                "Waiting on HR / IT",
                f.bottleneck or "Upstream onboarding in progress",
                kind="info",
                severity=sev,
            ))
        if j.assigned_tasks and state != OnboardingState.PROJECT_READY:
            out.append(_action(
                "Review first-week tasks",
                " · ".join(j.assigned_tasks[:3]),
                kind="secondary",
                severity="low",
            ))
        return out
    # Ops: route to the owning queue.
    if f.bottleneck:
        out.append(_action(
            f"Route to {f.queue} queue",
            f.bottleneck,
            severity=sev,
        ))
    else:
        out.append(_action("On track", "Project ready — no open bottleneck", kind="done", severity="low"))
    return out


def _is_actionable(f: JoinerFacts, role: str) -> bool:
    if is_resolved_for(f, role):
        return False
    if role == ROLE_HR:
        return f.queue == "HR"
    if role == ROLE_IT:
        return f.access_open and not f.ready
    if role == ROLE_MANAGER:
        return f.joiner.current_state in (OnboardingState.IT_PROVISIONED, OnboardingState.DAY1_ORIENTED)
    return f.health in ("blocked", "at_risk")


def _relevant_to(f: JoinerFacts, role: str) -> bool:
    if role == ROLE_OPS or role == ROLE_MANAGER:
        return bool(f.bottleneck)
    return f.queue == ("HR" if role == ROLE_HR else "IT")


# --- Role context ------------------------------------------------------------


def _permissions(role: str) -> dict:
    base = {
        "scope": "team" if role == ROLE_MANAGER else "cohort",
        "switch_queues": role == ROLE_OPS,
        "queues": [v.value for v in ALLOWED_VIEWS[role]],
        "view_journey": True,
        "view_documents": "full" if role in (ROLE_HR, ROLE_OPS) else "status",
        "view_it_ticket": "full" if role in (ROLE_IT, ROLE_OPS) else "status",
        "view_risk": True,
        "assign": True,
        "resolve": True,
        "regenerate_cohort": role == ROLE_OPS,
        "view_learning": role in (ROLE_HR, ROLE_MANAGER, ROLE_OPS),
        "manage_learning": role in (ROLE_MANAGER, ROLE_OPS),
        "manage_cases": role in (ROLE_HR, ROLE_OPS),
        "manage_prep": role == ROLE_MANAGER,
    }
    base["act_on"] = {
        ROLE_HR: ["documents", "handoff"],
        ROLE_IT: ["laptop", "vpn", "access", "sla"],
        ROLE_MANAGER: ["day1", "mentor", "project", "first_week_tasks"],
        ROLE_OPS: ["route", "assign", "escalate"],
    }[role]
    return base


@dataclass
class RoleContext:
    user: dict
    role: str
    visible: list[JoinerFacts]
    actionable: list[JoinerFacts]
    relevant_bottlenecks: dict[str, int]
    permissions: dict
    priorities: list[dict]
    cohort_total: int
    _by_id: dict[str, JoinerFacts] = field(default_factory=dict, repr=False)

    def __post_init__(self) -> None:
        self._by_id = {f.id: f for f in self.visible}

    @property
    def manager_id(self) -> Optional[str]:
        return self.user.get("manager_id") if self.role == ROLE_MANAGER else None

    def can_see(self, joiner_id: str) -> bool:
        return joiner_id in self._by_id

    def facts(self, joiner_id: str) -> Optional[JoinerFacts]:
        return self._by_id.get(joiner_id)

    def require_joiner(self, joiner_id: str) -> JoinerFacts:
        """404 (not 403) outside scope so other teams' joiner IDs are not confirmed."""
        f = self._by_id.get(joiner_id)
        if f is None:
            raise HTTPException(status_code=404, detail="Joiner not found")
        return f

    def resolve_view(self, requested: EmployerRole) -> EmployerRole:
        if requested not in ALLOWED_VIEWS[self.role]:
            raise HTTPException(
                status_code=403,
                detail=f"The {requested.value} queue lens is not available to {ROLE_LABELS[self.role]}.",
            )
        return requested

    def to_dict(self) -> dict:
        """Compact, JSON-safe context (the contract NIA will consume)."""
        return {
            "user": self.user,
            "role": self.role,
            "role_label": ROLE_LABELS[self.role],
            "visible_joiners": [f.id for f in self.visible],
            "actionable_joiners": [f.id for f in self.actionable],
            "relevant_bottlenecks": self.relevant_bottlenecks,
            "permissions": self.permissions,
            "priorities": self.priorities,
            "cohort_total": self.cohort_total,
            "synthetic": True,
        }


def role_for_session(session: dict) -> str:
    return _PERSONA_TO_ROLE.get(session.get("persona", ""), ROLE_OPS)


def build_role_context(session: dict, db: DataStore | None = None) -> RoleContext:
    db = db or store
    role = role_for_session(session)
    manager_id = session.get("manager_id") if role == ROLE_MANAGER else None
    joiners = db.list_joiners()

    visible: list[JoinerFacts] = []
    for j in joiners:
        if manager_id and j.manager_id != manager_id:
            continue
        f = joiner_facts(j, db)
        if f is not None:
            visible.append(f)

    actionable = [f for f in visible if _is_actionable(f, role)]
    sev_rank = {"high": 0, "medium": 1, "low": 2}
    actionable.sort(key=lambda f: (sev_rank[_severity(f)], -f.risk_score, f.id))

    bn = Counter(f.bottleneck for f in visible if f.bottleneck and _relevant_to(f, role))
    priorities = []
    for f in actionable:
        primary = role_actions(f, role)[0]
        priorities.append({
            "joiner_id": f.id,
            "joiner_name": f.joiner.name,
            "action": primary["label"],
            "detail": primary["detail"],
            "severity": primary["severity"],
            "queue": f.queue,
            "bottleneck": f.bottleneck,
            "risk_score": f.risk_score,
        })

    user = {
        "username": session.get("username"),
        "display_name": session.get("display_name"),
        "title": session.get("title"),
        "persona": session.get("persona"),
        "manager_id": session.get("manager_id"),
    }
    return RoleContext(
        user=user,
        role=role,
        visible=visible,
        actionable=actionable,
        relevant_bottlenecks=dict(bn.most_common()),
        permissions=_permissions(role),
        priorities=priorities,
        cohort_total=len(joiners),
    )


# --- Workspace (cards, nav, queues) ------------------------------------------


def _card(cid: str, label: str, value, hint: str = "", tone: str = "neutral", filt: str = "") -> dict:
    return {"id": cid, "label": label, "value": value, "hint": hint, "tone": tone, "filter": filt}


def build_cards(ctx: RoleContext) -> list[dict]:
    v = ctx.visible
    n = len(v)
    if ctx.role == ROLE_HR:
        pending = sum(1 for f in v if f.docs.status == DocumentStatus.PENDING)
        rework = sum(1 for f in v if f.docs.rework_flag)
        at_risk = sum(1 for f in v if f.health in ("at_risk", "blocked") and f.queue == "HR")
        return [
            _card("in_view", "Joiners in view", n, "Full cohort", filt="all"),
            _card("docs_pending", "Documents pending", pending, "iCIMS packets open", "warn" if pending else "ok", "docs_pending"),
            _card("rework", "Document rework", rework, "Sent back for corrections", "bad" if rework else "ok", "rework"),
            _card("actions", "HR actions", len(ctx.actionable), "In your queue now", "accent", "actionable"),
            _card("at_risk", "At risk", at_risk, "HR-owned joiners at risk", "bad" if at_risk else "ok", "hr_at_risk"),
        ]
    if ctx.role == ROLE_IT:
        hw = sum(1 for f in v if f.ticket.hardware_status != HardwareStatus.DELIVERED)
        sla = sum(1 for f in v if f.sla_open)
        access = sum(len(access_items(f.ticket)) for f in v if f.access_open)
        access_people = sum(1 for f in v if f.access_open)
        risks = sum(1 for f in v if f.queue == "IT" and f.health != "on_track")
        return [
            _card("in_view", "Joiners in view", n, "Full cohort", filt="all"),
            _card("hardware", "Pending hardware", hw, "Laptops not delivered", "warn" if hw else "ok", "hardware"),
            _card("sla", "SLA breaches", sla, "ServiceNow tickets over target", "bad" if sla else "ok", "sla"),
            _card("access", "Access requests", access, f"VPN + apps across {access_people} joiner(s)", "accent", "access"),
            _card("it_risks", "IT risks", risks, "IT-owned joiners at risk", "bad" if risks else "ok", "it_risk"),
        ]
    if ctx.role == ROLE_MANAGER:
        on_track = sum(1 for f in v if f.health == "on_track")
        pending_project = sum(1 for f in v if f.joiner.current_state == OnboardingState.DAY1_ORIENTED)
        ready = sum(1 for f in v if f.ready)
        return [
            _card("in_view", "My Joiners", n, "Your team only", filt="all"),
            _card("on_track", "On Track", on_track, "No blockers", "ok", "on_track"),
            _card("actions", "Need My Action", len(ctx.actionable), "Day 1 or project", "accent", "actionable"),
            _card("project_pending", "Project Assignment Pending", pending_project, "Assign in Jira", "warn" if pending_project else "ok", "project_pending"),
            _card("project_ready", "Project Ready", ready, "Working on first project", "ok", "project_ready"),
        ]
    health = Counter(f.health for f in v)
    active_bn = Counter(f.bottleneck for f in v if f.bottleneck)
    top = active_bn.most_common(1)
    return [
        _card("in_view", "Total Joiners", n, "Whole cohort", filt="all"),
        _card("on_track", "On Track", health.get("on_track", 0), "No blockers, low risk", "ok", "on_track"),
        _card("at_risk", "At Risk", health.get("at_risk", 0), f"Risk score ≥ {int(AT_RISK_SCORE)}", "warn", "at_risk"),
        _card("blocked", "Blocked", health.get("blocked", 0), "SLA breach, rework or stale docs", "bad", "blocked"),
        _card(
            "bottlenecks",
            "Active Bottlenecks",
            len(active_bn),
            f"Top: {top[0][0]} ({top[0][1]})" if top else "None",
            "accent",
            "bottleneck",
        ),
    ]


def joiner_summary(f: JoinerFacts, role: str) -> dict:
    j = f.joiner
    return {
        "id": j.id,
        "name": j.name,
        "role_type": j.role_type.value,
        "department": j.department,
        "manager_name": j.manager_name,
        "mentor_name": j.mentor_name,
        "current_state": j.current_state.value,
        "days_in_pipeline": f.days,
        "bottleneck": f.bottleneck,
        "queue": f.queue,
        "health": f.health,
        "risk_score": f.risk_score,
        "journey": f.journey,
        "actions": role_actions(f, role),
        "docs_status": f.docs.status.value,
        "rework": f.docs.rework_flag,
        "hardware_status": f.ticket.hardware_status.value,
        "sla_breached": f.sla_open,
        "access_open": f.access_open,
        "resolution": f.resolved.get(lens_queue(f, role)),
        "reopened": f.reopened.get(lens_queue(f, role)),
    }


def build_workspace(ctx: RoleContext) -> dict:
    role = ctx.role
    scope_label = (
        f"Your team · {len(ctx.visible)} joiner(s)"
        if role == ROLE_MANAGER
        else f"Full cohort · {len(ctx.visible)} joiner(s)"
    )
    return {
        **ctx.to_dict(),
        "question": ROLE_QUESTIONS[role],
        "scope": {"label": scope_label, "visible": len(ctx.visible), "cohort_total": ctx.cohort_total},
        "nav": NAV[role],
        "can_switch_queues": ctx.permissions["switch_queues"],
        "cards": build_cards(ctx),
        "action_queue": [joiner_summary(f, role) for f in ctx.actionable],
        "joiners": [joiner_summary(f, role) for f in ctx.visible],
        "resolved": [
            {"joiner_id": f.id, "name": f.joiner.name, **entry}
            for f in ctx.visible for entry in f.resolved.values()
            if role == ROLE_OPS or entry["queue"] == lens_queue(f, role)
        ],
        "focus": PRIORITIES[role],
        "as_of": ANALYTICS_AS_OF.isoformat(),
    }


# --- Role-aware alerts -------------------------------------------------------


_ALERT_QUEUE = {"IT": "IT", "HR": "HR", "MGR": "Manager"}
_ROLLUP_QUEUE = {"IT-SLA": "IT", "HR-DOCS": "HR", "HR-REWORK": "HR", "HR-DAY1": "Manager", "MGR-PROJECT": "Manager"}


def _names(ctx: RoleContext, ids: Iterable[str], limit: int = 4) -> str:
    names = [ctx.facts(i).joiner.name for i in ids if ctx.facts(i)]
    shown = ", ".join(names[:limit])
    return shown + ("…" if len(names) > limit else "")


def _word_joiner_alert(a: Alert, ctx: RoleContext) -> Optional[dict]:
    f = ctx.facts(a.joiner_id or "")
    if f is None:
        return None
    name = f.joiner.name
    t = f.ticket
    kind = a.id.split("-")[1]  # IT / HR / MGR
    if _ALERT_QUEUE.get(kind) in f.resolved:
        return None
    role = ctx.role
    if role == ROLE_OPS:
        return {"action_required": False}
    if role == ROLE_HR:
        if kind == "HR":
            return {"title": "Documents pending — chase packet", "action_required": True}
        if kind == "IT":
            return {
                "title": "IT provisioning delayed",
                "message": f"{name}'s IT provisioning is delayed and may affect onboarding readiness.",
                "action_required": False,
            }
        return None
    if role == ROLE_IT:
        if kind == "IT":
            return {
                "title": "Laptop SLA breached",
                "message": (
                    f"{name}'s laptop has breached SLA ({t.lead_time_days}d vs "
                    f"{t.sla_target_days}d target, {t.ticket_id}). Action required."
                ),
                "action_required": True,
            }
        return None
    # Manager
    if kind == "IT":
        return {
            "title": "IT setup delayed",
            "message": f"IT setup for {name} is delayed and may affect their project start.",
            "action_required": False,
        }
    if kind == "HR":
        return {
            "title": "Documents still with HR",
            "message": f"{name}'s onboarding documents are still pending with HR — Day 1 may slip.",
            "action_required": False,
        }
    return {
        "title": "Assign a first project",
        "message": f"{name} finished Day-1 orientation — assign a Jira project. Action required.",
        "action_required": True,
    }


def _rollup_ids(a: Alert, ctx: RoleContext) -> list[str]:
    queue = _ROLLUP_QUEUE.get(a.id.replace("ALT-ROLLUP-", ""))
    out = []
    for i in a.joiner_ids:
        f = ctx.facts(i)
        if f is None:
            continue
        if queue in f.resolved if queue else is_resolved_for(f, ctx.role):
            continue
        out.append(i)
    return out


def _word_rollup(a: Alert, ctx: RoleContext) -> Optional[dict]:
    key = a.id.replace("ALT-ROLLUP-", "")
    ids = _rollup_ids(a, ctx)
    n = len(ids)
    if n == 0:
        return None
    role = ctx.role
    if role == ROLE_OPS:
        text = {
            "IT-SLA": f"IT provisioning is contributing to {n} potential project-readiness delays.",
            "HR-DOCS": f"Document collection is holding {n} joiner(s) before IT provisioning and Day 1.",
            "HR-REWORK": f"Document rework is looping {n} joiner(s) back through HR.",
            "HR-DAY1": f"{n} provisioned joiner(s) are queued for Day-1 orientation.",
            "MGR-PROJECT": f"Manager project assignment is the last blocker for {n} joiner(s).",
        }.get(key)
        return {"message": text, "action_required": False} if text else {"action_required": False}
    if role == ROLE_HR:
        text = {
            "HR-DOCS": (f"{n} joiner(s) still have pending iCIMS packets: {_names(ctx, ids)}.", True),
            "HR-REWORK": (f"{n} joiner(s) need document rework resolved: {_names(ctx, ids)}.", True),
            "IT-SLA": (f"IT provisioning is delayed for {n} joiner(s) and may affect onboarding readiness.", False),
            "STALLED": (f"{n} joiner(s) have been in the pipeline ≥10 days — check HR handoffs.", False),
        }.get(key)
    elif role == ROLE_IT:
        text = {
            "IT-SLA": (f"{n} laptop ticket(s) have breached SLA: {_names(ctx, ids)}. Action required.", True),
            "STALLED": (f"{n} joiner(s) have been in the pipeline ≥10 days — check open IT tickets.", False),
        }.get(key)
    else:
        text = {
            "IT-SLA": (f"IT setup is delayed for {n} of your joiner(s): {_names(ctx, ids)} — project starts may slip.", False),
            "HR-DOCS": (f"{n} of your joiner(s) still have documents pending with HR: {_names(ctx, ids)}.", False),
            "HR-DAY1": (f"{n} of your joiner(s) are ready for Day-1 orientation: {_names(ctx, ids)}. Confirm mentors.", True),
            "MGR-PROJECT": (f"{n} of your joiner(s) need a Jira project assignment: {_names(ctx, ids)}.", True),
            "STALLED": (f"{n} of your joiner(s) have been in the pipeline ≥10 days.", False),
        }.get(key)
    if text is None:
        return None
    return {"message": text[0], "action_required": text[1]}


def present_alerts(ctx: RoleContext, base: AlertsResponse, view: EmployerRole) -> AlertsResponse:
    """Same underlying events for everyone; wording and inclusion follow the role."""
    out: list[Alert] = []
    for a in base.alerts:
        if ctx.role == ROLE_OPS and view != EmployerRole.ALL:
            if a.role_view not in {view.value, EmployerRole.ALL.value, "Ops"}:
                continue
        if a.joiner_id is not None:
            words = _word_joiner_alert(a, ctx)
            if words is None:
                continue
        else:
            words = _word_rollup(a, ctx)
            if words is None:
                continue
            words["joiner_ids"] = _rollup_ids(a, ctx)
        update = {k: v for k, v in words.items() if v is not None}
        update["audience"] = ctx.role
        update["event_title"] = a.title
        out.append(a.model_copy(update=update))
    out.sort(key=lambda a: (not a.action_required,))
    return base.model_copy(update={"alerts": out, "total": len(out)})


# --- Role-aware analytics ----------------------------------------------------


def _kpi(label: str, value, hint: str = "") -> dict:
    return {"label": label, "value": value, "hint": hint}


def _bars(bid: str, title: str, counts: dict, subtitle: str = "") -> dict:
    return {
        "id": bid,
        "title": title,
        "subtitle": subtitle,
        "kind": "bars",
        "items": [{"label": k, "value": v} for k, v in counts.items()],
    }


def _list(bid: str, title: str, rows: list[dict], subtitle: str = "") -> dict:
    return {"id": bid, "title": title, "subtitle": subtitle, "kind": "list", "items": rows}


def _pct(part: int, whole: int) -> float:
    return round(100.0 * part / whole, 1) if whole else 0.0


def _avg(values: list[float]) -> float:
    return round(sum(values) / len(values), 1) if values else 0.0


def build_role_insights(ctx: RoleContext) -> dict:
    v = ctx.visible
    role = ctx.role
    stage_order = [s.value for s in OnboardingState]
    if role == ROLE_HR:
        pending = [f for f in v if f.docs.status == DocumentStatus.PENDING]
        rework = [f for f in v if f.docs.rework_flag]
        hr_bn = Counter(f.bottleneck for f in v if f.queue == "HR")
        waits = sorted(pending + rework, key=lambda f: -f.docs.waiting_days)
        return {
            "role": role,
            "headline": "HR analytics — documents, rework and HR-owned delays",
            "kpis": [
                _kpi("Docs pending", len(pending), "iCIMS packets open"),
                _kpi("Document rework", len(rework), "Sent back for corrections"),
                _kpi("HR bottlenecks", sum(hr_bn.values()), "Joiners stuck in the HR queue"),
                _kpi("Avg docs wait", f"{_avg([f.docs.waiting_days for f in pending])}d", "Pending packets"),
                _kpi("HR delays", sum(1 for f in v if f.journey[0]["status"] == "blocked"), "Blocked at the HR step"),
            ],
            "breakdowns": [
                _bars("hr_bottlenecks", "HR bottlenecks", dict(hr_bn.most_common()), "Where HR-owned joiners are stuck"),
                _bars("docs_status", "Document status", {
                    "Complete": sum(1 for f in v if f.docs.status == DocumentStatus.COMPLETE and not f.docs.rework_flag),
                    "Pending": len(pending),
                    "Rework": len(rework),
                }, "Across the cohort"),
                _list("delays", "Longest document waits", [
                    {"label": f.joiner.name, "value": f"{f.docs.waiting_days}d", "joiner_id": f.id,
                     "hint": "Rework" if f.docs.rework_flag else "Pending"}
                    for f in waits[:6]
                ], "Chase these first"),
            ],
        }
    if role == ROLE_IT:
        hw = Counter(f.ticket.hardware_status.value for f in v)
        sla = [f for f in v if f.sla_open]
        lead = [f.ticket.lead_time_days for f in v]
        over = Counter()
        for f in v:
            gap = f.ticket.lead_time_days - f.ticket.sla_target_days
            over["Within SLA" if gap <= 0 else ("1–2d over" if gap <= 2 else "3d+ over")] += 1
        return {
            "role": role,
            "headline": "IT analytics — hardware, SLA, access and provisioning time",
            "kpis": [
                _kpi("Hardware delays", sum(1 for f in v if f.ticket.hardware_status != HardwareStatus.DELIVERED), "Laptops not delivered"),
                _kpi("SLA breaches", len(sla), "Open tickets over target"),
                _kpi("Access requests", sum(len(access_items(f.ticket)) for f in v if f.access_open), "VPN + apps pending"),
                _kpi("Avg provisioning time", f"{_avg(lead)}d", f"Target {v[0].ticket.sla_target_days if v else 3}d"),
                _kpi("Within SLA", f"{_pct(over.get('Within SLA', 0), len(v))}%", "Tickets at or under target"),
            ],
            "breakdowns": [
                _bars("hardware", "Hardware status", {k: hw.get(k, 0) for k in ("Pending", "Configured", "Delivered")}, "ServiceNow laptop tickets"),
                _bars("provisioning", "Provisioning time vs SLA", {k: over.get(k, 0) for k in ("Within SLA", "1–2d over", "3d+ over")}),
                _list("sla", "SLA breaches", [
                    {"label": f.joiner.name, "value": f"{f.ticket.lead_time_days}d", "joiner_id": f.id,
                     "hint": f"{f.ticket.ticket_id} · target {f.ticket.sla_target_days}d"}
                    for f in sorted(sla, key=lambda f: -f.ticket.lead_time_days)
                ], "Escalate these"),
            ],
        }
    if role == ROLE_MANAGER:
        n = len(v)
        day1 = sum(1 for f in v if f.joiner.current_state in (OnboardingState.DAY1_ORIENTED, OnboardingState.PROJECT_READY))
        ready = sum(1 for f in v if f.ready)
        stages = Counter(f.joiner.current_state.value for f in v)
        readiness = {
            "Project ready": ready,
            "Assignment pending": sum(1 for f in v if f.joiner.current_state == OnboardingState.DAY1_ORIENTED),
            "Day 1 due": sum(1 for f in v if f.joiner.current_state == OnboardingState.IT_PROVISIONED),
            "Waiting on HR / IT": sum(1 for f in v if f.joiner.current_state in (OnboardingState.OFFER_ACCEPTED, OnboardingState.DOCS_SUBMITTED)),
        }
        return {
            "role": role,
            "headline": "Team analytics — Day 1, project readiness and your actions",
            "kpis": [
                _kpi("Team onboarding", n, "Joiners reporting to you"),
                _kpi("Day-1 completion", f"{_pct(day1, n)}%", f"{day1} of {n} oriented"),
                _kpi("Project readiness", f"{_pct(ready, n)}%", f"{ready} project ready"),
                _kpi("Manager actions", len(ctx.actionable), "Day 1 or project to do"),
                _kpi("Avg days in pipeline", _avg([f.days for f in v]), "Since offer accepted"),
            ],
            "breakdowns": [
                _bars("team_stage", "Team by stage", {s.replace("_", " "): stages.get(s, 0) for s in stage_order}),
                _bars("readiness", "Project readiness", readiness),
                _list("actions", "Your next actions", [
                    {"label": p["joiner_name"], "value": p["action"], "joiner_id": p["joiner_id"], "hint": p["detail"]}
                    for p in ctx.priorities
                ]),
            ],
        }
    active = [f for f in v if not f.ready]
    by_queue = Counter(f.queue for f in active if f.queue in ("HR", "IT", "Manager"))
    cross = {
        "HR → IT (docs holding provisioning)": sum(
            1 for f in v if f.docs.status == DocumentStatus.PENDING and f.ticket.hardware_status != HardwareStatus.DELIVERED
        ),
        "IT → Manager (laptop late for Day 1)": sum(1 for f in v if f.sla_open),
        "Manager → Project (assignment pending)": sum(
            1 for f in v if f.joiner.current_state == OnboardingState.DAY1_ORIENTED
        ),
    }
    health = Counter(f.health for f in v)
    return {
        "role": role,
        "headline": "Cohort analytics — where onboarding breaks down",
        "kpis": [
            _kpi("Total joiners", len(v), "Whole cohort"),
            _kpi("On track", health.get("on_track", 0)),
            _kpi("At risk", health.get("at_risk", 0)),
            _kpi("Blocked", health.get("blocked", 0)),
            _kpi("Completion", f"{_pct(len(v) - len(active), len(v))}%", "Project ready"),
        ],
        "breakdowns": [
            _bars("owners", "HR vs IT vs Manager", {k: by_queue.get(k, 0) for k in ("HR", "IT", "Manager")}, "Open bottlenecks by owning queue"),
            _bars("cross", "Cross-functional delays", cross, "Where one team's delay hits the next"),
        ],
    }
