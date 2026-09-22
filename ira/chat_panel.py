"""Expanded IRA chat panel — compact desktop companion (~320×450)."""

from __future__ import annotations

from datetime import datetime

from PySide6.QtCore import Qt, QTimer, Signal
from PySide6.QtGui import QFont, QKeyEvent
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QTextEdit,
    QVBoxLayout,
    QWidget,
    QComboBox,
    QGraphicsDropShadowEffect,
)
from PySide6.QtGui import QColor


class ChatPanel(QWidget):
    send_message = Signal(str)
    minimize_requested = Signal()
    close_requested = Signal()
    employee_changed = Signal(str)
    refresh_requested = Signal()

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.Tool
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setFixedSize(320, 460)

        shell = QFrame(self)
        shell.setObjectName("shell")
        shell.setGeometry(4, 4, 312, 452)
        shell.setStyleSheet(
            """
            QFrame#shell {
              background: #0f172a;
              border-radius: 16px;
              border: 1px solid #1e293b;
            }
            QLabel { color: #e2e8f0; }
            QLineEdit {
              background: #1e293b; color: #f8fafc; border: 1px solid #334155;
              border-radius: 10px; padding: 8px 10px; font-size: 13px;
            }
            QPushButton#send {
              background: #38bdf8; color: #0f172a; border: 0; border-radius: 10px;
              font-weight: 700; padding: 8px 12px;
            }
            QPushButton#icon {
              background: transparent; color: #94a3b8; border: 0; font-size: 14px;
              padding: 2px 6px;
            }
            QPushButton#chip {
              background: #1e293b; color: #cbd5e1; border: 1px solid #334155;
              border-radius: 12px; padding: 5px 9px; font-size: 11px; text-align: left;
            }
            QPushButton#chip:hover { border-color: #38bdf8; color: #e0f2fe; }
            QComboBox {
              background: #1e293b; color: #e2e8f0; border: 1px solid #334155;
              border-radius: 8px; padding: 4px 8px; font-size: 12px;
            }
            QScrollArea { border: 0; background: transparent; }
            QWidget#chatInner { background: transparent; }
            """
        )
        shadow = QGraphicsDropShadowEffect(shell)
        shadow.setBlurRadius(28)
        shadow.setOffset(0, 8)
        shadow.setColor(QColor(0, 0, 0, 140))
        shell.setGraphicsEffect(shadow)

        root = QVBoxLayout(shell)
        root.setContentsMargins(12, 10, 12, 10)
        root.setSpacing(8)

        # Header
        head = QHBoxLayout()
        titles = QVBoxLayout()
        title = QLabel("✨ IRA")
        title.setFont(QFont("Segoe UI", 13, QFont.Weight.Bold))
        sub = QLabel("Your onboarding companion")
        sub.setStyleSheet("color:#94a3b8; font-size:11px;")
        titles.addWidget(title)
        titles.addWidget(sub)
        head.addLayout(titles)
        head.addStretch()
        self.status_dot = QLabel("●")
        self.status_dot.setStyleSheet("color:#64748b; font-size:10px;")
        head.addWidget(self.status_dot)
        btn_min = QPushButton("−")
        btn_min.setObjectName("icon")
        btn_min.clicked.connect(self.minimize_requested.emit)
        btn_close = QPushButton("×")
        btn_close.setObjectName("icon")
        btn_close.clicked.connect(self.close_requested.emit)
        head.addWidget(btn_min)
        head.addWidget(btn_close)
        root.addLayout(head)

        # Employee picker
        pick = QHBoxLayout()
        pick_lbl = QLabel("Employee")
        pick_lbl.setStyleSheet("color:#94a3b8; font-size:11px;")
        self.employee_combo = QComboBox()
        self.employee_combo.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
        self.employee_combo.currentIndexChanged.connect(self._on_employee_changed)
        refresh = QPushButton("↻")
        refresh.setObjectName("icon")
        refresh.setToolTip("Refresh context from SmartStart")
        refresh.clicked.connect(self.refresh_requested.emit)
        pick.addWidget(pick_lbl)
        pick.addWidget(self.employee_combo, 1)
        pick.addWidget(refresh)
        root.addLayout(pick)

        # Chat scroll
        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.chat_inner = QWidget()
        self.chat_inner.setObjectName("chatInner")
        self.chat_layout = QVBoxLayout(self.chat_inner)
        self.chat_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.chat_layout.setSpacing(8)
        self.scroll.setWidget(self.chat_inner)
        root.addWidget(self.scroll, 1)

        # Suggestions
        self.suggest_wrap = QVBoxLayout()
        self.suggest_wrap.setSpacing(4)
        root.addLayout(self.suggest_wrap)

        # Input
        row = QHBoxLayout()
        self.input = QLineEdit()
        self.input.setPlaceholderText("Ask IRA anything…")
        self.input.returnPressed.connect(self._submit)
        send = QPushButton("➤")
        send.setObjectName("send")
        send.clicked.connect(self._submit)
        row.addWidget(self.input, 1)
        row.addWidget(send)
        root.addLayout(row)

        self._employees: list[dict] = []
        self._suppress_emp = False

    def set_online(self, online: bool) -> None:
        self.status_dot.setStyleSheet(
            f"color:{'#22c55e' if online else '#f59e0b'}; font-size:10px;"
        )
        self.status_dot.setToolTip("SmartStart connected" if online else "Offline / FAQ only")

    def set_employees(self, employees: list[dict], selected_id: str | None) -> None:
        self._suppress_emp = True
        self._employees = employees
        self.employee_combo.clear()
        self.employee_combo.addItem("Select employee…", None)
        for e in employees:
            label = f"{e.get('name')} · {e.get('role_type')} · {e.get('department')}"
            self.employee_combo.addItem(label, e.get("id"))
        if selected_id:
            idx = self.employee_combo.findData(selected_id)
            if idx >= 0:
                self.employee_combo.setCurrentIndex(idx)
        self._suppress_emp = False

    def _on_employee_changed(self, _idx: int) -> None:
        if self._suppress_emp:
            return
        emp_id = self.employee_combo.currentData()
        if emp_id:
            self.employee_changed.emit(str(emp_id))

    def clear_chat(self) -> None:
        while self.chat_layout.count():
            item = self.chat_layout.takeAt(0)
            w = item.widget()
            if w:
                w.deleteLater()

    def add_message(self, text: str, *, role: str = "ira") -> None:
        bubble = QLabel(text)
        bubble.setWordWrap(True)
        bubble.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        ts = datetime.now().strftime("%H:%M")
        if role == "user":
            bubble.setStyleSheet(
                "background:#1d4ed8; color:#eff6ff; border-radius:12px;"
                "padding:8px 10px; font-size:13px;"
            )
            bubble.setAlignment(Qt.AlignmentFlag.AlignRight)
        else:
            bubble.setStyleSheet(
                "background:#1e293b; color:#e2e8f0; border-radius:12px;"
                "padding:8px 10px; font-size:13px;"
            )
        meta = QLabel(ts)
        meta.setStyleSheet("color:#64748b; font-size:10px;")
        wrap = QVBoxLayout()
        wrap.setSpacing(2)
        if role == "user":
            wrap.addWidget(bubble, alignment=Qt.AlignmentFlag.AlignRight)
            wrap.addWidget(meta, alignment=Qt.AlignmentFlag.AlignRight)
        else:
            wrap.addWidget(bubble, alignment=Qt.AlignmentFlag.AlignLeft)
            wrap.addWidget(meta, alignment=Qt.AlignmentFlag.AlignLeft)
        box = QWidget()
        box.setLayout(wrap)
        self.chat_layout.addWidget(box)
        QTimer.singleShot(30, self._scroll_bottom)

    def show_typing(self) -> QLabel:
        tip = QLabel("IRA is typing…")
        tip.setStyleSheet("color:#94a3b8; font-size:11px; font-style:italic;")
        self.chat_layout.addWidget(tip)
        QTimer.singleShot(30, self._scroll_bottom)
        return tip

    def set_suggestions(self, items: list[str]) -> None:
        while self.suggest_wrap.count():
            item = self.suggest_wrap.takeAt(0)
            w = item.widget()
            if w:
                w.deleteLater()
        for text in items[:5]:
            btn = QPushButton(text)
            btn.setObjectName("chip")
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.clicked.connect(lambda _=False, t=text: self._quick(t))
            self.suggest_wrap.addWidget(btn)

    def _quick(self, text: str) -> None:
        self.input.setText(text)
        self._submit()

    def _submit(self) -> None:
        text = self.input.text().strip()
        if not text:
            return
        self.input.clear()
        self.send_message.emit(text)

    def _scroll_bottom(self) -> None:
        bar = self.scroll.verticalScrollBar()
        bar.setValue(bar.maximum())

    def keyPressEvent(self, event: QKeyEvent) -> None:
        if event.key() == Qt.Key.Key_Escape:
            self.minimize_requested.emit()
        else:
            super().keyPressEvent(event)
