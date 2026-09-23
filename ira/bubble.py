"""Floating IRA bubble — collapsed assistant button."""

from __future__ import annotations

from PySide6.QtCore import QPoint, Qt, QTimer, Signal
from PySide6.QtGui import (
    QBrush,
    QColor,
    QFont,
    QMouseEvent,
    QPainter,
    QPainterPath,
    QPolygon,
)
from PySide6.QtWidgets import QWidget

from ira.platform_ui import IS_WINDOWS
from ira.winflags import companion_window_flags


class IraBubble(QWidget):
    """Collapsed floating assistant — click to open the panel."""

    clicked = Signal()
    moved_to = Signal(int, int)

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.setWindowTitle("IRA")
        self.setWindowFlags(companion_window_flags())
        self.setFixedSize(72, 72)
        self.setToolTip("IRA — open assistant")
        if IS_WINDOWS:
            self.setStyleSheet("background:#0f172a; border-radius:36px;")
        else:
            self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)

        self._drag_offset: QPoint | None = None
        self._press_pos = QPoint()
        self._did_drag = False
        self._pulse = 0.35
        self._pulse_dir = 1
        self._flash = 0

        self._timer = QTimer(self)
        self._timer.timeout.connect(self._tick)
        self._timer.start(50)

    def _tick(self) -> None:
        self._pulse += 0.035 * self._pulse_dir
        if self._pulse >= 1.0:
            self._pulse = 1.0
            self._pulse_dir = -1
        elif self._pulse <= 0.0:
            self._pulse = 0.0
            self._pulse_dir = 1
        if self._flash:
            self._flash -= 1
        self.update()

    def paintEvent(self, _event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        path = QPainterPath()
        path.addEllipse(2, 2, 68, 68)
        p.setClipPath(path)

        glow = int(40 + 35 * self._pulse) + (25 if self._flash else 0)
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QBrush(QColor(14, 165, 233, min(glow, 100))))
        p.drawEllipse(2, 2, 68, 68)
        p.setBrush(QBrush(QColor(3, 105, 161)))
        p.drawEllipse(10, 10, 52, 52)
        p.setBrush(QBrush(QColor(224, 242, 254)))
        p.drawRoundedRect(24, 24, 24, 18, 5, 5)
        p.drawPolygon(QPolygon([QPoint(30, 42), QPoint(36, 42), QPoint(30, 48)]))
        font = QFont()
        font.setPixelSize(9)
        font.setBold(True)
        p.setFont(font)
        p.setPen(QColor(15, 23, 42))
        p.drawText(QPoint(28, 37), "IRA")

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
        self._flash = 16
        self.update()
