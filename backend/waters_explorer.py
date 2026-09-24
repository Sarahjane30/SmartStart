"""Waters // How it all connects — content for the employee "explore the machine" experience.

Company facts come only from public Waters sources (listed in SOURCES). The personal
chain at the end is built from the joiner's own SmartStart record — no extra dataset.
"""

from __future__ import annotations

import os

from backend.database import DataStore, store
from backend.models import Joiner, RoleType
from backend.team_directory import _DEFAULT, _TEAMS

SOURCES = (
    {
        "label": "Waters completes combination with BD's Biosciences & Diagnostic Solutions (Feb 2026)",
        "url": "https://www.prnewswire.com/news-releases/waters-completes-combination-with-bds-biosciences--diagnostic-solutions-businesses-302682583.html",
    },
    {
        "label": "waters.com — Advancing biosciences, diagnostics & analytical science",
        "url": "https://www.waters.com/nextgen/us/en/c/promo/combination.html",
    },
    {
        "label": "Waters opens Global Capability Center in Bengaluru (Dec 2023)",
        "url": "https://ir.waters.com/News--Events/newsroom/news-details/2023/Waters-Corporation-Opens-New-State-of-the-Art-Global-Capability-Center-in-Bengaluru-India/default.aspx",
    },
    {"label": "waters.com — Careers: global locations", "url": "https://www.waters.com/careers"},
)

COMPANY = {
    "name": "Waters",
    "tagline": "A global leader in life sciences and diagnostics.",
    "summary": (
        "Waters develops analytical technologies, informatics and services that help "
        "scientists analyse complex samples and make important decisions — from releasing "
        "safe medicines to detecting disease earlier."
    ),
    "colleagues": "~16,000",
    "divisions": [
        {"name": "Analytical Sciences", "what": "Liquid chromatography, mass spectrometry and the software around them."},
        {"name": "Biosciences", "what": "Tools for studying cells — formerly BD Biosciences."},
        {"name": "Advanced Diagnostics", "what": "Testing that helps clinicians find and manage infections — formerly BD Diagnostic Solutions."},
        {"name": "Materials Sciences", "what": "Measuring how materials behave — heat, flow and strength."},
    ],
}

SCIENCE = {
    "id": "science",
    "index": "01",
    "label": "What does Waters do?",
    "title": "The science",
    "lead": COMPANY["summary"],
    "simple": "Think of it as helping scientists work out exactly what's inside a sample — and trust the answer.",
    "explore": [
        {
            "name": "Liquid chromatography",
            "simple": "Separates a mixture into its ingredients.",
            "goto": "technology",
        },
        {
            "name": "Mass spectrometry",
            "simple": "Identifies each ingredient and how much of it there is.",
            "goto": "technology",
        },
        {
            "name": "Informatics",
            "simple": "Software that turns instrument signals into answers a lab can trust.",
            "deeper": (
                "Instruments produce raw signals. Lab software (for example Empower chromatography "
                "data software and the waters_connect platform) captures that data, processes it into "
                "results and keeps an audit trail — essential in regulated labs such as pharma QC."
            ),
        },
    ],
}

IMPACT = {
    "id": "impact",
    "index": "02",
    "label": "Why does it matter?",
    "title": "From lab → real world",
    "lead": (
        "Waters technologies sit behind decisions that reach everyday life. "
        "The goal isn't just measurement — it's helping scientists make better decisions."
    ),
    "areas": [
        {"name": "Medicines", "what": "Checking that effective, high-quality medicines are ready for release."},
        {"name": "Food & water", "what": "Helping ensure the safety of what we eat and drink."},
        {"name": "Diagnostics", "what": "Detecting diseases earlier and managing routine infections."},
        {"name": "Antibiotic resistance", "what": "Supporting the fight against infections that stop responding to drugs."},
    ],
}

TECHNOLOGY = {
    "id": "technology",
    "index": "03",
    "label": "The technology",
    "title": "Inside the chambers",
    "lead": "Two core ideas power most of the machine. Start simple — go deeper when you're ready.",
    "chambers": [
        {
            "name": "Liquid chromatography",
            "short": "LC",
            "steps": ["Separate", "Analyze", "Understand"],
            "simple": (
                "Imagine a race where every ingredient in a sample runs at a different speed — "
                "so they cross the finish line one at a time and you can look at each on its own."
            ),
            "deeper": (
                "A liquid (the mobile phase) pushes the sample through a column packed with tiny "
                "particles (the stationary phase). Molecules that stick to the particles more move "
                "slower, so each compound leaves the column at its own retention time. A detector "
                "draws each one as a peak — the chromatogram. UPLC uses smaller particles at higher "
                "pressure for faster, sharper separations."
            ),
        },
        {
            "name": "Mass spectrometry",
            "short": "MS",
            "steps": ["Identify", "Measure", "Understand"],
            "simple": (
                "A very precise scale for molecules. Weigh something that small accurately enough "
                "and you know exactly what it is — and how much of it is there."
            ),
            "deeper": (
                "Molecules are given an electric charge (ionised), then sorted by their mass-to-charge "
                "ratio (m/z) and counted. The resulting spectrum is a fingerprint that identifies the "
                "molecule; the signal size tells you the quantity. Put LC in front (LC-MS) and you "
                "separate first, then identify each compound as it arrives."
            ),
        },
    ],
}

