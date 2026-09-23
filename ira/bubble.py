"""Floating IRA bubble — collapsed navy assistant button."""

from __future__ import annotations

from PySide6.QtCore import QPoint, Qt, QTimer, Signal
from PySide6.QtGui import QBrush, QColor, QMouseEvent, QPainter, QPainterPath
from PySide6.QtWidgets import QWidget

from ira.platform_ui import IS_WINDOWS
from ira.winflags import companion_window_flags

NAVY = QColor(8, 13, 29)
BLUE = QColor(22, 58, 122)
ACCENT = QColor(61, 106, 176)
CORE = QColor(232, 238, 248)


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
            self.setStyleSheet("background:#080d1d; border-radius:28px;")
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

        glow = int(30 + 25 * self._pulse) + (20 if self._flash else 0)
        p.setBrush(QBrush(QColor(61, 106, 176, min(glow, 90))))
        p.drawEllipse(1, 1, 54, 54)
        p.setBrush(QBrush(BLUE))
        p.drawEllipse(8, 8, 40, 40)
        p.setBrush(QBrush(CORE))
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
