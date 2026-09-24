"""Synthetic enterprise knowledge layer for SmartStart + IRA.

Governed, hackathon-scale entity catalog with relationships — enough to
demonstrate intelligent navigation without a full graph database.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class KnowledgeEntity:
    id: str
    kind: str  # application | process | document | policy | team | term | place
    name: str
    summary: str
    owner: str
    department: str
    source: str
    source_updated: str = "Sep 2026"
    actions: tuple[str, ...] = ()
    related_ids: tuple[str, ...] = ()
    keywords: tuple[str, ...] = ()
    role_tags: tuple[str, ...] = ("intern", "fte")  # who typically needs this
    navigate_hint: str = ""  # human-controlled next step label


# --- Catalog -----------------------------------------------------------------

ENTITIES: dict[str, KnowledgeEntity] = {}


def _e(entity: KnowledgeEntity) -> KnowledgeEntity:
    ENTITIES[entity.id] = entity
    return entity


_e(
    KnowledgeEntity(
        id="app-hr-portal",
        kind="application",
        name="HR Portal",
        summary=(
            "Employee self-service for leave, payslips, holiday calendar, and HR forms. "
            "Onboarding documents still route through iCIMS in this sandbox."
        ),
        owner="HR Operations",
        department="HR",
        source="Leave & Attendance Guide",
        actions=("Open HR Portal", "View leave policy"),
        related_ids=("proc-leave", "doc-leave-guide", "pol-leave", "app-icims"),
        keywords=("hr portal", "leave", "payslip", "payroll", "holiday", "salary", "attendance"),
        navigate_hint="Open the HR Portal to submit or track leave.",
    )
)
_e(
    KnowledgeEntity(
        id="app-icims",
        kind="application",
        name="iCIMS",
        summary=(
            "HR / ATS system used for onboarding document packets in this sandbox. "
            "Submit forms here; incomplete packets stay Pending."
        ),
        owner="HR Operations",
        department="HR",
        source="iCIMS (mock)",
        actions=("Open document packet",),
        related_ids=("proc-docs", "doc-onboarding-policy"),
        keywords=("icims", "documents", "docs", "forms", "packet", "hr system"),
        navigate_hint="Submit your onboarding packet in iCIMS.",
    )
)
_e(
    KnowledgeEntity(
        id="app-servicenow",
        kind="application",
        name="ServiceNow",
        summary=(
            "IT service management platform. Hardware, software, VPN, and access "
            "requests are tracked as tickets (for example REQ-####)."
        ),
        owner="IT Service Desk",
        department="IT",
        source="ServiceNow (mock)",
        actions=("Raise IT request", "View my ticket"),
        related_ids=("proc-it-access", "proc-laptop", "team-it-desk", "term-ticket"),
        keywords=("servicenow", "service now", "it ticket", "incident", "request"),
        navigate_hint="Use ServiceNow for IT requests and ticket status.",
    )
)
_e(
    KnowledgeEntity(
        id="app-jira",
        kind="application",
        name="Jira",
        summary=(
            "Project and work tracking. Teams plan sprints, assign tasks, and grant "
            "project board access through Jira in this sandbox."
        ),
        owner="IT / Project Team",
        department="Engineering",
        source="Jira (mock)",
        actions=("Start access request", "View project board"),
        related_ids=("proc-jira-access", "app-github", "term-project-ready"),
        keywords=("jira", "project board", "sprint", "ticket", "story"),
        role_tags=("intern", "fte"),
        navigate_hint="Request Jira access through the IT access process (ServiceNow).",
    )
)
_e(
    KnowledgeEntity(
        id="app-github",
        kind="application",
        name="GitHub",
        summary=(
            "Source control for engineering teams. Clone repos, commit, branch, and "
            "open pull requests after Git Basics."
        ),
        owner="Engineering Platforms",
        department="Engineering",
        source="Engineering Handbook",
        actions=("Open GitHub", "Start Git Basics"),
        related_ids=("term-git", "learn-git", "app-jira"),
        keywords=("github", "repo", "repository", "pull request", "git"),
        role_tags=("intern", "fte"),
        navigate_hint="Complete Git Basics, then use GitHub for source control.",
    )
)
_e(
    KnowledgeEntity(
        id="app-teams",
        kind="application",
        name="Microsoft Teams",
        summary="Day-to-day chat, meetings, and channels for your department.",
        owner="IT Workplace",
        department="IT",
        source="IT Workplace Guide",
        actions=("Open Teams",),
        related_ids=("app-okta",),
        keywords=("teams", "chat", "meeting", "channel", "slack"),
        navigate_hint="Sign in to Teams with your Okta account after IT provisioning.",
    )
)
_e(
    KnowledgeEntity(
        id="app-okta",
        kind="application",
        name="Okta",
        summary="Single sign-on for Waters apps. Accept your Okta invite after laptop delivery.",
        owner="IT Identity",
        department="IT",
        source="IT Identity Guide",
        actions=("Accept Okta invite",),
        related_ids=("app-servicenow", "proc-laptop"),
        keywords=("okta", "sso", "login", "password", "reset password"),
        navigate_hint="Accept the Okta invite emailed after your laptop is Delivered.",
    )
)
_e(
    KnowledgeEntity(
        id="app-learning",
        kind="application",
        name="Learning Portal",
        summary="Mandatory and recommended modules for your role track in SmartStart Employee Experience.",
        owner="Learning & Development",
        department="HR",
        source="SmartStart Learning",
        actions=("Open learning track",),
        related_ids=("learn-git", "term-project-ready"),
        keywords=("learning", "training", "course", "module", "lms"),
        navigate_hint="Open Employee Experience → Learning track.",
    )
)
_e(
    KnowledgeEntity(
        id="app-celonis",
        kind="application",
        name="Celonis",
        summary=(
            "Process mining platform used to discover how real work flows through systems "
            "and where bottlenecks appear."
        ),
        owner="Process Excellence",
        department="Operations",
        source="Process Mining Primer",
        actions=("Open Celonis overview",),
        related_ids=("term-process-mining", "term-bpmn"),
        keywords=("celonis", "process mining tool"),
        role_tags=("fte",),
        navigate_hint="Ask your manager before requesting Celonis access.",
    )
)

_e(
    KnowledgeEntity(
        id="proc-leave",
        kind="process",
        name="Leave Application",
        summary=(
            "Submit leave in the HR Portal. Your manager approves requests. "
            "Balances and policies are governed by the Leave & Attendance Guide."
        ),
        owner="HR Operations",
        department="HR",
        source="Leave & Attendance Guide",
        actions=("Open HR Portal", "View leave policy"),
        related_ids=("app-hr-portal", "pol-leave", "doc-leave-guide"),
        keywords=("apply for leave", "time off", "pto", "vacation", "sick leave"),
        navigate_hint="Open the HR Portal to submit leave for manager approval.",
    )
)
_e(
    KnowledgeEntity(
        id="proc-docs",
        kind="process",
        name="Onboarding Documents",
        summary="Upload your full onboarding packet in iCIMS. Incomplete packets stay Pending.",
        owner="HR Operations",
        department="HR",
        source="Onboarding Policy",
        actions=("Open iCIMS packet",),
        related_ids=("app-icims", "doc-onboarding-policy"),
        keywords=("submit documents", "onboarding packet", "forms"),
        navigate_hint="Complete your iCIMS document packet.",
    )
)
_e(
    KnowledgeEntity(
        id="proc-laptop",
        kind="process",
        name="Laptop Provisioning",
        summary=(
            "IT provisions hardware after documents are Complete. Status moves "
            "Pending → Configured → Delivered on a ServiceNow ticket."
        ),
        owner="IT Service Desk",
        department="IT",
        source="ServiceNow (mock)",
        actions=("View IT ticket", "Raise IT request"),
        related_ids=("app-servicenow", "team-it-desk"),
        keywords=("laptop", "hardware", "computer", "device", "not working"),
        navigate_hint="Track hardware on your ServiceNow ticket; raise a new request only if none exists.",
    )
)
_e(
    KnowledgeEntity(
        id="proc-it-access",
        kind="process",
        name="IT Access Request",
        summary=(
            "Software and system access (Jira, GitHub, VPN extras) is requested through "
            "ServiceNow. Manager approval may be required."
        ),
        owner="IT Service Desk",
        department="IT",
        source="IT Access Policy",
        actions=("Start access request",),
        related_ids=("app-servicenow", "app-jira", "app-github"),
        keywords=("request access", "software access", "permission", "entitle"),
        navigate_hint="Start an access request in ServiceNow.",
    )
)
_e(
    KnowledgeEntity(
        id="proc-jira-access",
        kind="process",
        name="Jira Project Access",
        summary=(
            "Jira board access is provisioned via IT access and confirmed by your "
            "project manager. Required before project-ready status."
        ),
        owner="Project Manager",
        department="Engineering",
        source="Jira (mock)",
        actions=("Start access request", "Contact manager"),
        related_ids=("app-jira", "proc-it-access", "term-project-ready"),
        keywords=("jira access", "project access", "board access"),
        navigate_hint="Request through IT access; your manager / PM confirms project assignment.",
    )
)

_e(
    KnowledgeEntity(
        id="doc-leave-guide",
        kind="document",
        name="Leave & Attendance Guide",
        summary="Approved guide covering leave types, how to apply, and who approves.",
        owner="HR Operations",
        department="HR",
        source="Leave & Attendance Guide",
        actions=("Open document",),
        related_ids=("proc-leave", "pol-leave", "app-hr-portal"),
        keywords=("leave policy", "attendance guide", "leave guide"),
        navigate_hint="Open the Leave & Attendance Guide.",
    )
)
_e(
    KnowledgeEntity(
        id="doc-onboarding-policy",
        kind="document",
        name="Onboarding Policy",
        summary="Approved policy for joiner stages, document packets, and Day-1 expectations.",
        owner="HR Operations",
        department="HR",
        source="Onboarding Policy",
        actions=("Open document",),
        related_ids=("proc-docs", "app-icims"),
        keywords=("onboarding policy", "joining policy"),
        navigate_hint="Open the Onboarding Policy document.",
    )
)
_e(
    KnowledgeEntity(
        id="pol-leave",
        kind="policy",
        name="Leave Policy",
        summary="Governs leave entitlements and approval. Exact balances come from HR systems — IRA will not invent numbers.",
        owner="HR Operations",
        department="HR",
        source="Leave & Attendance Guide",
        actions=("Open leave policy", "Open HR Portal"),
        related_ids=("doc-leave-guide", "proc-leave"),
        keywords=("leave policy", "pto policy"),
        navigate_hint="Open the Leave & Attendance Guide for policy details.",
    )
)
_e(
    KnowledgeEntity(
        id="pol-git",
        kind="policy",
        name="Git / Source Control Policy",
        summary="Branching, review, and secrets rules for GitHub. Linked from Engineering Handbook.",
        owner="Engineering Platforms",
        department="Engineering",
        source="Engineering Handbook",
        actions=("Open Git policy",),
        related_ids=("term-git", "app-github"),
        keywords=("git policy", "source control policy", "github policy"),
        navigate_hint="Open the Git policy in the Engineering Handbook.",
    )
)

_e(
    KnowledgeEntity(
        id="team-it-desk",
        kind="team",
        name="IT Service Desk",
        summary="Handles laptop issues, VPN, password resets, and ServiceNow tickets.",
        owner="IT Service Desk",
        department="IT",
        source="IT Service Catalog",
        actions=("Raise IT request",),
        related_ids=("app-servicenow", "proc-laptop"),
        keywords=("it desk", "service desk", "helpdesk", "help desk", "laptop broken"),
        navigate_hint="Raise an IT request in ServiceNow.",
    )
)
_e(
    KnowledgeEntity(
        id="team-hr-ops",
        kind="team",
        name="HR Operations",
        summary="Owns leave, payroll routing, onboarding documents, and HR policies.",
        owner="HR Operations",
        department="HR",
        source="HR Service Catalog",
        actions=("Open HR Portal",),
        related_ids=("proc-leave", "app-hr-portal", "app-icims"),
        keywords=("hr operations", "hr ops", "payroll team", "who handles payroll"),
        navigate_hint="Contact HR Operations via the HR Portal.",
    )
)
_e(
    KnowledgeEntity(
        id="team-payroll",
        kind="team",
        name="Payroll",
        summary="Processes salary and payslips. Contact via HR Operations — IRA does not invent pay amounts or dates.",
        owner="Payroll / HR Operations",
        department="HR",
        source="HR Service Catalog",
        actions=("Open HR Portal", "Contact HR Operations"),
        related_ids=("team-hr-ops", "app-hr-portal"),
        keywords=("payroll", "salary", "payslip", "paycheck", "when will i get paid"),
        navigate_hint="Ask HR Operations / Payroll through the HR Portal — I won’t invent pay figures.",
    )
)

_e(
    KnowledgeEntity(
        id="term-git",
        kind="term",
        name="Git",
        summary=(
            "Git is a version control system for tracking code changes. Teams use GitHub "
            "as the hosted remote. Git Basics covers clone, commit, branch, and pull requests."
        ),
        owner="Engineering Platforms",
        department="Engineering",
        source="Engineering Handbook",
        actions=("Start Git Basics",),
        related_ids=("app-github", "learn-git", "pol-git"),
        keywords=("what is git", "git basics", "version control"),
        navigate_hint="Start the Git Basics learning module.",
    )
)
_e(
    KnowledgeEntity(
        id="term-bpmn",
        kind="term",
        name="BPMN",
        summary=(
            "BPMN stands for Business Process Model and Notation — a standard way to "
            "visually map how work moves from step to step."
        ),
        owner="Process Excellence",
        department="Operations",
        source="Process Modeling Primer",
        related_ids=("term-process-mining", "app-celonis"),
        keywords=("bpmn", "business process model", "what is bpmn"),
        navigate_hint="Ask your manager which process diagrams apply to your role.",
    )
)
_e(
    KnowledgeEntity(
        id="term-process-mining",
        kind="term",
        name="Process mining",
        summary=(
            "Process mining discovers how processes actually run from system event logs, "
            "then highlights delays and rework. Celonis is a common tool for this."
        ),
        owner="Process Excellence",
        department="Operations",
        source="Process Mining Primer",
        related_ids=("app-celonis", "term-bpmn"),
        keywords=("process mining", "what is process mining"),
        navigate_hint="See the Process Mining Primer or ask Process Excellence.",
    )
)
_e(
    KnowledgeEntity(
        id="term-ticket",
        kind="term",
        name="ServiceNow ticket",
        summary=(
            "A ServiceNow ticket (often REQ- or INC-) tracks an IT request or incident "
            "from open through resolution."
        ),
        owner="IT Service Desk",
        department="IT",
        source="ServiceNow (mock)",
        related_ids=("app-servicenow",),
        keywords=("servicenow ticket", "what is a ticket", "req-", "incident"),
        navigate_hint="Open your ServiceNow ticket to see status.",
    )
)
_e(
    KnowledgeEntity(
        id="term-project-ready",
        kind="term",
        name="Project ready",
        summary=(
            "Project-ready means HR docs, IT setup, required learning, and Jira project "
            "access are complete so you can start assigned work."
        ),
        owner="SmartStart",
        department="Onboarding",
        source="SmartStart",
        related_ids=("app-jira", "learn-git", "proc-jira-access"),
        keywords=("project ready", "project readiness", "can i start my project"),
        navigate_hint="Ask IRA “Am I project-ready?” for your personal checklist.",
    )
)
_e(
    KnowledgeEntity(
        id="term-waters",
        kind="term",
        name="Waters",
        summary=(
            "Waters is a global leader in life sciences and diagnostics — analytical technologies "
            "such as liquid chromatography and mass spectrometry, informatics and service, "
            "with about 16,000 colleagues worldwide (public company information)."
        ),
        owner="SmartStart",
        department="Company",
        source="waters.com",
        keywords=("waters", "what is waters", "about the company", "company", "what does waters do"),
        navigate_hint="Open “What is Waters?” in your workspace to explore how it all connects — and where you fit.",
    )
)
_e(
    KnowledgeEntity(
        id="place-office",
        kind="place",
        name="Office / workplace",
        summary=(
            "Confirm your site, floor, and badge desk with your manager or mentor on Day 1. "
            "IRA does not invent building maps that aren’t on your record."
        ),
        owner="Workplace Services",
        department="Facilities",
        source="Workplace Guide",
        keywords=("office", "where is the office", "cafeteria", "dress code", "what time should i come"),
        navigate_hint="Ask your manager or mentor for site-specific workplace details.",
    )
)
_e(
    KnowledgeEntity(
        id="learn-git",
        kind="document",
        name="Git Basics (learning module)",
        summary=(
            "Required engineering foundation module (~45 min): clone, commit, branch, "
            "practice PR. Often required before project repository work."
        ),
        owner="Learning & Development",
        department="Engineering",
        source="SmartStart Learning",
        actions=("Start Git Basics",),
        related_ids=("term-git", "app-github", "term-project-ready"),
        keywords=("git basics", "finish git", "why git"),
        role_tags=("intern", "fte"),
        navigate_hint="Open Learning track → Git Basics.",
    )
)

# Relationships (from → relation → to)
RELATIONS: list[tuple[str, str, str]] = [
    ("app-jira", "access_requires", "proc-jira-access"),
    ("proc-jira-access", "provisioned_through", "app-servicenow"),
    ("proc-jira-access", "approved_by", "team-hr-ops"),  # manager path; PM owns project
    ("proc-leave", "uses", "app-hr-portal"),
    ("proc-leave", "governed_by", "pol-leave"),
    ("pol-leave", "documented_in", "doc-leave-guide"),
    ("proc-docs", "uses", "app-icims"),
    ("proc-laptop", "tracked_in", "app-servicenow"),
    ("proc-it-access", "tracked_in", "app-servicenow"),
    ("app-github", "requires_learning", "learn-git"),
    ("term-git", "hosted_on", "app-github"),
    ("term-process-mining", "tool", "app-celonis"),
    ("term-bpmn", "related_to", "term-process-mining"),
]


def find_entities(query: str, *, role: str | None = None, limit: int = 5) -> list[KnowledgeEntity]:
    """Keyword score entities; optional role filter (intern/fte)."""
    q = " ".join(query.lower().split())
    role_l = (role or "").lower()
    scored: list[tuple[int, KnowledgeEntity]] = []
    for ent in ENTITIES.values():
        if role_l in {"intern", "fte"} and ent.kind == "application":
            if role_l not in ent.role_tags:
                continue
        score = 0
        name_l = ent.name.lower()
        if name_l in q or (len(name_l) > 3 and name_l in q):
            score += 8
        for kw in ent.keywords:
            if kw in q:
                score += 5 + min(len(kw), 12) // 3
        if score:
            scored.append((score, ent))
    scored.sort(key=lambda t: (-t[0], t[1].name))
    return [e for _, e in scored[:limit]]


def get_entity(entity_id: str) -> Optional[KnowledgeEntity]:
    return ENTITIES.get(entity_id)


def related(entity_id: str) -> list[KnowledgeEntity]:
    ent = ENTITIES.get(entity_id)
    if not ent:
        return []
    out: list[KnowledgeEntity] = []
    for rid in ent.related_ids:
        if rid in ENTITIES:
            out.append(ENTITIES[rid])
    return out


def format_source(ent: KnowledgeEntity) -> str:
    return f"Source: {ent.source} · {ent.owner} · Updated: {ent.source_updated}"


def explain_entity(ent: KnowledgeEntity, *, role_label: str | None = None) -> str:
    lines = [ent.summary]
    if role_label and ent.kind == "term":
        lines.append(f"For your role ({role_label}), this often shows up in day-to-day work.")
    rel = related(ent.id)
    if rel:
        lines.append("Related: " + ", ".join(r.name for r in rel[:4]))
    if ent.navigate_hint:
        lines.append(f"Next: {ent.navigate_hint}")
    if ent.actions:
        lines.append("Actions: " + " · ".join(f"[{a}]" for a in ent.actions[:3]))
    lines.append(format_source(ent))
    return "\n".join(lines)


def role_recommended_apps(role_type: str) -> list[KnowledgeEntity]:
    role_l = role_type.lower()
    preferred = (
        ["app-github", "app-jira", "app-teams", "app-learning", "app-hr-portal"]
        if role_l == "intern"
        else ["app-jira", "app-teams", "app-learning", "app-hr-portal", "app-servicenow", "app-celonis"]
    )
    return [ENTITIES[i] for i in preferred if i in ENTITIES]
