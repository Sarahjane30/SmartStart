"""In-memory store for Layer 1 synthetic onboarding data."""

from __future__ import annotations

from dataclasses import dataclass, field

from backend.models import DocumentSubmission, ITProvisioningTicket, Joiner


@dataclass
class DataStore:
    joiners: dict[str, Joiner] = field(default_factory=dict)
    documents: dict[str, DocumentSubmission] = field(default_factory=dict)
    it_tickets: dict[str, ITProvisioningTicket] = field(default_factory=dict)

    def clear(self) -> None:
        self.joiners.clear()
        self.documents.clear()
        self.it_tickets.clear()

    def upsert_bundle(
        self,
        joiner: Joiner,
        documents: DocumentSubmission,
        it_ticket: ITProvisioningTicket,
    ) -> None:
        self.joiners[joiner.id] = joiner
        self.documents[joiner.id] = documents
        self.it_tickets[it_ticket.ticket_id] = it_ticket

    def list_joiners(self) -> list[Joiner]:
        return sorted(self.joiners.values(), key=lambda j: (j.joining_date, j.id))

    def get_joiner(self, joiner_id: str) -> Joiner | None:
        return self.joiners.get(joiner_id)

    def get_documents(self, joiner_id: str) -> DocumentSubmission | None:
        return self.documents.get(joiner_id)

    def get_ticket_for_joiner(self, joiner_id: str) -> ITProvisioningTicket | None:
        for ticket in self.it_tickets.values():
            if ticket.joiner_id == joiner_id:
                return ticket
        return None


store = DataStore()
