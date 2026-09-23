"""IRA chat panel — governed Waters knowledge layer companion."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from PySide6.QtCore import Qt, QTimer, Signal, QSize, QPoint, QRect, QRectF
from PySide6.QtGui import (
    QCursor,
    QKeyEvent,
    QMouseEvent,
    QPainter,
    QColor,
    QBrush,
    QPen,
    QLinearGradient,
    QRadialGradient,
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
from ira.network_anim import NetworkSphere

EDGE = 8

# MindBot-inspired dark navy + electric blue (SmartStart enterprise)
BG = "#070B14"
BG_ELEV = "#0E1524"
SURFACE = "#141C2E"
SURFACE_2 = "#1A2438"
IRA_BUBBLE = "#161F33"
USER_BUBBLE = "#243552"
LINE = "#243049"
TEXT = "#F4F7FF"
MUTED = "#8B97B0"
BLUE = "#3D7EFF"
BLUE_SOFT = "#5B93FF"
BLUE_DIM = "#1E3A6E"
GREEN = "#3DDC97"


class PanelMode(str, Enum):
    NORMAL = "normal"
    EXPANDED = "expanded"


SIZES = {
    PanelMode.NORMAL: (400, 720),
    PanelMode.EXPANDED: (560, 860),
}
MIN_W, MIN_H = 360, 600
MAX_W = 700


class ProgressCard(QWidget):
    """Glass progress strip with Laptop / Mentor / Day 1 milestones."""

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self._pct = 0
        self._milestones = {"laptop": False, "mentor": False, "day1": False}
        self.setFixedHeight(84)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)

    def set_progress(self, pct: int, *, laptop: bool, mentor: bool, day1: bool) -> None:
        self._pct = max(0, min(100, int(pct)))
        self._milestones = {"laptop": laptop, "mentor": mentor, "day1": day1}
        self.update()

    def _draw_icon(self, p: QPainter, kind: str, cx: int, cy: int, done: bool) -> None:
        color = QColor("#061018" if done else MUTED)
        p.setPen(QPen(color, 1.5))
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
        w, h = self.width(), self.height()

        p.setPen(QPen(QColor(LINE)))
        grad = QLinearGradient(0, 0, w, h)
        grad.setColorAt(0.0, QColor(SURFACE))
        grad.setColorAt(1.0, QColor(SURFACE_2))
        p.setBrush(QBrush(grad))
        p.drawRoundedRect(0, 0, w - 1, h - 1, 18, 18)

        p.setPen(QColor(MUTED))
        p.drawText(16, 16, "Your readiness")
        p.setPen(QColor(BLUE_SOFT))
        p.drawText(w - 48, 16, f"{self._pct}%")

        track_x, track_y, track_h = 16, 24, 5
        track_w = w - 32
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QBrush(QColor(BLUE_DIM)))
        p.drawRoundedRect(track_x, track_y, track_w, track_h, 3, 3)
        fill_w = int(track_w * self._pct / 100)
        if fill_w > 0:
            bar = QLinearGradient(track_x, 0, track_x + fill_w, 0)
            bar.setColorAt(0.0, QColor(BLUE))
            bar.setColorAt(1.0, QColor(BLUE_SOFT))
            p.setBrush(QBrush(bar))
            p.drawRoundedRect(track_x, track_y, fill_w, track_h, 3, 3)

        milestones = [
            ("laptop", "Hardware", self._milestones["laptop"]),
            ("mentor", "People", self._milestones["mentor"]),
            ("day1", "Ready", self._milestones["day1"]),
        ]
        gap = track_w // 3
        for i, (kind, label, done) in enumerate(milestones):
            cx = track_x + gap // 2 + i * gap
            cy = 52
            p.setPen(Qt.PenStyle.NoPen)
            if done:
                glow = QRadialGradient(cx, cy - 2, 14)
                glow.setColorAt(0.0, QColor(61, 126, 255, 90))
                glow.setColorAt(1.0, QColor(61, 126, 255, 0))
                p.setBrush(QBrush(glow))
                p.drawEllipse(cx - 14, cy - 16, 28, 28)
                p.setBrush(QBrush(QColor(BLUE)))
            else:
                p.setBrush(QBrush(QColor(SURFACE_2)))
            p.drawEllipse(cx - 9, cy - 9, 18, 18)
            self._draw_icon(p, kind, cx, cy, done)
            p.setPen(QColor(TEXT if done else MUTED))
            p.drawText(cx - 26, cy + 12, 52, 16, Qt.AlignmentFlag.AlignHCenter, label)


class _SendOrb(QPushButton):
    """Glowing circular send button (MindBot mic/send motif)."""

    def __init__(self, parent=None) -> None:
        super().__init__("↑", parent)
        self.setFixedSize(44, 44)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        self.setFlat(True)
        self.setStyleSheet("border:0; background:transparent; color:#fff; font-size:18px; font-weight:700;")

    def paintEvent(self, event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        r = QRectF(2, 2, self.width() - 4, self.height() - 4)
        glow = QRadialGradient(r.center(), r.width() * 0.7)
        if self.isEnabled():
            glow.setColorAt(0.0, QColor(61, 126, 255, 120))
            glow.setColorAt(0.55, QColor(61, 126, 255, 40))
            glow.setColorAt(1.0, QColor(61, 126, 255, 0))
            p.setBrush(QBrush(glow))
            p.setPen(Qt.PenStyle.NoPen)
            p.drawEllipse(QRectF(0, 0, self.width(), self.height()))
            core = QLinearGradient(0, 0, 0, self.height())
            core.setColorAt(0.0, QColor(BLUE_SOFT))
            core.setColorAt(1.0, QColor(BLUE))
            p.setBrush(QBrush(core))
        else:
            p.setBrush(QBrush(QColor(LINE)))
        p.setPen(Qt.PenStyle.NoPen)
        p.drawEllipse(r)
        p.setPen(QColor("#FFFFFF" if self.isEnabled() else MUTED))
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
        max_h = int((screen.availableGeometry().height() * 0.9) if screen else 800)
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

        self.setStyleSheet(
            f"""
            ChatPanel {{
              background: transparent;
              border: 1px solid {LINE};
              border-radius: 22px;
            }}
            QWidget#panelContent {{
              background: transparent;
            }}
            QLabel {{ color: {TEXT}; font-size: 13px; }}
            QLineEdit#composer {{
              background: {SURFACE};
              color: {TEXT};
              border: 1px solid {LINE};
              border-radius: 22px;
              padding: 12px 18px;
              font-size: 13px;
              selection-background-color: {BLUE_DIM};
            }}
            QLineEdit#composer:focus {{ border-color: {BLUE}; }}
            QLineEdit#composer:disabled {{ color: {MUTED}; }}
            QPushButton#icon {{
              background: transparent; color: {MUTED}; border: 0;
              font-size: 15px; padding: 6px 8px; border-radius: 10px;
            }}
            QPushButton#icon:hover {{ background: {SURFACE}; color: {TEXT}; }}
            QPushButton#chip {{
              background: {SURFACE};
              color: {TEXT};
              border: 1px solid {LINE};
              border-radius: 14px;
              padding: 10px 12px;
              font-size: 12px;
              font-weight: 600;
            }}
            QPushButton#chip:hover {{
              background: {BLUE_DIM};
              border-color: {BLUE};
              color: #ffffff;
            }}
            QPushButton#cta {{
              background: qlineargradient(x1:0,y1:0,x2:1,y2:0,
                stop:0 {BLUE}, stop:1 {BLUE_SOFT});
              color: #ffffff;
              border: 0;
              border-radius: 22px;
              font-weight: 700;
              padding: 14px 28px;
              font-size: 14px;
            }}
            QPushButton#cta:hover {{ background: {BLUE_SOFT}; }}
            QScrollArea {{ border: 0; background: transparent; }}
            QWidget#chatInner {{ background: transparent; }}
            QScrollBar:vertical {{
              background: transparent; width: 6px; margin: 4px;
            }}
            QScrollBar::handle:vertical {{
              background: {LINE}; border-radius: 3px; min-height: 24px;
            }}
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{ height: 0; }}
            """
        )

        # Content over SmartStart portal particle-globe backdrop
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        self._net = NetworkSphere(self, hero=True)
        self._net.lower()

        content = QWidget()
        content.setObjectName("panelContent")
        content.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        content_l = QVBoxLayout(content)
        content_l.setContentsMargins(22, 18, 18, 16)
        content_l.setSpacing(0)

        # Header
        head = QHBoxLayout()
        head.setSpacing(6)
        titles = QVBoxLayout()
        titles.setSpacing(2)
        brand = QLabel("IRA")
        brand.setStyleSheet(
            f"color:{TEXT}; font-size:15px; font-weight:800; letter-spacing:0.04em;"
        )
        self.status_line = QLabel("Not connected")
        self.status_line.setStyleSheet(f"color:{MUTED}; font-size:11px;")
        titles.addWidget(brand)
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
        content_l.addLayout(head)
        content_l.addSpacing(14)

        # Auth gate
        self.auth = QWidget()
        auth_l = QVBoxLayout(self.auth)
        auth_l.setContentsMargins(8, 24, 8, 24)
        auth_l.setSpacing(12)
        auth_l.addStretch(1)
        hero = QLabel("Waters knowledge\nlayer")
        hero.setAlignment(Qt.AlignmentFlag.AlignCenter)
        hero.setStyleSheet(
            f"color:{TEXT}; font-size:26px; font-weight:800; letter-spacing:-0.03em; line-height:1.15;"
        )
        self.auth_status = QLabel("Waiting for employee sign-in")
        self.auth_status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.auth_status.setStyleSheet(f"color:{MUTED}; font-size:13px;")
        auth_copy = QLabel(
            "Navigate apps, teams, processes, and approved docs.\n"
            "Sign in via SmartStart — IRA unlocks with your role."
        )
        auth_copy.setAlignment(Qt.AlignmentFlag.AlignCenter)
        auth_copy.setWordWrap(True)
        auth_copy.setStyleSheet(f"color:{MUTED}; font-size:12.5px;")
        self.connect_btn = QPushButton("Get Started")
        self.connect_btn.setObjectName("cta")
        self.connect_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.connect_btn.clicked.connect(self.open_smartstart_requested.emit)
        auth_l.addWidget(hero)
        auth_l.addSpacing(8)
        auth_l.addWidget(self.auth_status)
        auth_l.addWidget(auth_copy)
        auth_l.addSpacing(18)
        auth_l.addWidget(self.connect_btn, alignment=Qt.AlignmentFlag.AlignCenter)
        auth_l.addStretch(1)
        content_l.addWidget(self.auth, 1)

        # Unlocked body
        self.body = QWidget()
        body_l = QVBoxLayout(self.body)
        body_l.setContentsMargins(0, 0, 0, 0)
        body_l.setSpacing(20)

        # Compact greeting — two lines only
        greet = QVBoxLayout()
        greet.setSpacing(6)
        greet.setContentsMargins(0, 0, 0, 0)
        self.hello = QLabel("Hi")
        self.hello.setStyleSheet(
            f"color:{TEXT}; font-size:20px; font-weight:800; letter-spacing:-0.03em;"
        )
        self.prompt = QLabel("")  # unused, kept for API compatibility
        self.prompt.hide()
        self.identity = QLabel("")
        self.identity.setStyleSheet(f"color:{MUTED}; font-size:12px;")
        greet.addWidget(self.hello)
        greet.addWidget(self.identity)
        body_l.addLayout(greet)

        self.progress = ProgressCard()
        self.progress.hide()
        body_l.addWidget(self.progress)

        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.scroll.setMinimumHeight(300)
        self.chat_inner = QWidget()
        self.chat_inner.setObjectName("chatInner")
        self.chat_layout = QVBoxLayout(self.chat_inner)
        self.chat_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.chat_layout.setSpacing(40)
        self.chat_layout.setContentsMargins(0, 8, 4, 48)
        self.chat_layout.setSizeConstraint(QVBoxLayout.SizeConstraint.SetMinAndMaxSize)
        self.scroll.setWidget(self.chat_inner)
        body_l.addWidget(self.scroll, 1)

        # Suggestion chips — fixed strip above composer (never in scroll stack)
        self.suggest_host = QWidget()
        self.suggest_host.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self.suggest_grid = QGridLayout(self.suggest_host)
        self.suggest_grid.setContentsMargins(0, 8, 0, 4)
        self.suggest_grid.setHorizontalSpacing(14)
        self.suggest_grid.setVerticalSpacing(12)
        self.suggest_host.hide()
        body_l.addWidget(self.suggest_host)
        body_l.addSpacing(12)

        # Composer bar
        composer = QFrame()
        composer.setObjectName("composerBar")
        composer.setStyleSheet(
            f"QFrame#composerBar {{ background:{SURFACE}; border:1px solid {LINE};"
            f" border-radius:26px; margin-top:4px; }}"
        )
        comp_l = QHBoxLayout(composer)
        comp_l.setContentsMargins(8, 8, 8, 8)
        comp_l.setSpacing(8)
        self.input = QLineEdit()
        self.input.setObjectName("composer")
        self.input.setPlaceholderText("Ask about apps, teams, docs…")
        self.input.setStyleSheet(
            f"QLineEdit#composer {{ background:transparent; border:0; color:{TEXT};"
            f" padding:10px 12px; font-size:13px; }}"
        )
        self.input.returnPressed.connect(self._submit)
        self.send_btn = _SendOrb()
        self.send_btn.clicked.connect(self._submit)
        comp_l.addWidget(self.input, 1)
        comp_l.addWidget(self.send_btn, 0)
        body_l.addWidget(composer)

        content_l.addWidget(self.body, 1)

        grip_row = QHBoxLayout()
        grip_row.setContentsMargins(0, 4, 2, 0)
        grip_row.addStretch()
        grip = QSizeGrip(self)
        grip.setFixedSize(14, 14)
        grip.setStyleSheet("background:transparent; border:0;")
        grip_row.addWidget(grip)
        content_l.addLayout(grip_row)

        root.addWidget(content)
        self._content = content
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, False)
        self.set_locked(True)

    def resizeEvent(self, event) -> None:
        super().resizeEvent(event)
        if hasattr(self, "_net"):
            self._net.setGeometry(self.rect())
            self._net.lower()

    def paintEvent(self, _event) -> None:
        # Border only — portal globe paints the fill
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        p.setPen(QPen(QColor(LINE)))
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.drawRoundedRect(0, 0, self.width() - 1, self.height() - 1, 22, 22)

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
            self._employee_first = ""
            self.status_line.setText("Not connected")
            self.status_line.setStyleSheet(f"color:{MUTED}; font-size:11px;")
            self.set_suggestions([])
            if hasattr(self, "_net"):
                self._net.set_hero(True)
            if self._mode == PanelMode.NORMAL:
                self.resize(self.width(), min(self.height(), 520))
        else:
            first = (name or "there").split()[0]
            self._employee_first = first
            self.hello.setText(f"Hi, {first}")
            role_disp = "FTE" if role.upper() == "FTE" else role.capitalize()
            parts = [p for p in (role_disp, dept) if p]
            self.identity.setText(" · ".join(parts) if parts else "Waters knowledge layer")
            self.status_line.setText("Connected to SmartStart")
            self.status_line.setStyleSheet(f"color:{GREEN}; font-size:11px;")
            if hasattr(self, "_net"):
                self._net.set_hero(False)
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
        self.set_suggestions([])

    def _bubble_style(self, role: str, *, latest: bool) -> str:
        if role == "user":
            bg = USER_BUBBLE if latest else "#1C2A40"
            return (
                f"QFrame#msgBubble {{ background:{bg}; border-radius:18px;"
                f" border:1px solid {LINE}; }}"
                f" QLabel {{ color:{TEXT}; font-size:13px; background:transparent; border:0; }}"
            )
        bg = IRA_BUBBLE if latest else "#121A2A"
        border = BLUE if latest else LINE
        return (
            f"QFrame#msgBubble {{ background:{bg}; border-radius:18px;"
            f" border:1px solid {border}; }}"
            f" QLabel {{ color:{TEXT}; font-size:13px; background:transparent; border:0; }}"
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
                        f"color:{BLUE_SOFT if latest else MUTED}; font-size:10px;"
                        "font-weight:700; letter-spacing:0.06em;"
                    )

    def add_message(self, text: str, *, role: str = "ira") -> None:
        avail = max(220, self.width() - 76)
        bubble_w = min(avail, max(210, int(avail * 0.82)))

        box = QWidget()
        box.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Minimum)
        wrap = QVBoxLayout(box)
        wrap.setSpacing(8)
        wrap.setContentsMargins(0, 0, 0, 0)
        align = Qt.AlignmentFlag.AlignRight if role == "user" else Qt.AlignmentFlag.AlignLeft

        who = "YOU" if role == "user" else "IRA"
        stamp = datetime.now().strftime("%H:%M")
        meta = QLabel(f"{who}  ·  {stamp}")
        meta.setObjectName("msgMeta")
        meta.setStyleSheet(
            f"color:{BLUE_SOFT}; font-size:10px; font-weight:700; letter-spacing:0.06em;"
        )
        wrap.addWidget(meta, alignment=align)

        bubble = QFrame()
        bubble.setObjectName("msgBubble")
        bubble.setProperty("msgRole", role)
        bubble.setFixedWidth(bubble_w)
        bubble.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)
        bubble.setStyleSheet(self._bubble_style(role, latest=True))
        inner = QVBoxLayout(bubble)
        inner.setContentsMargins(16, 14, 16, 14)
        inner.setSpacing(0)
        body = QLabel(text)
        body.setWordWrap(True)
        body.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        body.setFixedWidth(bubble_w - 32)
        inner.addWidget(body)
        wrap.addWidget(bubble, alignment=align)

        self.chat_layout.addWidget(box)

        def _fit() -> None:
            w = max(80, body.width() or (bubble_w - 32))
            h = max(body.heightForWidth(w), body.sizeHint().height(), 18)
            body.setFixedHeight(h)
            bubble.setFixedHeight(h + 28)
            self.chat_inner.adjustSize()

        _fit()
        QTimer.singleShot(0, _fit)
        self._dim_older_messages()
        QTimer.singleShot(20, self._scroll_bottom)

    def show_typing(self) -> QLabel:
        tip = QLabel("IRA is thinking…")
        tip.setStyleSheet(f"color:{MUTED}; font-size:12px; padding:8px 0;")
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
            # Cap at 2 side-by-side chips so the strip never stacks into the composer
            for i, text in enumerate(items[:2]):
                btn = QPushButton(text)
                btn.setObjectName("chip")
                btn.setCursor(Qt.CursorShape.PointingHandCursor)
                btn.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
                btn.setFixedHeight(40)
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
