"""IRA desktop application orchestrator — independent of SmartStart UI."""

from __future__ import annotations

import sys
import webbrowser
from pathlib import Path
from typing import Optional

from PySide6.QtCore import QTimer, Qt
from PySide6.QtGui import QGuiApplication
from PySide6.QtWidgets import QApplication

from ira.brain import answer, greeting, suggestions_for
from ira.bubble import IraBubble
from ira.chat_panel import ChatPanel, PanelMode
from ira.client import SmartStartClient
from ira.config import load_config, update_config


class IraApp:
    """Collapsed bubble ↔ compact / expanded chat panel."""

    def __init__(self) -> None:
        self.cfg = load_config()
        self.client = SmartStartClient(self.cfg.get("smartstart_base_url"))
        self.ctx: Optional[dict] = None
        self.online = False
        self._panel_open = False
        self._session_id: str | None = None

        self.bubble = IraBubble()
        self.panel = ChatPanel()

        self.bubble.clicked.connect(self.open_panel)
        self.bubble.moved_to.connect(self._persist_bubble_pos)
        self.panel.minimize_requested.connect(self.minimize)
        self.panel.close_requested.connect(self.quit)
        self.panel.send_message.connect(self._on_send)
        self.panel.open_smartstart_requested.connect(self.open_smartstart)

        self._place_bubble()
        self.bubble.show()
        self.bubble.raise_()

        self._poll = QTimer()
        self._poll.timeout.connect(self._heartbeat)
        self._poll.start(2_000)
        QTimer.singleShot(200, self._bootstrap)
        # Open compact panel once so the login state is obvious
        QTimer.singleShot(400, self.open_panel)

    def _place_bubble(self) -> None:
        screen = QGuiApplication.primaryScreen()
        geo = screen.availableGeometry() if screen else None
        x = self.cfg.get("bubble_x")
        y = self.cfg.get("bubble_y")
        if x is None or y is None:
            if geo:
                x = geo.right() - self.bubble.width() - 20
                y = geo.bottom() - self.bubble.height() - 20
            else:
                x, y = 100, 100
        x, y = int(x), int(y)
        if geo is not None:
            x = min(max(geo.left() + 8, x), geo.right() - self.bubble.width())
            y = min(max(geo.top() + 8, y), geo.bottom() - self.bubble.height())
        self.bubble.move(x, y)

    def _persist_bubble_pos(self, x: int, y: int) -> None:
        self.cfg = update_config(bubble_x=x, bubble_y=y)

    def _place_panel(self) -> None:
        screen = QGuiApplication.primaryScreen()
        geo = screen.availableGeometry() if screen else None
        if geo:
            x = geo.right() - self.panel.width() - 20
            y = geo.bottom() - self.panel.height() - 20
            self.panel.move(max(geo.left() + 8, x), max(geo.top() + 8, y))
        else:
            self.panel.move(
                max(8, self.bubble.x() - self.panel.width() + self.bubble.width()),
                max(8, self.bubble.y() - self.panel.height() + 40),
            )

    def open_smartstart(self) -> None:
        webbrowser.open(self.client.portal_login_url())
        self.panel.auth_status.setText("● Waiting for SmartStart…")
        self.panel.auth_status.setStyleSheet("color:#9db2ff; font-size:13px;")

    def _bootstrap(self) -> None:
        self.online = self.client.available()
        self.panel.set_online(self.online)
        self._sync_session(force_greet=True)

    def _heartbeat(self) -> None:
        self.online = self.client.available()
        self.panel.set_online(self.online)
        self._sync_session(force_greet=False)

    def _sync_session(self, *, force_greet: bool) -> None:
        if not self.online:
            self.panel.set_locked(True)
            self._session_id = None
            self.ctx = None
            return

        data = self.client.active_session()
        sess = data.get("session") if data.get("active") else None
        if not sess:
            if self._session_id is not None or force_greet:
                self._session_id = None
                self.ctx = None
                self.panel.set_locked(True)
                self.panel.clear_chat()
            return

        emp_id = str(sess.get("employee_id") or "")
        name = str(sess.get("employee_name") or "Employee")
        role = str(sess.get("role_type") or "")
        dept = str(sess.get("department") or "")
        if not emp_id:
            self.panel.set_locked(True)
            return

        changed = emp_id != self._session_id
        self._session_id = emp_id
        self.cfg = update_config(employee_id=emp_id)
        try:
            self.ctx = self.client.context(emp_id)
        except Exception:
            self.ctx = None

        self.panel.set_locked(False, name=name, role=role, dept=dept)
        if changed or force_greet:
            self.panel.clear_chat()
            self.panel.add_message(greeting(self.ctx), role="ira")
            self.panel.set_suggestions(suggestions_for(self.ctx))

    def open_panel(self) -> None:
        if self._panel_open:
            return
        self._panel_open = True
        self.panel.apply_mode(PanelMode.NORMAL)
        self._place_panel()
        self.bubble.hide()
        self.panel.show()
        self.panel.raise_()
        self.panel.activateWindow()
        self._sync_session(force_greet=False)

    def minimize(self) -> None:
        self._panel_open = False
        # Park bubble near panel's bottom-right
        self.bubble.move(
            self.panel.x() + self.panel.width() - self.bubble.width(),
            self.panel.y() + self.panel.height() - self.bubble.height(),
        )
        self._persist_bubble_pos(self.bubble.x(), self.bubble.y())
        self.panel.hide()
        self.bubble.show()
        self.bubble.raise_()

    def quit(self) -> None:
        self._persist_bubble_pos(self.bubble.x(), self.bubble.y())
        QApplication.instance().quit()

    def _on_send(self, text: str) -> None:
        if not self._session_id:
            self.panel.set_locked(True)
            return
        self.panel.add_message(text, role="user")
        tip = self.panel.show_typing()

        def _reply() -> None:
            tip.deleteLater()
            if self.online and self._session_id:
                try:
                    self.ctx = self.client.context(self._session_id)
                except Exception:
                    pass
            reply = answer(text, self.ctx, online=self.online and bool(self.ctx))
            self.panel.add_message(reply, role="ira")

        QTimer.singleShot(300, _reply)


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv
    try:
        QApplication.setHighDpiScaleFactorRoundingPolicy(
            Qt.HighDpiScaleFactorRoundingPolicy.Round
        )
        app = QApplication(argv)
        app.setApplicationName("IRA")
        app.setQuitOnLastWindowClosed(True)
        import ira as _ira_pkg

        pkg = Path(_ira_pkg.__file__).resolve().parent
        print()
        print("=" * 52)
        print("  IRA — I know Waters")
        print(f"  {pkg}")
        print("  SmartStart navy · ask me anything")
        print("  Connect via SmartStart employee sign-in")
        print("=" * 52)
        print()
        _ = IraApp()
        return app.exec()
    except Exception:
        import traceback

        print("\n*** IRA failed to start ***\n", file=sys.stderr)
        traceback.print_exc()
        if sys.platform.startswith("win"):
            try:
                input("\nPress Enter to close… ")
            except EOFError:
                pass
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
