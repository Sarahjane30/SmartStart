"""SmartStart portal particle-globe backdrop for IRA (subtle PySide6 port)."""

from __future__ import annotations

import math
import random
from dataclasses import dataclass

from PySide6.QtCore import QTimer, Qt, QPointF
from PySide6.QtGui import QPainter, QColor, QPen, QBrush, QRadialGradient, QPainterPath
from PySide6.QtWidgets import QWidget


@dataclass
class _Point:
    x: float
    y: float
    z: float
    accent: bool
    hue: str  # "white" | "blue" | "cyan"
    pulse: float
    pulse_rate: float
    size: float


class NetworkSphere(QWidget):
    """Animated particle globe — same visual language as frontend/graphics.js."""

    def __init__(self, parent=None, *, hero: bool = False) -> None:
        super().__init__(parent)
        self._hero = hero
        self._t = 0.0
        self._points: list[_Point] = []
        self._seed_points()
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)
        self.setAttribute(Qt.WidgetAttribute.WA_OpaquePaintEvent, False)

        self._timer = QTimer(self)
        self._timer.timeout.connect(self._tick)
        self._timer.start(33)  # ~30 fps

    def set_hero(self, hero: bool) -> None:
        self._hero = hero
        self.update()

    def _seed_points(self) -> None:
        # Match portal globe: Fibonacci sphere + accent cyan/blue hubs
        rng = random.Random(7)
        count = 520  # slightly fewer than web 780 for desktop perf
        accent_rate = 0.11
        golden = math.pi * (3 - math.sqrt(5))
        pts: list[_Point] = []
        for i in range(count):
            y = 1 - (i / (count - 1)) * 2
            radius = math.sqrt(max(0.0, 1 - y * y))
            theta = golden * i
            accent = rng.random() < accent_rate
            if accent:
                hue = "cyan" if rng.random() < 0.35 else "blue"
                size = 1.8 + rng.random() * 2.2
            else:
                hue = "white"
                size = 0.55 + rng.random() * 1.1
            pts.append(
                _Point(
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
        self._points = pts

    def _tick(self) -> None:
        self._t += 0.033
        self.update()

    def _color(self, point: _Point, depth: float, alpha_boost: float, subtle: float) -> QColor:
        alpha = min(1.0, (0.2 + depth * 0.85) * alpha_boost) * subtle
        a = int(max(0, min(255, alpha * 255)))
        if point.hue == "blue":
            return QColor(88, 118, 255, a)
        if point.hue == "cyan":
            return QColor(60, 220, 245, a)
        return QColor(232, 238, 255, int(a * 0.82))

    def paintEvent(self, _event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()
        if w < 8 or h < 8:
            return

        # Rounded clip + portal navy wash (from .pane-visual)
        clip = QPainterPath()
        clip.addRoundedRect(0, 0, w, h, 22, 22)
        p.setClipPath(clip)

        # Subtle: quieter fill so chat stays readable; hero: closer to portal
        if self._hero:
            p.fillRect(self.rect(), QColor(4, 6, 15))
            wash = QRadialGradient(w * 0.70, h * 0.15, max(w, h) * 0.95)
            wash.setColorAt(0.0, QColor(11, 18, 38, 255))
            wash.setColorAt(0.62, QColor(4, 6, 15, 255))
            wash.setColorAt(1.0, QColor(4, 6, 15, 255))
            p.fillRect(self.rect(), QBrush(wash))
            subtle = 0.85
        else:
            p.fillRect(self.rect(), QColor(7, 11, 20))
            wash = QRadialGradient(w * 0.55, h * 0.35, max(w, h) * 0.7)
            wash.setColorAt(0.0, QColor(11, 18, 38, 90))
            wash.setColorAt(0.55, QColor(7, 11, 20, 40))
            wash.setColorAt(1.0, QColor(7, 11, 20, 0))
            p.fillRect(self.rect(), QBrush(wash))
            subtle = 0.28  # quiet behind chat

        # Very faint grid (portal visual-grid, masked soft)
        grid_a = 18 if self._hero else 8
        p.setPen(QPen(QColor(255, 255, 255, grid_a), 1))
        step = 46
        for x in range(0, w, step):
            p.drawLine(x, 0, x, h)
        for y in range(0, h, step):
            p.drawLine(0, y, w, y)

        cx = w * 0.5
        cy = h * (0.46 if self._hero else 0.48)
        radius = min(w, h) * (0.36 if self._hero else 0.30)

        # Soft bottom glow like .visual-glow
        glow_a = 55 if self._hero else 22
        bottom = QRadialGradient(w * 0.5, h * 1.05, max(w, h) * 0.55)
        bottom.setColorAt(0.0, QColor(31, 59, 255, glow_a))
        bottom.setColorAt(0.7, QColor(31, 59, 255, 0))
        bottom.setColorAt(1.0, QColor(31, 59, 255, 0))
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QBrush(bottom))
        p.drawRect(self.rect())

        # Same spin / tilt math as graphics.js (no pointer parallax)
        spin = self._t * 0.16
        tilt_x = -0.2
        yaw = spin
        cos_y, sin_y = math.cos(yaw), math.sin(yaw)
        cos_x, sin_x = math.cos(tilt_x), math.sin(tilt_x)

        projected: list[tuple[_Point, float, float, float, float]] = []
        for pt in self._points:
            x1 = pt.x * cos_y - pt.z * sin_y
            z1 = pt.x * sin_y + pt.z * cos_y
            y2 = pt.y * cos_x - z1 * sin_x
            z2 = pt.y * sin_x + z1 * cos_x
            perspective = 1 / (1.9 - z2 * 0.55)
            sx = cx + x1 * radius * perspective * 1.55
            sy = cy + y2 * radius * perspective * 1.55
            depth = (z2 + 1) / 2
            projected.append((pt, sx, sy, depth, z2))

        projected.sort(key=lambda q: q[4])

        # Faint links between nearby accent nodes on the front hemisphere
        accents = [q for q in projected if q[0].accent and q[4] > -0.15]
        link_limit = radius * 0.42
        link_a_scale = 0.22 * subtle
        for i, a in enumerate(accents):
            for b in accents[i + 1 :]:
                dx = a[1] - b[1]
                dy = a[2] - b[2]
                dist = math.hypot(dx, dy)
                if dist > link_limit:
                    continue
                fade = (1 - dist / link_limit) * link_a_scale
                p.setPen(QPen(QColor(110, 140, 255, int(fade * 255)), 0.6))
                p.drawLine(QPointF(a[1], a[2]), QPointF(b[1], b[2]))

        # Sweeping scan band (portal highlight slice)
        scan = (math.sin(self._t * 0.55) + 1) / 2

        p.setPen(Qt.PenStyle.NoPen)
        for pt, sx, sy, depth, _z in projected:
            pulse = 0.7 + 0.3 * math.sin(self._t * pt.pulse_rate + pt.pulse)
            near_scan = 1 - min(1.0, abs(depth - scan) * 5.5)
            boost = 1 + near_scan * 1.1
            size = pt.size * (0.45 + depth * 0.95) * pulse * (1 + near_scan * 0.5)

            if pt.accent:
                # Soft aura
                aura = self._color(pt, depth, 0.12 * boost, subtle)
                p.setBrush(QBrush(aura))
                p.drawEllipse(QPointF(sx, sy), size * 3.4, size * 3.4)

            core = self._color(pt, depth, boost, subtle)
            p.setBrush(QBrush(core))
            rr = max(0.35, size)
            p.drawEllipse(QPointF(sx, sy), rr, rr)