SITES = (
    {"id": "milford", "name": "Milford", "country": "USA", "lat": 42.14, "lon": -71.52,
     "what": "Global headquarters in Massachusetts."},
    {"id": "wilmslow", "name": "Wilmslow", "country": "UK", "lat": 53.33, "lon": -2.23,
     "what": "One of Waters' listed global locations, near Manchester."},
    {"id": "wexford", "name": "Wexford", "country": "Ireland", "lat": 52.34, "lon": -6.46,
     "what": "One of Waters' listed global locations in the south-east of Ireland."},
    {"id": "bengaluru", "name": "Bengaluru", "country": "India", "lat": 12.93, "lon": 77.68,
     "what": (
         "Global Capability Center, opened Dec 2023 at RMZ Ecoworld — software engineering, "
         "technology & product development, data analytics and IT for the whole enterprise."
     ),
     "layers": ["Teams", "Technology", "Operations", "People"]},
)

WORLD = {
    "id": "world",
    "index": "04",
    "label": "Waters around the world",
    "title": "A global science company",
    "lead": f"About {COMPANY['colleagues'][1:]} colleagues, working with customers around the world.",
}

PEOPLE_NODES = (
    {"id": "scientists", "name": "Scientists", "what": "Chemistry, physics and biology experts who shape what the instruments can do."},
    {"id": "engineers", "name": "Engineers", "what": "Design the hardware and keep the infrastructure running."},
    {"id": "software", "name": "Software", "what": "Build the apps, instrument software and platforms."},
    {"id": "data", "name": "Data", "what": "Turn data into insight — for customers and for Waters itself."},
    {"id": "operations", "name": "Operations", "what": "Make, ship and support products reliably."},
    {"id": "sales", "name": "Sales", "what": "Help labs find the right solution for their science."},
    {"id": "service", "name": "Service", "what": "Install, maintain and fix instruments in customer labs."},
    {"id": "business", "name": "Business", "what": "Finance, strategy and planning that keep the company moving."},
    {"id": "hr", "name": "HR", "what": "Hire, onboard and grow the people who do all of the above."},
)

PEOPLE = {
    "id": "people",
    "index": "05",
    "label": "Who works here?",
    "title": "An ecosystem",
    "lead": "Waters isn't one kind of job. It's an ecosystem of people, technology and science.",
}

_DEPT = {
    "Engineering": ("Technology & Product Development", "software"),
    "Product": ("Technology & Product Development", "software"),
    "Data Science": ("Data & Analytics", "data"),
    "Data Engineering": ("Data & Analytics", "data"),
    "IT Infrastructure": ("Information Technology", "engineers"),
    "Security": ("Information Technology", "engineers"),
    "Human Resources": ("People & Culture", "hr"),
    "Finance": ("Business Operations", "business"),
    "Operations": ("Business Operations", "operations"),
    "Marketing": ("Commercial", "sales"),
    "Sales": ("Commercial", "sales"),
}

IRA_ACTIONS = (
    {"label": "Meet my team", "goto": "team"},
    {"label": "Understand my role", "ask": "What does my role do?"},
    {"label": "Explore my tools", "ask": "Which apps will I use?"},
    {"label": "Ask IRA anything", "goto": "ask"},
)


def home_site() -> dict:
    site_id = os.environ.get("SMARTSTART_HOME_SITE", "bengaluru").lower()
    return next((s for s in SITES if s["id"] == site_id), SITES[-1])


def role_title(j: Joiner) -> str:
    return f"{j.department} {'Intern' if j.role_type == RoleType.INTERN else 'Associate'}"


def your_place(j: Joiner) -> dict:
    area, node = _DEPT.get(j.department, ("Business Operations", "business"))
    team = _TEAMS.get(j.department, _DEFAULT)[0]
    title = role_title(j)
    site = home_site()
    return {
        "id": "you",
        "index": "06",
        "label": "Your place in the machine",
        "title": "And you?",
        "name": j.name,
        "role_title": title,
        "department": j.department,
        "team": team,
        "manager": j.manager_name,
        "mentor": j.mentor_name,
        "learning_track": j.learning_track,
        "site": site["name"],
        "node": node,
        "chain": [
            {"level": "Company", "name": "Waters"},
            {"level": "Business area", "name": area},
            {"level": "Department", "name": j.department},
            {"level": "Your team", "name": f"{team} · with {j.manager_name}"},
            {"level": "Your role", "name": title},
            {"level": "You", "name": j.name},
        ],
        "note": "Company facts are public; your chain comes from your SmartStart record.",
    }


def build(joiner_id: str, db: DataStore | None = None) -> dict:
    j = (db or store).get_joiner(joiner_id)
    if j is None:
        raise KeyError(joiner_id)
    you = your_place(j)
    world = {**WORLD, "sites": [{**s, "home": s["id"] == home_site()["id"]} for s in SITES]}
    people = {**PEOPLE, "nodes": [{**n, "yours": n["id"] == you["node"]} for n in PEOPLE_NODES]}
    return {
        "title": "Waters // How it all connects",
        "company": COMPANY,
        "components": [SCIENCE, IMPACT, TECHNOLOGY, world, people, you],
        "ira": {
            "line": "Okay — now you know what Waters does. Want to understand what your team actually does?",
            "actions": list(IRA_ACTIONS),
        },
        "sources": list(SOURCES),
        "synthetic_note": you["note"],
    }
