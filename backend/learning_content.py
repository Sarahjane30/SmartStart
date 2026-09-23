"""Synthetic learning material behind each onboarding module.

Keyed by the module id suffix used in ``employee_experience._module_catalog``.
Resource kinds: ``policy`` (slug in ira/knowledge_base), ``portal`` (icims /
servicenow / jira), ``person`` (mentor / manager / hr / it — drafts an email via
IRA) and ``ira`` (a question to ask IRA).
"""

from __future__ import annotations

from typing import Any

_R = dict[str, str]


def _policy(slug: str, label: str, note: str = "") -> _R:
    return {"kind": "policy", "target": slug, "label": label, "note": note}


def _portal(name: str, label: str, note: str = "") -> _R:
    return {"kind": "portal", "target": name, "label": label, "note": note}


def _person(who: str, label: str, note: str = "") -> _R:
    return {"kind": "person", "target": who, "label": label, "note": note}


def _ira(question: str) -> _R:
    return {"kind": "ira", "target": question, "label": question, "note": ""}


CONTENT: dict[str, dict[str, Any]] = {
    "welcome": {
        "summary": "Who Waters is, how we work, and what your first week looks like.",
        "lessons": [
            ("Our mission", "Waters builds analytical instruments and software that help labs deliver safer medicines, food and water. Every team — from Finance to Engineering — supports scientists getting reliable results."),
            ("How we work", "We default to written, async updates, keep decisions in shared channels, and give credit openly. Core collaboration hours are 10:00–16:00 local time; outside that, protect your focus time."),
            ("Your first week", "Day 1: orientation, laptop and accounts. Days 2–3: meet your manager and mentor, finish compliance modules. Days 4–5: shadow your team and agree on 30-day goals."),
            ("Where things live", "SmartStart shows your onboarding status. iCIMS holds HR documents, ServiceNow handles IT requests, and Jira tracks project work. IRA can point you to any of them."),
        ],
        "takeaways": [
            "Core hours are 10:00–16:00; the rest is flexible.",
            "Write things down — decisions live in shared channels.",
            "Use IRA when you don't know which system owns something.",
        ],
        "resources": [
            _policy("hr-code-of-conduct", "Code of Conduct", "How we treat each other and customers"),
            _policy("hr-working-hours-and-hybrid", "Working hours & hybrid policy", "Core hours, office days, remote rules"),
            _person("manager", "Say hello to your manager", "IRA drafts a short intro email"),
        ],
        "check": {
            "question": "What are Waters' core collaboration hours?",
            "options": ["08:00–12:00", "10:00–16:00", "12:00–18:00", "There are none"],
            "answer_index": 1,
            "explanation": "Core hours are 10:00–16:00 local time so teams across time zones overlap.",
        },
        "ask_ira": ["Which apps should I use?", "What happens on Day 1?"],
    },
    "security": {
        "summary": "Protect your account, spot phishing, and handle data by its classification.",
        "lessons": [
            ("Strong sign-in", "Use a 14+ character passphrase that you don't reuse anywhere. MFA through Okta Verify is mandatory on every Waters account."),
            ("Spotting phishing", "Watch for urgency, unexpected attachments, look-alike domains and requests for credentials or gift cards. Hover before you click."),
            ("Reporting", "Use the Report Phishing button in Outlook. If you clicked a link or entered your password, contact the Service Desk immediately — speed matters more than blame."),
            ("Data classification", "Public, Internal, Confidential and Restricted. Confidential and Restricted data must never go to personal email, personal cloud storage or public AI tools."),
        ],
        "takeaways": [
            "MFA on everything; never share your password — not even with IT.",
            "Report suspicious email with the Report Phishing button.",
            "Clicked something? Tell the Service Desk right away.",
        ],
        "resources": [
            _policy("infosec-password-and-mfa", "Password & MFA standard"),
            _policy("infosec-incident-and-phishing", "Incident & phishing reporting"),
            _policy("infosec-data-classification", "Data classification standard"),
            _policy("infosec-acceptable-use", "Acceptable use (incl. AI tools)"),
        ],
        "check": {
            "question": "You entered your password on a suspicious page. What do you do first?",
            "options": [
                "Wait and see if anything happens",
                "Delete the email",
                "Contact the Service Desk immediately and reset your password",
                "Tell your manager next week",
            ],
            "answer_index": 2,
            "explanation": "Speed limits the damage — report to the Service Desk right away so they can reset access.",
        },
        "ask_ira": ["What should I do if I clicked a phishing link?", "Can I use ChatGPT for work?"],
    },
    "tools": {
        "summary": "Get Okta, Slack, email and calendar working on your new laptop.",
        "lessons": [
            ("Okta first", "Okta is your single sign-on. Activate it from the welcome email, enrol Okta Verify for MFA, then open every other app from the Okta dashboard."),
            ("Slack and Teams", "Join #general, #it-help and your department channel. Set your profile photo, title and working hours so people know when to reach you."),
            ("Email and calendar", "Outlook is the system of record for meetings. Add your working hours and share your calendar with your team."),
            ("Getting help", "Raise a ServiceNow request for missing access. Include the app name and your manager's approval to avoid back-and-forth."),
        ],
        "takeaways": [
            "Open apps from the Okta dashboard, not bookmarks.",
            "Missing access? Raise one ServiceNow request with manager approval.",
            "Set working hours in Slack and Outlook.",
        ],
        "resources": [
            _portal("servicenow", "Open ServiceNow (IT requests)", "Track laptop and access tickets"),
            _policy("infosec-password-and-mfa", "Password & MFA standard"),
            _person("it", "Email your IT provisioning contact", "IRA drafts the request"),
        ],
        "check": {
            "question": "Where should you open most work apps from?",
            "options": ["Browser bookmarks", "The Okta dashboard", "Links in email", "A shared spreadsheet"],
            "answer_index": 1,
            "explanation": "Okta is single sign-on — launching from it keeps MFA and access consistent.",
        },
        "ask_ira": ["When will my laptop arrive?", "How do I reset my password?"],
    },
    "mentor": {
        "summary": "Book your first mentor chat and agree how you'll check in every week.",
        "lessons": [
            ("Why a mentor", "Your mentor helps you learn how work really gets done — norms, people and shortcuts. They're not your manager; there's no evaluation in these chats."),
            ("The intro chat", "Book 30 minutes in your first week. Share your background, what you want to learn, and how you like to get feedback."),
            ("Weekly check-ins", "Keep a 15-minute weekly slot. Bring one win, one blocker and one question. Keep notes in a shared doc."),
        ],
        "takeaways": [
            "Book the intro chat in week one.",
            "Weekly 15 minutes: one win, one blocker, one question.",
            "Keep a shared notes doc so nothing gets lost.",
        ],
        "resources": [
            _person("mentor", "Draft an intro email to your mentor", "IRA writes it — you edit and send"),
            _ira("Draft an email to my mentor about a weekly check-in"),
        ],
        "check": {
            "question": "What's a good structure for a weekly mentor check-in?",
            "options": [
                "A formal performance review",
                "One win, one blocker, one question",
                "A status report for your manager",
                "Only meet when something breaks",
            ],
            "answer_index": 1,
            "explanation": "A light, repeatable structure keeps check-ins short and useful.",
        },
        "ask_ira": ["Who is my mentor?", "What is my mentor's email?"],
    },
    "git": {
        "summary": "Clone, commit, branch and open your first practice pull request.",
        "lessons": [
            ("Clone the practice repo", "Open the practice repository linked in your Jira task and run `git clone`. Work inside the folder it creates."),
            ("Branch and commit", "Create a branch with `git checkout -b yourname/first-change`, edit a file, then `git add` and `git commit -m \"Describe the change\"`."),
            ("Open a pull request", "Push with `git push -u origin yourname/first-change` and open a PR. Add your mentor as reviewer and describe what and why."),
            ("Respond to review", "Reply to every comment, push fixes as new commits, and merge only after approval."),
        ],
        "takeaways": [
            "Never commit straight to main — always branch.",
            "Small commits with clear messages.",
            "Add your mentor as PR reviewer.",
        ],
        "resources": [
            _portal("jira", "Open your Jira task", "Contains the practice repo link"),
            _policy("legal-confidentiality-and-ip", "Confidentiality & IP", "Code you write belongs to Waters"),
            _person("mentor", "Ask your mentor to review your PR", "IRA drafts the request"),
        ],
        "check": {
            "question": "Where should your first change go?",
            "options": ["Directly on main", "On a new branch, then a pull request", "Emailed as a zip", "A personal GitHub repo"],
            "answer_index": 1,
            "explanation": "Branch + PR keeps main safe and gets your change reviewed.",
        },
        "ask_ira": ["How do I finish Git Basics?"],
    },
    "comm": {
        "summary": "Standups, async updates and how to ask for help without waiting too long.",
        "lessons": [
            ("Standups", "Keep it to yesterday, today and blockers. Save detailed discussion for after."),
            ("Async updates", "Post end-of-day notes in your team channel: what shipped, what's next, what's stuck. Link to tickets instead of re-explaining."),
            ("The 30-minute rule", "Stuck for 30 minutes? Ask. Say what you tried, what you expected and what happened."),
            ("Tone", "Assume good intent, be direct and kind, and move heated threads to a call."),
        ],
        "takeaways": [
            "Stuck 30 minutes → ask, with what you tried.",
            "Link tickets instead of re-explaining.",
            "Move heated threads to a call.",
        ],
        "resources": [
            _policy("hr-code-of-conduct", "Code of Conduct"),
            _policy("hr-working-hours-and-hybrid", "Working hours & hybrid policy"),
            _person("mentor", "Ask your mentor for feedback", "IRA drafts the message"),
        ],
        "check": {
            "question": "You've been stuck for 30 minutes. What's the best next step?",
            "options": [
                "Keep trying alone until end of day",
                "Ask for help, sharing what you tried",
                "Skip the task",
                "Wait for the next standup",
            ],
            "answer_index": 1,
            "explanation": "Asking early — with context — saves everyone time.",
        },
        "ask_ira": ["Who is on my team?", "What should I do now?"],
    },
    "shadow": {
        "summary": "Observe a real team ritual and note how decisions are made.",
        "lessons": [
            ("Before", "Ask the organiser if you can join, read the agenda, and review the previous notes."),
            ("During", "Listen more than you speak. Note who decides, what data they use, and what gets deferred."),
            ("After", "Write three observations and one question, and share them with your mentor."),
        ],
        "takeaways": ["Ask first, read the agenda.", "Note who decides and why.", "Share three observations afterwards."],
        "resources": [
            _policy("legal-confidentiality-and-ip", "Confidentiality & IP"),
            _person("mentor", "Ask to join a team ritual", "IRA drafts the request"),
        ],
        "check": {
            "question": "What should you share after shadowing?",
            "options": ["Nothing", "Three observations and one question", "A full transcript", "A performance rating"],
            "answer_index": 1,
            "explanation": "A short reflection turns observation into learning.",
        },
        "ask_ira": ["Who is on my team?"],
    },
    "crm": {
        "summary": "Find accounts, read notes, and follow pipeline stages in the CRM.",
        "lessons": [
            ("Accounts and contacts", "Accounts are organisations; contacts are the people. Always search before creating to avoid duplicates."),
            ("Notes and activity", "Log every customer touchpoint within 24 hours. Keep notes factual — customers can request their data."),
            ("Pipeline stages", "Qualify → Discover → Propose → Negotiate → Closed. Each stage has exit criteria; don't move a deal without meeting them."),
        ],
        "takeaways": ["Search before you create.", "Log activity within 24 hours.", "Respect stage exit criteria."],
        "resources": [
            _policy("legal-data-privacy", "Data privacy policy", "Customer personal data rules"),
            _policy("infosec-data-classification", "Data classification standard"),
            _person("mentor", "Ask your mentor for a CRM walkthrough", "IRA drafts the request"),
        ],
        "check": {
            "question": "Before creating a new account in the CRM you should…",
            "options": ["Create it straight away", "Search for an existing record first", "Ask the customer", "Export all accounts"],
            "answer_index": 1,
            "explanation": "Searching first prevents duplicate records.",
        },
        "ask_ira": ["Which apps should I use?"],
    },
    "arch": {
        "summary": "The systems map for your department and who owns what.",
        "lessons": [
            ("Systems map", "Start from the department architecture diagram: user-facing apps, core services, data stores and integrations."),
            ("Ownership", "Every service has an owning team and an on-call rotation. Check the service catalogue before changing anything you don't own."),
            ("Data flows", "Know which systems hold Confidential or Restricted data — those have extra review requirements."),
        ],
        "takeaways": ["Check ownership before changing a service.", "Know where sensitive data flows.", "Use the service catalogue."],
        "resources": [
            _policy("infosec-data-classification", "Data classification standard"),
            _person("manager", "Ask your manager for an architecture walkthrough", "IRA drafts the request"),
        ],
        "check": {
            "question": "Before changing a service your team doesn't own you should…",
            "options": ["Just push the change", "Check the owner and talk to them", "Fork it", "Disable monitoring"],
            "answer_index": 1,
            "explanation": "Owners know the constraints — coordinate first.",
        },
        "ask_ira": ["Who owns ServiceNow?"],
    },
    "env": {
        "summary": "Set up the local stack, handle secrets safely, and learn the deploy path.",
        "lessons": [
            ("Local stack", "Follow the repository README. Use the provided dev containers so versions match CI."),
            ("Secrets", "Never commit secrets. Pull them from the approved vault at runtime; rotate anything that leaks immediately."),
            ("Deploy path", "Branch → PR → CI → staging → production with approval. You'll do a supervised first deploy with your buddy."),
        ],
        "takeaways": ["Use dev containers.", "Secrets live in the vault, never in git.", "First deploy is supervised."],
        "resources": [
            _policy("infosec-password-and-mfa", "Password & MFA standard"),
            _policy("infosec-acceptable-use", "Acceptable use"),
            _portal("servicenow", "Request repo or vault access"),
        ],
        "check": {
            "question": "Where should API keys for local development come from?",
            "options": ["Committed in the repo", "The approved secrets vault", "A Slack message", "A sticky note"],
            "answer_index": 1,
            "explanation": "The vault keeps secrets out of git and makes rotation possible.",
        },
        "ask_ira": ["How do I reset my password?", "Can I use ChatGPT for work?"],
    },
    "ready": {
        "summary": "What 'ready for a project' means and how to get signed off.",
        "lessons": [
            ("Definition of ready", "A ticket is ready when it has a clear outcome, acceptance criteria, an owner and no unresolved dependencies."),
            ("Your readiness checklist", "Documents complete, laptop and access working, required modules done, and a kickoff with your manager."),
            ("Getting assigned", "Once your checklist is green, your manager assigns your first tickets in Jira."),
        ],
        "takeaways": ["Tickets need outcome + acceptance criteria.", "Green checklist → manager assigns work.", "Kickoff agenda: goals, stakeholders, success metric."],
        "resources": [
            _portal("jira", "Open the project board (Jira)"),
            _person("manager", "Request project assignment", "IRA drafts the email to your manager"),
            _ira("What is project readiness?"),
        ],
        "check": {
            "question": "Which of these is required for a ticket to be 'ready'?",
            "options": ["A big estimate", "Acceptance criteria", "Five reviewers", "A deadline next year"],
            "answer_index": 1,
            "explanation": "Acceptance criteria make 'done' unambiguous.",
        },
        "ask_ira": ["What is project readiness?", "What's blocking me?"],
    },
    "oncall": {
        "summary": "Who to page, when to escalate, and how to write it up.",
        "lessons": [
            ("Severity", "Sev1 = customer-facing outage, page immediately. Sev2 = degraded, respond within an hour. Sev3 = next business day."),
            ("Escalating", "Page the on-call for the owning service. If there's no response in 15 minutes, escalate to the secondary."),
            ("Write-ups", "Every Sev1/Sev2 gets a blameless post-incident review within five business days."),
        ],
        "takeaways": ["Know Sev1/2/3.", "15 minutes no answer → escalate.", "Blameless reviews."],
        "resources": [
            _policy("infosec-incident-and-phishing", "Incident reporting"),
            _portal("servicenow", "Open ServiceNow incidents"),
        ],
        "check": {
            "question": "Primary on-call hasn't responded in 15 minutes to a Sev1. You…",
            "options": ["Wait longer", "Escalate to the secondary", "Fix it in production alone", "Close the incident"],
            "answer_index": 1,
            "explanation": "Escalation paths exist so outages don't wait.",
        },
        "ask_ira": ["Who handles IT incidents?"],
    },
    "proc": {
        "summary": "Approvals, SLAs and hand-offs in your department.",
        "lessons": [
            ("Approvals", "Purchases, travel and exceptions follow the delegation-of-authority matrix. When in doubt, your manager approves first."),
            ("SLAs", "Each hand-off has a target response time. Track work in the owning system so SLAs are measurable."),
            ("Hand-offs", "Include context, the deadline and the decision needed. One owner per request."),
        ],
        "takeaways": ["Manager approves first.", "Work lives in the owning system.", "One owner per request."],
        "resources": [
            _policy("finance-procurement-and-corporate-card", "Procurement & corporate card"),
            _policy("finance-travel-and-expense", "Travel & expense policy"),
            _person("manager", "Ask your manager about approvals", "IRA drafts the email"),
        ],
        "check": {
            "question": "A good hand-off always includes…",
            "options": ["Context, deadline and the decision needed", "Only a link", "Nothing — they'll ask", "A long meeting"],
            "answer_index": 0,
            "explanation": "Clear hand-offs avoid back-and-forth.",
        },
        "ask_ira": ["How do I claim expenses?", "Can I use a corporate card?"],
    },
    "systems": {
        "summary": "A tour of Workday, Salesforce and the reporting tools you'll use.",
        "lessons": [
            ("Workday", "Your HR record, time off and payslips. Update personal details yourself."),
            ("Salesforce", "Customer accounts, opportunities and cases. Read-only until your training is complete."),
            ("Reporting", "Dashboards come from the governed data warehouse — don't build shadow spreadsheets for official numbers."),
        ],
        "takeaways": ["Workday = you; Salesforce = customers.", "Official numbers come from governed dashboards."],
        "resources": [
            _policy("legal-data-privacy", "Data privacy policy"),
            _policy("infosec-acceptable-use", "Acceptable use"),
            _portal("icims", "Open the HR portal (iCIMS)"),
        ],
        "check": {
            "question": "Where do official business numbers come from?",
            "options": ["Personal spreadsheets", "Governed dashboards", "Slack threads", "Memory"],
            "answer_index": 1,
            "explanation": "Governed data keeps everyone on the same numbers.",
        },
        "ask_ira": ["Which apps should I use?"],
    },
    "stake": {
        "summary": "Identify partners and decision owners for your first project.",
        "lessons": [
            ("Map", "List everyone affected by your project. Mark who decides, who's consulted and who's informed."),
            ("Meet", "Book 20-minute intros with the decision owners in your first two weeks."),
            ("Update", "Agree a cadence — a short weekly written update beats ad-hoc pings."),
        ],
        "takeaways": ["Decide / consult / inform.", "Meet decision owners early.", "Weekly written update."],
        "resources": [
            _policy("hr-code-of-conduct", "Code of Conduct"),
            _policy("legal-anti-bribery-and-gifts", "Gifts & hospitality rules", "When external partners are involved"),
            _person("manager", "Ask your manager who the key stakeholders are", "IRA drafts the email"),
        ],
        "check": {
            "question": "Who should you meet first on a new project?",
            "options": ["Everyone at once", "The decision owners", "Nobody", "Only your peers"],
            "answer_index": 1,
            "explanation": "Decision owners shape scope — start there.",
        },
        "ask_ira": ["Who is on my team?"],
    },
}


def content_for(suffix: str) -> dict[str, Any] | None:
    return CONTENT.get(suffix)
