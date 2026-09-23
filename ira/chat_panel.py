"""Expanded IRA chat panel — resizable desktop companion."""

from __future__ import annotations

from datetime import datetime

from PySide6.QtCore import Qt, QTimer, Signal, QSize, QPoint, QRect
from PySide6.QtGui import QKeyEvent, QColor, QMouseEvent, QGuiApplication
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
)

from ira.winflags import companion_window_flags


class _FlowLayout(QLayout):
    """Simple wrapping chip row for suggested questions."""

    def __init__(self, parent=None, spacing: int = 6) -> None:
        super().__init__(parent)
        self._items: list[QLayoutItem] = []
        self.setSpacing(spacing)

    def addItem(self, item: QLayoutItem) -> None:
        self._items.append(item)

    def count(self) -> int:
        return len(self._items)

    def itemAt(self, index: int) -> QLayoutItem | None:
        if 0 <= index < len(self._items):
            return self._items[index]
        return None

    def takeAt(self, index: int) -> QLayoutItem | None:
        if 0 <= index < len(self._items):
            return self._items.pop(index)
        return None

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
        size += QSize(m.left() + m.right(), m.top() + m.bottom())
        return size

    def _do_layout(self, rect: QRect, test_only: bool) -> int:
        x, y = rect.x(), rect.y()
        line_h = 0
        for item in self._items:
            w = item.sizeHint().width()
            h = item.sizeHint().height()
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
    refresh_requested = Signal()

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.setWindowTitle("IRA — Your onboarding companion")
        self.setWindowFlags(companion_window_flags())
        self.setMinimumSize(340, 480)
        self.setMaximumSize(560, 800)
        self.resize(380, 560)
        self._unlocked = False
        self._signed_name = ""

        self.setStyleSheet(
            """
            ChatPanel { background: #0b1220; }
            QLabel { color: #e2e8f0; font-size: 13px; }
            QLineEdit {
              background: #1e293b; color: #f8fafc; border: 1px solid #334155;
              border-radius: 10px; padding: 10px 12px; font-size: 13px;
            }
            QLineEdit:disabled { color: #64748b; }
            QPushButton#send {
              background: #0284c7; color: #f8fafc; border: 0; border-radius: 10px;
              font-weight: 700; padding: 10px 14px; font-size: 13px; min-width: 44px;
            }
            QPushButton#send:disabled { background: #334155; color: #94a3b8; }
            QPushButton#icon {
              background: transparent; color: #94a3b8; border: 0; font-size: 16px;
              padding: 4px 8px;
            }
            QPushButton#icon:hover { color: #e2e8f0; }
            QPushButton#chip {
              background: #1e293b; color: #cbd5e1; border: 1px solid #334155;
              border-radius: 14px; padding: 6px 12px; font-size: 12px;
            }
            QPushButton#chip:hover { border-color: #38bdf8; color: #e0f2fe; }
            QPushButton#cta {
              background: #0284c7; color: #fff; border: 0; border-radius: 10px;
              font-weight: 700; padding: 12px 16px; font-size: 13px;
            }
            QPushButton#cta:hover { background: #0369a1; }
            QScrollArea { border: 0; background: transparent; }
            QWidget#chatInner { background: transparent; }
            QFrame#gate {
              background: #111827; border: 1px solid #1f2937; border-radius: 12px;
            }
            """
        )

        root = QVBoxLayout(self)
        root.setContentsMargins(14, 12, 14, 10)
        root.setSpacing(10)

        # Header
        head = QHBoxLayout()
        titles = QVBoxLayout()
        titles.setSpacing(2)
        title = QLabel("IRA")
        title.setStyleSheet("color:#f8fafc; font-size:16px; font-weight:700;")
        self.subtitle = QLabel("Your onboarding companion")
        self.subtitle.setStyleSheet("color:#94a3b8; font-size:12px;")
        titles.addWidget(title)
        titles.addWidget(self.subtitle)
        head.addLayout(titles, 1)
        self.status_dot = QLabel("●")
        self.status_dot.setStyleSheet("color:#64748b; font-size:11px;")
        head.addWidget(self.status_dot)
        btn_min = QPushButton("−")
        btn_min.setObjectName("icon")
        btn_min.setToolTip("Minimize")
        btn_min.clicked.connect(self.minimize_requested.emit)
        btn_close = QPushButton("×")
        btn_close.setObjectName("icon")
        btn_close.setToolTip("Close")
        btn_close.clicked.connect(self.close_requested.emit)
        head.addWidget(btn_min)
        head.addWidget(btn_close)
        root.addLayout(head)

        # Identity strip
        self.identity = QLabel("Not signed in to SmartStart")
        self.identity.setStyleSheet(
            "color:#94a3b8; font-size:12px; background:#111827;"
            "border:1px solid #1f2937; border-radius:8px; padding:8px 10px;"
        )
        root.addWidget(self.identity)

        # Login gate
        self.gate = QFrame()
        self.gate.setObjectName("gate")
        gate_l = QVBoxLayout(self.gate)
        gate_l.setContentsMargins(16, 18, 16, 18)
        gate_l.setSpacing(10)
        gate_title = QLabel("Sign in to SmartStart")
        gate_title.setStyleSheet("font-size:15px; font-weight:700; color:#f8fafc;")
        gate_body = QLabel(
            "IRA uses your SmartStart employee session.\n"
            "Open the portal, choose Intern or FTE, pick your profile, "
            "then come back — chat unlocks automatically."
        )
        gate_body.setWordWrap(True)
        gate_body.setStyleSheet("color:#94a3b8; font-size:13px; line-height:1.35;")
        self.open_ss_btn = QPushButton("Open SmartStart to sign in")
        self.open_ss_btn.setObjectName("cta")
        self.open_ss_btn.setCursor(Qt.CursorShape.PointingHandCursor)
        self.open_ss_btn.clicked.connect(self.open_smartstart_requested.emit)
        gate_l.addWidget(gate_title)
        gate_l.addWidget(gate_body)
        gate_l.addWidget(self.open_ss_btn)
        root.addWidget(self.gate)

        # Chat area
        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.chat_inner = QWidget()
        self.chat_inner.setObjectName("chatInner")
        self.chat_layout = QVBoxLayout(self.chat_inner)
        self.chat_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.chat_layout.setSpacing(10)
        self.chat_layout.setContentsMargins(0, 0, 4, 0)
        self.scroll.setWidget(self.chat_inner)
        root.addWidget(self.scroll, 1)

        # Suggestions label + flow chips
        self.suggest_label = QLabel("Try asking")
        self.suggest_label.setStyleSheet("color:#64748b; font-size:11px; font-weight:600;")
        root.addWidget(self.suggest_label)
        self.suggest_host = QWidget()
        self.suggest_flow = _FlowLayout(self.suggest_host, spacing=6)
        self.suggest_host.setLayout(self.suggest_flow)
        root.addWidget(self.suggest_host)

        # Input
        row = QHBoxLayout()
        self.input = QLineEdit()
        self.input.setPlaceholderText("Ask IRA anything…")
        self.input.returnPressed.connect(self._submit)
        self.send_btn = QPushButton("Send")
        self.send_btn.setObjectName("send")
        self.send_btn.clicked.connect(self._submit)
        row.addWidget(self.input, 1)
        row.addWidget(self.send_btn)
        root.addLayout(row)

        # Resize grip
        grip_row = QHBoxLayout()
        grip_row.addStretch()
        grip = QSizeGrip(self)
        grip.setStyleSheet("background: transparent; width: 16px; height: 16px;")
        grip_row.addWidget(grip)
        root.addLayout(grip_row)

        self.set_locked(True)

        # Drag window from header area
        self._drag_offset: QPoint | None = None

    def mousePressEvent(self, event: QMouseEvent) -> None:
        if event.button() == Qt.MouseButton.LeftButton and event.position().y() < 56:
            self._drag_offset = event.globalPosition().toPoint() - self.frameGeometry().topLeft()
            event.accept()
        else:
            super().mousePressEvent(event)

    def mouseMoveEvent(self, event: QMouseEvent) -> None:
        if self._drag_offset is not None and event.buttons() & Qt.MouseButton.LeftButton:
            self.move(event.globalPosition().toPoint() - self._drag_offset)
            event.accept()
        else:
            super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event: QMouseEvent) -> None:
        self._drag_offset = None
        super().mouseReleaseEvent(event)

    def set_online(self, online: bool) -> None:
        self.status_dot.setStyleSheet(
            f"color:{'#22c55e' if online else '#f59e0b'}; font-size:11px;"
        )
        self.status_dot.setToolTip("SmartStart connected" if online else "SmartStart offline")

    def set_locked(self, locked: bool, *, name: str = "") -> None:
        self._unlocked = not locked
        self._signed_name = name
        self.gate.setVisible(locked)
        self.scroll.setVisible(not locked)
        self.suggest_label.setVisible(not locked)
        self.suggest_host.setVisible(not locked)
        self.input.setEnabled(not locked)
        self.send_btn.setEnabled(not locked)
        if locked:
            self.identity.setText("Not signed in to SmartStart")
            self.subtitle.setText("Waiting for SmartStart login")
            self.input.setPlaceholderText("Sign in to SmartStart first…")
            self.set_suggestions([])
        else:
            self.identity.setText(f"Signed in · {name}" if name else "Signed in")
            self.subtitle.setText("Connected to SmartStart")
            self.input.setPlaceholderText("Ask IRA anything…")
            self.input.setFocus()

    def clear_chat(self) -> None:
        while self.chat_layout.count():
            item = self.chat_layout.takeAt(0)
            w = item.widget()
            if w:
                w.deleteLater()

    def add_message(self, text: str, *, role: str = "ira") -> None:
        max_w = max(200, self.scroll.viewport().width() - 28)
        bubble = QLabel(text)
        bubble.setWordWrap(True)
        bubble.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        bubble.setSizePolicy(QSizePolicy.Policy.Preferred, QSizePolicy.Policy.Minimum)
        bubble.setMaximumWidth(max_w)
        bubble.setMinimumWidth(min(160, max_w))
        ts = datetime.now().strftime("%H:%M")
        if role == "user":
            bubble.setStyleSheet(
                "background:#1d4ed8; color:#eff6ff; border-radius:12px;"
                "padding:10px 12px; font-size:13px;"
            )
        else:
            bubble.setStyleSheet(
                "background:#1e293b; color:#e2e8f0; border-radius:12px;"
                "padding:10px 12px; font-size:13px;"
            )
        meta = QLabel(ts)
        meta.setStyleSheet("color:#64748b; font-size:10px;")
        wrap = QVBoxLayout()
        wrap.setSpacing(3)
        wrap.setContentsMargins(0, 0, 0, 0)
        align = Qt.AlignmentFlag.AlignRight if role == "user" else Qt.AlignmentFlag.AlignLeft
        wrap.addWidget(bubble, alignment=align)
        wrap.addWidget(meta, alignment=align)
        box = QWidget()
        box.setLayout(wrap)
        box.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Minimum)
        self.chat_layout.addWidget(box)
        QTimer.singleShot(30, self._scroll_bottom)

    def show_typing(self) -> QLabel:
        tip = QLabel("IRA is typing…")
        tip.setStyleSheet("color:#94a3b8; font-size:12px; font-style:italic;")
        self.chat_layout.addWidget(tip)
        QTimer.singleShot(30, self._scroll_bottom)
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
        # Hide suggestion chips after the first real question
        self.set_suggestions([])
        self.send_message.emit(text)

    def _scroll_bottom(self) -> None:
        bar = self.scroll.verticalScrollBar()
        bar.setValue(bar.maximum())

    def keyPressEvent(self, event: QKeyEvent) -> None:
        if event.key() == Qt.Key.Key_Escape:
            self.minimize_requested.emit()
        else:
            super().keyPressEvent(event)
