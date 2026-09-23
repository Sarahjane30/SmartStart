"""Animated neural-network constellation backdrop for IRA."""

from __future__ import annotations

import math
import random
from dataclasses import dataclass

from PySide6.QtCore import QTimer, Qt, QPointF
from PySide6.QtGui import QPainter, QColor, QPen, QBrush, QRadialGradient, QPainterPath
from PySide6.QtWidgets import QWidget


@dataclass
class _Node:
    # Unit-sphere coords (x,y,z) with |v| ~= 1 for shell nodes; smaller for dust
    x: float
    y: float
    z: float
    r: float          # draw radius px scale
    kind: str         # "dust" | "glow_cyan" | "glow_blue"
    phase: float      # pulse phase
    speed: float      # pulse speed


class NetworkSphere(QWidget):
    """Slowly rotating node/edge sphere — matches the IRA constellation art."""

    def __init__(self, parent=None, *, hero: bool = False) -> None:
        super().__init__(parent)
        self._hero = hero
        self._angle = 0.0
        self._t = 0.0
        self._nodes: list[_Node] = []
        self._seed_nodes()
        self.setAttribute(Qt.WidgetAttribute.WA_TransparentForMouseEvents, True)
        self.setAttribute(Qt.WidgetAttribute.WA_OpaquePaintEvent, False)

        self._timer = QTimer(self)
        self._timer.timeout.connect(self._tick)
        self._timer.start(33)  # ~30 fps

    def set_hero(self, hero: bool) -> None:
        self._hero = hero
        self.update()

    def _seed_nodes(self) -> None:
        rng = random.Random(42)
        nodes: list[_Node] = []

        def on_sphere(scale: float = 1.0) -> tuple[float, float, float]:
            # Uniform-ish on sphere
            z = rng.uniform(-1.0, 1.0)
            t = rng.uniform(0.0, 2 * math.pi)
            r = math.sqrt(max(0.0, 1.0 - z * z))
            return r * math.cos(t) * scale, z * scale, r * math.sin(t) * scale

        # Fine dust
        for _ in range(110):
            x, y, z = on_sphere(rng.uniform(0.55, 1.0))
            nodes.append(
                _Node(x, y, z, r=rng.uniform(0.6, 1.4), kind="dust",
                      phase=rng.random() * math.pi * 2, speed=rng.uniform(0.4, 1.0))
            )
        # Inner dust cloud
        for _ in range(40):
            x, y, z = on_sphere(rng.uniform(0.15, 0.55))
            nodes.append(
                _Node(x, y, z, r=rng.uniform(0.5, 1.1), kind="dust",
                      phase=rng.random() * math.pi * 2, speed=rng.uniform(0.3, 0.8))
            )
        # Cyan glow hubs
        for _ in range(14):
            x, y, z = on_sphere(rng.uniform(0.7, 1.0))
            nodes.append(
                _Node(x, y, z, r=rng.uniform(2.4, 4.2), kind="glow_cyan",
                      phase=rng.random() * math.pi * 2, speed=rng.uniform(0.6, 1.3))
            )
        # Soft indigo hubs
        for _ in range(10):
            x, y, z = on_sphere(rng.uniform(0.65, 0.98))
            nodes.append(
                _Node(x, y, z, r=rng.uniform(2.0, 3.6), kind="glow_blue",
                      phase=rng.random() * math.pi * 2, speed=rng.uniform(0.5, 1.1))
            )
        self._nodes = nodes

    def _tick(self) -> None:
        self._angle = (self._angle + 0.018) % (2 * math.pi)
        self._t += 0.033
        self.update()

    def _project(self, n: _Node, cx: float, cy: float, radius: float) -> tuple[float, float, float]:
        # Rotate around Y then slight X tilt
        a = self._angle
        cos_a, sin_a = math.cos(a), math.sin(a)
        x1 = n.x * cos_a + n.z * sin_a
        z1 = -n.x * sin_a + n.z * cos_a
        y1 = n.y
        tilt = 0.35
        cos_t, sin_t = math.cos(tilt), math.sin(tilt)
        y2 = y1 * cos_t - z1 * sin_t
        z2 = y1 * sin_t + z1 * cos_t
        # Perspective
        depth = (z2 + 1.4) / 2.4  # 0..1-ish
        scale = 0.72 + 0.45 * depth
        px = cx + x1 * radius * scale
        py = cy + y2 * radius * scale
        return px, py, depth

    def paintEvent(self, _event) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        w, h = self.width(), self.height()
        if w < 8 or h < 8:
            return

        # Deep navy fill (clipped to rounded panel)
        clip = QPainterPath()
        clip.addRoundedRect(0, 0, w, h, 22, 22)
        p.setClipPath(clip)
        p.fillRect(self.rect(), QColor(7, 11, 20))

        # Soft vignette / glow wash
        wash = QRadialGradient(w * 0.5, h * (0.42 if self._hero else 0.38), max(w, h) * 0.55)
        wash.setColorAt(0.0, QColor(30, 70, 140, 55 if self._hero else 32))
        wash.setColorAt(0.55, QColor(20, 40, 90, 18))
        wash.setColorAt(1.0, QColor(7, 11, 20, 0))
        p.fillRect(self.rect(), QBrush(wash))

        # Faint technical grid
        p.setPen(QPen(QColor(36, 48, 72, 40), 1))
        step = 28
        for x in range(0, w, step):
            p.drawLine(x, 0, x, h)
        for y in range(0, h, step):
            p.drawLine(0, y, w, y)

        cx = w * 0.5
        cy = h * (0.42 if self._hero else 0.40)
        radius = min(w, h) * (0.42 if self._hero else 0.38)

        # Soft sphere halo
        halo = QRadialGradient(cx, cy, radius * 1.15)
        halo.setColorAt(0.0, QColor(40, 100, 200, 18 if self._hero else 10))
        halo.setColorAt(0.7, QColor(30, 70, 140, 8))
        halo.setColorAt(1.0, QColor(7, 11, 20, 0))
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QBrush(halo))
        p.drawEllipse(QPointF(cx, cy), radius * 1.15, radius * 1.15)

        # Project all nodes
        pts: list[tuple[float, float, float, _Node]] = []
        for n in self._nodes:
            px, py, depth = self._project(n, cx, cy, radius)
            pts.append((px, py, depth, n))

        # Edges between nearby glow hubs (and some dust)
        hubs = [(px, py, d, n) for px, py, d, n in pts if n.kind != "dust"]
        p.setPen(QPen(QColor(80, 160, 220, 55 if self._hero else 38), 1.0))
        link_dist = radius * 0.55
        link_dist2 = link_dist * link_dist
        for i, (x1, y1, d1, _) in enumerate(hubs):
            for j in range(i + 1, len(hubs)):
                x2, y2, d2, _ = hubs[j]
                dx, dy = x1 - x2, y1 - y2
                if dx * dx + dy * dy < link_dist2:
                    alpha = int(25 + 40 * ((d1 + d2) * 0.5))
                    p.setPen(QPen(QColor(90, 170, 230, min(alpha, 70)), 1.0))
                    p.drawLine(QPointF(x1, y1), QPointF(x2, y2))

        # A few dust-to-hub wisps
        p.setPen(QPen(QColor(100, 160, 210, 22), 0.8))
        dust = [(px, py, d, n) for px, py, d, n in pts if n.kind == "dust"]
        rng = random.Random(int(self._t * 3) % 97)
        for _ in range(18):
            if not dust or not hubs:
                break
            x1, y1, _, _ = dust[rng.randrange(len(dust))]
            x2, y2, _, _ = hubs[rng.randrange(len(hubs))]
            if (x1 - x2) ** 2 + (y1 - y2) ** 2 < (radius * 0.7) ** 2:
                p.drawLine(QPointF(x1, y1), QPointF(x2, y2))

        # Draw dust then glow (painter's algorithm by depth)
        pts.sort(key=lambda t: t[2])
        for px, py, depth, n in pts:
            pulse = 0.65 + 0.35 * math.sin(self._t * n.speed + n.phase)
            if n.kind == "dust":
                alpha = int((50 + 90 * depth) * (0.7 + 0.3 * pulse))
                p.setPen(Qt.PenStyle.NoPen)
                p.setBrush(QBrush(QColor(220, 235, 255, min(alpha, 160))))
                rr = n.r * (0.7 + 0.5 * depth)
                p.drawEllipse(QPointF(px, py), rr, rr)
            else:
                # Outer glow
                glow_r = n.r * (2.8 + 1.2 * pulse) * (0.85 + 0.3 * depth)
                if n.kind == "glow_cyan":
                    core = QColor(90, 220, 240)
                    aura = QColor(60, 200, 220)
                else:
                    core = QColor(140, 150, 255)
                    aura = QColor(100, 110, 230)
                grad = QRadialGradient(px, py, glow_r)
                a0 = int((70 if self._hero else 50) * pulse)
                grad.setColorAt(0.0, QColor(aura.red(), aura.green(), aura.blue(), a0))
                grad.setColorAt(0.45, QColor(aura.red(), aura.green(), aura.blue(), a0 // 3))
                grad.setColorAt(1.0, QColor(aura.red(), aura.green(), aura.blue(), 0))
                p.setPen(Qt.PenStyle.NoPen)
                p.setBrush(QBrush(grad))
                p.drawEllipse(QPointF(px, py), glow_r, glow_r)
                # Core
                cr = n.r * (0.9 + 0.25 * depth) * pulse
                p.setBrush(QBrush(core))
                p.drawEllipse(QPointF(px, py), cr, cr)
                # Specular
                p.setBrush(QBrush(QColor(255, 255, 255, 90)))
                p.drawEllipse(QPointF(px - cr * 0.25, py - cr * 0.3), cr * 0.35, cr * 0.28)
