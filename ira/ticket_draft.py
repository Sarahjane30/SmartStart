"""Draft IT tickets for the employee self-service IT Help portal.

IRA picks the right portal form and pre-writes each field so the employee can
copy and paste it. IRA never submits the ticket: the employee opens the portal,
reviews the text and presses Submit themselves. Drafts only use the joiner's
own non-sensitive context (role, team, manager, the provisioning request on
record) and scrub anything that looks like a password, email or phone number.
"""

from __future__ import annotations

import os
import re
from typing import Optional

PORTAL_NAME = "Waters IT Service Portal"
REPORT_MENU = "Report Something Broken / Not Working Properly"
REQUEST_MENU = "Request New or Modified Access / Service"

_TICKET_WORDS = r"(?:ticket|incident|service request|it request|support request)"
_RAISE_RE = re.compile(
    rf"\b(?:raise|log|open|create|submit|file|lodge|make|put in|register|report)\b[\w\s']{{0,30}}?\b{_TICKET_WORDS}",
    re.I,
)
_RAISE_REQUEST_RE = re.compile(r"\b(?:raise|log|submit|file|lodge|put in|open)\s+(?:an?\s+)?(?:it\s+|new\s+)?request\b", re.I)
_TICKET_PHRASES = (
    "it ticket", "service desk", "helpdesk", "help desk", "it help portal", "it service portal",
    "it portal", "report a problem", "report an issue", "report a fault", "contact it", "tell it",
)
_PROBLEM_RE = re.compile(
    r"\b(?:not working|isn'?t working|is not working|aren'?t working|stopped working|doesn'?t work|does not work|"
    r"broken|broke|faulty|dead|won'?t (?:turn on|start|boot|charge|connect|open|load|launch)|"
    r"can'?t (?:connect|log ?in|sign ?in|open|access|print)|cannot (?:connect|log ?in|sign ?in|open|access|print)|"
    r"unable to (?:connect|log ?in|sign ?in|open|access|print)|keeps? (?:crashing|freezing|disconnecting|dropping)|"
    r"crash(?:es|ed|ing)?|frozen|freez(?:es|ing)|blue screen|error message|not responding|not syncing|"
    r"not loading|(?:is|running|very|really|so) slow)\b",
    re.I,
)
_STATUS_RE = re.compile(r"\b(?:status|track|progress|update on|where is|when will|REQ-\d+|INC\d+|RITM\d+)\b", re.I)

_NETWORK = re.compile(r"\b(?:vpn|wi-?fi|wireless|internet|network|ethernet|lan|connectivity|hotspot)\b", re.I)
_EMAIL = re.compile(r"\b(?:outlook|teams|office ?365|o365|onedrive|sharepoint|calendar|excel|powerpoint|e-?mail)\b", re.I)
_PRINT = re.compile(r"\b(?:print(?:er|ing)?|scann(?:er|ing))\b", re.I)
_SAP = re.compile(r"\bsap\b", re.I)
_COMPASS = re.compile(r"\bcompass\b", re.I)
_ACCESS = re.compile(r"\b(?:access|permission|permissions|licen[cs]e|account)\b", re.I)
_WANT = re.compile(r"\b(?:need|want|request|order|get|getting|require|would like|new|replacement|extra|second|another)\b", re.I)
_INSTALL = re.compile(r"\binstall(?:ed|ing|ation)?\b", re.I)

_APPS = ["Okta", "GitHub", "Jira", "Confluence", "Slack", "Microsoft Teams", "VPN", "SAP", "Compass",
         "Workday", "Salesforce", "Power BI"]
_APP_ALIASES = {"teams": "Microsoft Teams", "powerbi": "Power BI", "power bi": "Power BI", "github": "GitHub"}
_HARDWARE = {
    "monitor": "Monitor", "screen": "Monitor", "display": "Monitor", "headset": "Headset", "headphones": "Headset",
    "keyboard": "Keyboard", "mouse": "Mouse", "dock": "Docking station", "docking station": "Docking station",
    "charger": "Laptop charger", "power adapter": "Laptop charger",
}
_DEVICES = ("laptop", "keyboard", "mouse", "monitor", "screen", "display", "headset", "webcam", "camera",
            "microphone", "mic", "charger", "dock", "battery", "trackpad", "touchpad", "speaker", "usb")

