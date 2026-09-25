"""Deterministic ServiceNow cohort from SmartStart seed-42 joiners."""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

from servicenow.backend.database import SnowStore, store
from servicenow.backend.models import (
    ActivityItem,
    CatalogItem,
    HardwareStatus,
    Incident,
    Priority,
    RequestItem,
    TicketState,
)

AS_OF = datetime(2026, 9, 15, 12, 0, 0, tzinfo=timezone.utc)

CATALOG = (
    ("CAT-001", "New Hire Laptop", "Hardware", "Provision laptop for incoming joiner"),
    ("CAT-002", "Standard Software Bundle", "Software", "Okta, Slack, email, VPN"),
    ("CAT-003", "Engineering Access Pack", "Access", "GitHub, Jira, AWS Console"),
    ("CAT-004", "Badge & Building Access", "Facilities", "Physical badge request"),
)


def _hw_for_state(state: str, rng: random.Random) -> HardwareStatus:
    if state in {"IT_PROVISIONED", "DAY1_ORIENTED", "PROJECT_READY"}:
        return HardwareStatus.DELIVERED
    if state == "DOCS_SUBMITTED":
        return rng.choice([HardwareStatus.PENDING, HardwareStatus.CONFIGURED, HardwareStatus.ORDERED])
    if state == "OFFER_ACCEPTED":
        return rng.choice([HardwareStatus.PENDING, HardwareStatus.ORDERED])
    return HardwareStatus.PENDING


def _state_for_hw(hw: HardwareStatus) -> TicketState:
    if hw == HardwareStatus.DELIVERED:
        return TicketState.CLOSED
    if hw == HardwareStatus.CONFIGURED:
        return TicketState.WIP
    if hw == HardwareStatus.ORDERED:
        return TicketState.PENDING
    return TicketState.NEW


def seed_cohort(
    n_interns: int = 15,
    n_ftes: int = 15,
    seed: int = 42,
    target: SnowStore | None = None,
) -> SnowStore:
    """Seed RITMs from the same SmartStart synthetic joiners."""
    from backend.database import DataStore
    from backend.synthetic_engine import generate_cohort

    db = target or store
    db.clear()

    for cid, name, cat, desc in CATALOG:
        db.catalog[cid] = CatalogItem(
            id=cid, name=name, category=cat, description=desc
        )

    ss = DataStore()
    generate_cohort(n_interns=n_interns, n_ftes=n_ftes, seed=seed, target_store=ss)
    rng = random.Random(seed + 11)
    now = AS_OF

    for idx, joiner in enumerate(ss.list_joiners(), start=1):
        ticket = ss.get_ticket_for_joiner(joiner.id)
        parts = joiner.id.rsplit("-", 1)
        ordinal = int(parts[1]) if len(parts) == 2 and parts[1].isdigit() else idx
        number = f"RITM{seed:04d}{ordinal:03d}"

        # Prefer SmartStart ticket hardware when present; else derive
        if ticket is not None:
            hw_map = {
                "Pending": HardwareStatus.PENDING,
                "Configured": HardwareStatus.CONFIGURED,
                "Delivered": HardwareStatus.DELIVERED,
            }
            hw = hw_map.get(ticket.hardware_status.value, HardwareStatus.PENDING)
            # Add Ordered variety for demo actions
            if hw == HardwareStatus.PENDING and rng.random() < 0.35:
                hw = HardwareStatus.ORDERED
            lead = ticket.lead_time_days
            software = list(ticket.software_access)
            snow_ticket_id = ticket.ticket_id
            opened = ticket.created_at
            updated = ticket.updated_at
            sla_target = ticket.sla_target_days
            breached = ticket.sla_breached
        else:
            hw = _hw_for_state(joiner.current_state.value, rng)
            lead = rng.randint(0, 8)
            software = ["Okta", "Slack", "Email"]
            snow_ticket_id = f"SYN-IT-{seed:04d}-{ordinal:03d}"
            opened = joiner.offer_accepted_at + timedelta(hours=6)
            updated = opened + timedelta(days=max(lead, 1))
            sla_target = 3
            breached = lead > sla_target

        state = _state_for_hw(hw)
        access_granted = hw == HardwareStatus.DELIVERED
        first, _, last = joiner.name.partition(" ")
        last = last or first
        email = f"{first}.{last}@synthetic.example".lower().replace(" ", "")

        activity = [
            ActivityItem(at=opened, label="Catalog request opened", detail="New Hire Laptop + Access"),
        ]
        if hw in {HardwareStatus.ORDERED, HardwareStatus.CONFIGURED, HardwareStatus.DELIVERED}:
            activity.append(ActivityItem(at=opened + timedelta(days=1), label="Hardware ordered"))
        if hw in {HardwareStatus.CONFIGURED, HardwareStatus.DELIVERED}:
            activity.append(ActivityItem(at=opened + timedelta(days=2), label="Hardware configured"))
        if hw == HardwareStatus.DELIVERED:
            activity.append(ActivityItem(at=updated, label="Hardware delivered"))
            activity.append(ActivityItem(at=updated, label="Software access granted"))

        req = RequestItem(
            number=number,
            short_description=f"New hire laptop + access — {joiner.name}",
            requested_for=joiner.name,
            requested_for_email=email,
            state=state,
            priority=Priority.P2 if breached else (Priority.P3 if hw != HardwareStatus.DELIVERED else Priority.P4),
            hardware_status=hw,
            software_access=software,
            access_granted=access_granted,
            sla_target_days=sla_target,
            lead_time_days=lead,
            sla_breached=breached,
            opened_at=opened,
            updated_at=updated,
            due_date=(opened + timedelta(days=sla_target)).date(),
            department=joiner.department,
            manager=joiner.manager_name,
            employment_type=joiner.role_type.value,
            smartstart_joiner_id=joiner.id,
            smartstart_ticket_id=snow_ticket_id,
            activity=activity,
        )
        db.requests[number] = req

        # A few SLA-related incidents for open breached tickets
        if breached and hw != HardwareStatus.DELIVERED and rng.random() < 0.55:
            inc_num = f"INC{seed:04d}{ordinal:03d}"
            db.incidents[inc_num] = Incident(
                number=inc_num,
                short_description=f"SLA risk — new hire hardware for {joiner.name}",
                caller=joiner.manager_name,
                state=TicketState.WIP,
                priority=Priority.P2,
                assignment_group="IT Onboarding",
                opened_at=now - timedelta(hours=rng.randint(2, 48)),
                related_ritm=number,
            )

    # A couple generic incidents
    db.incidents["INC00429901"] = Incident(
        number="INC00429901",
        short_description="VPN client failing for onboarding cohort (synthetic)",
        caller="Riley Chen",
        state=TicketState.NEW,
        priority=Priority.P3,
        assignment_group="Network Ops",
        opened_at=now - timedelta(hours=5),
    )

    return db
