"""IRA chat panel — light SmartStart chat UX (white / navy / soft gray)."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from PySide6.QtCore import (
    Property,
    QEasingCurve,
    QPoint,
    QPropertyAnimation,
    QRect,
    Qt,
    QTimer,
    Signal,
)
from PySide6.QtGui import (
    QCursor,
    QKeyEvent,
    QMouseEvent,
    QPainter,
    QColor,
    QBrush,
    QPen,
)
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QVBoxLayout,
    QWidget,
    QSizeGrip,
    QApplication,
)

from ira.flow_layout import FlowLayout
from ira.globe_backdrop import GlobeBackdrop
from ira.winflags import companion_window_flags

EDGE = 8

# SmartStart light chat tokens (matches reference + frontend/style.css)
BG = "#f4f6fc"          # --bg
CARD = "#ffffff"        # --card
NAVY = "#0e1631"        # --navy-700 (YOU bubble + Ask)
NAVY_DEEP = "#080d1d"   # --navy-800
INK = "#0b1026"         # --ink
MUTED = "#5a6784"       # --muted
LINE = "#e3e8f5"        # --line
LINE_SOFT = "#eef1fa"
CYAN = "#0e7490"        # readable teal on light for "connected"


class PanelMode(str, Enum):
    NORMAL = "normal"
    EXPANDED = "expanded"


SIZES = {
    PanelMode.NORMAL: (360, 500),
    PanelMode.EXPANDED: (420, 620),
}
MIN_W, MIN_H = 320, 420
MAX_W = 480


class ChatPanel(QWidget):
    send_message = Signal(str)
    minimize_requested = Signal()
    close_requested = Signal()
    open_smartstart_requested = Signal()
    mode_changed = Signal(str)

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.setWindowTitle("IRA")
        self.setWindowFlags(companion_window_flags())
        self.setMouseTracking(True)

        screen = QApplication.primaryScreen()
        avail_h = screen.availableGeometry().height() if screen else 800
        max_h = max(MIN_H, int(avail_h * 0.7))
        self.setMinimumSize(MIN_W, MIN_H)
        self.setMaximumSize(MAX_W, max_h)

        self._mode = PanelMode.NORMAL
        self._unlocked = False
        self._resize_edge: str | None = None
        self._resize_origin = QPoint()
        self._resize_geom = QRect()
        self._drag_offset: QPoint | None = None
        self._employee_first = ""

        w, h = SIZES[PanelMode.NORMAL]
        self.resize(w, min(h, max_h))

        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, False)
        self.setStyleSheet(
            f"""
            ChatPanel {{
              background: {BG};
              border: 1px solid {LINE};
              border-radius: 16px;
            }}
            QWidget#panelContent {{ background: transparent; }}
            QLabel {{ color: {INK}; font-size: 12px; }}
            QPushButton#icon {{
              background: transparent; color: {MUTED}; border: 0;
              font-size: 13px; padding: 3px 5px; border-radius: 8px;
            }}
            QPushButton#icon:hover {{ background: {LINE_SOFT}; color: {INK}; }}
            QPushButton#chip {{
              background: {CARD};
              color: {INK};
              border: 1px solid {LINE};
              border-radius: 13px;
              padding: 0 11px;
              font-size: 11px;
              font-weight: 600;
            }}
            QPushButton#chip:hover {{
              background: {LINE_SOFT};
              border-color: #c8d0e4;
            }}
            QPushButton#cta {{
              background: {NAVY};
              color: #ffffff;
              border: 0;
              border-radius: 10px;
              font-weight: 700;
              padding: 10px 18px;
              font-size: 12px;
            }}
            QPushButton#cta:hover {{ background: {NAVY_DEEP}; }}
            QPushButton#askBtn {{
              background: {NAVY};
              color: #ffffff;
              border: 0;
              border-radius: 10px;
              font-weight: 700;
              padding: 0 16px;
              font-size: 12px;
              min-width: 52px;
            }}
            QPushButton#askBtn:hover {{ background: {NAVY_DEEP}; }}
            QPushButton#askBtn:disabled {{ background: #c5cddf; color: #ffffff; }}
            QScrollArea {{ border: 0; background: transparent; }}
            QWidget#chatInner {{ background: transparent; }}
            QScrollBar:vertical {{
              background: transparent; width: 4px; margin: 2px;
            }}
            QScrollBar::handle:vertical {{
              background: #c8d0e4; border-radius: 2px; min-height: 18px;
            }}
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{ height: 0; }}
            """
        )

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        self._globe = GlobeBackdrop()
        self._globe_t = 0.0
        self._globe_spin = 0.0
        self._thinking = 0.0
        self._think_anim = QPropertyAnimation(self, b"thinkingAmount", self)
        self._think_anim.setEasingCurve(QEasingCurve.Type.InOutSine)
        self._globe_timer = QTimer(self)
        self._globe_timer.timeout.connect(self._tick_globe)

        content = QWidget()
        content.setObjectName("panelContent")
        content_l = QVBoxLayout(content)
        content_l.setContentsMargins(14, 10, 10, 10)
        content_l.setSpacing(0)

        # Header
        head = QHBoxLayout()
        head.setSpacing(2)
        titles = QVBoxLayout()
        titles.setSpacing(0)
        brand = QLabel("IRA")
        brand.setStyleSheet(
            f"color:{INK}; font-size:12px; font-weight:700; letter-spacing:0.02em;"
        )
        self.status_line = QLabel("Not connected")
        self.status_line.setStyleSheet(f"color:{MUTED}; font-size:9.5px;")
        titles.addWidget(brand)
        titles.addWidget(self.status_line)
        head.addLayout(titles, 1)

        self.btn_expand = QPushButton("⤢")
        self.btn_expand.setObjectName("icon")
        self.btn_expand.setToolTip("Expand")
        self.btn_expand.clicked.connect(self._toggle_expand)
        btn_min = QPushButton("–")
        btn_min.setObjectName("icon")
        btn_min.setToolTip("Collapse to orb")
        btn_min.clicked.connect(self.minimize_requested.emit)
        btn_close = QPushButton("×")
        btn_close.setObjectName("icon")
        btn_close.setToolTip("Quit IRA")
        btn_close.clicked.connect(self.close_requested.emit)
        for b in (self.btn_expand, btn_min, btn_close):
            head.addWidget(b)
        content_l.addLayout(head)
        content_l.addSpacing(8)

        # Auth gate
        self.auth = QWidget()
        auth_l = QVBoxLayout(self.auth)
        auth_l.setContentsMargins(4, 12, 4, 12)
        auth_l.setSpacing(6)
        auth_l.addStretch(1)
        hero = QLabel("Ask me\nanything")
        hero.setAlignment(Qt.AlignmentFlag.AlignCenter)
        hero.setStyleSheet(
            f"color:{INK}; font-size:18px; font-weight:750; letter-spacing:-0.02em;"
        )
        self.auth_status = QLabel("Waiting for employee sign-in")
        self.auth_status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.auth_status.setStyleSheet(f"color:{MUTED}; font-size:11px;")
        auth_copy = QLabel(
            "Onboarding, apps, teams, processes —\nsign in via SmartStart to unlock."
        )
        auth_copy.setAlignment(Qt.AlignmentFlag.AlignCenter)
        auth_copy.setWordWrap(True)
        auth_copy.setStyleSheet(f"color:{MUTED}; font-size:11px;")
        self.connect_btn = QPushButton("Get Started")
        self.connect_btn.setObjectName("cta")
        self.connect_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.connect_btn.clicked.connect(self.open_smartstart_requested.emit)
        auth_l.addWidget(hero)
        auth_l.addSpacing(4)
        auth_l.addWidget(self.auth_status)
        auth_l.addWidget(auth_copy)
        auth_l.addSpacing(12)
        auth_l.addWidget(self.connect_btn, alignment=Qt.AlignmentFlag.AlignCenter)
        auth_l.addStretch(1)
        content_l.addWidget(self.auth, 1)

        # Unlocked body
        self.body = QWidget()
        body_l = QVBoxLayout(self.body)
        body_l.setContentsMargins(0, 0, 0, 0)
        body_l.setSpacing(8)

        greet = QVBoxLayout()
        greet.setSpacing(1)
        greet.setContentsMargins(0, 0, 0, 0)
        self.hello = QLabel("Hi")
        self.hello.setStyleSheet(
            f"color:{INK}; font-size:15px; font-weight:700; letter-spacing:-0.02em;"
        )
        self.prompt = QLabel("")
        self.prompt.hide()
        self.identity = QLabel("")
        self.identity.setStyleSheet(f"color:{MUTED}; font-size:10.5px;")
        greet.addWidget(self.hello)
        greet.addWidget(self.identity)
        body_l.addLayout(greet)

        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.scroll.setMinimumHeight(150)
        self.chat_inner = QWidget()
        self.chat_inner.setObjectName("chatInner")
        self.chat_layout = QVBoxLayout(self.chat_inner)
        self.chat_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.chat_layout.setSpacing(10)
        self.chat_layout.setContentsMargins(0, 2, 2, 8)
        self.chat_layout.setSizeConstraint(QVBoxLayout.SizeConstraint.SetMinAndMaxSize)
        self.scroll.setWidget(self.chat_inner)
        self.scroll.viewport().setAutoFillBackground(False)
        self.scroll.viewport().setStyleSheet("background: transparent;")
        body_l.addWidget(self.scroll, 1)

        # Suggestion chips — pill row
        self.suggest_host = QWidget()
        self.suggest_host.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self.suggest_grid = FlowLayout(self.suggest_host, h_spacing=6, v_spacing=6)
        self.suggest_grid.setContentsMargins(0, 2, 0, 2)
        self.suggest_host.hide()
        body_l.addWidget(self.suggest_host)

        # Composer: white input + navy Ask
        composer = QFrame()
        composer.setObjectName("composerBar")
        composer.setStyleSheet(
            f"QFrame#composerBar {{ background:transparent; border:0; }}"
        )
        comp_l = QHBoxLayout(composer)
        comp_l.setContentsMargins(0, 0, 0, 0)
        comp_l.setSpacing(8)
        self.input = QLineEdit()
        self.input.setObjectName("composer")
        self.input.setPlaceholderText("Ask about apps, teams, processes…")
        self.input.setFixedHeight(36)
        self.input.setStyleSheet(
            f"""
            QLineEdit#composer {{
              background: {CARD};
              color: {INK};
              border: 1px solid {LINE};
              border-radius: 10px;
              padding: 0 14px;
              font-size: 12px;
              selection-background-color: #dbe4f5;
            }}
            QLineEdit#composer:focus {{ border-color: #b8c4dc; }}
            QLineEdit#composer:disabled {{ color: {MUTED}; background: {LINE_SOFT}; }}
            """
        )
        self.input.returnPressed.connect(self._submit)
        self.send_btn = QPushButton("Ask")
        self.send_btn.setObjectName("askBtn")
        self.send_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.send_btn.setFixedHeight(36)
        self.send_btn.clicked.connect(self._submit)
        comp_l.addWidget(self.input, 1)
        comp_l.addWidget(self.send_btn, 0)
        body_l.addWidget(composer)

        content_l.addWidget(self.body, 1)

        grip_row = QHBoxLayout()
        grip_row.setContentsMargins(0, 2, 0, 0)
        grip_row.addStretch()
        grip = QSizeGrip(self)
        grip.setFixedSize(10, 10)
        grip.setStyleSheet("background:transparent; border:0;")
        grip_row.addWidget(grip)
        content_l.addLayout(grip_row)

        root.addWidget(content)
        self._content = content
        self.set_locked(True)

    def resizeEvent(self, event) -> None:
        super().resizeEvent(event)
        if hasattr(self, "suggest_host") and self.suggest_host.isVisible():
            QTimer.singleShot(0, self._fit_suggestions)

    def _fit_suggestions(self) -> None:
        w = self.suggest_host.width()
        if w > 0:
            self.suggest_host.setFixedHeight(self.suggest_grid.heightForWidth(w))

    def _get_thinking(self) -> float:
        return self._thinking

    def _set_thinking(self, value: float) -> None:
        self._thinking = float(value)
        self.update()

    thinkingAmount = Property(float, _get_thinking, _set_thinking)

    def set_thinking(self, on: bool) -> None:
        self._think_anim.stop()
        self._think_anim.setDuration(450 if on else 900)
        self._think_anim.setStartValue(self._thinking)
        self._think_anim.setEndValue(1.0 if on else 0.0)
        self._think_anim.start()

    def showEvent(self, event) -> None:
        super().showEvent(event)
        self._globe_timer.start(40)

    def hideEvent(self, event) -> None:
        super().hideEvent(event)
        self._globe_timer.stop()

    def _tick_globe(self) -> None:
        k = self._thinking
        self._globe_t += 0.04 * (1 + 1.5 * k)
        self._globe_spin += 0.0064 * (1 + 4 * k)
        self.update()

    def paintEvent(self, _event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QBrush(QColor(BG)))
        p.drawRoundedRect(0, 0, self.width(), self.height(), 16, 16)
        k = self._thinking
        R = min(self.width(), self.height()) * 0.36 * (1 + 0.04 * k)
        self._globe.paint(
            p,
            self.width() / 2,
            self.height() * 0.46,
            R,
            spin=self._globe_spin,
            t=self._globe_t,
            opacity=0.13 + 0.27 * k,
        )
        p.setPen(QPen(QColor(LINE)))
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.drawRoundedRect(0, 0, self.width() - 1, self.height() - 1, 16, 16)

    def _toggle_expand(self) -> None:
        self.apply_mode(PanelMode.EXPANDED if self._mode == PanelMode.NORMAL else PanelMode.NORMAL)

    def apply_mode(self, mode: PanelMode) -> None:
        self._mode = mode
        screen = QApplication.primaryScreen()
        avail_h = screen.availableGeometry().height() if screen else 800
        max_h = max(MIN_H, int(avail_h * 0.7))
        self.setMaximumHeight(max_h)
        w, h = SIZES[mode]
        h = min(h, max_h)
        old = self.geometry()
        self.resize(w, h)
        new = self.geometry()
        self.move(old.x() + old.width() - new.width(), old.y() + old.height() - new.height())
        self.btn_expand.setText("⤡" if mode == PanelMode.EXPANDED else "⤢")
        self.btn_expand.setToolTip("Compact" if mode == PanelMode.EXPANDED else "Expand")
        self.mode_changed.emit(mode.value)

    def _hit_edge(self, pos: QPoint) -> str | None:
        r = self.rect()
        left, right = pos.x() <= EDGE, pos.x() >= r.width() - EDGE
        top, bottom = pos.y() <= EDGE, pos.y() >= r.height() - EDGE
        if top and left:
            return "tl"
        if top and right:
            return "tr"
        if bottom and left:
            return "bl"
        if bottom and right:
            return "br"
        if left:
            return "l"
        if right:
            return "r"
        if top:
            return "t"
        if bottom:
            return "b"
        return None

    def _cursor_for(self, edge: str | None):
        return {
            "l": Qt.CursorShape.SizeHorCursor,
            "r": Qt.CursorShape.SizeHorCursor,
            "t": Qt.CursorShape.SizeVerCursor,
            "b": Qt.CursorShape.SizeVerCursor,
            "tl": Qt.CursorShape.SizeFDiagCursor,
            "br": Qt.CursorShape.SizeFDiagCursor,
            "tr": Qt.CursorShape.SizeBDiagCursor,
            "bl": Qt.CursorShape.SizeBDiagCursor,
        }.get(edge or "", Qt.CursorShape.ArrowCursor)

    def mousePressEvent(self, event: QMouseEvent) -> None:
        if event.button() != Qt.MouseButton.LeftButton:
            return super().mousePressEvent(event)
        edge = self._hit_edge(event.position().toPoint())
        if edge:
            self._resize_edge = edge
            self._resize_origin = event.globalPosition().toPoint()
            self._resize_geom = self.geometry()
            event.accept()
            return
        if event.position().y() < 44:
            self._drag_offset = event.globalPosition().toPoint() - self.frameGeometry().topLeft()
            event.accept()
            return
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event: QMouseEvent) -> None:
        if self._resize_edge:
            self._apply_resize(event.globalPosition().toPoint())
            event.accept()
            return
        if self._drag_offset is not None and event.buttons() & Qt.MouseButton.LeftButton:
            self.move(event.globalPosition().toPoint() - self._drag_offset)
            event.accept()
            return
        self.setCursor(QCursor(self._cursor_for(self._hit_edge(event.position().toPoint()))))
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event: QMouseEvent) -> None:
        self._resize_edge = None
        self._drag_offset = None
        self.setCursor(QCursor(Qt.CursorShape.ArrowCursor))
        super().mouseReleaseEvent(event)

    def _apply_resize(self, global_pos: QPoint) -> None:
        dx = global_pos.x() - self._resize_origin.x()
        dy = global_pos.y() - self._resize_origin.y()
        g = QRect(self._resize_geom)
        edge = self._resize_edge or ""
        max_h = self.maximumHeight()
        if "l" in edge:
            new_w = min(MAX_W, max(MIN_W, g.width() - dx))
            g.setX(g.right() - new_w + 1)
            g.setWidth(new_w)
        if "r" in edge:
            g.setWidth(min(MAX_W, max(MIN_W, g.width() + dx)))
        if "t" in edge:
            new_h = min(max_h, max(MIN_H, g.height() - dy))
            g.setY(g.bottom() - new_h + 1)
            g.setHeight(new_h)
        if "b" in edge:
            g.setHeight(min(max_h, max(MIN_H, g.height() + dy)))
        self.setGeometry(g)

    def set_online(self, online: bool) -> None:
        if self._unlocked:
            self.status_line.setText("Connected to SmartStart" if online else "SmartStart offline")
            self.status_line.setStyleSheet(
                f"color:{CYAN if online else MUTED}; font-size:9.5px;"
            )
        else:
            self.status_line.setText("Not connected")
            self.status_line.setStyleSheet(f"color:{MUTED}; font-size:9.5px;")
            self.auth_status.setText(
                "SmartStart is running — sign in to continue"
                if online
                else "Start SmartStart on port 8000"
            )

    def set_locked(self, locked: bool, *, name: str = "", role: str = "", dept: str = "") -> None:
        self._unlocked = not locked
        self.auth.setVisible(locked)
        self.body.setVisible(not locked)
        self.input.setEnabled(not locked)
        self.send_btn.setEnabled(not locked)
        if locked:
            self._employee_first = ""
            self.status_line.setText("Not connected")
            self.status_line.setStyleSheet(f"color:{MUTED}; font-size:9.5px;")
            self.set_suggestions([])
            if self._mode == PanelMode.NORMAL:
                screen = QApplication.primaryScreen()
                max_h = max(
                    MIN_H,
                    int((screen.availableGeometry().height() if screen else 800) * 0.7),
                )
                self.resize(SIZES[PanelMode.NORMAL][0], min(SIZES[PanelMode.NORMAL][1], max_h))
        else:
            first = (name or "there").split()[0]
            self._employee_first = first
            self.hello.setText(f"Hi, {first}")
            role_disp = "FTE" if role.upper() == "FTE" else role.capitalize()
            parts = [p for p in (role_disp, dept) if p]
            self.identity.setText(" · ".join(parts) if parts else "Waters")
            self.status_line.setText("Connected to SmartStart")
            self.status_line.setStyleSheet(f"color:{CYAN}; font-size:9.5px;")
            self.input.setFocus()
            if self._mode == PanelMode.NORMAL:
                self.apply_mode(PanelMode.NORMAL)

    def clear_chat(self) -> None:
        while self.chat_layout.count():
            item = self.chat_layout.takeAt(0)
            w = item.widget()
            if w:
                w.deleteLater()
        self.set_suggestions([])

    def _bubble_style(self, role: str) -> str:
        if role == "user":
            return (
                f"QFrame#msgBubble {{ background:{NAVY}; border-radius:14px;"
                f" border:1px solid {NAVY_DEEP}; }}"
                f" QLabel#bubbleWho {{ color:rgba(255,255,255,0.75); font-size:9px;"
                f" font-weight:800; letter-spacing:0.06em; background:transparent; border:0; }}"
                f" QLabel#bubbleBody {{ color:#ffffff; font-size:12px;"
                f" background:transparent; border:0; }}"
            )
        return (
            f"QFrame#msgBubble {{ background:{CARD}; border-radius:14px;"
            f" border:1px solid {LINE}; }}"
            f" QLabel#bubbleWho {{ color:{MUTED}; font-size:9px;"
            f" font-weight:800; letter-spacing:0.06em; background:transparent; border:0; }}"
            f" QLabel#bubbleBody {{ color:{INK}; font-size:12px;"
            f" background:transparent; border:0; }}"
        )

    def add_message(self, text: str, *, role: str = "ira") -> None:
        avail = max(180, self.width() - 48)
        bubble_w = min(avail, max(190, int(avail * 0.9)))

        box = QWidget()
        box.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Minimum)
        wrap = QVBoxLayout(box)
        wrap.setSpacing(0)
        wrap.setContentsMargins(0, 0, 0, 0)
        align = Qt.AlignmentFlag.AlignRight if role == "user" else Qt.AlignmentFlag.AlignLeft

        bubble = QFrame()
        bubble.setObjectName("msgBubble")
        bubble.setProperty("msgRole", role)
        bubble.setFixedWidth(bubble_w)
        bubble.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)
        bubble.setStyleSheet(self._bubble_style(role))
        inner = QVBoxLayout(bubble)
        inner.setContentsMargins(12, 10, 12, 10)
        inner.setSpacing(4)

        who = QLabel("YOU" if role == "user" else "IRA")
        who.setObjectName("bubbleWho")
        body = QLabel(text)
        body.setObjectName("bubbleBody")
        body.setWordWrap(True)
        body.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        body.setFixedWidth(bubble_w - 24)
        inner.addWidget(who)
        inner.addWidget(body)
        wrap.addWidget(bubble, alignment=align)

        self.chat_layout.addWidget(box)

        def _fit() -> None:
            w = max(72, body.width() or (bubble_w - 24))
            h = max(body.heightForWidth(w), body.sizeHint().height(), 14)
            body.setFixedHeight(h)
            # who (~14) + spacing + padding
            bubble.setFixedHeight(h + 14 + 4 + 20)
            self.chat_inner.adjustSize()

        _fit()
        QTimer.singleShot(0, _fit)
        QTimer.singleShot(20, self._scroll_bottom)

    def show_typing(self) -> QLabel:
        tip = QLabel("IRA is thinking…")
        tip.setStyleSheet(f"color:{MUTED}; font-size:10.5px; padding:2px 0;")
        self.chat_layout.addWidget(tip)
        self.set_thinking(True)
        QTimer.singleShot(20, self._scroll_bottom)
        return tip

    def hide_typing(self, tip: QLabel) -> None:
        tip.deleteLater()
        self.set_thinking(False)

    def set_suggestions(self, items: list[str]) -> None:
        while self.suggest_grid.count():
            item = self.suggest_grid.takeAt(0)
            w = item.widget() if item else None
            if w:
                w.deleteLater()
        show = bool(items) and self._unlocked
        if show:
            for text in items[:3]:
                btn = QPushButton(text)
                btn.setObjectName("chip")
                btn.setCursor(Qt.CursorShape.PointingHandCursor)
                btn.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)
                btn.setFixedHeight(26)
                btn.clicked.connect(lambda _=False, t=text: self._quick(t))
                self.suggest_grid.addWidget(btn)
            self.suggest_host.show()
            self.suggest_host.setFixedHeight(
                self.suggest_grid.heightForWidth(max(1, self.suggest_host.width() or self.width() - 24))
            )
            QTimer.singleShot(0, self._fit_suggestions)
        else:
            self.suggest_host.hide()

    def _quick(self, text: str) -> None:
        if not self._unlocked:
            return
        self.input.setText(text)
        self._submit()

    def _submit(self) -> None:
        if not self._unlocked:
            return
        text = self.input.text().strip()
        if not text:
            return
        self.input.clear()
        self.set_suggestions([])
        self.send_message.emit(text)

    def _scroll_bottom(self) -> None:
        self.scroll.verticalScrollBar().setValue(self.scroll.verticalScrollBar().maximum())

    def keyPressEvent(self, event: QKeyEvent) -> None:
        if event.key() == Qt.Key.Key_Escape:
            self.minimize_requested.emit()
        else:
            super().keyPressEvent(event)
