"""Deterministic Jira cohort from SmartStart seed-42 joiners."""

from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

from jira.backend.database import JiraStore, store
from jira.backend.models import Board, Issue, IssueStatus, IssueType, Subtask

AS_OF = datetime(2026, 9, 15, 12, 0, 0, tzinfo=timezone.utc)

BOARDS = (
    ("BOARD-ONB", "ONB", "Onboarding", "SmartStart Onboarding", "Joiner onboarding stories + mentor tasks"),
    ("BOARD-ENG", "ENG", "Engineering Ramp", "Engineering", "Technical joiner ramp boards"),
    ("BOARD-OPS", "OPS", "Ops Ramp", "Operations", "Non-technical joiner ramp boards"),
)


def _status_from_state(state: str, rng: random.Random) -> IssueStatus:
    if state == "PROJECT_READY":
        return IssueStatus.DONE
    if state == "DAY1_ORIENTED":
        return IssueStatus.IN_PROGRESS
    if state in {"IT_PROVISIONED", "DOCS_SUBMITTED"}:
        return IssueStatus.TO_DO
    # OFFER_ACCEPTED / early — mix backlog and to do
    return rng.choice([IssueStatus.BACKLOG, IssueStatus.TO_DO, IssueStatus.TO_DO])


def _board_for(department: str, track: str) -> str:
    if department in {"Engineering", "Data Science", "Product", "IT Infrastructure", "Security"}:
        return "BOARD-ENG"
    if department in {"Operations", "Human Resources", "Finance", "Marketing", "Sales"}:
        return "BOARD-OPS"
    return "BOARD-ONB"


def seed_cohort(
    n_interns: int = 15,
    n_ftes: int = 15,
    seed: int = 42,
    target: JiraStore | None = None,
) -> JiraStore:
    from backend.database import DataStore
    from backend.synthetic_engine import generate_cohort

    db = target or store
    db.clear()

    for bid, key, name, project, desc in BOARDS:
        db.boards[bid] = Board(
            id=bid, key=key, name=name, project=project, description=desc, issue_count=0
        )

    ss = DataStore()
    generate_cohort(n_interns=n_interns, n_ftes=n_ftes, seed=seed, target_store=ss)
    rng = random.Random(seed + 19)
    now = AS_OF

    for idx, joiner in enumerate(ss.list_joiners(), start=1):
        parts = joiner.id.rsplit("-", 1)
        ordinal = int(parts[1]) if len(parts) == 2 and parts[1].isdigit() else idx
        key = f"ONB-{ordinal}"
        board_id = _board_for(joiner.department, joiner.department_track.value)
        # Always also count on ONB board for the main onboarding space
        status = _status_from_state(joiner.current_state.value, rng)

        first, _, last = joiner.name.partition(" ")
        last = last or first
        # Mentor is assignee (work owner); manager is reporter
        mentor_email = (
            f"{joiner.mentor_name.split()[0].lower()}.{joiner.mentor_name.split()[-1].lower()}"
            f"@synthetic.example"
        )

        subtasks = [
            Subtask(
                id=f"{key}-S{i + 1}",
                summary=task,
                done=status == IssueStatus.DONE or (status == IssueStatus.IN_PROGRESS and i == 0),
            )
            for i, task in enumerate(joiner.assigned_tasks)
        ]

        issue = Issue(
            key=key,
            summary=f"Onboard {joiner.name} — {joiner.learning_track}",
            issue_type=IssueType.STORY,
            status=status,
            assignee=joiner.mentor_name,
            assignee_email=mentor_email,
            reporter=joiner.manager_name,
            project="ONB",
            board_id=board_id,
            learning_track=joiner.learning_track,
            department=joiner.department,
            role_type=joiner.role_type.value,
            labels=["onboarding", joiner.role_type.value.lower(), "synthetic"],
            subtasks=subtasks,
            smartstart_joiner_id=joiner.id,
            joiner_name=joiner.name,
            created_at=joiner.offer_accepted_at,
            updated_at=now - timedelta(hours=rng.randint(1, 72)),
        )
        db.issues[key] = issue
        db.boards[board_id].issue_count += 1
        db.boards["BOARD-ONB"].issue_count += 1  # ONB aggregates all

    # Also put every issue on ONB board logically — board filter can include all ONB-* keys
    return db
