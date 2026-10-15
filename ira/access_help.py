"""How to get access to a system, or raise an IT ticket — answered from the joiner's IT record.

Steps follow the approved Access Requests & Approvals Policy and the IT Access Request
catalog entry: the manager requests or approves, IT grants, and the ticket is raised on the
Waters IT Service Portal (ServiceNow self-service).
IRA explains and drafts; it never raises the ticket itself.
"""

from __future__ import annotations

import re
from typing import Optional

from ira.ticket_draft import PORTAL_NAME, form_url

POLICY_ID = "playbook:access-requests-and-approvals"

SYSTEMS = {
    "jira": "Jira",
    "confluence": "Confluence",
    "github": "GitHub",
    "git hub": "GitHub",
    "salesforce": "Salesforce",
    "slack": "Slack",
    "workday": "Workday",
    "okta": "Okta",
    "vpn": "VPN",
    "celonis": "Celonis",
    "figma": "Figma",
    "tableau": "Tableau",
    "power bi": "Power BI",
    "sap": "SAP",
    "snowflake": "Snowflake",
    "databricks": "Databricks",
    "servicenow": "ServiceNow",
    "outlook": "Email",
    "email": "Email",
    "microsoft 365": "Microsoft 365",
    "teams": "Microsoft Teams",
}

_TICKET = re.compile(r"\b(raise|open|log|submit|file|create|make|lodge|put in|start|request)\b.*\b(ticket|request|incident)\b"
                     r"|\b(ticket|incident)\b.*\b(for|about)\b")
_IT = re.compile(r"\b(ticket|incident|it|servicenow|access|software|vpn|sign ?in|log ?in)\b")
_ACCESS = re.compile(r"\baccess (to|for)\b|\b(get|need|want|request|requesting|grant|give me|have)\b.*\baccess\b"
                     r"|\baccess\b.*\b(request|ticket)\b|\bpermission (to|for)\b|\b(can't|cannot|cant|unable to) (access|log ?in|sign ?in)\b")
_PROBLEM = re.compile(r"\b(can't|cannot|cant|unable to|not working|doesn't work|isn't working|broken|error|locked out|issue|problem|fault)\b")
_HARDWARE = ("laptop", "hardware", "keyboard", "monitor", "screen", "charger", "mouse", "headset", "dock")
_ELSEWHERE = ("phish", "lost", "stolen", "malware", "virus", "leave", "expense", "payroll", "what is ", "what's ")


def _system(q: str) -> Optional[str]:
    for key, name in SYSTEMS.items():
        if re.search(rf"\b{re.escape(key)}\b", q):
            return name
    return None


def _source() -> str:
    title, owner, updated = "Access Requests & Approvals Policy", "IT Identity", "Sep 2026"
    try:
        from backend import knowledge_sources as ks

        src = ks.approved(POLICY_ID)
        if src:
            title, owner, updated = src.rev.title, src.rev.owner, src.rev.updated
    except Exception:  # noqa: BLE001 — the desktop app may run without the backend package
        pass
    return f"Source: {title} · {owner} · Updated: {updated}"


def _on_record(system: str, it: dict) -> bool:
    return system.lower() in {s.lower() for s in it.get("software_access") or []}


def _ticket_help(q: str, it: dict) -> str:
    hardware = any(h in q for h in _HARDWARE)
    lines = [f"IT tickets are raised on the {PORTAL_NAME} (ServiceNow). Pick the type that fits:"]
    broken = ("• Something broken (an incident) — e.g. your laptop won't start or you can't sign in. Say what you were doing, "
              f"the exact error and add a screenshot.\n  Report it here: {form_url('hardware-software')}")
    new = ("• Something new (a request) — access to a system, extra software or hardware. Name the system, the access level "
           f"and one line on why.\n  Request it here: {form_url('access')}")
    lines += [broken, new] if hardware or _PROBLEM.search(q) else [new, broken]
    tid, hw = it.get("ticket_id"), it.get("hardware_status")
    if tid:
        lines.append(f"\nYour laptop request {tid} is {hw}." + (
            " If the laptop itself has a fault, raise an incident and quote that number." if hardware and hw == "Delivered" else ""))
    lines.append("Tell me which system it's for — e.g. “access to Confluence” — and I'll give you the exact steps.")
    lines.append("Source: ServiceNow · IT Service Desk · Updated: Sep 2026")
    return "\n".join(lines)


