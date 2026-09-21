"""Deterministic synthetic cohort for mock iCIMS (seed 42, shared with SmartStart)."""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

from icims.backend.database import IcimsStore, store
from icims.backend.models import (
    ActivityItem,
    Candidate,
    CandidateStage,
    CandidateType,
    DocSubmissionStatus,
    HireDocument,
    Interview,
    InterviewOutcome,
    NewHire,
    Offer,
    OfferStatus,
    Requisition,
    RequisitionStatus,
)

AS_OF = datetime(2026, 9, 15, 12, 0, 0, tzinfo=timezone.utc)

DOC_NAMES = (
    "Offer Letter",
    "Identification",
    "NDA",
    "Tax Information",
    "Bank Information",
)

POSITION_FOR_DEPT = {
    "Engineering": ("Software Engineer", "Software Engineering Intern"),
    "Data Science": ("Data Engineer", "Data Analyst Intern"),
    "Product": ("Software Engineer", "Software Engineering Intern"),
    "IT Infrastructure": ("Software Engineer", "Software Engineering Intern"),
    "Security": ("Software Engineer", "Software Engineering Intern"),
    "Human Resources": ("Business Analyst", "Business Analyst Intern"),
    "Finance": ("Business Analyst", "Data Analyst Intern"),
    "Marketing": ("Process Intelligence Analyst", "Business Analyst Intern"),
    "Sales": ("Process Intelligence Analyst", "Business Analyst Intern"),
    "Operations": ("Process Intelligence Analyst", "Business Analyst Intern"),
}


def _positions(department: str, is_intern: bool) -> str:
    fte, intern = POSITION_FOR_DEPT.get(
        department, ("Software Engineer", "Software Engineering Intern")
    )
    return intern if is_intern else fte


def _stage_for_demo(idx: int, onboarding_state: str, rng: random.Random) -> CandidateStage:
    """Assign recruiting stages with demo-friendly variety (incl. Sent offers)."""
    # Keep a stable mix regardless of SmartStart onboarding state so Offers
    # page always has actionable Sent offers for the Mark Accepted demo.
    cycle = [
        CandidateStage.APPLIED,
        CandidateStage.SCREENING,
        CandidateStage.INTERVIEW,
        CandidateStage.OFFER,
        CandidateStage.OFFER,
        CandidateStage.OFFER_ACCEPTED,
        CandidateStage.HIRED,
        CandidateStage.HIRED,
    ]
    stage = cycle[(idx - 1) % len(cycle)]
    # Light noise so seed still feels organic
    if rng.random() < 0.08 and stage == CandidateStage.APPLIED:
        return CandidateStage.SCREENING
    _ = onboarding_state  # identity still comes from SmartStart joiner
    return stage


def _req_status(stage: CandidateStage) -> RequisitionStatus:
    if stage in {CandidateStage.APPLIED, CandidateStage.SCREENING}:
        return RequisitionStatus.OPEN
    if stage == CandidateStage.INTERVIEW:
        return RequisitionStatus.INTERVIEWING
    if stage in {CandidateStage.OFFER, CandidateStage.OFFER_ACCEPTED}:
        return RequisitionStatus.OFFER_STAGE
    return RequisitionStatus.FILLED


