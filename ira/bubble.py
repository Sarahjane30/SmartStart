"""Floating IRA bubble — SmartStart portal particle globe (circular, no square)."""

from __future__ import annotations

import math
import random
from dataclasses import dataclass

from PySide6.QtCore import QPoint, QPointF, Qt, QTimer, Signal, QRectF
from PySide6.QtGui import (
    QBrush,
    QColor,
    QMouseEvent,
    QPainter,
    QPen,
    QRadialGradient,
    QRegion,
)
from PySide6.QtWidgets import QWidget

from ira.winflags import companion_window_flags

SIZE = 72  # px — circular hit target


@dataclass
class _Pt:
    x: float
    y: float
    z: float
    accent: bool
    hue: str
    pulse: float
    pulse_rate: float
    size: float


class IraBubble(QWidget):
    clicked = Signal()
    moved_to = Signal(int, int)

    def __init__(self, parent=None) -> None:
        super().__init__(parent)
        self.setWindowTitle("IRA")
        self.setWindowFlags(companion_window_flags())
        self.setFixedSize(SIZE, SIZE)
        self.setToolTip("IRA — click to open")
        # Transparent corners + hard circular mask = no black square on Windows
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, True)
        self.setAttribute(Qt.WidgetAttribute.WA_NoSystemBackground, True)
        self.setStyleSheet("background: transparent; border: 0;")
        self._apply_circle_mask()

        self._drag_offset: QPoint | None = None
        self._press_pos = QPoint()
        self._did_drag = False
        self._t = 0.0
        self._flash = 0
        self._points = self._seed_points()

        t = QTimer(self)
        t.timeout.connect(self._tick)
        t.start(40)
        self._timer = t

    def _apply_circle_mask(self) -> None:
        # Ellipse mask clips the HWND to a circle — kills the square chrome
        self.setMask(QRegion(0, 0, SIZE, SIZE, QRegion.RegionType.Ellipse))

    def resizeEvent(self, event) -> None:
        super().resizeEvent(event)
        self._apply_circle_mask()

    def _seed_points(self) -> list[_Pt]:
        # Same Fibonacci sphere as frontend/graphics.js (scaled for 72px)
        rng = random.Random(7)
        count = 220
        golden = math.pi * (3 - math.sqrt(5))
        pts: list[_Pt] = []
        for i in range(count):
            y = 1 - (i / (count - 1)) * 2
            radius = math.sqrt(max(0.0, 1 - y * y))
            theta = golden * i
            accent = rng.random() < 0.11
            if accent:
                hue = "cyan" if rng.random() < 0.35 else "blue"
                size = 1.8 + rng.random() * 2.2
            else:
                hue = "white"
                size = 0.55 + rng.random() * 1.1
            pts.append(
                _Pt(
                    x=math.cos(theta) * radius,
                    y=y,
                    z=math.sin(theta) * radius,
                    accent=accent,
                    hue=hue,
                    pulse=rng.random() * math.pi * 2,
                    pulse_rate=0.6 + rng.random() * 1.6,
                    size=size,
                )
            )
        return pts

    def _tick(self) -> None:
        self._t += 0.04
        if self._flash:
            self._flash -= 1
        self.update()

    def paintEvent(self, _event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        p.setCompositionMode(QPainter.CompositionMode.CompositionMode_Source)
        p.fillRect(self.rect(), Qt.GlobalColor.transparent)
        p.setCompositionMode(QPainter.CompositionMode.CompositionMode_SourceOver)

        w = h = SIZE
        cx = cy = w / 2
        R = w * 0.36  # match portal radius ratio

        # Soft outer glow only — no filled square, no opaque disc rim
        flash_boost = 50 if self._flash else 0
        glow = QRadialGradient(cx, cy, w * 0.5)
        glow.setColorAt(0.0, QColor(31, 59, 255, 55 + flash_boost))
        glow.setColorAt(0.55, QColor(14, 22, 49, 90))
        glow.setColorAt(0.82, QColor(8, 13, 29, 40))
        glow.setColorAt(1.0, QColor(0, 0, 0, 0))
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QBrush(glow))
        p.drawEllipse(QRectF(0, 0, w, h))

        # Deep navy core (portal depth, clipped by circle mask)
        core = QRadialGradient(cx * 0.85, cy * 0.75, R * 1.55)
        core.setColorAt(0.0, QColor(23, 34, 72, 230))
        core.setColorAt(0.55, QColor(8, 13, 29, 245))
        core.setColorAt(1.0, QColor(4, 6, 15, 255))
        p.setBrush(QBrush(core))
        p.drawEllipse(QPointF(cx, cy), R * 1.15, R * 1.15)

        # Portal particle globe (same math as frontend/graphics.js)
        spin = self._t * 0.16
        tilt = -0.2
        cos_y, sin_y = math.cos(spin), math.sin(spin)
        cos_x, sin_x = math.cos(tilt), math.sin(tilt)

        projected: list[tuple[_Pt, float, float, float, float]] = []
        for pt in self._points:
            x1 = pt.x * cos_y - pt.z * sin_y
            z1 = pt.x * sin_y + pt.z * cos_y
            y2 = pt.y * cos_x - z1 * sin_x
            z2 = pt.y * sin_x + z1 * cos_x
            perspective = 1 / (1.9 - z2 * 0.55)
            sx = cx + x1 * R * perspective * 1.55
            sy = cy + y2 * R * perspective * 1.55
            depth = (z2 + 1) / 2
            projected.append((pt, sx, sy, depth, z2))

        projected.sort(key=lambda q: q[4])

        # Faint accent links (front hemisphere)
        accents = [q for q in projected if q[0].accent and q[4] > -0.15]
        link_limit = R * 0.42
        for i, a in enumerate(accents):
            for b in accents[i + 1 :]:
                dx, dy = a[1] - b[1], a[2] - b[2]
                dist = math.hypot(dx, dy)
                if dist > link_limit:
                    continue
                fade = (1 - dist / link_limit) * 0.22
                p.setPen(QPen(QColor(110, 140, 255, int(fade * 255)), 0.6))
                p.drawLine(QPointF(a[1], a[2]), QPointF(b[1], b[2]))

        scan = (math.sin(self._t * 0.55) + 1) / 2
        p.setPen(Qt.PenStyle.NoPen)
        for pt, sx, sy, depth, _z in projected:
            pulse = 0.7 + 0.3 * math.sin(self._t * pt.pulse_rate + pt.pulse)
            near = 1 - min(1.0, abs(depth - scan) * 5.5)
            boost = 1 + near * 1.1
            size = pt.size * (0.45 + depth * 0.95) * pulse * (1 + near * 0.5)
            # Scale particle size down for 72px bubble (portal uses larger canvas)
            size *= 0.42
            if pt.hue == "blue":
                col = QColor(88, 118, 255)
                base_a = 0.2 + depth * 0.85
            elif pt.hue == "cyan":
                col = QColor(60, 220, 245)
                base_a = 0.2 + depth * 0.85
            else:
                col = QColor(232, 238, 255)
                base_a = (0.2 + depth * 0.85) * 0.82
            alpha = int(min(255, base_a * boost * 255))
            if pt.accent:
                a2 = int(min(255, base_a * 0.12 * boost * 255))
                p.setBrush(QBrush(QColor(col.red(), col.green(), col.blue(), max(12, a2))))
                p.drawEllipse(QPointF(sx, sy), size * 3.4, size * 3.4)
            p.setBrush(QBrush(QColor(col.red(), col.green(), col.blue(), max(20, alpha))))
            p.drawEllipse(QPointF(sx, sy), max(0.35, size), max(0.35, size))

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
