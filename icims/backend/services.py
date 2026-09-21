"""Business actions for mock iCIMS — offers, documents, readiness, events."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from icims.backend.database import IcimsStore, store
from icims.backend.models import (
    ActivityItem,
    CandidateStage,
    DashboardResponse,
    DeliveryStatus,
    DocSubmissionStatus,
    HireDocument,
    IntegrationEvent,
    NewHire,
    OfferStatus,
)
from icims.backend.seed import AS_OF, DOC_NAMES


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _emit(
    db: IcimsStore,
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


def build_dashboard(db: IcimsStore | None = None) -> DashboardResponse:
    db = db or store
    candidates = db.list_candidates()
    offers = db.list_offers()
    hires = db.list_new_hires()
    pipeline = {s.value: 0 for s in CandidateStage}
    for c in candidates:
        pipeline[c.stage.value] += 1

    interviews = sum(len(c.interviews) for c in candidates)
    upcoming = sorted(
        [
            {
                "employee": h.name,
                "position": h.role,
                "department": h.department,
                "manager": h.hiring_manager,
                "start_date": h.start_date.isoformat(),
                "status": h.preboarding_status,
                "employee_id": h.employee_id,
            }
            for h in hires
        ],
        key=lambda r: r["start_date"],
    )[:8]

    return DashboardResponse(
        active_candidates=sum(
            1
            for c in candidates
            if c.stage
            not in {CandidateStage.HIRED, CandidateStage.OFFER_ACCEPTED}
        ),
        interviews_this_week=min(interviews, 18),
        offers_pending=sum(
            1
            for o in offers
            if o.status in {OfferStatus.SENT, OfferStatus.PENDING_APPROVAL, OfferStatus.DRAFT}
        ),
        offers_accepted=sum(1 for o in offers if o.status == OfferStatus.ACCEPTED),
        new_hires=len(hires),
        starting_soon=sum(1 for h in hires if h.preboarding_status != "Ready"),
        pipeline=pipeline,
        upcoming_starts=upcoming,
    )


def send_offer(offer_id: str, db: IcimsStore | None = None) -> dict:
    db = db or store
    offer = db.get_offer(offer_id)
    if offer is None:
        raise HTTPException(status_code=404, detail="Offer not found")
    if offer.status not in {OfferStatus.DRAFT, OfferStatus.PENDING_APPROVAL}:
        raise HTTPException(status_code=400, detail=f"Cannot send from status {offer.status}")
    offer.status = OfferStatus.SENT
    cand = db.get_candidate(offer.candidate_id)
    if cand:
        cand.stage = CandidateStage.OFFER
        cand.activity.append(ActivityItem(at=_now(), label="Offer sent"))
    event = _emit(
        db,
        "OFFER_SENT",
        offer.candidate_id,
        {
            "event_type": "OFFER_SENT",
            "offer_id": offer.id,
            "candidate_id": offer.candidate_id,
            "position": offer.position,
            "timestamp": _now().isoformat(),
        },
    )
    return {"offer": offer, "event": event}


def accept_offer(offer_id: str, db: IcimsStore | None = None) -> dict:
    """Mark offer accepted — core demo action that emits OFFER_ACCEPTED."""
    db = db or store
    offer = db.get_offer(offer_id)
    if offer is None:
        raise HTTPException(status_code=404, detail="Offer not found")
    if offer.status == OfferStatus.ACCEPTED:
        return {"offer": offer, "already_accepted": True}
    if offer.status == OfferStatus.DECLINED:
        raise HTTPException(status_code=400, detail="Offer was declined")

    offer.status = OfferStatus.ACCEPTED
    cand = db.get_candidate(offer.candidate_id)
    if cand is None:
        raise HTTPException(status_code=500, detail="Candidate missing")
    cand.stage = CandidateStage.OFFER_ACCEPTED
    cand.activity.append(ActivityItem(at=_now(), label="Offer accepted"))

    # Ensure new hire exists
    existing = next(
        (h for h in db.list_new_hires() if h.candidate_id == cand.id),
        None,
    )
    if existing is None:
        ordinal = int(cand.id.rsplit("-", 1)[-1])
        emp_id = f"EMP-{1000 + ordinal}"
        hire = NewHire(
            employee_id=emp_id,
            candidate_id=cand.id,
            name=cand.name,
            email=cand.email,
            role=cand.position,
            department=cand.department,
            hiring_manager=cand.hiring_manager,
            manager_id=cand.manager_id,
            employment_type=cand.candidate_type,
            start_date=offer.proposed_start_date,
            documents_complete=0,
            documents_total=5,
            preboarding_status="In Progress",
            hr_ready=False,
            smartstart_joiner_id=cand.smartstart_joiner_id,
            activity=[
                ActivityItem(at=_now(), label="Offer accepted", detail=cand.id),
                ActivityItem(at=_now(), label="New hire record created", detail=emp_id),
            ],
        )
        db.new_hires[emp_id] = hire
        for d_i, doc_name in enumerate(DOC_NAMES):
            did = f"DOC-{emp_id}-{d_i + 1}"
            # First 3 pre-submitted for demo flow
            submitted = d_i < 3
            db.documents[did] = HireDocument(
                id=did,
                employee_id=emp_id,
                employee_name=cand.name,
                document_name=doc_name,
                required=True,
                submission_status=(
                    DocSubmissionStatus.SUBMITTED if submitted else DocSubmissionStatus.MISSING
                ),
                verification_status=(
                    DocSubmissionStatus.SUBMITTED if submitted else DocSubmissionStatus.MISSING
                ),
                submitted_at=_now() if submitted else None,
            )
        hire.documents_complete = 0
    else:
        hire = existing

    payload = {
        "event_type": "OFFER_ACCEPTED",
        "candidate_id": cand.id,
        "employee_id": hire.employee_id,
        "employee_type": cand.candidate_type.value.upper().replace("INTERN", "INTERN"),
        "position": cand.position,
        "department": cand.department,
        "manager": cand.hiring_manager,
        "manager_id": cand.manager_id,
        "start_date": offer.proposed_start_date.isoformat(),
        "smartstart_joiner_id": cand.smartstart_joiner_id,
        "timestamp": _now().isoformat(),
    }
    if cand.candidate_type.value == "Intern":
        payload["employee_type"] = "INTERN"
    else:
        payload["employee_type"] = "FTE"

    event = _emit(db, "OFFER_ACCEPTED", cand.id, payload)
    return {"offer": offer, "candidate": cand, "new_hire": hire, "event": event}


def decline_offer(offer_id: str, db: IcimsStore | None = None) -> dict:
    db = db or store
    offer = db.get_offer(offer_id)
    if offer is None:
        raise HTTPException(status_code=404, detail="Offer not found")
    offer.status = OfferStatus.DECLINED
    cand = db.get_candidate(offer.candidate_id)
    if cand:
        cand.activity.append(ActivityItem(at=_now(), label="Offer declined"))
    event = _emit(
        db,
        "OFFER_DECLINED",
        offer.candidate_id,
        {
            "event_type": "OFFER_DECLINED",
            "offer_id": offer.id,
            "candidate_id": offer.candidate_id,
            "timestamp": _now().isoformat(),
        },
    )
    return {"offer": offer, "event": event}


def verify_document(document_id: str, db: IcimsStore | None = None) -> dict:
    db = db or store
    doc = db.get_document(document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.verification_status == DocSubmissionStatus.VERIFIED:
        return {"document": doc, "already_verified": True}
    if doc.submission_status == DocSubmissionStatus.MISSING:
        doc.submission_status = DocSubmissionStatus.SUBMITTED
        doc.submitted_at = _now()
    doc.verification_status = DocSubmissionStatus.VERIFIED
    doc.submission_status = DocSubmissionStatus.VERIFIED

    hire = db.get_hire(doc.employee_id)
    if hire:
        verified = sum(
            1
            for d in db.list_documents()
            if d.employee_id == hire.employee_id
            and d.verification_status == DocSubmissionStatus.VERIFIED
        )
        hire.documents_complete = verified
        hire.activity.append(
            ActivityItem(at=_now(), label=f"Document verified: {doc.document_name}")
        )
        if verified >= hire.documents_total:
            hire.preboarding_status = "Ready"
            # readiness checked separately

    event = _emit(
        db,
        "DOCUMENT_VERIFIED",
        doc.employee_id,
        {
            "event_type": "DOCUMENT_VERIFIED",
            "document_id": doc.id,
            "document_name": doc.document_name,
            "employee_id": doc.employee_id,
            "employee_name": doc.employee_name,
            "timestamp": _now().isoformat(),
        },
    )
    return {"document": doc, "event": event, "new_hire": hire}


def mark_hr_ready(employee_id: str, db: IcimsStore | None = None) -> dict:
    db = db or store
    hire = db.get_hire(employee_id)
    if hire is None:
        raise HTTPException(status_code=404, detail="New hire not found")
    docs = [
        d
        for d in db.list_documents()
        if d.employee_id == employee_id
    ]
    all_verified = all(d.verification_status == DocSubmissionStatus.VERIFIED for d in docs) and len(docs) >= 5
    if not (hire.offer_accepted and hire.personal_info_complete and hire.background_check and all_verified):
        raise HTTPException(
            status_code=400,
            detail="Preboarding checklist incomplete — verify all documents first",
        )
    hire.hr_ready = True
    hire.preboarding_status = "Ready"
    hire.documents_complete = len(docs)
    cand = db.get_candidate(hire.candidate_id)
    if cand and cand.stage != CandidateStage.HIRED:
        cand.stage = CandidateStage.HIRED
        cand.activity.append(ActivityItem(at=_now(), label="Moved to Hired — HR ready"))
    hire.activity.append(ActivityItem(at=_now(), label="HR preboarding complete"))

    event = _emit(
        db,
        "HR_PREBOARDING_COMPLETE",
        hire.employee_id,
        {
            "event_type": "HR_PREBOARDING_COMPLETE",
            "employee_id": hire.employee_id,
            "candidate_id": hire.candidate_id,
            "name": hire.name,
            "department": hire.department,
            "start_date": hire.start_date.isoformat(),
            "smartstart_joiner_id": hire.smartstart_joiner_id,
            "timestamp": _now().isoformat(),
        },
    )
    return {"new_hire": hire, "event": event}


def integration_status(db: IcimsStore | None = None) -> dict:
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
        "note": "Mock iCIMS integration view — does not embed SmartStart.",
    }
