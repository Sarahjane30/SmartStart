"""In-memory store for standalone mock ServiceNow."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from servicenow.backend.models import (
    CatalogItem,
    Incident,
    IntegrationEvent,
    RequestItem,
)


@dataclass
class SnowStore:
    catalog: dict[str, CatalogItem] = field(default_factory=dict)
    requests: dict[str, RequestItem] = field(default_factory=dict)
    incidents: dict[str, Incident] = field(default_factory=dict)
    events: list[IntegrationEvent] = field(default_factory=list)

    def clear(self) -> None:
        self.catalog.clear()
        self.requests.clear()
        self.incidents.clear()
        self.events.clear()

    def list_requests(self) -> list[RequestItem]:
        return sorted(self.requests.values(), key=lambda r: r.number)

    def list_incidents(self) -> list[Incident]:
        return sorted(self.incidents.values(), key=lambda i: i.number, reverse=True)

    def list_catalog(self) -> list[CatalogItem]:
        return sorted(self.catalog.values(), key=lambda c: c.id)

    def list_events(self) -> list[IntegrationEvent]:
        return list(reversed(self.events))

    def get_request(self, number: str) -> Optional[RequestItem]:
        return self.requests.get(number)

    def get_incident(self, number: str) -> Optional[Incident]:
        return self.incidents.get(number)

    def append_event(self, event: IntegrationEvent) -> None:
        self.events.append(event)


store = SnowStore()