def _sign_in_help(system: str, it: dict) -> str:
    tid = it.get("ticket_id")
    return (
        f"{system} is already on your IT record{f' (ServiceNow {tid})' if tid else ''}, so you don't need a new access request.\n"
        f"If you can't get in, raise an incident on the {PORTAL_NAME} (ServiceNow): say it's {system}, what you see "
        "(the exact error or a screenshot) and when it started. Okta sign-in problems go to the IT Service Desk the same way.\n"
        f"Report it here: {form_url('hardware-software')}\n"
        "Source: ServiceNow · IT Service Desk · Updated: Sep 2026"
    )


def _jira_help(mgr: str, ready: dict) -> str:
    mgr_line = "Your manager / PM" if mgr == "your manager" else f"{mgr} (your manager / PM)"
    ready_line = "" if not ready else (
        "Your record shows you're project-ready, so your board access should already be set up. "
        f"If you can't see your team's board, ask {mgr} to check you're on the project."
        if ready.get("project_ready")
        else f"Your record isn't project-ready yet — {mgr} assigns your first project, and board access follows."
    )
    return (
        "Jira access is tied to your project, so it works a little differently:\n"
        f"1. {mgr_line} confirms which project you're on.\n"
        f"2. Board access is then requested on the {PORTAL_NAME} (ServiceNow) — your manager raises it, "
        "or you raise it and they approve it. Name the board and the access level (Viewer or Editor).\n"
        f"   Raise it here: {form_url('access')}\n"
        "3. IT Service Desk grants it, usually within 1 working day.\n\n"
        + (f"{ready_line}\n" if ready_line else "")
        + f"Want a head start? Say “Draft an email to {mgr} asking for Jira access”.\n"
        "Source: Jira Project Access · Project Manager · Updated: Sep 2026"
    )


def _access_steps(system: str, mgr: str, intern: bool) -> str:
    level = "Viewer or Editor (interns get Viewer or Editor only)" if intern else "Viewer, Editor or Admin (Admin needs a written reason)"
    return (
        f"Here's how to get {system} access:\n"
        f"1. Check with {mgr if mgr == 'your manager' else mgr + ', your manager'} — they confirm you need it and justify the request.\n"
        f"2. Raise an access request on the {PORTAL_NAME} (ServiceNow) — your manager raises it, or you raise it and they approve it.\n"
        f"   Raise it here: {form_url('access')}\n"
        "   Include:\n"
        f"   • the system: {system}\n"
        f"   • the access level: {level}\n"
        "   • one line on why you need it for your work\n"
        "3. IT Service Desk approves and grants it — they aim to decide within 1 working day. Incomplete requests come back to you.\n\n"
        f"Want a head start? Say “Draft an email to {mgr} asking for {system} access”.\n"
        f"{_source()}"
    )


def access_reply(q: str, ctx: Optional[dict]) -> Optional[str]:
    """Answer "how do I get X access / raise a ticket", or None if the question is about something else."""
    if any(k in q for k in _ELSEWHERE):
        return None
    ticket, access = bool(_TICKET.search(q)), bool(_ACCESS.search(q))
    system = _system(q)
    if not (ticket or access):
        return None
    ctx = ctx or {}
    emp, it, ready = ctx.get("employee") or {}, ctx.get("it") or {}, ctx.get("readiness") or {}
    mgr = emp.get("manager_name") or "your manager"
    intern = (emp.get("role_type") or "").upper() == "INTERN"
    if system is None or system == "ServiceNow":
        if not (_IT.search(q) or any(h in q for h in _HARDWARE)):
            return None
        return _ticket_help(q, it)
    if system == "Jira":
        return _jira_help(mgr, ready)
    if _on_record(system, it):
        return _sign_in_help(system, it)
    return _access_steps(system, mgr, intern)
