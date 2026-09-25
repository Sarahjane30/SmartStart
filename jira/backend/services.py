"""Issue transitions and events for mock Jira."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from jira.backend.database import JiraStore, store
from jira.backend.models import (
    DeliveryStatus,
    IntegrationEvent,
    IssueStatus,
)
from jira.backend.seed import AS_OF

STATUS_ORDER = [
    IssueStatus.BACKLOG,
    IssueStatus.TO_DO,
    IssueStatus.IN_PROGRESS,
    IssueStatus.DONE,
]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _emit(
    db: JiraStore,
    event_type: str,
    record_id: str,
    payload: dict[str, Any],
) -> IntegrationEvent:
    now = _now()
    event = IntegrationEvent(
        id=f"EVT-{len(db.events) + 1:05d}",
        event_type=event_type,
        record_id=record_id,
        payload=payload,
        delivery=DeliveryStatus.DELIVERED,
        created_at=now,
        transmitted_at=now,
    )
    db.append_event(event)
    return event


def transition_issue(key: str, status: str, db: JiraStore | None = None) -> dict:
    db = db or store
    issue = db.get_issue(key)
    if issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    try:
        new_status = IssueStatus(status)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid status: {status}") from exc

    old = issue.status
    issue.status = new_status
    issue.updated_at = _now()
    if new_status == IssueStatus.DONE:
        for st in issue.subtasks:
            st.done = True

    event_type = "ISSUE_UPDATED"
    if new_status == IssueStatus.IN_PROGRESS and old != IssueStatus.IN_PROGRESS:
        event_type = "ISSUE_STARTED"
    elif new_status == IssueStatus.DONE:
        event_type = "PROJECT_READY"

    payload = {
        "event_type": event_type,
        "issue_key": issue.key,
        "summary": issue.summary,
        "status": issue.status.value,
        "previous_status": old.value,
        "assignee": issue.assignee,
        "reporter": issue.reporter,
        "joiner_name": issue.joiner_name,
        "department": issue.department,
        "learning_track": issue.learning_track,
        "smartstart_joiner_id": issue.smartstart_joiner_id,
        "timestamp": _now().isoformat(),
    }
    event = _emit(db, event_type, issue.key, payload)
    return {"issue": issue, "event": event}


def complete_subtask(key: str, subtask_id: str, db: JiraStore | None = None) -> dict:
    db = db or store
    issue = db.get_issue(key)
    if issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")
    st = next((s for s in issue.subtasks if s.id == subtask_id), None)
    if st is None:
        raise HTTPException(status_code=404, detail="Sub-task not found")
    st.done = True
    issue.updated_at = _now()
    event = _emit(
        db,
        "SUBTASK_DONE",
        issue.key,
        {
            "event_type": "SUBTASK_DONE",
            "issue_key": issue.key,
            "subtask_id": subtask_id,
            "summary": st.summary,
            "smartstart_joiner_id": issue.smartstart_joiner_id,
            "timestamp": _now().isoformat(),
        },
    )
    # Auto-progress to In Progress if still To Do
    if issue.status in {IssueStatus.BACKLOG, IssueStatus.TO_DO}:
        issue.status = IssueStatus.IN_PROGRESS
    if all(s.done for s in issue.subtasks) and issue.subtasks:
        return transition_issue(key, IssueStatus.DONE.value, db=db)
    return {"issue": issue, "event": event}


def assigned_to_me(db: JiraStore | None = None) -> dict:
    """Group open issues by status for the For you / Assigned list."""
    db = db or store
    # Demo: show all onboarding issues (mentor assignees vary); UI labels as Assigned
    issues = [i for i in db.list_issues() if i.status != IssueStatus.DONE]
    done = [i for i in db.list_issues() if i.status == IssueStatus.DONE]
    groups: dict[str, list] = {s.value: [] for s in STATUS_ORDER}
    for issue in issues:
        groups[issue.status.value].append(issue.model_dump(mode="json"))
    return {
        "total_open": len(issues),
        "total_done": len(done),
        "groups": groups,
        "synthetic": True,
    }


def board_columns(board_id: str, db: JiraStore | None = None) -> dict:
    db = db or store
    board = db.get_board(board_id)
    if board is None:
        raise HTTPException(status_code=404, detail="Board not found")
    if board_id == "BOARD-ONB":
        issues = db.list_issues()
    else:
        issues = [i for i in db.list_issues() if i.board_id == board_id]
    columns = {s.value: [] for s in STATUS_ORDER}
    for issue in issues:
        columns[issue.status.value].append(issue.model_dump(mode="json"))
    return {
        "board": board.model_dump(mode="json"),
        "columns": columns,
        "total": len(issues),
        "synthetic": True,
    }


def integration_status(db: JiraStore | None = None) -> dict:
    db = db or store
    events = db.list_events()
    last = events[0] if events else None
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
                "records_transmitted": len(events) + 30,
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
        "note": "Mock Jira integration view — does not embed SmartStart.",
    }
