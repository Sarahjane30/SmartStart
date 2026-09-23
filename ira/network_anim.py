"""Soft blurred SmartStart glow backdrop — clean navy, no grid."""

from __future__ import annotations

import math
import random
from dataclasses import dataclass

from PySide6.QtCore import QTimer, Qt, QPointF
from PySide6.QtGui import (
    QPainter,
    QColor,
    QBrush,
    QRadialGradient,
    QPainterPath,
    QPen,
)
from PySide6.QtWidgets import QWidget


@dataclass
class _Orb:
    """Soft bokeh orb drifting on a slow orbit (blurred portal energy)."""

    angle: float
    radius: float      # 0..1 of panel min-dim
    size: float        # px scale
    hue: str           # blue | cyan | white
    speed: float
    phase: float


class NetworkSphere(QWidget):
    """Ambient blurred glow — navy wash + soft SmartStart-colored orbs."""

    def __init__(self, parent=None, *, hero: bool = False) -> None:
        super().__init__(parent)
        self._hero = hero
        self._t = 0.0
        self._orbs: list[_Orb] = []
        self._seed()
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)
        self.setAttribute(Qt.WidgetAttribute.WA_OpaquePaintEvent, False)

        self._timer = QTimer(self)
        self._timer.timeout.connect(self._tick)
        self._timer.start(40)

    def set_hero(self, hero: bool) -> None:
        self._hero = hero
        self.update()

    def _seed(self) -> None:
        rng = random.Random(11)
        orbs: list[_Orb] = []
        for _ in range(18):
            hue = rng.choice(["blue", "blue", "cyan", "white"])
            orbs.append(
                _Orb(
                    angle=rng.random() * math.pi * 2,
                    radius=0.12 + rng.random() * 0.38,
                    size=40 + rng.random() * 90,
                    hue=hue,
                    speed=(0.08 + rng.random() * 0.14) * (1 if rng.random() > 0.5 else -1),
                    phase=rng.random() * math.pi * 2,
                )
            )
        # A few larger soft washes
        for _ in range(5):
            orbs.append(
                _Orb(
                    angle=rng.random() * math.pi * 2,
                    radius=0.05 + rng.random() * 0.22,
                    size=120 + rng.random() * 140,
                    hue=rng.choice(["blue", "cyan"]),
                    speed=0.04 + rng.random() * 0.06,
                    phase=rng.random() * math.pi * 2,
                )
            )
        self._orbs = orbs

    def _tick(self) -> None:
        self._t += 0.04
        self.update()

    def paintEvent(self, _event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()
        if w < 8 or h < 8:
            return

        clip = QPainterPath()
        clip.addRoundedRect(0, 0, w, h, 22, 22)
        p.setClipPath(clip)

        # Flat navy-900 — SmartStart --navy-900
        p.fillRect(self.rect(), QColor(4, 6, 15))

        # Soft center lift (navy-800 → navy-700)
        base = QRadialGradient(w * 0.5, h * 0.45, max(w, h) * 0.65)
        if self._hero:
            base.setColorAt(0.0, QColor(14, 22, 49, 180))   # navy-700
            base.setColorAt(0.55, QColor(8, 13, 29, 80))    # navy-800
            base.setColorAt(1.0, QColor(4, 6, 15, 0))
            gain = 0.55
        else:
            base.setColorAt(0.0, QColor(14, 22, 49, 100))
            base.setColorAt(0.6, QColor(8, 13, 29, 45))
            base.setColorAt(1.0, QColor(4, 6, 15, 0))
            gain = 0.28
        p.fillRect(self.rect(), QBrush(base))

        cx, cy = w * 0.5, h * 0.48
        span = min(w, h)

        p.setPen(Qt.PenStyle.NoPen)
        for orb in self._orbs:
            ang = orb.angle + self._t * orb.speed
            pulse = 0.85 + 0.15 * math.sin(self._t * 0.7 + orb.phase)
            ox = cx + math.cos(ang) * orb.radius * span * 1.15
            oy = cy + math.sin(ang) * orb.radius * span * 0.95
            rr = orb.size * pulse * (1.05 if self._hero else 0.9)

            if orb.hue == "cyan":
                core = QColor(34, 211, 238)      # --cyan
            elif orb.hue == "white":
                core = QColor(234, 238, 255)     # #eaeeff
            else:
                core = QColor(31, 59, 255)       # #1f3bff

            a0 = int((55 if self._hero else 28) * gain)
            grad = QRadialGradient(ox, oy, rr)
            grad.setColorAt(0.0, QColor(core.red(), core.green(), core.blue(), a0))
            grad.setColorAt(0.35, QColor(core.red(), core.green(), core.blue(), a0 // 3))
            grad.setColorAt(0.7, QColor(core.red(), core.green(), core.blue(), a0 // 10))
            grad.setColorAt(1.0, QColor(core.red(), core.green(), core.blue(), 0))
            p.setBrush(QBrush(grad))
            p.drawEllipse(QPointF(ox, oy), rr, rr)

        # Frost so light stays behind content
        p.fillRect(self.rect(), QColor(4, 6, 15, 90 if self._hero else 130))
