"""Faded particle-globe backdrop for the chat panel (same globe as the orb)."""

from __future__ import annotations

import math
import random
from dataclasses import dataclass

from PySide6.QtCore import QPointF, Qt
from PySide6.QtGui import QBrush, QColor, QPainter, QPen


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


# Tuned for the light panel background — white particles would vanish, so use ink tones.
_COLORS = {
    "blue": QColor(70, 98, 235),
    "cyan": QColor(30, 170, 205),
    "dot": QColor(40, 54, 110),
}


class GlobeBackdrop:
    def __init__(self, count: int = 260, seed: int = 7) -> None:
        rng = random.Random(seed)
        golden = math.pi * (3 - math.sqrt(5))
        self._points: list[_Pt] = []
        for i in range(count):
            y = 1 - (i / (count - 1)) * 2
            radius = math.sqrt(max(0.0, 1 - y * y))
            theta = golden * i
            accent = rng.random() < 0.11
            if accent:
                hue = "cyan" if rng.random() < 0.35 else "blue"
                size = 1.8 + rng.random() * 2.2
            else:
                hue = "dot"
                size = 0.55 + rng.random() * 1.1
            self._points.append(
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

    def paint(
        self,
        p: QPainter,
        cx: float,
        cy: float,
        R: float,
        *,
        spin: float,
        t: float,
        opacity: float,
    ) -> None:
        if opacity <= 0.001:
            return
        tilt = -0.2
        cos_y, sin_y = math.cos(spin), math.sin(spin)
        cos_x, sin_x = math.cos(tilt), math.sin(tilt)
        particle_scale = max(1.0, R / 60)

        projected: list[tuple[_Pt, float, float, float, float]] = []
        for pt in self._points:
            x1 = pt.x * cos_y - pt.z * sin_y
            z1 = pt.x * sin_y + pt.z * cos_y
            y2 = pt.y * cos_x - z1 * sin_x
            z2 = pt.y * sin_x + z1 * cos_x
            perspective = 1 / (1.9 - z2 * 0.55)
            sx = cx + x1 * R * perspective * 1.55
            sy = cy + y2 * R * perspective * 1.55
            projected.append((pt, sx, sy, (z2 + 1) / 2, z2))
        projected.sort(key=lambda q: q[4])

        accents = [q for q in projected if q[0].accent and q[4] > -0.15]
        link_limit = R * 0.42
        for i, a in enumerate(accents):
            for b in accents[i + 1 :]:
                dist = math.hypot(a[1] - b[1], a[2] - b[2])
                if dist > link_limit:
                    continue
                fade = (1 - dist / link_limit) * 0.3 * opacity
                p.setPen(QPen(QColor(70, 98, 235, int(fade * 255)), 0.8))
                p.drawLine(QPointF(a[1], a[2]), QPointF(b[1], b[2]))

        scan = (math.sin(t * 0.55) + 1) / 2
        p.setPen(Qt.PenStyle.NoPen)
        for pt, sx, sy, depth, _z in projected:
            pulse = 0.7 + 0.3 * math.sin(t * pt.pulse_rate + pt.pulse)
            near = 1 - min(1.0, abs(depth - scan) * 5.5)
            boost = 1 + near * 1.1
            size = pt.size * (0.45 + depth * 0.95) * pulse * (1 + near * 0.5) * particle_scale
            col = _COLORS[pt.hue]
            base_a = (0.2 + depth * 0.85) * (1.0 if pt.accent else 0.75)
            alpha = min(1.0, base_a * boost) * opacity
            if pt.accent:
                p.setBrush(QBrush(QColor(col.red(), col.green(), col.blue(), int(alpha * 0.18 * 255))))
                p.drawEllipse(QPointF(sx, sy), size * 3.4, size * 3.4)
            p.setBrush(QBrush(QColor(col.red(), col.green(), col.blue(), int(alpha * 255))))
            p.drawEllipse(QPointF(sx, sy), max(0.5, size), max(0.5, size))
