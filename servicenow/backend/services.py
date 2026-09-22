"""IT actions for mock ServiceNow — hardware, access, SLA, events."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from servicenow.backend.database import SnowStore, store
from servicenow.backend.models import (
    ActivityItem,
    DashboardResponse,
    DeliveryStatus,
    HardwareStatus,
    IntegrationEvent,
    TicketState,
)
from servicenow.backend.seed import AS_OF


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _emit(
    db: SnowStore,
    event_type: str,
    record_id: str,
    payload: dict[str, Any],
    delivery: DeliveryStatus = DeliveryStatus.DELIVERED,
) -> IntegrationEvent:
    now = _now()
    event = IntegrationEvent(
        id=f"EVT-{len(db.events) + 1:05d}",
        event_type=event_type,
        record_id=record_id,
        payload=payload,
        delivery=delivery,
        created_at=now,
        transmitted_at=now if delivery == DeliveryStatus.DELIVERED else None,
    )
    db.append_event(event)
    return event


def build_dashboard(db: SnowStore | None = None) -> DashboardResponse:
    db = db or store
    reqs = db.list_requests()
    by_state: dict[str, int] = {}
    by_hw: dict[str, int] = {}
    for r in reqs:
        by_state[r.state.value] = by_state.get(r.state.value, 0) + 1
        by_hw[r.hardware_status.value] = by_hw.get(r.hardware_status.value, 0) + 1

    urgent = [
        {
            "number": r.number,
            "requested_for": r.requested_for,
            "hardware_status": r.hardware_status.value,
            "sla_breached": r.sla_breached,
            "lead_time_days": r.lead_time_days,
            "state": r.state.value,
        }
        for r in reqs
        if r.sla_breached or r.hardware_status != HardwareStatus.DELIVERED
    ][:10]

    return DashboardResponse(
        open_requests=sum(1 for r in reqs if r.state != TicketState.CLOSED),
        hardware_pending=sum(
            1
            for r in reqs
            if r.hardware_status in {HardwareStatus.PENDING, HardwareStatus.ORDERED}
        ),
        hardware_configured=sum(
            1 for r in reqs if r.hardware_status == HardwareStatus.CONFIGURED
        ),
        awaiting_delivery=sum(
            1 for r in reqs if r.hardware_status == HardwareStatus.CONFIGURED
        ),
        access_pending=sum(1 for r in reqs if not r.access_granted),
        sla_breached=sum(1 for r in reqs if r.sla_breached),
        closed_complete=sum(1 for r in reqs if r.state == TicketState.CLOSED),
        by_state=by_state,
        by_hardware=by_hw,
        urgent=urgent,
    )


def order_hardware(number: str, db: SnowStore | None = None) -> dict:
    db = db or store
    req = db.get_request(number)
    if req is None:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.hardware_status not in {HardwareStatus.PENDING}:
        raise HTTPException(status_code=400, detail=f"Cannot order from {req.hardware_status}")
    req.hardware_status = HardwareStatus.ORDERED
    req.state = TicketState.PENDING
    req.updated_at = _now()
    req.activity.append(ActivityItem(at=_now(), label="Hardware ordered"))
    event = _emit(
        db,
        "HARDWARE_ORDERED",
        req.number,
        {
            "event_type": "HARDWARE_ORDERED",
            "ritm": req.number,
            "requested_for": req.requested_for,
            "smartstart_joiner_id": req.smartstart_joiner_id,
            "timestamp": _now().isoformat(),
        },
    )
    return {"request": req, "event": event}


def configure_hardware(number: str, db: SnowStore | None = None) -> dict:
    db = db or store
    req = db.get_request(number)
    if req is None:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.hardware_status not in {HardwareStatus.PENDING, HardwareStatus.ORDERED}:
        raise HTTPException(
            status_code=400, detail=f"Cannot configure from {req.hardware_status}"
        )
    req.hardware_status = HardwareStatus.CONFIGURED
    req.state = TicketState.WIP
    req.updated_at = _now()
    req.activity.append(ActivityItem(at=_now(), label="Hardware configured"))
    event = _emit(
        db,
        "HARDWARE_CONFIGURED",
        req.number,
        {
            "event_type": "HARDWARE_CONFIGURED",
            "ritm": req.number,
            "requested_for": req.requested_for,
            "hardware_status": "Configured",
            "smartstart_joiner_id": req.smartstart_joiner_id,
            "smartstart_ticket_id": req.smartstart_ticket_id,
            "timestamp": _now().isoformat(),
        },
    )
    return {"request": req, "event": event}


def deliver_hardware(number: str, db: SnowStore | None = None) -> dict:
    db = db or store
    req = db.get_request(number)
    if req is None:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.hardware_status not in {
        HardwareStatus.CONFIGURED,
        HardwareStatus.ORDERED,
        HardwareStatus.PENDING,
    }:
        raise HTTPException(
            status_code=400, detail=f"Cannot deliver from {req.hardware_status}"
        )
    # Auto-configure if skipping steps for demo speed
    if req.hardware_status != HardwareStatus.CONFIGURED:
        req.hardware_status = HardwareStatus.CONFIGURED
        req.activity.append(ActivityItem(at=_now(), label="Hardware configured (auto)"))
    req.hardware_status = HardwareStatus.DELIVERED
    req.state = TicketState.RESOLVED
    req.updated_at = _now()
    req.sla_breached = False
    req.activity.append(ActivityItem(at=_now(), label="Hardware delivered"))
    event = _emit(
        db,
        "HARDWARE_DELIVERED",
        req.number,
        {
            "event_type": "HARDWARE_DELIVERED",
            "ritm": req.number,
            "requested_for": req.requested_for,
            "hardware_status": "Delivered",
            "smartstart_joiner_id": req.smartstart_joiner_id,
            "smartstart_ticket_id": req.smartstart_ticket_id,
            "timestamp": _now().isoformat(),
        },
    )
    return {"request": req, "event": event}


def grant_access(number: str, db: SnowStore | None = None) -> dict:
    db = db or store
    req = db.get_request(number)
    if req is None:
        raise HTTPException(status_code=404, detail="Request not found")
    req.access_granted = True
    req.updated_at = _now()
    req.activity.append(
        ActivityItem(
            at=_now(),
            label="Software access granted",
            detail=", ".join(req.software_access),
        )
    )
    event = _emit(
        db,
        "ACCESS_GRANTED",
        req.number,
        {
            "event_type": "ACCESS_GRANTED",
            "ritm": req.number,
            "requested_for": req.requested_for,
            "software_access": list(req.software_access),
            "smartstart_joiner_id": req.smartstart_joiner_id,
            "timestamp": _now().isoformat(),
        },
    )
    # If hardware delivered + access → close + IT_PROVISIONING_COMPLETE
    complete_event = None
    if req.hardware_status == HardwareStatus.DELIVERED and req.access_granted:
        req.state = TicketState.CLOSED
        req.activity.append(ActivityItem(at=_now(), label="IT provisioning complete"))
        complete_event = _emit(
            db,
            "IT_PROVISIONING_COMPLETE",
            req.number,
            {
                "event_type": "IT_PROVISIONING_COMPLETE",
                "ritm": req.number,
                "requested_for": req.requested_for,
                "department": req.department,
                "hardware_status": "Delivered",
                "software_access": list(req.software_access),
                "smartstart_joiner_id": req.smartstart_joiner_id,
                "smartstart_ticket_id": req.smartstart_ticket_id,
                "timestamp": _now().isoformat(),
            },
        )
    return {"request": req, "event": event, "complete_event": complete_event}


def close_request(number: str, db: SnowStore | None = None) -> dict:
    db = db or store
    req = db.get_request(number)
    if req is None:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.hardware_status != HardwareStatus.DELIVERED:
        raise HTTPException(status_code=400, detail="Deliver hardware before closing")
    if not req.access_granted:
        raise HTTPException(status_code=400, detail="Grant access before closing")
    req.state = TicketState.CLOSED
    req.updated_at = _now()
    req.activity.append(ActivityItem(at=_now(), label="Request closed complete"))
    event = _emit(
        db,
        "IT_PROVISIONING_COMPLETE",
        req.number,
        {
            "event_type": "IT_PROVISIONING_COMPLETE",
            "ritm": req.number,
            "requested_for": req.requested_for,
            "smartstart_joiner_id": req.smartstart_joiner_id,
            "smartstart_ticket_id": req.smartstart_ticket_id,
            "timestamp": _now().isoformat(),
        },
    )
    return {"request": req, "event": event}


def integration_status(db: SnowStore | None = None) -> dict:
    db = db or store
    events = db.list_events()
    delivered = [e for e in events if e.delivery == DeliveryStatus.DELIVERED]
    last = delivered[0] if delivered else None
    today = _now().date()
    events_today = sum(1 for e in events if e.created_at.date() == today)
    return {
        "integrations": [
            {
                "name": "External Onboarding Platform",
                "status": "Connected",
                "type": "REST API / Event Feed",
                "last_successful_transmission": (
                    last.transmitted_at.isoformat() if last and last.transmitted_at else None
                ),
                "records_transmitted": len(delivered) + 30,
                "events_today": events_today or len(events),
            }
        ],
        "activity": [
            {
                "at": e.created_at.isoformat(),
                "kind": "EVENT",
                "event_type": e.event_type,
                "record": e.record_id,
                "delivery": e.delivery.value,
            }
            for e in events[:40]
        ],
        "synthetic": True,
        "as_of": AS_OF.isoformat(),
        "note": "Mock ServiceNow integration view — does not embed SmartStart.",
    }
