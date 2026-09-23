"""IRA chat panel — navy / white SmartStart assistant."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from PySide6.QtCore import Qt, QTimer, Signal, QSize, QPoint, QRect
from PySide6.QtGui import QCursor, QKeyEvent, QMouseEvent, QFontMetrics, QPainter, QColor, QBrush, QPen
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
    QLayout,
    QLayoutItem,
    QApplication,
)

from ira.winflags import companion_window_flags

EDGE = 8

# Brand palette (navy + white)
BG = "#0B1A33"
BG_SOFT = "#122440"
USER_BUBBLE = "#1C2E4A"
IRA_BUBBLE = "#FFFFFF"
IRA_TEXT = "#0B1A33"
ACCENT = "#E8F0FF"
TEXT = "#F5F5F5"
MUTED = "#A8B4C8"
LINE = "#243656"
GREEN = "#3DDC97"


class PanelMode(str, Enum):
    NORMAL = "normal"
    EXPANDED = "expanded"


SIZES = {
    PanelMode.NORMAL: (380, 540),
    PanelMode.EXPANDED: (560, 700),
}
MIN_W, MIN_H = 340, 460
MAX_W = 680


class _FlowLayout(QLayout):
    def __init__(self, parent=None, spacing: int = 8) -> None:
        super().__init__(parent)
        self._items: list[QLayoutItem] = []
        self.setSpacing(spacing)

    def addItem(self, item: QLayoutItem) -> None:
        self._items.append(item)

    def count(self) -> int:
        return len(self._items)

    def itemAt(self, index: int) -> QLayoutItem | None:
        return self._items[index] if 0 <= index < len(self._items) else None

    def takeAt(self, index: int) -> QLayoutItem | None:
        return self._items.pop(index) if 0 <= index < len(self._items) else None

    def expandingDirections(self) -> Qt.Orientation:
        return Qt.Orientation(0)

    def hasHeightForWidth(self) -> bool:
        return True

    def heightForWidth(self, width: int) -> int:
        return self._do_layout(QRect(0, 0, width, 0), True)

    def setGeometry(self, rect: QRect) -> None:
        super().setGeometry(rect)
        self._do_layout(rect, False)

    def sizeHint(self) -> QSize:
        return self.minimumSize()

    def minimumSize(self) -> QSize:
        size = QSize()
        for item in self._items:
            size = size.expandedTo(item.minimumSize())
        m = self.contentsMargins()
        return size + QSize(m.left() + m.right(), m.top() + m.bottom())

    def _do_layout(self, rect: QRect, test_only: bool) -> int:
        x, y = rect.x(), rect.y()
        line_h = 0
        for item in self._items:
            w, h = item.sizeHint().width(), item.sizeHint().height()
            if x + w > rect.right() and line_h > 0:
                x = rect.x()
                y += line_h + self.spacing()
                line_h = 0
            if not test_only:
                item.setGeometry(QRect(QPoint(x, y), item.sizeHint()))
            x += w + self.spacing()
            line_h = max(line_h, h)
        return y + line_h - rect.y()


class ProgressCard(QWidget):
    """Horizontal onboarding progress + Laptop / Mentor / Day 1 milestones."""

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self._pct = 0
        self._milestones = {"laptop": False, "mentor": False, "day1": False}
        self.setMinimumHeight(78)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)

    def set_progress(self, pct: int, *, laptop: bool, mentor: bool, day1: bool) -> None:
        self._pct = max(0, min(100, int(pct)))
        self._milestones = {"laptop": laptop, "mentor": mentor, "day1": day1}
        self.update()

    def _draw_icon(self, p: QPainter, kind: str, cx: int, cy: int, done: bool) -> None:
        color = QColor(BG if done else MUTED)
        p.setPen(QPen(color, 1.4))
        p.setBrush(Qt.BrushStyle.NoBrush)
        if kind == "laptop":
            p.drawRoundedRect(cx - 7, cy - 5, 14, 9, 1, 1)
            p.drawLine(cx - 9, cy + 5, cx + 9, cy + 5)
        elif kind == "mentor":
            p.drawEllipse(cx - 3, cy - 6, 6, 6)
            p.drawArc(cx - 7, cy - 1, 14, 10, 0, 180 * 16)
        else:  # day1
            p.drawRoundedRect(cx - 6, cy - 5, 12, 11, 1, 1)
            p.drawLine(cx - 6, cy - 1, cx + 6, cy - 1)
            p.drawLine(cx - 3, cy - 7, cx - 3, cy - 3)
            p.drawLine(cx + 3, cy - 7, cx + 3, cy - 3)

    def paintEvent(self, _event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()

        p.setPen(QPen(QColor(LINE)))
        p.setBrush(QBrush(QColor(BG_SOFT)))
        p.drawRoundedRect(0, 0, w - 1, h - 1, 10, 10)

        p.setPen(QColor(MUTED))
        p.drawText(14, 18, "Onboarding progress")
        p.setPen(QColor(ACCENT))
        pct_txt = f"{self._pct}%"
        p.drawText(w - 52, 18, pct_txt)

        track_y = 28
        track_h = 6
        track_x = 14
        track_w = w - 28
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QBrush(QColor(LINE)))
        p.drawRoundedRect(track_x, track_y, track_w, track_h, 3, 3)
        fill_w = int(track_w * self._pct / 100)
        if fill_w > 0:
            p.setBrush(QBrush(QColor(ACCENT)))
            p.drawRoundedRect(track_x, track_y, fill_w, track_h, 3, 3)

        milestones = [
            ("laptop", "Laptop", self._milestones["laptop"]),
            ("mentor", "Mentor", self._milestones["mentor"]),
            ("day1", "Day 1", self._milestones["day1"]),
        ]
        gap = track_w // 3
        for i, (kind, label, done) in enumerate(milestones):
            cx = track_x + gap // 2 + i * gap
            cy = 54
            p.setPen(Qt.PenStyle.NoPen)
            p.setBrush(QBrush(QColor(ACCENT if done else LINE)))
            p.drawEllipse(cx - 11, cy - 16, 22, 22)
            self._draw_icon(p, kind, cx, cy - 5, done)
            p.setPen(QColor(TEXT if done else MUTED))
            p.drawText(cx - 22, cy + 12, 44, 14, Qt.AlignmentFlag.AlignHCenter, label)


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
        max_h = int((screen.availableGeometry().height() * 0.9) if screen else 800)
        self.setMinimumSize(MIN_W, MIN_H)
        self.setMaximumSize(MAX_W, max_h)

        self._mode = PanelMode.NORMAL
        self._unlocked = False
        self._resize_edge: str | None = None
        self._resize_origin = QPoint()
        self._resize_geom = QRect()
        self._drag_offset: QPoint | None = None

        w, h = SIZES[PanelMode.NORMAL]
        self.resize(w, min(h, max_h))

        self.setStyleSheet(
            f"""
            ChatPanel {{
              background: {BG};
              border: 1px solid {LINE};
              border-radius: 14px;
            }}
            QLabel {{ color: {TEXT}; font-size: 13px; }}
            QFrame#divider {{
              background: {LINE}; max-height: 1px; border: 0;
            }}
            QLineEdit {{
              background: {BG_SOFT};
              color: {TEXT};
              border: 1px solid {LINE};
              border-radius: 20px;
              padding: 11px 16px;
              font-size: 13px;
              selection-background-color: {USER_BUBBLE};
            }}
            QLineEdit:focus {{ border-color: {ACCENT}; }}
            QLineEdit:disabled {{ color: {MUTED}; }}
            QPushButton#send {{
              background: {USER_BUBBLE};
              color: {TEXT};
              border: 1px solid {ACCENT};
              border-radius: 20px;
              font-weight: 700;
              padding: 11px 18px;
              font-size: 13px;
              min-width: 68px;
            }}
            QPushButton#send:hover {{
              background: {ACCENT};
              color: {BG};
            }}
            QPushButton#send:disabled {{ background: {LINE}; color: {MUTED}; border-color: {LINE}; }}
            QPushButton#icon {{
              background: transparent; color: {MUTED}; border: 0;
              font-size: 14px; padding: 4px 8px; border-radius: 6px;
            }}
            QPushButton#icon:hover {{ background: {USER_BUBBLE}; color: {TEXT}; }}
            QPushButton#chip {{
              background: transparent;
              color: {TEXT};
              border: 1px solid rgba(255,255,255,0.65);
              border-radius: 16px;
              padding: 7px 14px;
              font-size: 12px;
            }}
            QPushButton#chip:hover {{
              background: rgba(232,240,255,0.16);
              color: #ffffff;
              border-color: {ACCENT};
            }}
            QPushButton#cta {{
              background: {BG_SOFT};
              color: {TEXT};
              border: 1px solid {ACCENT};
              border-radius: 10px;
              font-weight: 700;
              padding: 12px 22px;
              font-size: 13px;
            }}
            QPushButton#cta:hover {{
              background: {ACCENT};
              color: {BG};
            }}
            QScrollArea {{ border: 0; background: transparent; }}
            QWidget#chatInner {{ background: transparent; }}
            QLabel#section {{
              color: {MUTED}; font-size: 10px; font-weight: 600;
              letter-spacing: 0.08em;
            }}
            """
        )

        root = QVBoxLayout(self)
        root.setContentsMargins(18, 16, 18, 12)
        root.setSpacing(0)

        # Header
        head = QHBoxLayout()
        titles = QVBoxLayout()
        titles.setSpacing(3)
        title = QLabel("IRA")
        title.setStyleSheet(f"color:{TEXT}; font-size:16px; font-weight:700; letter-spacing:0.04em;")
        self.status_line = QLabel("Not connected")
        self.status_line.setStyleSheet(f"color:{MUTED}; font-size:11px;")
        titles.addWidget(title)
        titles.addWidget(self.status_line)
        head.addLayout(titles, 1)

        self.btn_expand = QPushButton("⤢")
        self.btn_expand.setObjectName("icon")
        self.btn_expand.setToolTip("Expand")
        self.btn_expand.clicked.connect(self._toggle_expand)
        btn_min = QPushButton("–")
        btn_min.setObjectName("icon")
        btn_min.setToolTip("Minimize")
        btn_min.clicked.connect(self.minimize_requested.emit)
        btn_close = QPushButton("×")
        btn_close.setObjectName("icon")
        btn_close.setToolTip("Close")
        btn_close.clicked.connect(self.close_requested.emit)
        for b in (self.btn_expand, btn_min, btn_close):
            head.addWidget(b)
        root.addLayout(head)

        div = QFrame()
        div.setObjectName("divider")
        div.setFixedHeight(1)
        root.addSpacing(12)
        root.addWidget(div)
        root.addSpacing(12)

        # Auth
        self.auth = QWidget()
        auth_l = QVBoxLayout(self.auth)
        auth_l.setContentsMargins(8, 20, 8, 20)
        auth_l.setSpacing(10)
        auth_l.addStretch(1)
        auth_title = QLabel("Connect to SmartStart")
        auth_title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        auth_title.setStyleSheet(f"color:{TEXT}; font-size:15px; font-weight:600;")
        self.auth_status = QLabel("Waiting for employee sign-in")
        self.auth_status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.auth_status.setStyleSheet(f"color:{MUTED}; font-size:12px;")
        auth_copy = QLabel(
            "Open SmartStart, choose Intern or FTE,\n"
            "and select your profile. IRA unlocks automatically."
        )
        auth_copy.setAlignment(Qt.AlignmentFlag.AlignCenter)
        auth_copy.setWordWrap(True)
        auth_copy.setStyleSheet(f"color:{MUTED}; font-size:12.5px;")
        self.connect_btn = QPushButton("Open SmartStart")
        self.connect_btn.setObjectName("cta")
        self.connect_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.connect_btn.clicked.connect(self.open_smartstart_requested.emit)
        auth_l.addWidget(auth_title)
        auth_l.addWidget(self.auth_status)
        auth_l.addSpacing(6)
        auth_l.addWidget(auth_copy)
        auth_l.addSpacing(14)
        auth_l.addWidget(self.connect_btn, alignment=Qt.AlignmentFlag.AlignCenter)
        auth_l.addStretch(1)
        root.addWidget(self.auth, 1)

        # Body
        self.body = QWidget()
        body_l = QVBoxLayout(self.body)
        body_l.setContentsMargins(0, 0, 0, 0)
        body_l.setSpacing(12)

        self.identity = QLabel("")
        self.identity.setStyleSheet(f"color:{MUTED}; font-size:12px;")
        body_l.addWidget(self.identity)

        self.progress = ProgressCard()
        self.progress.hide()
        body_l.addWidget(self.progress)

        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.scroll.setMinimumHeight(120)
        self.chat_inner = QWidget()
        self.chat_inner.setObjectName("chatInner")
        self.chat_layout = QVBoxLayout(self.chat_inner)
        self.chat_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.chat_layout.setSpacing(12)
        self.chat_layout.setContentsMargins(0, 0, 4, 0)
        self.scroll.setWidget(self.chat_inner)
        body_l.addWidget(self.scroll, 1)

        footer = QVBoxLayout()
        footer.setSpacing(10)
        self.suggest_label = QLabel("SUGGESTED")
        self.suggest_label.setObjectName("section")
        footer.addWidget(self.suggest_label)
        self.suggest_host = QWidget()
        self.suggest_flow = _FlowLayout(self.suggest_host, spacing=8)
        self.suggest_host.setLayout(self.suggest_flow)
        footer.addWidget(self.suggest_host)

        row = QHBoxLayout()
        row.setSpacing(10)
        self.input = QLineEdit()
        self.input.setPlaceholderText("Ask IRA anything…")
        self.input.returnPressed.connect(self._submit)
        self.send_btn = QPushButton("Send")
        self.send_btn.setObjectName("send")
        self.send_btn.clicked.connect(self._submit)
        row.addWidget(self.input, 1)
        row.addWidget(self.send_btn, 0)
        footer.addLayout(row)
        body_l.addLayout(footer)

        root.addWidget(self.body, 1)

        grip_row = QHBoxLayout()
        grip_row.setContentsMargins(0, 8, 0, 0)
        grip_row.addStretch()
        grip = QSizeGrip(self)
        grip.setFixedSize(12, 12)
        grip.setStyleSheet(f"background:{LINE}; border-radius:2px;")
        grip_row.addWidget(grip)
        root.addLayout(grip_row)

        self.set_locked(True)

    def _toggle_expand(self) -> None:
        self.apply_mode(PanelMode.EXPANDED if self._mode == PanelMode.NORMAL else PanelMode.NORMAL)

    def apply_mode(self, mode: PanelMode) -> None:
        self._mode = mode
        screen = QApplication.primaryScreen()
        max_h = int((screen.availableGeometry().height() * 0.9) if screen else 800)
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
        if event.position().y() < 52:
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
                f"color:{GREEN if online else '#FBBF24'}; font-size:11px;"
            )
        else:
            self.status_line.setText("Not connected")
            self.status_line.setStyleSheet(f"color:{MUTED}; font-size:11px;")
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
            self.progress.hide()
            self.status_line.setText("Not connected")
            self.status_line.setStyleSheet(f"color:{MUTED}; font-size:11px;")
            self.set_suggestions([])
            if self._mode == PanelMode.NORMAL:
                self.resize(self.width(), min(self.height(), 460))
        else:
            role_disp = "FTE" if role.upper() == "FTE" else role.capitalize()
            parts = [p for p in (name, role_disp, dept) if p]
            self.identity.setText(" · ".join(parts))
            self.status_line.setText("Connected to SmartStart")
            self.status_line.setStyleSheet(f"color:{GREEN}; font-size:11px;")
            self.input.setFocus()
            if self._mode == PanelMode.NORMAL:
                self.apply_mode(PanelMode.NORMAL)

    def set_onboarding_progress(self, snap: dict | None) -> None:
        """Accept a progress_snapshot() dict (pct / laptop / mentor / day1)."""
        if not snap:
            self.progress.hide()
            return
        self.progress.set_progress(
            int(snap.get("pct") or 0),
            laptop=bool(snap.get("laptop")),
            mentor=bool(snap.get("mentor")),
            day1=bool(snap.get("day1")),
        )
        self.progress.show()

    def clear_chat(self) -> None:
        while self.chat_layout.count():
            item = self.chat_layout.takeAt(0)
            w = item.widget()
            if w:
                w.deleteLater()

    def _dim_older_messages(self) -> None:
        """Soften prior bubbles so the latest message reads as primary."""
        count = self.chat_layout.count()
        for i in range(count):
            item = self.chat_layout.itemAt(i)
            box = item.widget() if item else None
            if not box:
                continue
            latest = i == count - 1
            for child in box.findChildren(QLabel):
                name = child.objectName()
                if name == "msgBubble":
                    role = child.property("msgRole") or "ira"
                    if role == "user":
                        bg = USER_BUBBLE if latest else "#16253d"
                        fg = TEXT if latest else MUTED
                        size = "13.5" if latest else "13"
                    else:
                        bg = IRA_BUBBLE if latest else "#E4EAF5"
                        fg = IRA_TEXT if latest else "#1a2d4d"
                        size = "13.5" if latest else "13"
                    child.setStyleSheet(
                        f"background:{bg}; color:{fg}; border-radius:14px;"
                        f"padding:14px 16px; font-size:{size}px;"
                    )
                elif name == "msgTime":
                    child.setStyleSheet(
                        f"color:{'#9aa8bd' if latest else '#5c6b82'}; font-size:9px;"
                    )

    def add_message(self, text: str, *, role: str = "ira") -> None:
        avail = max(200, self.width() - 56)
        bubble_w = min(avail, max(200, int(avail * 0.88)))

        bubble = QLabel(text)
        bubble.setObjectName("msgBubble")
        bubble.setProperty("msgRole", role)
        bubble.setWordWrap(True)
        bubble.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        bubble.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Minimum)
        bubble.setFixedWidth(bubble_w)

        if role == "user":
            bubble.setStyleSheet(
                f"background:{USER_BUBBLE}; color:{TEXT}; border-radius:14px;"
                "padding:14px 16px; font-size:13.5px;"
            )
        else:
            bubble.setStyleSheet(
                f"background:{IRA_BUBBLE}; color:{IRA_TEXT}; border-radius:14px;"
                "padding:14px 16px; font-size:13.5px;"
            )

        fm = QFontMetrics(bubble.font())
        text_h = fm.boundingRect(0, 0, bubble_w - 32, 5000, Qt.TextFlag.TextWordWrap, text).height()
        bubble.setMinimumHeight(text_h + 28)

        meta = QLabel(datetime.now().strftime("%H:%M"))
        meta.setObjectName("msgTime")
        meta.setStyleSheet("color:#8a97ad; font-size:9px;")
        wrap = QVBoxLayout()
        wrap.setSpacing(4)
        wrap.setContentsMargins(0, 0, 0, 0)
        align = Qt.AlignmentFlag.AlignRight if role == "user" else Qt.AlignmentFlag.AlignLeft
        wrap.addWidget(bubble, alignment=align)
        wrap.addWidget(meta, alignment=align)
        box = QWidget()
        box.setLayout(wrap)
        self.chat_layout.addWidget(box)
        self._dim_older_messages()
        QTimer.singleShot(20, self._scroll_bottom)

    def show_typing(self) -> QLabel:
        tip = QLabel("Thinking…")
        tip.setStyleSheet(f"color:{MUTED}; font-size:12px;")
        self.chat_layout.addWidget(tip)
        QTimer.singleShot(20, self._scroll_bottom)
        return tip

    def set_suggestions(self, items: list[str]) -> None:
        while self.suggest_flow.count():
            item = self.suggest_flow.takeAt(0)
            w = item.widget() if item else None
            if w:
                w.deleteLater()
        show = bool(items) and self._unlocked
        self.suggest_label.setVisible(show)
        self.suggest_host.setVisible(show)
        for text in items[:4]:
            btn = QPushButton(text)
            btn.setObjectName("chip")
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.clicked.connect(lambda _=False, t=text: self._quick(t))
            self.suggest_flow.addWidget(btn)

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
