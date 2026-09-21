"""In-memory stores for Layer 1 — source systems vs SmartStart."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional

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

    def copy_from(self, other: "DataStore") -> int:
        """Replace contents with a deep copy of another store. Returns joiner count."""
        self.clear()
        for joiner in other.list_joiners():
            docs = other.get_documents(joiner.id)
            ticket = other.get_ticket_for_joiner(joiner.id)
            if docs is None or ticket is None:
                continue
            self.upsert_bundle(
                joiner.model_copy(deep=True),
                docs.model_copy(deep=True),
                ticket.model_copy(deep=True),
            )
        return len(self.joiners)


@dataclass
class IngestRunLog:
    """Last (and history of) SmartStart ingest runs from mock source systems."""

    last_run: Optional[dict[str, Any]] = None
    history: list[dict[str, Any]] = field(default_factory=list)

    def record(self, payload: dict[str, Any]) -> None:
        self.last_run = payload
        self.history.insert(0, payload)
        self.history = self.history[:20]


# Systems of record (mock iCIMS / ServiceNow / Jira) — generated here first.
source_store = DataStore()

# SmartStart operational store — populated only via ingest from source_store.
store = DataStore()

ingest_log = IngestRunLog()
