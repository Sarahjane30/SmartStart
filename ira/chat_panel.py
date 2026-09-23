"""IRA chat panel — compact, flat darkest navy + white (no gradients)."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from PySide6.QtCore import Qt, QTimer, Signal, QPoint, QRect, QRectF
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
    QGridLayout,
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

from ira.winflags import companion_window_flags
from ira.platform_ui import IS_WINDOWS

EDGE = 8

# Flat palette — darkest navy + white only (no gradients)
BG = "#02040a"
SURFACE = "#0a0f1c"
SURFACE_2 = "#12182a"
LINE = "#1c2438"
TEXT = "#ffffff"
MUTED = "#a8b0c4"
ACCENT = "#ffffff"


class PanelMode(str, Enum):
    NORMAL = "normal"
    EXPANDED = "expanded"


# Compact defaults — must fit typical laptop screens
SIZES = {
    PanelMode.NORMAL: (360, 520),
    PanelMode.EXPANDED: (420, 640),
}
MIN_W, MIN_H = 320, 420
MAX_W = 480


class _SendBtn(QPushButton):
    """Flat circular send — no glow, no gradient."""

    def __init__(self, parent=None) -> None:
        super().__init__("↑", parent)
        self.setFixedSize(36, 36)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setFlat(True)
        self.setStyleSheet("border:0; background:transparent; color:#02040a; font-size:16px; font-weight:700;")

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        r = QRectF(1, 1, self.width() - 2, self.height() - 2)
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QBrush(QColor(TEXT if self.isEnabled() else LINE)))
        p.drawEllipse(r)
        p.setPen(QColor(BG if self.isEnabled() else MUTED))
        p.drawText(self.rect(), Qt.AlignmentFlag.AlignCenter, "↑")


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
        max_h = max(MIN_H, int(avail_h * 0.72))
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
            QWidget#panelContent {{ background: {BG}; }}
            QLabel {{ color: {TEXT}; font-size: 13px; }}
            QPushButton#icon {{
              background: transparent; color: {MUTED}; border: 0;
              font-size: 14px; padding: 4px 6px; border-radius: 8px;
            }}
            QPushButton#icon:hover {{ background: {SURFACE_2}; color: {TEXT}; }}
            QPushButton#chip {{
              background: {SURFACE};
              color: {TEXT};
              border: 1px solid {LINE};
              border-radius: 10px;
              padding: 8px 10px;
              font-size: 11px;
              font-weight: 600;
            }}
            QPushButton#chip:hover {{
              background: {SURFACE_2};
              border-color: {MUTED};
            }}
            QPushButton#cta {{
              background: {TEXT};
              color: {BG};
              border: 0;
              border-radius: 12px;
              font-weight: 700;
              padding: 12px 22px;
              font-size: 13px;
            }}
            QPushButton#cta:hover {{ background: #e8ecf5; }}
            QScrollArea {{ border: 0; background: {BG}; }}
            QWidget#chatInner {{ background: {BG}; }}
            QScrollBar:vertical {{
              background: transparent; width: 5px; margin: 2px;
            }}
            QScrollBar::handle:vertical {{
              background: {LINE}; border-radius: 2px; min-height: 20px;
            }}
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{ height: 0; }}
            """
        )

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # No particle/gradient backdrop — solid navy only
        self._net = None

        content = QWidget()
        content.setObjectName("panelContent")
        content_l = QVBoxLayout(content)
        content_l.setContentsMargins(16, 12, 12, 12)
        content_l.setSpacing(0)

        # Header — compact
        head = QHBoxLayout()
        head.setSpacing(4)
        titles = QVBoxLayout()
        titles.setSpacing(1)
        brand = QLabel("IRA")
        brand.setStyleSheet(
            f"color:{TEXT}; font-size:13px; font-weight:800; letter-spacing:0.06em;"
        )
        self.status_line = QLabel("Not connected")
        self.status_line.setStyleSheet(f"color:{MUTED}; font-size:10px;")
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
        content_l.addSpacing(10)

        # Auth gate
        self.auth = QWidget()
        auth_l = QVBoxLayout(self.auth)
        auth_l.setContentsMargins(4, 16, 4, 16)
        auth_l.setSpacing(8)
        auth_l.addStretch(1)
        hero = QLabel("Ask me\nanything")
        hero.setAlignment(Qt.AlignmentFlag.AlignCenter)
        hero.setStyleSheet(
            f"color:{TEXT}; font-size:22px; font-weight:800; letter-spacing:-0.02em;"
        )
        self.auth_status = QLabel("Waiting for employee sign-in")
        self.auth_status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.auth_status.setStyleSheet(f"color:{MUTED}; font-size:12px;")
        auth_copy = QLabel(
            "Onboarding, apps, teams, processes —\nsign in via SmartStart to unlock."
        )
        auth_copy.setAlignment(Qt.AlignmentFlag.AlignCenter)
        auth_copy.setWordWrap(True)
        auth_copy.setStyleSheet(f"color:{MUTED}; font-size:12px;")
        self.connect_btn = QPushButton("Get Started")
        self.connect_btn.setObjectName("cta")
        self.connect_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.connect_btn.clicked.connect(self.open_smartstart_requested.emit)
        auth_l.addWidget(hero)
        auth_l.addSpacing(6)
        auth_l.addWidget(self.auth_status)
        auth_l.addWidget(auth_copy)
        auth_l.addSpacing(14)
        auth_l.addWidget(self.connect_btn, alignment=Qt.AlignmentFlag.AlignCenter)
        auth_l.addStretch(1)
        content_l.addWidget(self.auth, 1)

        # Unlocked body
        self.body = QWidget()
        body_l = QVBoxLayout(self.body)
        body_l.setContentsMargins(0, 0, 0, 0)
        body_l.setSpacing(10)

        greet = QVBoxLayout()
        greet.setSpacing(2)
        greet.setContentsMargins(0, 0, 0, 0)
        self.hello = QLabel("Hi")
        self.hello.setStyleSheet(
            f"color:{TEXT}; font-size:18px; font-weight:800; letter-spacing:-0.02em;"
        )
        self.prompt = QLabel("")
        self.prompt.hide()
        self.identity = QLabel("")
        self.identity.setStyleSheet(f"color:{MUTED}; font-size:11px;")
        greet.addWidget(self.hello)
        greet.addWidget(self.identity)
        body_l.addLayout(greet)

        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.scroll.setMinimumHeight(160)
        self.chat_inner = QWidget()
        self.chat_inner.setObjectName("chatInner")
        self.chat_layout = QVBoxLayout(self.chat_inner)
        self.chat_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.chat_layout.setSpacing(12)
        self.chat_layout.setContentsMargins(0, 4, 2, 12)
        self.chat_layout.setSizeConstraint(QVBoxLayout.SizeConstraint.SetMinAndMaxSize)
        self.scroll.setWidget(self.chat_inner)
        body_l.addWidget(self.scroll, 1)

        self.suggest_host = QWidget()
        self.suggest_host.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self.suggest_grid = QGridLayout(self.suggest_host)
        self.suggest_grid.setContentsMargins(0, 4, 0, 2)
        self.suggest_grid.setHorizontalSpacing(8)
        self.suggest_grid.setVerticalSpacing(6)
        self.suggest_host.hide()
        body_l.addWidget(self.suggest_host)

        composer = QFrame()
        composer.setObjectName("composerBar")
        composer.setStyleSheet(
            f"QFrame#composerBar {{ background:{SURFACE}; border:1px solid {LINE};"
            f" border-radius:14px; }}"
        )
        comp_l = QHBoxLayout(composer)
        comp_l.setContentsMargins(6, 6, 6, 6)
        comp_l.setSpacing(6)
        self.input = QLineEdit()
        self.input.setObjectName("composer")
        self.input.setPlaceholderText("Ask me anything…")
        self.input.setStyleSheet(
            f"QLineEdit#composer {{ background:transparent; border:0; color:{TEXT};"
            f" padding:8px 10px; font-size:13px; }}"
        )
        self.input.returnPressed.connect(self._submit)
        self.send_btn = _SendBtn()
        self.send_btn.clicked.connect(self._submit)
        comp_l.addWidget(self.input, 1)
        comp_l.addWidget(self.send_btn, 0)
        body_l.addWidget(composer)

        content_l.addWidget(self.body, 1)

        grip_row = QHBoxLayout()
        grip_row.setContentsMargins(0, 2, 0, 0)
        grip_row.addStretch()
        grip = QSizeGrip(self)
        grip.setFixedSize(12, 12)
        grip.setStyleSheet("background:transparent; border:0;")
        grip_row.addWidget(grip)
        content_l.addLayout(grip_row)

        root.addWidget(content)
        self._content = content
        self.set_locked(True)

    def resizeEvent(self, event) -> None:
        super().resizeEvent(event)

    def paintEvent(self, _event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QBrush(QColor(BG)))
        p.drawRoundedRect(0, 0, self.width(), self.height(), 16, 16)
        p.setPen(QPen(QColor(LINE)))
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.drawRoundedRect(0, 0, self.width() - 1, self.height() - 1, 16, 16)

    def _toggle_expand(self) -> None:
        self.apply_mode(PanelMode.EXPANDED if self._mode == PanelMode.NORMAL else PanelMode.NORMAL)

    def apply_mode(self, mode: PanelMode) -> None:
        self._mode = mode
        screen = QApplication.primaryScreen()
        avail_h = screen.availableGeometry().height() if screen else 800
        max_h = max(MIN_H, int(avail_h * 0.72))
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
        if event.position().y() < 48:
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
                f"color:{TEXT if online else MUTED}; font-size:10px;"
            )
        else:
            self.status_line.setText("Not connected")
            self.status_line.setStyleSheet(f"color:{MUTED}; font-size:10px;")
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
            self.status_line.setStyleSheet(f"color:{MUTED}; font-size:10px;")
            self.set_suggestions([])
            if self._mode == PanelMode.NORMAL:
                screen = QApplication.primaryScreen()
                max_h = max(MIN_H, int((screen.availableGeometry().height() if screen else 800) * 0.72))
                self.resize(SIZES[PanelMode.NORMAL][0], min(SIZES[PanelMode.NORMAL][1], max_h))
        else:
            first = (name or "there").split()[0]
            self._employee_first = first
            self.hello.setText(f"Hi, {first}")
            role_disp = "FTE" if role.upper() == "FTE" else role.capitalize()
            parts = [p for p in (role_disp, dept) if p]
            self.identity.setText(" · ".join(parts) if parts else "Waters")
            self.status_line.setText("Connected to SmartStart")
            self.status_line.setStyleSheet(f"color:{TEXT}; font-size:10px;")
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

    def _bubble_style(self, role: str, *, latest: bool) -> str:
        # Flat: user = slightly lighter navy, IRA = surface; white text
        if role == "user":
            bg = SURFACE_2 if latest else SURFACE
            return (
                f"QFrame#msgBubble {{ background:{bg}; border-radius:12px;"
                f" border:1px solid {LINE}; }}"
                f" QLabel {{ color:{TEXT}; font-size:12.5px; background:transparent; border:0; }}"
            )
        bg = SURFACE if latest else BG
        border = MUTED if latest else LINE
        return (
            f"QFrame#msgBubble {{ background:{bg}; border-radius:12px;"
            f" border:1px solid {border}; }}"
            f" QLabel {{ color:{TEXT}; font-size:12.5px; background:transparent; border:0; }}"
        )

    def _dim_older_messages(self) -> None:
        msg_indices = [
            i
            for i in range(self.chat_layout.count())
            if self.chat_layout.itemAt(i).widget() is not None
        ]
        latest_i = msg_indices[-1] if msg_indices else -1
        for i in msg_indices:
            box = self.chat_layout.itemAt(i).widget()
            if not box:
                continue
            latest = i == latest_i
            for child in box.findChildren(QFrame):
                if child.objectName() == "msgBubble":
                    role = child.property("msgRole") or "ira"
                    child.setStyleSheet(self._bubble_style(role, latest=latest))
            for child in box.findChildren(QLabel):
                if child.objectName() == "msgMeta":
                    child.setStyleSheet(
                        f"color:{MUTED}; font-size:9px;"
                        "font-weight:700; letter-spacing:0.04em;"
                    )

    def add_message(self, text: str, *, role: str = "ira") -> None:
        avail = max(180, self.width() - 56)
        bubble_w = min(avail, max(180, int(avail * 0.88)))

        box = QWidget()
        box.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Minimum)
        wrap = QVBoxLayout(box)
        wrap.setSpacing(4)
        wrap.setContentsMargins(0, 0, 0, 0)
        align = Qt.AlignmentFlag.AlignRight if role == "user" else Qt.AlignmentFlag.AlignLeft

        who = "YOU" if role == "user" else "IRA"
        stamp = datetime.now().strftime("%H:%M")
        meta = QLabel(f"{who}  ·  {stamp}")
        meta.setObjectName("msgMeta")
        meta.setStyleSheet(
            f"color:{MUTED}; font-size:9px; font-weight:700; letter-spacing:0.04em;"
        )
        wrap.addWidget(meta, alignment=align)

        bubble = QFrame()
        bubble.setObjectName("msgBubble")
        bubble.setProperty("msgRole", role)
        bubble.setFixedWidth(bubble_w)
        bubble.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)
        bubble.setStyleSheet(self._bubble_style(role, latest=True))
        inner = QVBoxLayout(bubble)
        inner.setContentsMargins(12, 10, 12, 10)
        inner.setSpacing(0)
        body = QLabel(text)
        body.setWordWrap(True)
        body.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        body.setFixedWidth(bubble_w - 24)
        inner.addWidget(body)
        wrap.addWidget(bubble, alignment=align)

        self.chat_layout.addWidget(box)

        def _fit() -> None:
            w = max(80, body.width() or (bubble_w - 24))
            h = max(body.heightForWidth(w), body.sizeHint().height(), 16)
            body.setFixedHeight(h)
            bubble.setFixedHeight(h + 20)
            self.chat_inner.adjustSize()

        _fit()
        QTimer.singleShot(0, _fit)
        self._dim_older_messages()
        QTimer.singleShot(20, self._scroll_bottom)

    def show_typing(self) -> QLabel:
        tip = QLabel("IRA is thinking…")
        tip.setStyleSheet(f"color:{MUTED}; font-size:11px; padding:4px 0;")
        self.chat_layout.addWidget(tip)
        QTimer.singleShot(20, self._scroll_bottom)
        return tip

    def set_suggestions(self, items: list[str]) -> None:
        while self.suggest_grid.count():
            item = self.suggest_grid.takeAt(0)
            w = item.widget() if item else None
            if w:
                w.deleteLater()
        show = bool(items) and self._unlocked
        if show:
            for i, text in enumerate(items[:2]):
                btn = QPushButton(text)
                btn.setObjectName("chip")
                btn.setCursor(Qt.CursorShape.PointingHandCursor)
                btn.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
                btn.setFixedHeight(34)
                btn.setMinimumWidth(0)
                btn.clicked.connect(lambda _=False, t=text: self._quick(t))
                self.suggest_grid.addWidget(btn, 0, i)
            self.suggest_host.show()
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
