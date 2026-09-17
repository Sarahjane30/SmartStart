"""Layer 4 — seed-stable synthetic SLA / onboarding risk predictor."""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from backend.database import DataStore, store
from backend.models import (
    DocumentStatus,
    HardwareStatus,
    OnboardingState,
    PredictResponse,
    PredictiveAlert,
    RiskLevel,
)
from backend.synthetic_engine import days_in_pipeline, infer_bottleneck

AS_OF = datetime(2026, 9, 15, 12, 0, 0, tzinfo=timezone.utc)


def _stable_jitter(seed: str, lo: float, hi: float) -> float:
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    unit = int(digest[:8], 16) / 0xFFFFFFFF
    return lo + (hi - lo) * unit


def _level(score: float) -> RiskLevel:
    if score >= 80:
        return RiskLevel.CRITICAL
    if score >= 60:
        return RiskLevel.HIGH
    if score >= 35:
        return RiskLevel.MEDIUM
    return RiskLevel.LOW


def build_predictions(joiner_id: str, db: DataStore | None = None) -> PredictResponse:
    db = db or store
    joiner = db.get_joiner(joiner_id)
    if joiner is None:
        raise KeyError(joiner_id)
    docs = db.get_documents(joiner_id)
    ticket = db.get_ticket_for_joiner(joiner_id)
    if docs is None or ticket is None:
        raise KeyError(f"incomplete bundle for {joiner_id}")

    days = days_in_pipeline(joiner, now=AS_OF)
    bottleneck = infer_bottleneck(joiner.current_state, docs, ticket)
    alerts: list[PredictiveAlert] = []

    it_score = 12.0 + _stable_jitter(f"{joiner_id}:it", 0, 8)
    it_drivers: list[str] = []
    if ticket.sla_breached:
        it_score += 45
        it_drivers.append(
            f"Lead time {ticket.lead_time_days}d exceeds SLA {ticket.sla_target_days}d"
        )
    elif ticket.lead_time_days >= ticket.sla_target_days:
        it_score += 28
        it_drivers.append("Lead time at SLA boundary")
    if ticket.hardware_status == HardwareStatus.PENDING:
        it_score += 22
        it_drivers.append("Hardware still Pending")
    elif ticket.hardware_status == HardwareStatus.CONFIGURED:
        it_score += 10
        it_drivers.append("Hardware Configured, not Delivered")
    if docs.status == DocumentStatus.PENDING and joiner.current_state in {
        OnboardingState.OFFER_ACCEPTED,
        OnboardingState.DOCS_SUBMITTED,
    }:
        it_score += 15
        it_drivers.append("Documents still Pending — IT may stay blocked")
    if joiner.current_state == OnboardingState.DOCS_SUBMITTED:
        it_score += 8
        it_drivers.append("State DOCS_SUBMITTED awaiting provisioning")

    it_score = min(100.0, round(it_score, 1))
    if it_score >= 35 or ticket.hardware_status != HardwareStatus.DELIVERED:
        alerts.append(
            PredictiveAlert(
                id=f"{joiner_id}-PRED-IT",
                category="IT Provisioning",
                title="Laptop provisioning likely delayed"
                if it_score >= 50
                else "Laptop provisioning watch",
                message=(
                    f"Synthetic model estimates {it_score:.0f}% chance of IT delay for "
                    f"{ticket.ticket_id} (hardware: {ticket.hardware_status.value})."
                ),
                risk_score=it_score,
                risk_level=_level(it_score),
                drivers=it_drivers or ["Baseline synthetic IT risk"],
                recommended_action=(
                    "Escalate ServiceNow ticket and confirm dock/date with IT"
                    if it_score >= 60
                    else "Monitor hardware status; confirm Okta invite readiness"
                ),
                synthetic=True,
            )
        )

    docs_score = 8.0 + _stable_jitter(f"{joiner_id}:docs", 0, 6)
    docs_drivers: list[str] = []
    if docs.status == DocumentStatus.PENDING:
        docs_score += 40 + min(docs.waiting_days * 4, 24)
        docs_drivers.append(f"Packet Pending for {docs.waiting_days}d")
    if docs.rework_flag:
        docs_score += 25
        docs_drivers.append("Rework flag set on packet")
    if joiner.current_state == OnboardingState.OFFER_ACCEPTED:
        docs_score += 12
        docs_drivers.append("Still in OFFER_ACCEPTED")
    docs_score = min(100.0, round(docs_score, 1))
    if docs.status != DocumentStatus.COMPLETE or docs_score >= 35:
        alerts.append(
            PredictiveAlert(
                id=f"{joiner_id}-PRED-DOCS",
                category="Documents",
                title="Document packet at risk of delay",
                message=(
                    f"Synthetic docs risk {docs_score:.0f}% — status {docs.status.value}"
                    + (" with rework" if docs.rework_flag else "")
                    + "."
                ),
                risk_score=docs_score,
                risk_level=_level(docs_score),
                drivers=docs_drivers or ["Documents Complete — residual watch"],
                recommended_action=(
                    "Nudge joiner to finish iCIMS packet today"
                    if docs.status == DocumentStatus.PENDING
                    else "Verify packet completeness before Day-1"
                ),
                synthetic=True,
            )
        )

    overall = 10.0 + _stable_jitter(f"{joiner_id}:overall", 0, 5)
    overall_drivers: list[str] = []
    if days > 14:
        overall += 35
        overall_drivers.append(f"{days} days in pipeline")
    elif days > 7:
        overall += 18
        overall_drivers.append(f"{days} days in pipeline")
    if bottleneck:
        overall += 20
        overall_drivers.append(f"Bottleneck: {bottleneck}")
    if joiner.current_state not in {
        OnboardingState.DAY1_ORIENTED,
        OnboardingState.PROJECT_READY,
    }:
        overall += 10
        overall_drivers.append(f"State {joiner.current_state.value}")

    overall = min(
        100.0,
        round(0.45 * it_score + 0.35 * docs_score + 0.20 * overall, 1),
    )
    alerts.append(
        PredictiveAlert(
            id=f"{joiner_id}-PRED-OVERALL",
            category="Onboarding Timeline",
            title="Onboarding timeline risk",
            message=(
                f"Composite synthetic risk {overall:.0f}% that this joiner misses "
                f"the target project-ready window."
            ),
            risk_score=overall,
            risk_level=_level(overall),
            drivers=overall_drivers or ["On track vs synthetic baseline"],
            recommended_action=(
                "Review bottlenecks in Command Center and assign an owner"
                if overall >= 50
                else "Continue standard cadence; no escalation needed"
            ),
            synthetic=True,
        )
    )

    alerts.sort(key=lambda a: a.risk_score, reverse=True)
    top = alerts[0].risk_score if alerts else 0.0
    return PredictResponse(
        joiner_id=joiner_id,
        overall_risk_score=top,
        overall_risk_level=_level(top),
        alerts=alerts,
        synthetic=True,
        as_of=AS_OF,
    )
