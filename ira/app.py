"""IRA desktop application orchestrator — independent of SmartStart UI."""

from __future__ import annotations

import sys
import webbrowser
from pathlib import Path
from typing import Optional

from PySide6.QtCore import QTimer, Qt, QRect
from PySide6.QtGui import QGuiApplication
from PySide6.QtWidgets import QApplication, QWidget

from ira.brain import greeting, suggestions_for
from ira.bubble import IraBubble
from ira.chat_panel import ChatPanel, PanelMode
from ira.client import SmartStartClient
from ira.config import load_config, update_config
from ira.desktop_flow import DesktopConversation, wants_onboarding

# Park unused windows here — NEVER hide() them on Windows (hide can kill Tool UIs)
_PARK = QRect(-12000, -12000, 64, 64)


class IraApp:
    """Collapsed bubble ↔ compact / expanded chat panel."""

    def __init__(self) -> None:
        self.cfg = load_config()
        self.client = SmartStartClient(self.cfg.get("smartstart_base_url"))
        self.ctx: Optional[dict] = None
        self.online = False
        self._panel_open = False
        self._session_id: str | None = None
        self._panel_home = QRect()

        # Invisible keep-alive so the process never has "zero windows"
        self._keepalive = QWidget()
        self._keepalive.setObjectName("iraKeepAlive")
        self._keepalive.setWindowFlags(
            Qt.WindowType.Tool
            | Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowDoesNotAcceptFocus
        )
        self._keepalive.setFixedSize(1, 1)
        self._keepalive.setGeometry(_PARK)
        self._keepalive.show()

        self.bubble = IraBubble()
        self.panel = ChatPanel()
        self._history: list[tuple[str, str]] = []
        self.flow = DesktopConversation()

        self.bubble.clicked.connect(self.open_panel)
        self.bubble.moved_to.connect(self._persist_bubble_pos)
        self.panel.minimize_requested.connect(self.minimize)
        self.panel.close_requested.connect(self.quit)
        self.panel.send_message.connect(self._on_send)
        self.panel.open_smartstart_requested.connect(self.open_smartstart)

        self._place_bubble()
        # Start with panel open (auth / chat). Park bubble off-screen — still "shown".
        self.bubble.setGeometry(_PARK)
        self.bubble.show()
        self._panel_open = True
        self._place_panel()
        self.panel.show()
        self.panel.raise_()

        self._poll = QTimer()
        self._poll.timeout.connect(self._heartbeat)
        self._poll.start(2_000)
        QTimer.singleShot(200, self._bootstrap)
        # Re-assert always-on-top (Windows focus stealing can bury Tool windows)
        self._topmost = QTimer()
        self._topmost.timeout.connect(self._ensure_topmost)
        self._topmost.start(3_000)

    def _ensure_topmost(self) -> None:
        w = self.panel if self._panel_open else self.bubble
        if w.isVisible():
            w.raise_()

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
        # Ignore parked off-screen coords
        if x < -1000 or y < -1000:
            return
        self.cfg = update_config(bubble_x=x, bubble_y=y)

    def _place_panel(self) -> None:
        screen = QGuiApplication.primaryScreen()
        geo = screen.availableGeometry() if screen else None
        if geo:
            x = geo.right() - self.panel.width() - 20
            y = geo.bottom() - self.panel.height() - 20
            self.panel.move(max(geo.left() + 8, x), max(geo.top() + 8, y))
        else:
            self.panel.move(80, 80)
        self._panel_home = self.panel.geometry()

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
            if changed:
                self.flow = DesktopConversation()
            self.panel.clear_chat()
            self.panel.add_message(greeting(self.ctx), role="ira")
            intro = self.flow.intro(self.ctx)
            if intro:
                self.panel.add_message(intro.reply, role="ira")
                self.panel.set_suggestions(intro.chips, limit=intro.chip_limit)
            else:
                self.panel.set_suggestions(suggestions_for(self.ctx))

    def open_panel(self) -> None:
        if self._panel_open:
            self.panel.raise_()
            self.panel.activateWindow()
            return
        self._panel_open = True
        self.panel.apply_mode(PanelMode.NORMAL)
        self._place_panel()
        # Bring panel on-screen; park bubble off-screen (still shown — no hide())
        self.panel.show()
        self.panel.raise_()
        self.panel.activateWindow()
        self.bubble.setGeometry(_PARK)
        self._sync_session(force_greet=False)

    def minimize(self) -> None:
        """Collapse to floating orb. Never hide() windows — park off-screen instead."""
        self._panel_open = False
        self._panel_home = self.panel.geometry()

        screen = QGuiApplication.primaryScreen()
        geo = screen.availableGeometry() if screen else None
        bx = self._panel_home.right() - self.bubble.width()
        by = self._panel_home.bottom() - self.bubble.height()
        if geo is not None:
            bx = min(max(geo.left() + 8, bx), geo.right() - self.bubble.width())
            by = min(max(geo.top() + 8, by), geo.bottom() - self.bubble.height())
        self.bubble.setFixedSize(64, 64)
        self.bubble.move(bx, by)
        self._persist_bubble_pos(bx, by)

        self.bubble.show()
        self.bubble.raise_()
        self.bubble.activateWindow()
        # Park panel off-screen instead of hide() — Windows Tool hide is unreliable
        self.panel.move(_PARK.x(), _PARK.y())
        print(f"IRA minimized → orb at ({bx}, {by}). Click the blue orb to reopen.", flush=True)

    def quit(self) -> None:
        if self.bubble.x() > -1000:
            self._persist_bubble_pos(self.bubble.x(), self.bubble.y())
        app = QApplication.instance()
        if app is not None:
            app.quit()

    def _on_send(self, text: str) -> None:
        if not self._session_id:
            self.panel.set_locked(True)
            return
        self.panel.add_message(text, role="user")
        self._history.append(("user", text))
        tip = self.panel.show_typing()

        def _reply() -> None:
            self.panel.hide_typing(tip)
            if self.online and self._session_id:
                try:
                    self.ctx = self.client.context(self._session_id)
                except Exception:
                    pass
            if wants_onboarding(text) and self.flow.onboarding is None and self.flow.coach is None:
                turn = self.flow.restart_onboarding()
            else:
                turn = self.flow.handle(
                    text,
                    self.ctx,
                    online=self.online and bool(self.ctx),
                    history=list(self._history[-8:]),
                )
            self.panel.add_message(turn.reply, role="ira")
            self._history.append(("ira", turn.reply))
            self.panel.set_suggestions(turn.chips, limit=turn.chip_limit)
            if self.online and self._session_id:
                if turn.save_answers is not None:
                    self.client.save_profile(self._session_id, turn.save_answers)
                if turn.observe:
                    self.client.observe(self._session_id, text, flavour=turn.flavour)

        QTimer.singleShot(900, _reply)


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv
    try:
        QApplication.setHighDpiScaleFactorRoundingPolicy(
            Qt.HighDpiScaleFactorRoundingPolicy.Round
        )
        app = QApplication(argv)
        app.setApplicationName("IRA")
        app.setQuitOnLastWindowClosed(False)
        import ira as _ira_pkg

        pkg = Path(_ira_pkg.__file__).resolve().parent
        print()
        print("=" * 52)
        print("  IRA — intelligent onboarding companion")
        print(f"  {pkg}")
        print("  – What / Where / Who / What next")
        print("  – collapses to orb (stays on desktop)")
        print("  × quits   ·   click orb to reopen")
        print("=" * 52)
        print()
        ira_app = IraApp()
        app._ira = ira_app  # type: ignore[attr-defined]
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
