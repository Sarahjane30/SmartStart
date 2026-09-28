"""Service catalog for the mock IT Help portal — what an employee can report or request."""

from __future__ import annotations

URGENCY = ["1 - High", "2 - Medium", "3 - Low"]

DESCRIBE_HELP = (
    "Please describe your issue. In order to expedite the resolution of your issue, "
    "please include the following details: what is happening, when it started, "
    "what you have already tried, and how it affects your work."
)

_CONTACT = [
    {"key": "name", "label": "Name", "type": "user", "required": True},
    {"key": "phone", "label": "Phone number where we can reach you (if needed)", "type": "text"},
    {"key": "watch_users", "label": "Watch List Users", "type": "text"},
    {
        "key": "watch_emails",
        "label": "Watch List Email Addresses",
        "type": "text",
        "help": "If entering multiple email addresses, please use a comma separated list without any spaces.",
        "placeholder": "email1@example.com,email2@example.com",
    },
]

_INCIDENT = _CONTACT + [
    {"key": "urgency", "label": "Urgency", "type": "select", "required": True, "options": URGENCY},
    {"key": "short_description", "label": "Short Description", "type": "text", "required": True, "max": 160},
    {"key": "description", "label": "Please describe your issue", "type": "textarea", "required": True,
     "help": DESCRIBE_HELP, "max": 4000},
]

_APPS = ["Okta", "GitHub", "Jira", "Confluence", "Slack", "Microsoft Teams", "VPN", "SAP", "Compass",
         "Workday", "Salesforce", "Power BI"]


def _incident(item_id: str, title: str, summary: str, icon: str) -> dict:
    return {
        "id": item_id,
        "kind": "incident",
        "group": "report",
        "title": title,
        "summary": summary,
        "icon": icon,
        "intro": [
            f"Report an issue you are having with {title}. An incident record will be created and "
            "managed through to successful resolution. You will also be notified of progress.",
            "Please note that this is not the form for new requests. To submit a new request for "
            "access, hardware, software or service, please use \"Request New or Modified Access / Service\".",
        ],
        "fields": _INCIDENT,
    }


CATALOG: list[dict] = [
    _incident("sap", "SAP", "Create an Incident record to report an issue with SAP", "monitor"),
    _incident("compass", "Compass", "Create an Incident record to report an issue with Compass", "monitor"),
    _incident(
        "hardware-software",
        "Computer Hardware or Software",
        "Create an Incident record to report and request assistance with an issue with Computer Hardware or Software",
        "monitor",
    ),
    _incident(
        "network",
        "Networking / Connectivity",
        "Create an Incident record to report an issue with Wi-Fi, VPN or network access",
        "monitor",
    ),
    _incident(
        "email-collab",
        "Email, Teams or Office 365",
        "Create an Incident record to report an issue with Outlook, Teams or Office apps",
        "monitor",
    ),
    _incident("printing", "Printing", "Create an Incident record to report a printer or scanning issue", "monitor"),
    _incident("other", "Something Else", "Report any other IT issue that is not listed", "monitor"),
    {
        "id": "access",
        "kind": "request",
        "group": "request",
        "title": "Request New or Modified Access",
        "summary": "Request access to an application, repository, project board or shared resource",
        "icon": "key",
        "intro": [
            "Request new, modified or removed access to an application. Your manager may be asked to "
            "approve the request before it is fulfilled.",
        ],
        "fields": _CONTACT[:2] + [
            {"key": "application", "label": "Application", "type": "select", "required": True, "options": _APPS},
            {"key": "access_type", "label": "Access type", "type": "select", "required": True,
             "options": ["New access", "Modify existing access", "Remove access"]},
            {"key": "short_description", "label": "Short Description", "type": "text", "required": True, "max": 160},
            {"key": "justification", "label": "Business justification", "type": "textarea", "required": True,
             "help": "Explain what you need and why — include the team, project or repository if relevant.",
             "max": 4000},
            {"key": "approver", "label": "Manager / approver", "type": "text"},
        ],
    },
    {
        "id": "new-hardware",
        "kind": "request",
        "group": "request",
        "title": "Request New Hardware or Peripheral",
        "summary": "Order a monitor, headset, keyboard, mouse, docking station or charger",
        "icon": "box",
        "intro": ["Request new or replacement hardware. Standard peripherals are usually fulfilled within 3 business days."],
        "fields": _CONTACT[:2] + [
            {"key": "hardware_item", "label": "Item", "type": "select", "required": True,
             "options": ["Monitor", "Headset", "Keyboard", "Mouse", "Docking station", "Laptop charger"]},
            {"key": "delivery", "label": "Delivery location", "type": "select", "required": True,
             "options": ["Office — collect from IT desk", "Office — deliver to desk", "Remote — ship to me"]},
            {"key": "short_description", "label": "Short Description", "type": "text", "required": True, "max": 160},
            {"key": "justification", "label": "Business justification", "type": "textarea", "required": True, "max": 4000},
        ],
    },
    {
        "id": "software-install",
        "kind": "request",
        "group": "request",
        "title": "Request Software Installation",
        "summary": "Request installation of approved software on your company laptop",
        "icon": "box",
        "intro": ["Request approved software for your company laptop. Unapproved software requires a security review."],
        "fields": _CONTACT[:2] + [
            {"key": "software", "label": "Software name and version", "type": "text", "required": True, "max": 120},
            {"key": "short_description", "label": "Short Description", "type": "text", "required": True, "max": 160},
            {"key": "justification", "label": "Business justification", "type": "textarea", "required": True, "max": 4000},
        ],
    },
]

BY_ID = {item["id"]: item for item in CATALOG}
FEATURED = ["sap", "compass", "hardware-software", "network"]

PHONES = [
    {"region": "India", "number": "+91 00000 01234", "hours": "Mon–Fri 08:00–20:00 IST"},
    {"region": "United States", "number": "+1 555 0100", "hours": "24×7"},
    {"region": "United Kingdom & Ireland", "number": "+44 5550 0100", "hours": "Mon–Fri 08:00–18:00 GMT"},
]
