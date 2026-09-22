"""Floating IRA bubble — tiny always-on-top desktop companion."""

from __future__ import annotations

from PySide6.QtCore import QPoint, Qt, QTimer, Signal
from PySide6.QtGui import QColor, QFont, QPainter, QPen, QBrush, QMouseEvent
from PySide6.QtWidgets import QWidget, QLabel, QVBoxLayout, QGraphicsDropShadowEffect


class IraBubble(QWidget):
    """Minimized floating orb — click to expand chat."""

    clicked = Signal()
    moved_to = Signal(int, int)

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.Tool
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setFixedSize(72, 88)
        self._drag_offset: QPoint | None = None
        self._press_pos = QPoint()
        self._did_drag = False
        self._pulse = 0.0
        self._pulse_dir = 1

        layout = QVBoxLayout(self)
        layout.setContentsMargins(6, 4, 6, 4)
        layout.setSpacing(2)

        self.orb = _Orb(self)
        layout.addWidget(self.orb, alignment=Qt.AlignmentFlag.AlignHCenter)

        self.caption = QLabel("IRA")
        self.caption.setAlignment(Qt.AlignmentFlag.AlignHCenter)
        self.caption.setStyleSheet(
            "color: #e8eef8; font-size: 11px; font-weight: 700;"
            "background: rgba(15, 23, 42, 180); border-radius: 8px; padding: 2px 8px;"
        )
        layout.addWidget(self.caption)

        shadow = QGraphicsDropShadowEffect(self)
        shadow.setBlurRadius(18)
        shadow.setOffset(0, 4)
        shadow.setColor(QColor(0, 0, 0, 110))
        self.orb.setGraphicsEffect(shadow)

        self._timer = QTimer(self)
        self._timer.timeout.connect(self._tick)
        self._timer.start(50)

    def _tick(self) -> None:
        self._pulse += 0.04 * self._pulse_dir
        if self._pulse >= 1.0:
            self._pulse = 1.0
            self._pulse_dir = -1
        elif self._pulse <= 0.0:
            self._pulse = 0.0
            self._pulse_dir = 1
        self.orb.set_pulse(self._pulse)

    def mousePressEvent(self, event: QMouseEvent) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            self._drag_offset = event.globalPosition().toPoint() - self.frameGeometry().topLeft()
            self._press_pos = event.globalPosition().toPoint()
            self._did_drag = False
            event.accept()

    def mouseMoveEvent(self, event: QMouseEvent) -> None:
        if self._drag_offset is not None and event.buttons() & Qt.MouseButton.LeftButton:
            delta = event.globalPosition().toPoint() - self._press_pos
            if abs(delta.x()) > 4 or abs(delta.y()) > 4:
                self._did_drag = True
            self.move(event.globalPosition().toPoint() - self._drag_offset)
            event.accept()

    def mouseReleaseEvent(self, event: QMouseEvent) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            if self._did_drag:
                self.moved_to.emit(self.x(), self.y())
            else:
                self.clicked.emit()
            self._drag_offset = None
            event.accept()

    def pulse_notify(self) -> None:
        self.orb.flash()


class _Orb(QWidget):
    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.setFixedSize(52, 52)
        self._pulse = 0.35
        self._flash = 0

    def set_pulse(self, value: float) -> None:
        self._pulse = value
        self.update()

    def flash(self) -> None:
        self._flash = 12
        self.update()

    def paintEvent(self, _event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        glow = int(40 + 50 * self._pulse) + (20 if self._flash else 0)
        if self._flash:
            self._flash -= 1
        cx, cy, r = 26, 26, 20
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QBrush(QColor(56, 189, 248, glow)))
        p.drawEllipse(cx - r - 4, cy - r - 4, (r + 4) * 2, (r + 4) * 2)
        p.setBrush(QBrush(QColor(14, 165, 233)))
        p.drawEllipse(cx - r, cy - r, r * 2, r * 2)
        p.setBrush(QBrush(QColor(224, 242, 254)))
        p.drawEllipse(cx - 7, cy - 7, 14, 14)
        p.setPen(QPen(QColor(255, 255, 255, 200)))
        font = QFont("Segoe UI", 8, QFont.Weight.Bold)
        p.setFont(font)
