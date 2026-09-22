"""HTTP client for SmartStart IRA APIs — never touches SmartStart frontend."""

from __future__ import annotations

from typing import Any, Optional

import httpx

from ira.config import load_config


class SmartStartClient:
    def __init__(self, base_url: str | None = None, timeout: float = 4.0) -> None:
        self.base_url = (base_url or load_config()["smartstart_base_url"]).rstrip("/")
        self.timeout = timeout

    def _get(self, path: str) -> Any:
        with httpx.Client(base_url=self.base_url, timeout=self.timeout) as client:
            res = client.get(path)
            res.raise_for_status()
            return res.json()

    def health(self) -> Optional[dict]:
        try:
            with httpx.Client(base_url=self.base_url, timeout=2.0) as client:
                res = client.get("/health")
                if res.status_code == 200:
                    return res.json()
        except Exception:
            return None
        return None

    def list_employees(self) -> list[dict]:
        data = self._get("/api/ira/employees")
        return list(data.get("employees") or [])

    def context(self, employee_id: str) -> dict:
        return self._get(f"/api/ira/{employee_id}/context")

    def available(self) -> bool:
        return self.health() is not None
