"""Synthetic assignable owners for Command Center Assign actions."""

from __future__ import annotations

from backend.database import DataStore, store
from backend.models import AssignOwnersResponse, OwnerCandidate
from backend.synthetic_engine import infer_bottleneck


HR_TEAM: tuple[tuple[str, str, str], ...] = (
    ("OWN-HR-HALE", "Jordan Hale", "People Ops · docs & compliance"),
    ("OWN-HR-QUINN", "Avery Quinn", "HR onboarding partner · iCIMS packets"),
    ("OWN-HR-BLAKE", "Jordan Blake", "People Ops · Day-1 checklist"),
)

IT_TEAM: tuple[tuple[str, str, str], ...] = (
    ("OWN-IT-RILEY", "Riley Chen", "IT Partner · ServiceNow / hardware"),
    ("OWN-IT-ORTIZ", "Sam Ortiz", "IT provisioning · laptop & VPN"),
    ("OWN-IT-NGUYEN", "Casey Nguyen", "IT Partner · Okta & software access"),
)

OPS_TEAM: tuple[tuple[str, str, str], ...] = (
    ("OWN-OPS-ORTIZ", "Sam Ortiz", "Onboarding Ops · cross-team escalations"),
)

PEER_MANAGERS: tuple[tuple[str, str, str], ...] = (
    ("MGR-CHEN", "Ava Chen", "Engineering / Data / Security"),
    ("MGR-PARK", "Leo Park", "Product / IT Infrastructure"),
    ("MGR-SINGH", "Priya Singh", "HR / Finance / Ops"),
    ("MGR-COLE", "Jordan Cole", "Marketing / Sales"),
)


def _queue_for_bottleneck(bottleneck: str | None) -> str:
    if not bottleneck:
        return "Ops"
    t = bottleneck.lower()
    if "document" in t or "docs" in t or "icims" in t or "offer-to-docs" in t:
        return "HR"
    if "it " in t or "sla" in t or "servicenow" in t or "hardware" in t or "provisioning" in t:
        return "IT"
    if "project" in t or "jira" in t or "day-1" in t or "orientation" in t:
        return "Manager"
    return "Ops"


def build_assignable_owners(
    joiner_id: str, db: DataStore | None = None
) -> AssignOwnersResponse:
    db = db or store
    joiner = db.get_joiner(joiner_id)
    if joiner is None:
        raise KeyError(joiner_id)

    docs = db.get_documents(joiner_id)
    ticket = db.get_ticket_for_joiner(joiner_id)
    if docs is None or ticket is None:
        raise KeyError(joiner_id)

    bottleneck = infer_bottleneck(joiner.current_state, docs, ticket)
    queue = _queue_for_bottleneck(bottleneck)

    owners: list[OwnerCandidate] = []

    owners.append(
        OwnerCandidate(
            id=f"OWN-MGR-{joiner.manager_id}",
            name=joiner.manager_name,
            title="Hiring manager",
            team="Manager",
            focus=f"Owns {joiner.department} joiners · Day-1 / project readiness",
            recommended=queue == "Manager",
        )
    )
    owners.append(
        OwnerCandidate(
            id=f"OWN-MENTOR-{joiner_id}",
            name=joiner.mentor_name,
            title="Mentor",
            team="Mentor",
            focus="Learning track, check-ins, day-to-day unblock",
            recommended=queue == "Manager",
        )
    )

    if queue == "HR":
        for oid, name, focus in HR_TEAM:
            owners.append(
                OwnerCandidate(
                    id=oid,
                    name=name,
                    title="HR",
                    team="HR",
                    focus=focus,
                    recommended=True,
                )
            )
    elif queue == "IT":
        for oid, name, focus in IT_TEAM:
            owners.append(
                OwnerCandidate(
                    id=oid,
                    name=name,
                    title="IT",
                    team="IT",
                    focus=focus,
                    recommended=True,
                )
            )
    elif queue == "Manager":
        for mid, mname, depts in PEER_MANAGERS:
            if mid == joiner.manager_id:
                continue
            owners.append(
                OwnerCandidate(
                    id=f"OWN-MGR-{mid}",
                    name=mname,
                    title="Hiring manager",
                    team="Manager",
                    focus=f"Peer manager · {depts}",
                    recommended=False,
                )
            )
    else:
        for oid, name, focus in (*OPS_TEAM, HR_TEAM[0], IT_TEAM[0]):
            owners.append(
                OwnerCandidate(
                    id=oid,
                    name=name,
                    title="Ops partner",
                    team="Ops",
                    focus=focus,
                    recommended=True,
                )
            )

    seen: set[str] = set()
    unique: list[OwnerCandidate] = []
    for o in owners:
        if o.id in seen:
            continue
        seen.add(o.id)
        unique.append(o)

    return AssignOwnersResponse(
        joiner_id=joiner.id,
        joiner_name=joiner.name,
        department=joiner.department,
        manager_name=joiner.manager_name,
        mentor_name=joiner.mentor_name,
        bottleneck=bottleneck,
        queue=queue,
        owners=unique,
        synthetic=True,
        note=(
            f"Suggested {queue} owners for this bottleneck — synthetic demo only, "
            "assignments are not persisted."
        ),
    )
