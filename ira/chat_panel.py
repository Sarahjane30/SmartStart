"""IRA chat panel — compact, resizable SmartStart assistant."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from PySide6.QtCore import Qt, QTimer, Signal, QSize, QPoint, QRect
from PySide6.QtGui import QCursor, QKeyEvent, QMouseEvent
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

EDGE = 8  # px hit zone for edge resize


class PanelMode(str, Enum):
    NORMAL = "normal"
    EXPANDED = "expanded"


# Default / expanded footprints (width, height)
SIZES = {
    PanelMode.NORMAL: (400, 480),
    PanelMode.EXPANDED: (620, 640),
}
MIN_W, MIN_H = 360, 420
MAX_W = 700


class _FlowLayout(QLayout):
    def __init__(self, parent=None, spacing: int = 6) -> None:
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
            """
            ChatPanel {
              background: #0f172a;
              border: 1px solid #1e293b;
              border-radius: 14px;
            }
            QLabel { color: #e2e8f0; font-size: 13px; }
            QLineEdit {
              background: #1e293b; color: #f8fafc; border: 1px solid #334155;
              border-radius: 10px; padding: 9px 11px; font-size: 13px;
            }
            QLineEdit:disabled { color: #64748b; }
            QPushButton#send {
              background: #0284c7; color: #fff; border: 0; border-radius: 10px;
              font-weight: 700; padding: 9px 12px; font-size: 13px;
              min-width: 56px; max-width: 72px;
            }
            QPushButton#send:disabled { background: #334155; color: #64748b; }
            QPushButton#icon {
              background: transparent; color: #94a3b8; border: 0;
              font-size: 13px; padding: 4px 7px; border-radius: 6px;
            }
            QPushButton#icon:hover { background: #1e293b; color: #e2e8f0; }
            QPushButton#chip {
              background: #1e293b; color: #cbd5e1; border: 1px solid #334155;
              border-radius: 14px; padding: 5px 11px; font-size: 12px;
            }
            QPushButton#chip:hover { border-color: #38bdf8; color: #e0f2fe; }
            QPushButton#cta {
              background: #0284c7; color: #fff; border: 0; border-radius: 10px;
              font-weight: 700; padding: 11px 18px; font-size: 13px;
            }
            QPushButton#cta:hover { background: #0369a1; }
            QScrollArea { border: 0; background: transparent; }
            QWidget#chatInner { background: transparent; }
            QFrame#authCard {
              background: #111827; border: 1px solid #1f2937; border-radius: 12px;
            }
            QLabel#section {
              color: #64748b; font-size: 11px; font-weight: 600;
              letter-spacing: 0.02em;
            }
            """
        )

        root = QVBoxLayout(self)
        root.setContentsMargins(14, 12, 14, 10)
        root.setSpacing(8)

        # —— Header ——
        head = QHBoxLayout()
        head.setSpacing(6)
        titles = QVBoxLayout()
        titles.setSpacing(1)
        title = QLabel("IRA")
        title.setStyleSheet("color:#f8fafc; font-size:15px; font-weight:700;")
        self.status_line = QLabel("● Not connected")
        self.status_line.setStyleSheet("color:#94a3b8; font-size:11px;")
        titles.addWidget(title)
        titles.addWidget(self.status_line)
        head.addLayout(titles, 1)

        self.btn_expand = QPushButton("↗")
        self.btn_expand.setObjectName("icon")
        self.btn_expand.setToolTip("Expand")
        self.btn_expand.clicked.connect(self._toggle_expand)
        btn_min = QPushButton("—")
        btn_min.setObjectName("icon")
        btn_min.setToolTip("Minimize")
        btn_min.clicked.connect(self.minimize_requested.emit)
        btn_close = QPushButton("×")
        btn_close.setObjectName("icon")
        btn_close.setToolTip("Close")
        btn_close.clicked.connect(self.close_requested.emit)
        head.addWidget(self.btn_expand)
        head.addWidget(btn_min)
        head.addWidget(btn_close)
        root.addLayout(head)

        # —— Auth (compact single card) ——
        self.auth = QFrame()
        self.auth.setObjectName("authCard")
        auth_l = QVBoxLayout(self.auth)
        auth_l.setContentsMargins(18, 22, 18, 22)
        auth_l.setSpacing(10)
        auth_l.setAlignment(Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignHCenter)

        auth_brand = QLabel("IRA")
        auth_brand.setAlignment(Qt.AlignmentFlag.AlignCenter)
        auth_brand.setStyleSheet("font-size:18px; font-weight:700; color:#f8fafc;")
        self.auth_status = QLabel("● Not connected")
        self.auth_status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.auth_status.setStyleSheet("color:#f59e0b; font-size:12px;")
        auth_copy = QLabel(
            "IRA uses your SmartStart employee session\nto personalize onboarding answers."
        )
        auth_copy.setAlignment(Qt.AlignmentFlag.AlignCenter)
        auth_copy.setWordWrap(True)
        auth_copy.setStyleSheet("color:#94a3b8; font-size:13px;")
        self.connect_btn = QPushButton("Connect SmartStart")
        self.connect_btn.setObjectName("cta")
        self.connect_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.connect_btn.clicked.connect(self.open_smartstart_requested.emit)
        auth_l.addStretch(1)
        auth_l.addWidget(auth_brand)
        auth_l.addWidget(self.auth_status)
        auth_l.addSpacing(4)
        auth_l.addWidget(auth_copy)
        auth_l.addSpacing(8)
        auth_l.addWidget(self.connect_btn, alignment=Qt.AlignmentFlag.AlignCenter)
        auth_l.addStretch(1)
        root.addWidget(self.auth, 1)

        # —— Signed-in body ——
        self.body = QWidget()
        body_l = QVBoxLayout(self.body)
        body_l.setContentsMargins(0, 0, 0, 0)
        body_l.setSpacing(8)

        self.identity = QLabel("")
        self.identity.setStyleSheet(
            "color:#94a3b8; font-size:12px; background:#111827;"
            "border:1px solid #1f2937; border-radius:8px; padding:6px 10px;"
        )
        body_l.addWidget(self.identity)

        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.scroll.setMinimumHeight(80)
        self.scroll.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        self.chat_inner = QWidget()
        self.chat_inner.setObjectName("chatInner")
        self.chat_layout = QVBoxLayout(self.chat_inner)
        self.chat_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.chat_layout.setSpacing(8)
        self.chat_layout.setContentsMargins(2, 0, 2, 0)
        self.scroll.setWidget(self.chat_inner)
        body_l.addWidget(self.scroll, 1)

        self.suggest_label = QLabel("Suggested")
        self.suggest_label.setObjectName("section")
        self.suggest_label.setContentsMargins(2, 0, 0, 0)
        body_l.addWidget(self.suggest_label)
        self.suggest_host = QWidget()
        self.suggest_host.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Minimum)
        self.suggest_flow = _FlowLayout(self.suggest_host, spacing=6)
        self.suggest_host.setLayout(self.suggest_flow)
        body_l.addWidget(self.suggest_host)

        row = QHBoxLayout()
        row.setSpacing(8)
        row.setContentsMargins(0, 0, 0, 0)
        self.input = QLineEdit()
        self.input.setPlaceholderText("Ask IRA anything…")
        self.input.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self.input.returnPressed.connect(self._submit)
        self.send_btn = QPushButton("Send")
        self.send_btn.setObjectName("send")
        self.send_btn.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Fixed)
        self.send_btn.clicked.connect(self._submit)
        row.addWidget(self.input, 1)
        row.addWidget(self.send_btn, 0)
        body_l.addLayout(row)

        root.addWidget(self.body, 1)

        # Subtle resize affordance
        grip_row = QHBoxLayout()
        grip_row.setContentsMargins(0, 0, 0, 0)
        grip_row.addStretch()
        hint = QLabel("⤡ resize")
        hint.setStyleSheet("color:#475569; font-size:10px;")
        grip_row.addWidget(hint)
        grip = QSizeGrip(self)
        grip.setFixedSize(14, 14)
        grip_row.addWidget(grip)
        root.addLayout(grip_row)

        self.set_locked(True)

    # ——— sizing modes ———

    def _toggle_expand(self) -> None:
        if self._mode == PanelMode.NORMAL:
            self.apply_mode(PanelMode.EXPANDED)
        else:
            self.apply_mode(PanelMode.NORMAL)

    def apply_mode(self, mode: PanelMode) -> None:
        self._mode = mode
        screen = QApplication.primaryScreen()
        max_h = int((screen.availableGeometry().height() * 0.9) if screen else 800)
        w, h = SIZES[mode]
        h = min(h, max_h)
        # Keep bottom-right corner anchored when expanding
        old = self.geometry()
        self.resize(w, h)
        new = self.geometry()
        dx = old.width() - new.width()
        dy = old.height() - new.height()
        self.move(old.x() + dx, old.y() + dy)
        self.btn_expand.setText("↙" if mode == PanelMode.EXPANDED else "↗")
        self.btn_expand.setToolTip("Normal size" if mode == PanelMode.EXPANDED else "Expand")
        self.mode_changed.emit(mode.value)

    # ——— edge resize ———

    def _hit_edge(self, pos: QPoint) -> str | None:
        r = self.rect()
        left = pos.x() <= EDGE
        right = pos.x() >= r.width() - EDGE
        top = pos.y() <= EDGE
        bottom = pos.y() >= r.height() - EDGE
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
        edge = self._hit_edge(event.position().toPoint())
        self.setCursor(QCursor(self._cursor_for(edge)))
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

    # ——— state ———

    def set_online(self, online: bool) -> None:
        if self._unlocked:
            self.status_line.setText("● Connected to SmartStart" if online else "● SmartStart offline")
            self.status_line.setStyleSheet(
                f"color:{'#22c55e' if online else '#f59e0b'}; font-size:11px;"
            )
        else:
            self.status_line.setText("● Not connected")
            self.status_line.setStyleSheet("color:#94a3b8; font-size:11px;")
            self.auth_status.setText("● Waiting for SmartStart…" if online else "● Not connected")
            self.auth_status.setStyleSheet(
                f"color:{'#38bdf8' if online else '#f59e0b'}; font-size:12px;"
            )

    def set_locked(self, locked: bool, *, name: str = "", role: str = "", dept: str = "") -> None:
        self._unlocked = not locked
        self.auth.setVisible(locked)
        self.body.setVisible(not locked)
        self.input.setEnabled(not locked)
        self.send_btn.setEnabled(not locked)
        # Compact height while waiting for login — avoid a giant empty sheet
        if locked and self._mode == PanelMode.NORMAL:
            self.resize(self.width(), min(self.height(), 420))
        if locked:
            self.status_line.setText("● Not connected")
            self.status_line.setStyleSheet("color:#94a3b8; font-size:11px;")
            self.set_suggestions([])
        else:
            bits = [name] if name else ["Signed in"]
            if role:
                bits.append("FTE" if role.upper() == "FTE" else role.capitalize())
            if dept:
                bits.append(dept)
            self.identity.setText(" · ".join(bits))
            self.status_line.setText("● Connected to SmartStart")
            self.status_line.setStyleSheet("color:#22c55e; font-size:11px;")
            self.input.setFocus()
            if self._mode == PanelMode.NORMAL:
                self.apply_mode(PanelMode.NORMAL)

    def clear_chat(self) -> None:
        while self.chat_layout.count():
            item = self.chat_layout.takeAt(0)
            w = item.widget()
            if w:
                w.deleteLater()

    def add_message(self, text: str, *, role: str = "ira") -> None:
        # Use panel width (not viewport — often 0 before first paint on Windows)
        avail = max(220, self.width() - 56)
        bubble_w = min(avail, max(200, int(avail * 0.92)))

        bubble = QLabel()
        bubble.setText(text)
        bubble.setWordWrap(True)
        bubble.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        bubble.setSizePolicy(QSizePolicy.Policy.Fixed, QSizePolicy.Policy.Minimum)
        bubble.setFixedWidth(bubble_w)
        # Critical: force height so wrapped text is not clipped mid-sentence
        bubble.setMinimumHeight(bubble.heightForWidth(bubble_w))

        if role == "user":
            bubble.setStyleSheet(
                "background:#1d4ed8; color:#eff6ff; border-radius:12px;"
                "padding:8px 11px; font-size:13px;"
            )
        else:
            bubble.setStyleSheet(
                "background:#1e293b; color:#e2e8f0; border-radius:12px;"
                "padding:8px 11px; font-size:13px;"
            )
        # Recompute after stylesheet (font metrics can change)
        bubble.setMinimumHeight(max(bubble.heightForWidth(bubble_w), 36))

        meta = QLabel(datetime.now().strftime("%H:%M"))
        meta.setStyleSheet("color:#64748b; font-size:10px;")
        wrap = QVBoxLayout()
        wrap.setSpacing(2)
        wrap.setContentsMargins(0, 0, 0, 0)
        align = Qt.AlignmentFlag.AlignRight if role == "user" else Qt.AlignmentFlag.AlignLeft
        wrap.addWidget(bubble, alignment=align)
        wrap.addWidget(meta, alignment=align)
        box = QWidget()
        box.setLayout(wrap)
        box.setMinimumWidth(bubble_w)
        self.chat_layout.addWidget(box)
        QTimer.singleShot(20, self._scroll_bottom)

    def show_typing(self) -> QLabel:
        tip = QLabel("IRA is typing…")
        tip.setStyleSheet("color:#94a3b8; font-size:12px; font-style:italic;")
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
            btn.setSizePolicy(QSizePolicy.Policy.Minimum, QSizePolicy.Policy.Fixed)
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