_PLACEHOLDER_SHORT = "[Device or app] — [what is not working]"


def portal_url() -> str:
    return (os.environ.get("SMARTSTART_ITHELP_URL") or "http://127.0.0.1:8400").rstrip("/")


def is_ticket_request(query: str) -> bool:
    q = query.lower()
    if _STATUS_RE.search(query) and not _PROBLEM_RE.search(q):
        return False
    if _RAISE_RE.search(q) or _RAISE_REQUEST_RE.search(q) or any(p in q for p in _TICKET_PHRASES):
        return True
    return bool(_PROBLEM_RE.search(q))


def scrub(text: str) -> str:
    """Remove secrets and personal contact details before they reach a draft."""
    text = re.sub(r"\b(password|passcode|pwd|pin|otp)\b\s*(?:is|was|:|=)?\s*\S+", r"\1 [removed]", text, flags=re.I)
    text = re.sub(r"[\w.+-]+@[\w-]+\.[\w.-]+", "[email removed]", text)
    text = re.sub(r"\+?\d[\d\s().-]{6,}\d", "[number removed]", text)
    return text


def _category(q: str) -> str:
    problem = bool(_PROBLEM_RE.search(q))
    if _ACCESS.search(q) and not problem and _WANT.search(q):
        return "access"
    if _INSTALL.search(q) and not problem:
        return "software-install"
    if not problem and _WANT.search(q) and any(re.search(rf"\b{k}s?\b", q) for k in _HARDWARE):
        return "new-hardware"
    if _SAP.search(q):
        return "sap"
    if _COMPASS.search(q):
        return "compass"
    if _NETWORK.search(q):
        return "network"
    if _PRINT.search(q):
        return "printing"
    if _EMAIL.search(q):
        return "email-collab"
    return "hardware-software"


_LABELS = {
    "sap": "SAP",
    "compass": "Compass",
    "hardware-software": "Computer Hardware or Software",
    "network": "Networking / Connectivity",
    "email-collab": "Email, Teams or Office 365",
    "printing": "Printing",
    "other": "Something Else",
    "access": "Request New or Modified Access",
    "new-hardware": "Request New Hardware or Peripheral",
    "software-install": "Request Software Installation",
}

_TRIED = {
    "network": "[e.g. restarted the laptop, switched Wi-Fi off and on, disconnected and reconnected the VPN]",
    "sap": "[e.g. signed out and back in, tried another browser, cleared the browser cache]",
    "compass": "[e.g. signed out and back in, tried another browser, cleared the browser cache]",
    "email-collab": "[e.g. restarted the app, signed out and back in, tried the web version]",
    "printing": "[e.g. checked the printer queue, tried another printer, restarted the laptop]",
    "hardware-software": "[e.g. restarted the laptop, unplugged and reconnected the device, checked for updates]",
}


def _urgency(q: str) -> str:
    if re.search(r"\b(?:whole team|entire team|everyone|all of us|nobody can|no one can|team is blocked|outage)\b", q):
        return "1 - High"
    if re.search(
        r"\b(?:urgent|asap|blocked|blocking|can'?t work|cannot work|unable to work|at all|completely|"
        r"deadline|stuck|won'?t turn on|dead)\b",
        q,
    ):
        return "2 - Medium"
    return "3 - Low"


def _impact(urgency: str) -> str:
    if urgency.startswith("1"):
        return "Several people in my team are blocked until this is fixed."
    if urgency.startswith("2"):
        return "I can't continue my work until this is fixed."
    return "I can work around it for now, but it slows me down."


