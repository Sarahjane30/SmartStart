"""Floating IRA bubble — collapsed navy assistant button."""

from __future__ import annotations

from PySide6.QtCore import QPoint, Qt, QTimer, Signal
from PySide6.QtGui import QBrush, QColor, QMouseEvent, QPainter, QPainterPath
from PySide6.QtWidgets import QWidget

from ira.platform_ui import IS_WINDOWS
from ira.winflags import companion_window_flags

NAVY = QColor(11, 26, 51)       # #0B1A33
SOFT = QColor(28, 46, 74)       # #1C2E4A
ICE = QColor(232, 240, 255)     # #E8F0FF
CORE = QColor(245, 245, 245)    # #F5F5F5


class IraBubble(QWidget):
    clicked = Signal()
    moved_to = Signal(int, int)

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.setWindowTitle("IRA")
        self.setWindowFlags(companion_window_flags())
        self.setFixedSize(56, 56)
        self.setToolTip("IRA")
        if IS_WINDOWS:
            self.setStyleSheet("background:#0B1A33; border-radius:28px;")
        else:
            self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)

        self._drag_offset: QPoint | None = None
        self._press_pos = QPoint()
        self._did_drag = False
        self._pulse = 0.3
        self._dir = 1
        self._flash = 0

        t = QTimer(self)
        t.timeout.connect(self._tick)
        t.start(60)
        self._timer = t

    def _tick(self) -> None:
        self._pulse += 0.03 * self._dir
        if self._pulse >= 1.0:
            self._pulse, self._dir = 1.0, -1
        elif self._pulse <= 0.0:
            self._pulse, self._dir = 0.0, 1
        if self._flash:
            self._flash -= 1
        self.update()

    def paintEvent(self, _event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        clip = QPainterPath()
        clip.addEllipse(1, 1, 54, 54)
        p.setClipPath(clip)
        p.setPen(Qt.PenStyle.NoPen)

        glow = int(28 + 22 * self._pulse) + (24 if self._flash else 0)
        p.setBrush(QBrush(QColor(232, 240, 255, min(glow, 88))))
        p.drawEllipse(1, 1, 54, 54)
        p.setBrush(QBrush(NAVY))
        p.drawEllipse(6, 6, 44, 44)
        p.setBrush(QBrush(SOFT))
        p.drawEllipse(12, 12, 32, 32)
        p.setBrush(QBrush(ICE if self._flash else CORE))
        p.drawEllipse(22, 22, 12, 12)

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
        self._flash = 14
        self.update()
