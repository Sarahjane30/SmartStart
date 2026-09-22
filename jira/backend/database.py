"""In-memory store for standalone mock Jira."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from jira.backend.models import Board, IntegrationEvent, Issue


@dataclass
class JiraStore:
    boards: dict[str, Board] = field(default_factory=dict)
    issues: dict[str, Issue] = field(default_factory=dict)
    events: list[IntegrationEvent] = field(default_factory=list)

    def clear(self) -> None:
        self.boards.clear()
        self.issues.clear()
        self.events.clear()

    def list_boards(self) -> list[Board]:
        return sorted(self.boards.values(), key=lambda b: b.key)

    def list_issues(self) -> list[Issue]:
        return sorted(self.issues.values(), key=lambda i: i.key)

    def list_events(self) -> list[IntegrationEvent]:
        return list(reversed(self.events))

    def get_board(self, board_id: str) -> Optional[Board]:
        return self.boards.get(board_id)

    def get_issue(self, key: str) -> Optional[Issue]:
        return self.issues.get(key)

    def append_event(self, event: IntegrationEvent) -> None:
        self.events.append(event)


store = JiraStore()
