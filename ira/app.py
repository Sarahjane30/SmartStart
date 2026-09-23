"""IRA desktop application orchestrator — independent of SmartStart UI."""

from __future__ import annotations

import sys
from typing import Optional

from PySide6.QtCore import QTimer, Qt
from PySide6.QtGui import QGuiApplication
from PySide6.QtWidgets import QApplication

from ira.brain import answer, greeting, proactive_tips, suggestions_for
from ira.bubble import IraBubble
from ira.chat_panel import ChatPanel
from ira.client import SmartStartClient
from ira.config import load_config, update_config


class IraApp:
    """Tiny always-on-top companion: bubble ↔ chat panel."""

    def __init__(self) -> None:
        self.cfg = load_config()
        self.client = SmartStartClient(self.cfg.get("smartstart_base_url"))
        self.ctx: Optional[dict] = None
        self.online = False
        self._expanded = False
        self._last_tips: list[str] = []

        self.bubble = IraBubble()
        self.panel = ChatPanel()

        self.bubble.clicked.connect(self.expand)
        self.bubble.moved_to.connect(self._persist_bubble_pos)
        self.panel.minimize_requested.connect(self.minimize)
        self.panel.close_requested.connect(self.quit)
        self.panel.send_message.connect(self._on_send)
        self.panel.employee_changed.connect(self._on_employee)
        self.panel.refresh_requested.connect(self.refresh_context)

        self._place_bubble()
        self.bubble.show()
        self.bubble.raise_()
        self.bubble.activateWindow()

        self._poll = QTimer()
        self._poll.timeout.connect(self._heartbeat)
        self._poll.start(12_000)
        QTimer.singleShot(200, self._bootstrap)
        # Open chat once so Windows users notice IRA is not a website
        QTimer.singleShot(600, self.expand)

    def _place_bubble(self) -> None:
        screen = QGuiApplication.primaryScreen()
        geo = screen.availableGeometry() if screen else None
        x = self.cfg.get("bubble_x")
        y = self.cfg.get("bubble_y")
        if x is None or y is None:
            if geo:
                x = geo.right() - self.bubble.width() - 24
                y = geo.bottom() - self.bubble.height() - 24
            else:
                x, y = 100, 100
        x, y = int(x), int(y)
        # Clamp onto the visible desktop (bad saved coords hide IRA on Windows)
        if geo is not None:
            max_x = geo.right() - self.bubble.width()
            max_y = geo.bottom() - self.bubble.height()
            x = min(max(geo.left() + 8, x), max_x)
            y = min(max(geo.top() + 8, y), max_y)
        self.bubble.move(x, y)

    def _persist_bubble_pos(self, x: int, y: int) -> None:
        self.cfg = update_config(bubble_x=x, bubble_y=y)

    def _bootstrap(self) -> None:
        self.refresh_context()
        self._load_employees()
        emp_id = self.cfg.get("employee_id")
        if emp_id:
            self._select_employee(str(emp_id), greet=True)
        else:
            self.panel.clear_chat()
            self.panel.add_message(greeting(None), role="ira")
            self.panel.set_suggestions(suggestions_for(None))

    def _heartbeat(self) -> None:
        was = self.online
        self.online = self.client.available()
        self.panel.set_online(self.online)
        if self.online and self.cfg.get("employee_id"):
            try:
                self.ctx = self.client.context(str(self.cfg["employee_id"]))
            except Exception:
                self.ctx = None
            tips = proactive_tips(self.ctx)
            new = [t for t in tips if t not in self._last_tips]
            if new and not self._expanded:
                self.bubble.pulse_notify()
                self.bubble.caption.setText("IRA · tip")
                QTimer.singleShot(4000, lambda: self.bubble.caption.setText("IRA"))
            self._last_tips = tips
        if self.online and not was:
            self._load_employees()

    def _load_employees(self) -> None:
        if not self.client.available():
            self.online = False
            self.panel.set_online(False)
            return
        try:
            employees = self.client.list_employees()
            self.online = True
            self.panel.set_online(True)
            # Prefer Sarah Jane in the list order for demos
            employees = sorted(
                employees,
                key=lambda e: (0 if "Sarah Jane" in str(e.get("name")) else 1, e.get("name") or ""),
            )
            self.panel.set_employees(employees, self.cfg.get("employee_id"))
        except Exception:
            self.online = False
            self.panel.set_online(False)

    def refresh_context(self) -> None:
        self.online = self.client.available()
        self.panel.set_online(self.online)
        emp_id = self.cfg.get("employee_id")
        if not emp_id or not self.online:
            return
        try:
            self.ctx = self.client.context(str(emp_id))
            self.panel.set_suggestions(suggestions_for(self.ctx))
        except Exception:
            self.ctx = None

    def _select_employee(self, employee_id: str, *, greet: bool = True) -> None:
        self.cfg = update_config(employee_id=employee_id)
        self.refresh_context()
        if greet:
            self.panel.clear_chat()
            self.panel.add_message(greeting(self.ctx), role="ira")
            tips = proactive_tips(self.ctx)
            if tips:
                self.panel.add_message("Quick update:\n" + "\n".join(f"• {t}" for t in tips), role="ira")
            self.panel.set_suggestions(suggestions_for(self.ctx))

    def _on_employee(self, employee_id: str) -> None:
        self._select_employee(employee_id, greet=True)

    def expand(self) -> None:
        if self._expanded:
            return
        self._expanded = True
        bx, by = self.bubble.x(), self.bubble.y()
        self.panel.move(max(8, bx - self.panel.width() + self.bubble.width()), max(8, by - self.panel.height() + 40))
        self.bubble.hide()
        self.panel.show()
        self.panel.raise_()
        self.panel.activateWindow()
        self.refresh_context()
        self._load_employees()

    def minimize(self) -> None:
        self._expanded = False
        # Anchor bubble near panel if still on screen
        self.bubble.move(self.panel.x() + self.panel.width() - self.bubble.width(), self.panel.y() + self.panel.height() - self.bubble.height())
        self._persist_bubble_pos(self.bubble.x(), self.bubble.y())
        self.panel.hide()
        self.bubble.show()
        self.bubble.raise_()

    def quit(self) -> None:
        self._persist_bubble_pos(self.bubble.x(), self.bubble.y())
        QApplication.instance().quit()

    def _on_send(self, text: str) -> None:
        self.panel.add_message(text, role="user")
        tip = self.panel.show_typing()

        def _reply() -> None:
            tip.deleteLater()
            # Fresh context when online so status changes show up mid-demo
            if self.online and self.cfg.get("employee_id"):
                try:
                    self.ctx = self.client.context(str(self.cfg["employee_id"]))
                except Exception:
                    pass
            reply = answer(text, self.ctx, online=self.online)
            self.panel.add_message(reply, role="ira")
            self.panel.set_suggestions(suggestions_for(self.ctx))

        QTimer.singleShot(350, _reply)


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv
    # High-DPI friendly
    QApplication.setHighDpiScaleFactorRoundingPolicy(
        Qt.HighDpiScaleFactorRoundingPolicy.PassThrough
    )
    app = QApplication(argv)
    app.setApplicationName("IRA")
    app.setQuitOnLastWindowClosed(True)
    print()
    print("=" * 56)
    print("  IRA desktop companion is starting…")
    print("  This is NOT a website / NOT http://127.0.0.1:8000")
    print("  Look for the blue IRA bubble on your Windows desktop")
    print("  (bottom-right). It also appears in the taskbar as IRA.")
    print("  Keep SmartStart running in the other terminal.")
    print("=" * 56)
    print()
    _ = IraApp()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
