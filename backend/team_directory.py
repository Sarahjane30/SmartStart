"""Synthetic department team directory — the people a joiner actually works with.

Deterministic per department so every joiner in a department sees the same team.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata

from backend.models import Colleague, RoleType

EMAIL_DOMAIN = "synthetic.smartstart.example"


def work_email(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    parts = re.findall(r"[a-z]+", ascii_name.lower())
    return f"{'.'.join(parts) or 'colleague'}@{EMAIL_DOMAIN}"

# (title, expertise, ask me about)
_Role = tuple[str, tuple[str, ...], str]

_TEAMS: dict[str, tuple[str, str, tuple[_Role, ...]]] = {
    "Human Resources": (
        "People Operations",
        "Head of People Operations",
        (
            ("HR Business Partner", ("Employee relations", "Performance cycles", "Org design"), "Manager questions, team changes, performance reviews"),
            ("Talent Acquisition Lead", ("Hiring pipelines", "iCIMS", "Interview design"), "Open roles, referrals, interview panels"),
            ("Total Rewards Specialist", ("Compensation bands", "Benefits", "Payroll inputs"), "Benefits enrolment, payroll questions"),
            ("HR Operations Analyst", ("Workday", "HR data", "Onboarding workflows"), "HR Portal, leave records, employee data"),
            ("L&D Coordinator", ("Learning Portal", "Training plans", "Compliance courses"), "Mandatory training, course access"),
        ),
    ),
    "Sales": (
        "Commercial — Americas",
        "Regional Sales Director",
        (
            ("Account Executive", ("Enterprise deals", "Negotiation", "Salesforce"), "Deal stages, pricing approvals"),
            ("Sales Engineer", ("Product demos", "Technical discovery", "Lab workflows"), "Demo environments, technical objections"),
            ("Sales Operations Analyst", ("Salesforce reports", "Forecasting", "Territory planning"), "Pipeline dashboards, CRM hygiene"),
            ("Customer Success Manager", ("Renewals", "Adoption plans", "QBRs"), "Customer health, renewal timelines"),
            ("Inside Sales Representative", ("Lead qualification", "Outreach cadences", "HubSpot"), "Prospecting playbooks"),
        ),
    ),
    "Security": (
        "Information Security",
        "Head of Security Operations",
        (
            ("Security Analyst", ("SOC monitoring", "Incident triage", "SIEM"), "Phishing reports, suspicious alerts"),
            ("Security Engineer", ("Cloud security", "IAM", "Okta"), "Access policies, MFA issues"),
            ("GRC Specialist", ("ISO 27001", "Risk assessments", "Audits"), "Policy exceptions, audit evidence"),
            ("Application Security Engineer", ("Code scanning", "Threat modelling", "OWASP"), "Secure code reviews"),
            ("Security Awareness Lead", ("Training", "Phishing simulations", "Culture"), "Security training, awareness content"),
        ),
    ),
    "Engineering": (
        "Platform Engineering",
        "Engineering Manager",
        (
            ("Senior Software Engineer", ("Python", "API design", "Code review"), "Service architecture, review etiquette"),
            ("Frontend Engineer", ("TypeScript", "React", "Design systems"), "UI conventions, component library"),
            ("DevOps Engineer", ("CI/CD", "Kubernetes", "Terraform"), "Pipelines, deployments, environments"),
            ("QA Engineer", ("Test automation", "Playwright", "Release testing"), "Test plans, flaky tests"),
            ("Staff Engineer", ("System design", "Performance", "Mentoring"), "Technical direction, RFCs"),
        ),
    ),
    "Finance": (
        "Finance & Accounting",
        "Finance Controller",
        (
            ("Financial Analyst", ("FP&A", "Budget models", "Excel"), "Budgets, cost centres, forecasts"),
            ("Accounts Payable Specialist", ("Invoices", "Vendor payments", "SAP"), "Vendor invoices, payment status"),
            ("Payroll Specialist", ("Payroll runs", "Tax filings", "Payslips"), "Salary dates, tax declarations"),
            ("Procurement Analyst", ("Purchase orders", "Vendor onboarding", "Coupa"), "POs, new vendor requests"),
            ("Expense Auditor", ("Concur", "Policy compliance", "Reimbursements"), "Expense claims, receipts"),
        ),
    ),
    "IT Infrastructure": (
        "IT Infrastructure & Service Desk",
        "IT Infrastructure Manager",
        (
            ("Service Desk Lead", ("ServiceNow", "Incident management", "SLAs"), "Tickets, escalations, laptop issues"),
            ("Systems Administrator", ("Windows", "Intune", "Endpoint management"), "Device setup, software installs"),
            ("Network Engineer", ("VPN", "Wi-Fi", "Firewalls"), "VPN access, office network"),
            ("Cloud Engineer", ("Azure", "AWS", "Backups"), "Cloud resources, storage"),
            ("IT Asset Coordinator", ("Hardware inventory", "Shipping", "Returns"), "Laptop delivery, replacements"),
        ),
    ),
    "Marketing": (
        "Brand & Growth Marketing",
        "Marketing Director",
        (
            ("Product Marketing Manager", ("Positioning", "Launches", "Messaging"), "Product narratives, launch plans"),
            ("Content Strategist", ("Copywriting", "SEO", "Editorial calendar"), "Blog and web content"),
            ("Marketing Operations Analyst", ("HubSpot", "Campaign analytics", "Attribution"), "Campaign data, dashboards"),
            ("Brand Designer", ("Figma", "Brand guidelines", "Visual identity"), "Templates, logos, brand usage"),
            ("Events Manager", ("Trade shows", "Webinars", "Vendor management"), "Upcoming events, booth logistics"),
        ),
    ),
    "Operations": (
        "Business Operations",
        "Operations Manager",
        (
            ("Process Excellence Lead", ("BPMN", "Lean", "Process mining"), "Process maps, improvement ideas"),
            ("Supply Chain Analyst", ("Demand planning", "Logistics", "SAP"), "Inventory and shipping questions"),
            ("Operations Analyst", ("Celonis", "KPIs", "Reporting"), "Operational dashboards"),
            ("Quality Specialist", ("GxP", "CAPA", "Audits"), "Quality procedures, deviations"),
            ("Project Coordinator", ("Jira", "Scheduling", "Stakeholder updates"), "Project timelines, status reports"),
        ),
    ),
    "Data Science": (
        "Data Science & Analytics",
        "Data Science Manager",
        (
            ("Senior Data Scientist", ("Machine learning", "Python", "Experiment design"), "Modelling approaches, notebooks"),
            ("ML Engineer", ("Model deployment", "MLOps", "Feature stores"), "Putting models in production"),
            ("Analytics Engineer", ("dbt", "SQL", "Data modelling"), "Data marts, metric definitions"),
            ("BI Developer", ("Power BI", "Dashboards", "Semantic models"), "Reports and dashboards"),
            ("Data Analyst", ("SQL", "Statistics", "Storytelling"), "Ad-hoc analysis, data sources"),
        ),
    ),
    "Product": (
        "Product Management",
        "Director of Product",
        (
            ("Senior Product Manager", ("Roadmaps", "Discovery", "Prioritisation"), "Roadmap and feature requests"),
            ("Product Designer", ("UX research", "Figma", "Prototyping"), "Design reviews, user research"),
            ("Product Analyst", ("Product analytics", "Amplitude", "A/B tests"), "Usage data, experiment results"),
            ("Technical Product Owner", ("Backlogs", "Jira", "Acceptance criteria"), "Sprint scope, user stories"),
            ("UX Writer", ("Microcopy", "Content design", "Accessibility"), "In-product wording"),
        ),
    ),
    "Data Engineering": (
        "Data Platform",
        "Data Engineering Manager",
        (
            ("Senior Data Engineer", ("Spark", "Airflow", "Pipeline design"), "Pipelines, orchestration"),
            ("Data Platform Engineer", ("Snowflake", "Terraform", "Cost tuning"), "Warehouse access, environments"),
            ("Data Quality Engineer", ("Great Expectations", "Monitoring", "SLAs"), "Data checks, incidents"),
            ("Analytics Engineer", ("dbt", "SQL", "Modelling"), "Transformations, metric layers"),
            ("Streaming Engineer", ("Kafka", "Real-time pipelines", "Python"), "Event streams, CDC"),
        ),
    ),
}

_DEFAULT = (
    "Department team",
    "Department Lead",
    (
        ("Senior Specialist", ("Department processes", "Stakeholders"), "How work gets done here"),
        ("Specialist", ("Day-to-day operations", "Tools"), "Daily workflows"),
        ("Analyst", ("Reporting", "Data"), "Reports and metrics"),
        ("Coordinator", ("Scheduling", "Communication"), "Meetings and logistics"),
        ("Associate", ("Documentation", "Support"), "Where docs live"),
    ),
)

_NAMES = (
    "Maya Fernandes", "Daniel Okafor", "Sofia Lindqvist", "Arjun Mehta", "Hannah Weiss",
    "Kenji Watanabe", "Isabel Moreno", "Noah Bennett", "Aisha Rahman", "Lucas Dubois",
    "Grace Kim", "Omar Haddad", "Chloe Martin", "Rahul Iyer", "Emma Schultz",
    "Diego Alvarez", "Zara Qureshi", "Ethan Walsh", "Meera Pillai", "Tomás Silva",
)


def _seed(text: str) -> int:
    return int(hashlib.sha256(text.encode()).hexdigest()[:8], 16)


def build_colleagues(
    *,
    joiner_id: str,
    joiner_name: str,
    role_type: RoleType,
    department: str,
    manager_name: str,
    mentor_name: str,
) -> tuple[str, list[Colleague]]:
    team_name, lead_title, roles = _TEAMS.get(department, _DEFAULT)
    taken = {manager_name, mentor_name, joiner_name}
    pool = [n for n in _NAMES if n not in taken]
    start = _seed(department) % len(pool)
    names = [pool[(start + i) % len(pool)] for i in range(len(roles))]
    slug = department.lower().replace(" ", "-")
    is_intern = role_type == RoleType.INTERN

    members = [
        Colleague(
            id=f"{slug}-lead",
            name=manager_name,
            title=lead_title,
            relationship="Your manager",
            expertise=["Team priorities", "Goals & reviews", "Approvals"],
            ask_about="Your goals, priorities, leave approval and project assignment",
            channel="Teams · 1:1 weekly",
            email=work_email(manager_name),
        ),
        Colleague(
            id=f"{slug}-mentor",
            name=mentor_name,
            title=f"Senior {roles[0][0]}" if roles else "Senior colleague",
            relationship="Your mentor" if is_intern else "Your buddy",
            expertise=list(roles[0][1]) if roles else ["Onboarding"],
            ask_about="Anything while you settle in — tools, norms, who to ask",
            channel="Slack DM",
            email=work_email(mentor_name),
        ),
    ]
    for (title, expertise, ask), name in zip(roles, names):
        members.append(
            Colleague(
                id=f"{slug}-{_seed(name) % 10000:04d}",
                name=name,
                title=title,
                expertise=list(expertise),
                ask_about=ask,
                channel="Slack · #" + slug,
                email=work_email(name),
            )
        )
    members.append(
        Colleague(
            id=joiner_id,
            name=joiner_name,
            title="Intern" if is_intern else f"New {department} team member",
            relationship="You",
            expertise=[],
            ask_about="",
            channel="",
            is_self=True,
        )
    )
    return team_name, members