_ASK_CLAUSE = re.compile(
    r"\b(?:how (?:do|can|should) i|how to|can you|could you|please|help me|i want to|i need to|where do i|what'?s the way to)\b"
    rf".*?\b(?:{_TICKET_WORDS}|ticket|it|service desk|help ?desk|portal|report(?: it)?|raise)\b\??",
    re.I,
)


def _short_description(query: str) -> Optional[str]:
    text = scrub(query.strip())
    text = re.sub(
        r"(?:\bmy\s+)?\b(?:password|passcode|pwd|pin|otp)\s+\[removed\]\s*(?:,|\band\b)?\s*", "", text, flags=re.I
    )
    text = re.sub(
        r"[,\s]*(?:\b(?:please\s+)?(?:call|text|ring|reach|contact|email|mail|message)\s+me\s+(?:on|at)\s+)?"
        r"\[(?:email|number) removed\]",
        "",
        text,
        flags=re.I,
    )
    clauses = re.split(r"[.?!;\n]+|,\s*(?=(?:how|what|can|could|please|so|and how)\b)|\s+[-–—]\s+", text, flags=re.I)
    for clause in clauses:
        c = _ASK_CLAUSE.sub("", clause).strip(" ,-–—")
        c = re.sub(r"^(?:hi|hey|hello)\b[\s,]*(?:ira\b)?[\s,]*", "", c, flags=re.I)
        c = re.sub(r"^(?:so|and|but|also|um|ok|okay)\b[\s,]*", "", c, flags=re.I)
        c = re.sub(r"\b(?:for|about|with)\s*$", "", c, flags=re.I).strip(" ,")
        if len(c.split()) < 2 or not (_PROBLEM_RE.search(c) or _WANT.search(c) or _INSTALL.search(c)):
            continue
        c = re.sub(r"^my\s+", "", c, flags=re.I)
        c = re.sub(r"^i\s+(?:can'?t|cannot|am unable to|'m unable to)\s+", "Unable to ", c, flags=re.I)
        c = re.sub(r"^i\s+(?:need|want|would like)\s+(?:a\s+|an\s+)?", "", c, flags=re.I)
        c = c[0].upper() + c[1:]
        return c[:120].rstrip()
    return None


def _app(q: str) -> Optional[str]:
    for alias, name in _APP_ALIASES.items():
        if re.search(rf"\b{re.escape(alias)}\b", q):
            return name
    for name in _APPS:
        if re.search(rf"\b{re.escape(name.lower())}\b", q):
            return name
    return None


def _hardware_item(q: str) -> Optional[str]:
    for key, name in _HARDWARE.items():
        if re.search(rf"\b{re.escape(key)}s?\b", q):
            return name
    return None


def _device(q: str) -> Optional[str]:
    for d in _DEVICES:
        if re.search(rf"\b{d}\b", q):
            return d
    return None


def _context_line(employee: dict, it: dict, category: str) -> str:
    who = ", ".join(x for x in (employee.get("role_title"), f"{employee['team']} team" if employee.get("team") else "") if x)
    line = f"New joiner — {who}" if who else "New joiner"
    if employee.get("department"):
        line += f" ({employee['department']})"
    line += "."
    if category in {"hardware-software", "network"} and it.get("ticket_id"):
        line += f" Laptop provisioning request on record: {it['ticket_id']}"
        if it.get("hardware_status"):
            line += f" (status: {it['hardware_status']})"
        line += "."
    return line