def seed_cohort(
    n_interns: int = 15,
    n_ftes: int = 15,
    seed: int = 42,
    target: IcimsStore | None = None,
) -> IcimsStore:
    """Seed iCIMS from the same SmartStart synthetic joiners (identity-aligned)."""
    from backend.database import DataStore
    from backend.synthetic_engine import generate_cohort

    db = target or store
    db.clear()

    ss = DataStore()
    generate_cohort(n_interns=n_interns, n_ftes=n_ftes, seed=seed, target_store=ss)
    rng = random.Random(seed + 7)
    now = AS_OF
    req_index: dict[tuple[str, str], str] = {}

    for idx, joiner in enumerate(ss.list_joiners(), start=1):
        is_intern = joiner.role_type.value == "INTERN"
        ctype = CandidateType.INTERN if is_intern else CandidateType.FTE
        position = _positions(joiner.department, is_intern)
        department = joiner.department
        stage = _stage_for_demo(idx, joiner.current_state.value, rng)

        parts = joiner.id.rsplit("-", 1)
        ordinal = int(parts[1]) if len(parts) == 2 and parts[1].isdigit() else idx
        candidate_id = f"CAND-{seed:04d}-{ordinal:03d}"

        first, _, last = joiner.name.partition(" ")
        last = last or first
        email = f"{first}.{last}@synthetic.example".lower().replace(" ", "")

        req_key = (position, department)
        if req_key not in req_index:
            rid = f"REQ-{seed:04d}-{len(req_index) + 1:03d}"
            req_index[req_key] = rid
            db.requisitions[rid] = Requisition(
                id=rid,
                position=position,
                department=department,
                hiring_manager=joiner.manager_name,
                manager_id=joiner.manager_id,
                openings=rng.randint(1, 3),
                candidate_count=0,
                status=_req_status(stage),
                created_date=(now - timedelta(days=rng.randint(20, 60))).date(),
                employment_type=ctype,
            )
        requisition_id = req_index[req_key]
        db.requisitions[requisition_id].candidate_count += 1

        app_date = (joiner.offer_accepted_at - timedelta(days=rng.randint(8, 20))).date()
        stage_order = list(CandidateStage)
        stage_i = stage_order.index(stage)

        interviews: list[Interview] = []
        activity: list[ActivityItem] = [
            ActivityItem(
                at=datetime.combine(app_date, datetime.min.time(), tzinfo=timezone.utc),
                label="Application received",
                detail=position,
            ),
        ]
        if stage_i >= stage_order.index(CandidateStage.INTERVIEW):
            interviews = [
                Interview(
                    id=f"INT-{idx:03d}-1",
                    candidate_id=candidate_id,
                    title="Technical Interview",
                    outcome=InterviewOutcome.COMPLETED,
                    rating="Strong",
                    interviewer=joiner.manager_name,
                    scheduled_at=now - timedelta(days=10),
                ),
                Interview(
                    id=f"INT-{idx:03d}-2",
                    candidate_id=candidate_id,
                    title="Manager Interview",
                    outcome=InterviewOutcome.COMPLETED,
                    rating="Strong",
                    interviewer=joiner.manager_name,
                    scheduled_at=now - timedelta(days=7),
                ),
                Interview(
                    id=f"INT-{idx:03d}-3",
                    candidate_id=candidate_id,
                    title="HR Discussion",
                    outcome=InterviewOutcome.COMPLETED,
                    rating="Proceed",
                    interviewer="Jordan Blake",
                    scheduled_at=now - timedelta(days=5),
                ),
            ]
            activity.append(
                ActivityItem(at=now - timedelta(days=7), label="Manager interview completed")
            )
            activity.append(
                ActivityItem(at=now - timedelta(days=4), label="Candidate moved to Offer")
            )

        candidate = Candidate(
            id=candidate_id,
            name=joiner.name,
            email=email,
            phone=f"+1-555-{1000 + idx:04d}",
            location=rng.choice(
                ("Austin, TX", "Chicago, IL", "Remote — US", "New York, NY", "Seattle, WA")
            ),
            position=position,
            department=department,
            hiring_manager=joiner.manager_name,
            manager_id=joiner.manager_id,
            requisition_id=requisition_id,
            candidate_type=ctype,
            stage=stage,
            application_date=app_date,
            expected_start_date=joiner.joining_date,
            smartstart_joiner_id=joiner.id,
            interviews=interviews,
            activity=activity,
        )
        db.candidates[candidate_id] = candidate

        if stage_i >= stage_order.index(CandidateStage.OFFER):
            if stage == CandidateStage.OFFER:
                ostatus = OfferStatus.SENT
            elif stage in {CandidateStage.OFFER_ACCEPTED, CandidateStage.HIRED}:
                ostatus = OfferStatus.ACCEPTED
            else:
                ostatus = OfferStatus.DRAFT
            oid = f"OFF-{seed:04d}-{ordinal:03d}"
            db.offers[oid] = Offer(
                id=oid,
                candidate_id=candidate_id,
                candidate_name=joiner.name,
                position=position,
                department=department,
                hiring_manager=joiner.manager_name,
                candidate_type=ctype,
                offer_date=(now - timedelta(days=2)).date(),
                proposed_start_date=joiner.joining_date,
                status=ostatus,
                smartstart_joiner_id=joiner.id,
            )
            if ostatus == OfferStatus.SENT:
                activity.append(ActivityItem(at=now - timedelta(days=1), label="Offer sent"))
            if ostatus == OfferStatus.ACCEPTED:
                activity.append(
                    ActivityItem(at=now - timedelta(hours=8), label="Offer accepted")
                )

        if stage in {CandidateStage.OFFER_ACCEPTED, CandidateStage.HIRED}:
            emp_id = f"EMP-{1000 + ordinal}"
            docs_verified = 5 if stage == CandidateStage.HIRED else 4
            hire = NewHire(
                employee_id=emp_id,
                candidate_id=candidate_id,
                name=joiner.name,
                email=email,
                role=position,
                department=department,
                hiring_manager=joiner.manager_name,
                manager_id=joiner.manager_id,
                employment_type=ctype,
                start_date=joiner.joining_date,
                documents_complete=docs_verified,
                documents_total=5,
                preboarding_status="Ready" if docs_verified == 5 else "In Progress",
                hr_ready=docs_verified == 5,
                smartstart_joiner_id=joiner.id,
                activity=[
                    ActivityItem(
                        at=now - timedelta(hours=6),
                        label="Offer accepted",
                        detail=candidate_id,
                    ),
                    ActivityItem(
                        at=now - timedelta(hours=5),
                        label="New hire record created",
                        detail=emp_id,
                    ),
                ],
            )
            db.new_hires[emp_id] = hire
            for d_i, doc_name in enumerate(DOC_NAMES):
                verified = d_i < docs_verified
                submitted = d_i < max(docs_verified, 4)
                did = f"DOC-{emp_id}-{d_i + 1}"
                status = (
                    DocSubmissionStatus.VERIFIED
                    if verified
                    else DocSubmissionStatus.SUBMITTED
                    if submitted
                    else DocSubmissionStatus.MISSING
                )
                db.documents[did] = HireDocument(
                    id=did,
                    employee_id=emp_id,
                    employee_name=joiner.name,
                    document_name=doc_name,
                    required=True,
                    submission_status=status,
                    verification_status=status,
                    submitted_at=now - timedelta(days=1) if submitted else None,
                )

    return db
