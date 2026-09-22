"""Pydantic models for standalone mock Jira."""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class IssueStatus(str, Enum):
    BACKLOG = "Backlog"
    TO_DO = "To Do"
    IN_PROGRESS = "In Progress"
    DONE = "Done"


class IssueType(str, Enum):
    STORY = "Story"
    TASK = "Task"
    SUBTASK = "Sub-task"


class DeliveryStatus(str, Enum):
    QUEUED = "Queued"
    DELIVERED = "Delivered"
    FAILED = "Failed"
    RETRY = "Retry"


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    username: str
    display_name: str
    title: str
    synthetic: bool = True
    message: str = "Synthetic Jira demo session — not real authentication."


class Board(BaseModel):
    id: str
    key: str
    name: str
    project: str
    description: str
    issue_count: int = 0
    synthetic: bool = True


class Subtask(BaseModel):
    id: str
    summary: str
    done: bool = False


class Issue(BaseModel):
    key: str
    summary: str
    issue_type: IssueType = IssueType.STORY
    status: IssueStatus
    assignee: str
    assignee_email: EmailStr
    reporter: str
    project: str = "ONB"
    board_id: str
    learning_track: str
    department: str
    role_type: str
    labels: list[str] = Field(default_factory=list)
    subtasks: list[Subtask] = Field(default_factory=list)
    smartstart_joiner_id: str
    joiner_name: str
    updated_at: datetime
    created_at: datetime
    synthetic: bool = True


class IntegrationEvent(BaseModel):
    id: str
    event_type: str
    record_id: str
    payload: dict
    delivery: DeliveryStatus
    created_at: datetime
    transmitted_at: Optional[datetime] = None
    synthetic: bool = True