def draft_ticket(query: str, ctx: dict) -> dict:
    q = scrub(query).lower()
    employee = ctx.get("employee", {}) or {}
    it = ctx.get("it", {}) or {}
    category = _category(q)
    label = _LABELS[category]
    short = _short_description(query)
    fields: list[dict] = []

    if category == "access":
        app = _app(q)
        team = employee.get("team") or "my team"
        fields = [
            {"key": "application", "label": "Application", "value": app or "[Choose the application]"},
            {"key": "access_type", "label": "Access type", "value": "New access"},
            {"key": "short_description", "label": "Short Description",
             "value": f"{app or '[Application]'} access for {team} onboarding"},
            {"key": "justification", "label": "Business justification", "value": (
                f"I recently joined as {employee.get('role_title') or 'a new team member'} in the {team} team"
                f"{' (' + employee['department'] + ')' if employee.get('department') else ''}. "
                f"I need {app or '[application]'} access to complete my onboarding tasks and work with the team. "
                "Please grant the standard access level for my role."
            )},
            {"key": "approver", "label": "Manager / approver", "value": employee.get("manager_name") or "[Your manager]"},
        ]
    elif category == "new-hardware":
        item = _hardware_item(q) or "[Choose the item]"
        fields = [
            {"key": "hardware_item", "label": "Item", "value": item},
            {"key": "delivery", "label": "Delivery location", "value": "Office — collect from IT desk"},
            {"key": "short_description", "label": "Short Description",
             "value": short or f"New {item.lower() if not item.startswith('[') else 'peripheral'} for onboarding"},
            {"key": "justification", "label": "Business justification", "value": (
                f"I'm a new {employee.get('role_title') or 'joiner'}"
                f"{' in the ' + employee['team'] + ' team' if employee.get('team') else ''} and need this for my day-to-day work. "
                "[Add why the standard kit isn't enough, if relevant.]"
            )},
        ]
    elif category == "software-install":
        fields = [
            {"key": "software", "label": "Software name and version", "value": "[Software name and version]"},
            {"key": "short_description", "label": "Short Description", "value": short or "Install [software] on my laptop"},
            {"key": "justification", "label": "Business justification", "value": (
                f"Needed for my work as {employee.get('role_title') or 'a new joiner'}"
                f"{' in the ' + employee['team'] + ' team' if employee.get('team') else ''}. [Add the task it's needed for.]"
            )},
        ]
    else:
        urgency = _urgency(q)
        device = _device(q)
        placeholder = f"{label} — [what is not working]" if category in {"sap", "compass"} else _PLACEHOLDER_SHORT
        happening = f"{short}." if short else "[Describe what you see — the device or app, and any error message word for word]"
        lines = [
            f"What's happening: {happening}",
            "When it started: [date and roughly what time]",
            f"What I've already tried: {_TRIED.get(category, _TRIED['hardware-software'])}",
            f"Impact on my work: {_impact(urgency)}",
        ]
        if device and category == "hardware-software":
            lines.append(f"Device: company laptop{'' if device == 'laptop' else ' — ' + device}")
        lines.append(f"Context: {_context_line(employee, it, category)}")
        fields = [
            {"key": "urgency", "label": "Urgency", "value": urgency},
            {"key": "short_description", "label": "Short Description", "value": short or placeholder},
            {"key": "description", "label": "Please describe your issue", "value": "\n".join(lines)},
        ]

    kind = "incident" if category not in {"access", "new-hardware", "software-install"} else "request"
    menu = REPORT_MENU if kind == "incident" else REQUEST_MENU
    return {
        "item_id": category,
        "item_label": label,
        "kind": kind,
        "menu": menu,
        "portal_name": PORTAL_NAME,
        "form_url": f"{portal_url()}/#/item/{category}?from=ira",
        "fields": fields,
        "steps": [
            f"Open the {PORTAL_NAME} and sign in with single sign-on.",
            f"The \u201c{label}\u201d form opens ({menu}).",
            "Copy each field below and paste it into the matching box. Name is filled in for you.",
            "Replace anything in [brackets], check it reads right, then press Submit and keep the ticket number.",
        ],
        "has_placeholders": any("[" in f["value"] for f in fields),
    }


def guidance_text(ticket: dict) -> str:
    return (
        f"To raise it, use the {ticket['portal_name']} — IT's self-service site, separate from SmartStart. "
        f"The right form is \u201c{ticket['item_label']}\u201d under {ticket['menu']}. "
        "I've drafted the fields below: open the portal, paste them in, fill in anything in [brackets] "
        "and press Submit yourself — I won't submit it for you. Don't add passwords or personal details."
    )
