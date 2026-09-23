"""IRA chat panel — mirrors SmartStart Employee Ask chatbot styling."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from PySide6.QtCore import Qt, QTimer, Signal, QSize, QPoint, QRect
from PySide6.QtGui import QCursor, QKeyEvent, QMouseEvent, QFontMetrics, QPainter, QColor, QBrush, QPen, QTextDocument
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

# SmartStart Ask reference tokens (frontend/style.css)
NAVY = "#0E1631"          # --navy-700
NAVY_SOFT = "#172248"     # --navy-600
NAVY_DEEP = "#080D1D"     # --navy-800
BLUE = "#163A7A"          # --blue-600
BLUE_50 = "#F3F6FB"       # assistant bubble
BLUE_100 = "#E8EEF8"
BG = "#F4F6FC"            # page / panel surface
CARD = "#FFFFFF"
INK = "#0B1026"
MUTED = "#5A6784"
LINE = "#E3E8F5"
ACCENT = "#E8F0FF"
GREEN = "#059669"


class PanelMode(str, Enum):
    NORMAL = "normal"
    EXPANDED = "expanded"


SIZES = {
    PanelMode.NORMAL: (400, 560),
    PanelMode.EXPANDED: (560, 720),
}
MIN_W, MIN_H = 360, 480
MAX_W = 700


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
        return y + line_h - rect.y() if self._items else 0


class ProgressCard(QWidget):
    """Horizontal onboarding progress + Laptop / Mentor / Day 1 milestones."""

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self._pct = 0
        self._milestones = {"laptop": False, "mentor": False, "day1": False}
        self.setFixedHeight(92)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)

    def set_progress(self, pct: int, *, laptop: bool, mentor: bool, day1: bool) -> None:
        self._pct = max(0, min(100, int(pct)))
        self._milestones = {"laptop": laptop, "mentor": mentor, "day1": day1}
        self.update()

    def _draw_icon(self, p: QPainter, kind: str, cx: int, cy: int, done: bool) -> None:
        color = QColor("#FFFFFF" if done else MUTED)
        p.setPen(QPen(color, 1.4))
        p.setBrush(Qt.BrushStyle.NoBrush)
        if kind == "laptop":
            p.drawRoundedRect(cx - 7, cy - 5, 14, 9, 1, 1)
            p.drawLine(cx - 9, cy + 5, cx + 9, cy + 5)
        elif kind == "mentor":
            p.drawEllipse(cx - 3, cy - 6, 6, 6)
            p.drawArc(cx - 7, cy - 1, 14, 10, 0, 180 * 16)
        else:
            p.drawRoundedRect(cx - 6, cy - 5, 12, 11, 1, 1)
            p.drawLine(cx - 6, cy - 1, cx + 6, cy - 1)
            p.drawLine(cx - 3, cy - 7, cx - 3, cy - 3)
            p.drawLine(cx + 3, cy - 7, cx + 3, cy - 3)

    def paintEvent(self, _event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w = self.width()

        p.setPen(QPen(QColor(LINE)))
        p.setBrush(QBrush(QColor(CARD)))
        p.drawRoundedRect(0, 0, w - 1, self.height() - 1, 14, 14)

        p.setPen(QColor(MUTED))
        p.drawText(14, 20, "Onboarding progress")
        p.setPen(QColor(NAVY))
        p.drawText(w - 52, 20, f"{self._pct}%")

        track_y, track_h, track_x = 30, 7, 14
        track_w = w - 28
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QBrush(QColor(BLUE_100)))
        p.drawRoundedRect(track_x, track_y, track_w, track_h, 4, 4)
        fill_w = int(track_w * self._pct / 100)
        if fill_w > 0:
            p.setBrush(QBrush(QColor(NAVY)))
            p.drawRoundedRect(track_x, track_y, fill_w, track_h, 4, 4)

        milestones = [
            ("laptop", "Laptop", self._milestones["laptop"]),
            ("mentor", "Mentor", self._milestones["mentor"]),
            ("day1", "Day 1", self._milestones["day1"]),
        ]
        gap = track_w // 3
        for i, (kind, label, done) in enumerate(milestones):
            cx = track_x + gap // 2 + i * gap
            icon_cy = 58
            p.setPen(Qt.PenStyle.NoPen)
            p.setBrush(QBrush(QColor(NAVY if done else BLUE_100)))
            p.drawEllipse(cx - 11, icon_cy - 11, 22, 22)
            self._draw_icon(p, kind, cx, icon_cy, done)
            p.setPen(QColor(INK if done else MUTED))
            p.drawText(cx - 24, icon_cy + 16, 48, 16, Qt.AlignmentFlag.AlignHCenter, label)


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
              border-radius: 16px;
            }}
            QLabel {{ color: {INK}; font-size: 13px; }}
            QFrame#chrome {{
              background: {NAVY};
              border: 0;
              border-top-left-radius: 15px;
              border-top-right-radius: 15px;
            }}
            QFrame#askCard {{
              background: {CARD};
              border: 1px solid {LINE};
              border-radius: 16px;
            }}
            QFrame#divider {{
              background: {LINE}; max-height: 1px; border: 0;
            }}
            QLineEdit {{
              background: {CARD};
              color: {INK};
              border: 1px solid {LINE};
              border-radius: 13px;
              padding: 11px 14px;
              font-size: 13px;
              selection-background-color: {BLUE_100};
            }}
            QLineEdit:focus {{
              border-color: {BLUE};
            }}
            QLineEdit:disabled {{ color: {MUTED}; background: {BLUE_50}; }}
            QPushButton#send {{
              background: {NAVY};
              color: #ffffff;
              border: 0;
              border-radius: 13px;
              font-weight: 700;
              padding: 11px 18px;
              font-size: 13px;
              min-width: 64px;
            }}
            QPushButton#send:hover {{ background: {NAVY_SOFT}; }}
            QPushButton#send:disabled {{ background: #c5cddc; color: #f8fafc; }}
            QPushButton#icon {{
              background: transparent; color: rgba(255,255,255,0.72); border: 0;
              font-size: 14px; padding: 4px 8px; border-radius: 6px;
            }}
            QPushButton#icon:hover {{ background: rgba(255,255,255,0.12); color: #ffffff; }}
            QPushButton#chip {{
              background: {CARD};
              color: {INK};
              border: 1px solid {LINE};
              border-radius: 16px;
              padding: 7px 14px;
              font-size: 12px;
              font-weight: 600;
            }}
            QPushButton#chip:hover {{
              background: {BLUE_50};
              border-color: #3d6ab0;
            }}
            QPushButton#cta {{
              background: {NAVY};
              color: #ffffff;
              border: 0;
              border-radius: 12px;
              font-weight: 700;
              padding: 12px 22px;
              font-size: 13px;
            }}
            QPushButton#cta:hover {{ background: {NAVY_SOFT}; }}
            QScrollArea {{ border: 0; background: transparent; }}
            QWidget#chatInner {{ background: transparent; }}
            QWidget#chatLog {{
              background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 #f8faff, stop:1 #ffffff);
              border: 1px solid {LINE};
              border-radius: 14px;
            }}
            QLabel#section {{
              color: {MUTED}; font-size: 10px; font-weight: 700;
              letter-spacing: 0.08em;
            }}
            """
        )

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # Navy chrome header (matches employee rail brand)
        chrome = QFrame()
        chrome.setObjectName("chrome")
        chrome_l = QHBoxLayout(chrome)
        chrome_l.setContentsMargins(16, 12, 10, 12)
        chrome_l.setSpacing(8)
        titles = QVBoxLayout()
        titles.setSpacing(2)
        title = QLabel("IRA")
        title.setStyleSheet(
            "color:#F4F6FF; font-size:15px; font-weight:800; letter-spacing:-0.02em;"
        )
        self.status_line = QLabel("Not connected")
        self.status_line.setStyleSheet("color:rgba(244,246,255,0.65); font-size:11px;")
        titles.addWidget(title)
        titles.addWidget(self.status_line)
        chrome_l.addLayout(titles, 1)

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
            chrome_l.addWidget(b)
        root.addWidget(chrome)

        content = QWidget()
        content_l = QVBoxLayout(content)
        content_l.setContentsMargins(14, 14, 14, 10)
        content_l.setSpacing(0)

        # Auth (locked)
        self.auth = QWidget()
        auth_l = QVBoxLayout(self.auth)
        auth_l.setContentsMargins(12, 28, 12, 28)
        auth_l.setSpacing(10)
        auth_l.addStretch(1)
        auth_title = QLabel("Connect to SmartStart")
        auth_title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        auth_title.setStyleSheet(f"color:{INK}; font-size:16px; font-weight:700;")
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
        content_l.addWidget(self.auth, 1)

        # Unlocked body — Ask-style card
        self.body = QWidget()
        body_l = QVBoxLayout(self.body)
        body_l.setContentsMargins(0, 0, 0, 0)
        body_l.setSpacing(10)

        head_row = QVBoxLayout()
        head_row.setSpacing(2)
        ask_title = QLabel("Ask")
        ask_title.setStyleSheet(
            f"color:{INK}; font-size:20px; font-weight:800; letter-spacing:-0.03em;"
        )
        self.identity = QLabel("Synthetic FAQ guide for onboarding")
        self.identity.setStyleSheet(f"color:{MUTED}; font-size:12px;")
        head_row.addWidget(ask_title)
        head_row.addWidget(self.identity)
        body_l.addLayout(head_row)

        self.progress = ProgressCard()
        self.progress.hide()
        body_l.addWidget(self.progress)

        ask_card = QFrame()
        ask_card.setObjectName("askCard")
        ask_l = QVBoxLayout(ask_card)
        ask_l.setContentsMargins(12, 12, 12, 12)
        ask_l.setSpacing(10)

        chat_log = QWidget()
        chat_log.setObjectName("chatLog")
        chat_log_l = QVBoxLayout(chat_log)
        chat_log_l.setContentsMargins(8, 8, 4, 8)
        chat_log_l.setSpacing(0)

        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.scroll.setMinimumHeight(140)
        self.scroll.setStyleSheet("QScrollArea { background: transparent; border: 0; }")
        self.chat_inner = QWidget()
        self.chat_inner.setObjectName("chatInner")
        self.chat_layout = QVBoxLayout(self.chat_inner)
        self.chat_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.chat_layout.setSpacing(12)
        self.chat_layout.setContentsMargins(4, 4, 8, 4)
        self.scroll.setWidget(self.chat_inner)
        chat_log_l.addWidget(self.scroll)
        ask_l.addWidget(chat_log, 1)

        self.suggest_host = _FlowHost()
        self.suggest_flow = _FlowLayout(self.suggest_host, spacing=7)
        self.suggest_host.setLayout(self.suggest_flow)
        ask_l.addWidget(self.suggest_host)

        row = QHBoxLayout()
        row.setSpacing(8)
        self.input = QLineEdit()
        self.input.setPlaceholderText("Ask about docs, laptop, mentor, Git Basics…")
        self.input.returnPressed.connect(self._submit)
        self.send_btn = QPushButton("Ask")
        self.send_btn.setObjectName("send")
        self.send_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.send_btn.clicked.connect(self._submit)
        row.addWidget(self.input, 1)
        row.addWidget(self.send_btn, 0)
        ask_l.addLayout(row)

        body_l.addWidget(ask_card, 1)
        content_l.addWidget(self.body, 1)

        grip_row = QHBoxLayout()
        grip_row.setContentsMargins(0, 4, 2, 0)
        grip_row.addStretch()
        grip = QSizeGrip(self)
        grip.setFixedSize(12, 12)
        grip.setStyleSheet(f"background:{LINE}; border-radius:2px;")
        grip_row.addWidget(grip)
        content_l.addLayout(grip_row)

        root.addWidget(content, 1)
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
        if event.position().y() < 56:
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
                f"color:{'#6EE7B7' if online else '#FBBF24'}; font-size:11px;"
            )
        else:
            self.status_line.setText("Not connected")
            self.status_line.setStyleSheet("color:rgba(244,246,255,0.65); font-size:11px;")
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
            self.status_line.setStyleSheet("color:rgba(244,246,255,0.65); font-size:11px;")
            self.set_suggestions([])
            if self._mode == PanelMode.NORMAL:
                self.resize(self.width(), min(self.height(), 480))
        else:
            role_disp = "FTE" if role.upper() == "FTE" else role.capitalize()
            parts = [p for p in (name, role_disp, dept) if p]
            who = " · ".join(parts) if parts else "onboarding"
            self.identity.setText(f"Synthetic FAQ guide · {who}")
            self.status_line.setText("Connected to SmartStart")
            self.status_line.setStyleSheet("color:#6EE7B7; font-size:11px;")
            self.input.setFocus()
            if self._mode == PanelMode.NORMAL:
                self.apply_mode(PanelMode.NORMAL)

    def set_onboarding_progress(self, snap: dict | None) -> None:
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

    def _bubble_style(self, role: str, *, latest: bool) -> str:
        if role == "user":
            bg = BLUE if latest else NAVY_SOFT
            return (
                f"background:{bg}; color:#ffffff; border-radius:16px;"
                f"padding:12px 14px; font-size:13px; border:0;"
            )
        bg = BLUE_50 if latest else "#EEF1F8"
        return (
            f"background:{bg}; color:{INK}; border-radius:16px;"
            f"padding:12px 14px; font-size:13px; border:1px solid {LINE};"
        )

    def _dim_older_messages(self) -> None:
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
                    child.setStyleSheet(self._bubble_style(role, latest=latest))
                elif name == "msgMeta":
                    child.setStyleSheet(
                        f"color:{MUTED if latest else '#9aa3b5'}; font-size:10px;"
                        "font-weight:700; letter-spacing:0.08em;"
                    )
                elif name == "msgTime":
                    child.setStyleSheet(
                        f"color:{'#8a94a8' if latest else '#b0b8c8'}; font-size:9px;"
                    )

    def add_message(self, text: str, *, role: str = "ira") -> None:
        avail = max(220, self.width() - 72)
        bubble_w = min(avail, max(220, int(avail * 0.92)))

        wrap = QVBoxLayout()
        wrap.setSpacing(4)
        wrap.setContentsMargins(0, 0, 0, 0)
        align = Qt.AlignmentFlag.AlignRight if role == "user" else Qt.AlignmentFlag.AlignLeft

        meta = QLabel("YOU" if role == "user" else "ASSISTANT")
        meta.setObjectName("msgMeta")
        meta.setStyleSheet(
            f"color:{MUTED}; font-size:10px; font-weight:700; letter-spacing:0.08em;"
        )
        wrap.addWidget(meta, alignment=align)

        bubble = QLabel(text)
        bubble.setObjectName("msgBubble")
        bubble.setProperty("msgRole", role)
        bubble.setWordWrap(True)
        bubble.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        bubble.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)
        bubble.setFixedWidth(bubble_w)
        bubble.setStyleSheet(self._bubble_style(role, latest=True))
        doc = QTextDocument()
        doc.setDefaultFont(bubble.font())
        doc.setDocumentMargin(0)
        doc.setPlainText(text)
        doc.setTextWidth(max(80, bubble_w - 28))
        bubble.setFixedHeight(int(doc.size().height()) + 36)
        wrap.addWidget(bubble, alignment=align)

        stamp = QLabel(datetime.now().strftime("%H:%M"))
        stamp.setObjectName("msgTime")
        stamp.setStyleSheet("color:#8a94a8; font-size:9px;")
        wrap.addWidget(stamp, alignment=align)

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
        self.suggest_host.setVisible(show)
        for text in items[:5]:
            btn = QPushButton(text)
            btn.setObjectName("chip")
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.clicked.connect(lambda _=False, t=text: self._quick(t))
            self.suggest_flow.addWidget(btn)
        if show:
            # Force height after chips are added
            QTimer.singleShot(0, self._relayout_chips)

    def _relayout_chips(self) -> None:
        w = max(self.suggest_host.width(), self.width() - 56)
        h = self.suggest_flow.heightForWidth(w)
        if h > 0:
            self.suggest_host.setFixedHeight(h)

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
