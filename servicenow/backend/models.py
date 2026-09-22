"""Pydantic models for standalone mock ServiceNow ITSM."""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class TicketState(str, Enum):
    NEW = "1 - New"
    WIP = "2 - Work in Progress"
    PENDING = "3 - Pending"
    RESOLVED = "4 - Resolved"
    CLOSED = "5 - Closed Complete"


class HardwareStatus(str, Enum):
    PENDING = "Pending"
    ORDERED = "Ordered"
    CONFIGURED = "Configured"
    DELIVERED = "Delivered"


class Priority(str, Enum):
    P1 = "1 - Critical"
    P2 = "2 - High"
    P3 = "3 - Moderate"
    P4 = "4 - Low"


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
    message: str = "Synthetic ServiceNow demo session — not real authentication."


class ActivityItem(BaseModel):
    at: datetime
    label: str
    detail: Optional[str] = None


class CatalogItem(BaseModel):
    id: str
    name: str
    category: str
    description: str
    active: bool = True
    synthetic: bool = True


class RequestItem(BaseModel):
    number: str
    short_description: str
    requested_for: str
    requested_for_email: EmailStr
    assignment_group: str = "IT Onboarding"
    assigned_to: str = "Riley Chen"
    state: TicketState
    priority: Priority = Priority.P3
    hardware_status: HardwareStatus
    software_access: list[str] = Field(default_factory=list)
    access_granted: bool = False
    sla_target_days: int = 3
    lead_time_days: int = 0
    sla_breached: bool = False
    opened_at: datetime
    updated_at: datetime
    due_date: date
    department: str
    manager: str
    employment_type: str
    smartstart_joiner_id: str
    smartstart_ticket_id: str
    activity: list[ActivityItem] = Field(default_factory=list)
    synthetic: bool = True


class Incident(BaseModel):
    number: str
    short_description: str
    caller: str
    state: TicketState
    priority: Priority
    assignment_group: str
    opened_at: datetime
    related_ritm: Optional[str] = None
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


class DashboardResponse(BaseModel):
    open_requests: int
    hardware_pending: int
    hardware_configured: int
    awaiting_delivery: int
    access_pending: int
    sla_breached: int
    closed_complete: int
    by_state: dict[str, int]
    by_hardware: dict[str, int]
    urgent: list[dict]
    synthetic: bool = True
