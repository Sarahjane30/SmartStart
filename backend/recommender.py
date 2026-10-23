"""Layer 4 — synthetic adaptive learning recommendations."""

from __future__ import annotations

from backend.database import DataStore, store
from backend.employee_experience import build_learning_track
from backend.models import (
    ModuleStatus,
    RecommendationItem,
    RecommendationsResponse,
    RoleType,
)

_STATUS_PROGRESS = {
    ModuleStatus.COMPLETE: 100.0,
    ModuleStatus.IN_PROGRESS: 55.0,
    ModuleStatus.AVAILABLE: 15.0,
    ModuleStatus.LOCKED: 0.0,
}


def _priority_for(status: ModuleStatus, rank: int) -> int:
    base = {
        ModuleStatus.IN_PROGRESS: 1,
        ModuleStatus.AVAILABLE: 2,
        ModuleStatus.LOCKED: 4,
        ModuleStatus.COMPLETE: 5,
    }[status]
    return min(5, max(1, base + (0 if rank < 2 else 1)))


def _reason(role_type: RoleType, title: str, status: ModuleStatus, category: str) -> str:
    if status == ModuleStatus.IN_PROGRESS:
        return f"In progress — finish “{title}” to keep your track moving."
    if status == ModuleStatus.AVAILABLE:
        if role_type == RoleType.INTERN and "Git" in title:
            return "Intern focus: complete Git Basics before your mentor check-in."
        if role_type == RoleType.INTERN and "mentor" in title.lower():
            return "Intern focus: schedule Meet your mentor early."
        if role_type == RoleType.FTE and "readiness" in title.lower():
            return "FTE focus: Project Readiness unlocks assignment."
        if role_type == RoleType.FTE and "department" in category.lower():
            return "FTE focus: department modules before project kickoff."
        return f"Next unlocked module in your {category} path."
    if status == ModuleStatus.LOCKED:
        return "Unlocks as you advance onboarding states — plan ahead."
    return "Completed — keep as reference."


def build_recommendations(
    joiner_id: str, db: DataStore | None = None
) -> RecommendationsResponse:
    db = db or store
    joiner = db.get_joiner(joiner_id)
    if joiner is None:
        raise KeyError(joiner_id)

    track = build_learning_track(joiner_id, db=db)

    def boost(title: str) -> int:
        if joiner.role_type == RoleType.INTERN:
            if "Git" in title or "mentor" in title.lower():
                return -1
        else:
            if "readiness" in title.lower() or "department" in title.lower():
                return -1
        return 0

    ordered = sorted(
        track.modules,
        key=lambda m: (
            0
            if m.status == ModuleStatus.IN_PROGRESS
            else 1
            if m.status == ModuleStatus.AVAILABLE
            else 2
            if m.status == ModuleStatus.LOCKED
            else 3,
            boost(m.title),
            m.title,
        ),
    )

    picks = [m for m in ordered if m.status != ModuleStatus.COMPLETE][:5]
    if len(picks) < 3:
        completes = [m for m in ordered if m.status == ModuleStatus.COMPLETE]
        picks.extend(completes[: 3 - len(picks)])

    recommendations: list[RecommendationItem] = []
    for idx, mod in enumerate(picks):
        recommendations.append(
            RecommendationItem(
                id=f"{joiner_id}-REC-{idx + 1}",
                module_id=mod.id,
                title=mod.title,
                reason=_reason(joiner.role_type, mod.title, mod.status, mod.category),
                priority=_priority_for(mod.status, idx),
                estimated_minutes=mod.duration_minutes,
                progress_pct=_STATUS_PROGRESS[mod.status],
                status=mod.status,
                category=mod.category,
                synthetic=True,
            )
        )

    focus = (
        "Mentor-guided foundations (Git / communication)"
        if joiner.role_type == RoleType.INTERN
        else "Department fluency + project readiness"
    )

    return RecommendationsResponse(
        joiner_id=joiner_id,
        role_type=joiner.role_type,
        department_track=joiner.department_track,
        focus=focus,
        recommendations=recommendations,
        track_completion_pct=track.completion_pct,
        synthetic=True,
    )
