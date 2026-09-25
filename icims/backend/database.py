"""In-memory store for standalone mock iCIMS."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from icims.backend.models import (
    Candidate,
    HireDocument,
    IntegrationEvent,
    NewHire,
    Offer,
    Requisition,
)


@dataclass
class IcimsStore:
    requisitions: dict[str, Requisition] = field(default_factory=dict)
    candidates: dict[str, Candidate] = field(default_factory=dict)
    offers: dict[str, Offer] = field(default_factory=dict)
    new_hires: dict[str, NewHire] = field(default_factory=dict)
    documents: dict[str, HireDocument] = field(default_factory=dict)
    events: list[IntegrationEvent] = field(default_factory=list)

    def clear(self) -> None:
        self.requisitions.clear()
        self.candidates.clear()
        self.offers.clear()
        self.new_hires.clear()
        self.documents.clear()
        self.events.clear()

    def list_candidates(self) -> list[Candidate]:
        return sorted(self.candidates.values(), key=lambda c: c.id)

    def list_requisitions(self) -> list[Requisition]:
        return sorted(self.requisitions.values(), key=lambda r: r.id)

    def list_offers(self) -> list[Offer]:
        return sorted(self.offers.values(), key=lambda o: o.id)

    def list_new_hires(self) -> list[NewHire]:
        return sorted(self.new_hires.values(), key=lambda h: h.employee_id)

    def list_documents(self) -> list[HireDocument]:
        return sorted(self.documents.values(), key=lambda d: d.id)

    def list_events(self) -> list[IntegrationEvent]:
        return list(reversed(self.events))

    def get_candidate(self, candidate_id: str) -> Optional[Candidate]:
        return self.candidates.get(candidate_id)

    def get_offer(self, offer_id: str) -> Optional[Offer]:
        return self.offers.get(offer_id)

    def get_hire(self, employee_id: str) -> Optional[NewHire]:
        return self.new_hires.get(employee_id)

    def get_document(self, document_id: str) -> Optional[HireDocument]:
        return self.documents.get(document_id)

    def append_event(self, event: IntegrationEvent) -> None:
        self.events.append(event)


store = IcimsStore()
