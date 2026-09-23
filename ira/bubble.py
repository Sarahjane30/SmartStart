"""Floating IRA bubble — glowing MindBot-inspired orb."""

from __future__ import annotations

from PySide6.QtCore import QPoint, Qt, QTimer, Signal, QRectF
from PySide6.QtGui import QBrush, QColor, QMouseEvent, QPainter, QPainterPath, QRadialGradient
from PySide6.QtWidgets import QWidget

from ira.platform_ui import IS_WINDOWS
from ira.winflags import companion_window_flags


class IraBubble(QWidget):
    clicked = Signal()
    moved_to = Signal(int, int)

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.setWindowTitle("IRA")
        self.setWindowFlags(companion_window_flags())
        self.setFixedSize(64, 64)
        self.setToolTip("IRA")
        if IS_WINDOWS:
            self.setStyleSheet("background:#04060f; border-radius:32px;")
        else:
            self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)

        self._drag_offset: QPoint | None = None
        self._press_pos = QPoint()
        self._did_drag = False
        self._pulse = 0.35
        self._dir = 1
        self._flash = 0

        t = QTimer(self)
        t.timeout.connect(self._tick)
        t.start(50)
        self._timer = t

    def _tick(self) -> None:
        self._pulse += 0.035 * self._dir
        if self._pulse >= 1.0:
            self._pulse, self._dir = 1.0, -1
        elif self._pulse <= 0.15:
            self._pulse, self._dir = 0.15, 1
        if self._flash:
            self._flash -= 1
        self.update()

    def paintEvent(self, _event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        cx, cy = self.width() / 2, self.height() / 2

        # Outer soft glow — SmartStart #1f3bff
        glow_r = 30 + 6 * self._pulse + (4 if self._flash else 0)
        glow = QRadialGradient(cx, cy, glow_r)
        alpha = int(70 + 50 * self._pulse) + (30 if self._flash else 0)
        glow.setColorAt(0.0, QColor(31, 59, 255, min(alpha, 140)))
        glow.setColorAt(0.55, QColor(31, 59, 255, 28))
        glow.setColorAt(1.0, QColor(31, 59, 255, 0))
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QBrush(glow))
        p.drawEllipse(QRectF(0, 0, 64, 64))

        # Core orb — navy → brand blue
        core = QRadialGradient(cx - 4, cy - 6, 22)
        core.setColorAt(0.0, QColor(157, 178, 255))   # #9db2ff
        core.setColorAt(0.45, QColor(31, 59, 255))     # #1f3bff
        core.setColorAt(1.0, QColor(11, 31, 74))       # #0b1f4a
        p.setBrush(QBrush(core))
        p.drawEllipse(QRectF(14, 14, 36, 36))

        # Specular highlight
        p.setBrush(QBrush(QColor(255, 255, 255, 55)))
        p.drawEllipse(QRectF(22, 20, 10, 7))

    def mousePressEvent(self, event: QMouseEvent) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            self._drag_offset = event.globalPosition().toPoint() - self.frameGeometry().topLeft()
            self._press_pos = event.globalPosition().toPoint()
            self._did_drag = False
            event.accept()

    def mouseMoveEvent(self, event: QMouseEvent) -> None:
        if self._drag_offset is not None and event.buttons() & Qt.MouseButton.LeftButton:
            if (event.globalPosition().toPoint() - self._press_pos).manhattanLength() > 4:
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
        self._flash = 18
        self.update()
