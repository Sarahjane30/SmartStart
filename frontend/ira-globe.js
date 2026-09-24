/* IRA / NIA particle globe — chat backdrop plus small orb globes that spin up while the assistant is thinking */

(function () {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const golden = Math.PI * (3 - Math.sqrt(5));
  // Ink tones for light surfaces; "light" is for orbs on the navy launcher.
  const PALETTES = {
    ink: { blue: [70, 98, 235], cyan: [30, 170, 205], dot: [40, 54, 110], link: [70, 98, 235] },
    light: { blue: [170, 190, 255], cyan: [120, 225, 245], dot: [225, 232, 255], link: [190, 205, 255] },
  };

  function createGlobe(canvas, opts = {}) {
    const ctx = canvas.getContext("2d");
    const count = opts.count || 320;
    const colors = PALETTES[opts.palette] || PALETTES.ink;
    const idle = opts.idle ?? 0.13;
    const peak = opts.peak ?? 0.4;
    const radius = opts.radius ?? 0.36;
    const minDot = opts.minDot ?? 0.5;

    const points = [];
    for (let i = 0; i < count; i += 1) {
      const y = 1 - (i / (count - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      const accent = Math.random() < 0.11;
      points.push({
        x: Math.cos(theta) * r,
        y,
        z: Math.sin(theta) * r,
        accent,
        hue: accent ? (Math.random() < 0.35 ? "cyan" : "blue") : "dot",
        pulse: Math.random() * Math.PI * 2,
        pulseRate: 0.6 + Math.random() * 1.6,
        size: accent ? 1.8 + Math.random() * 2.2 : 0.55 + Math.random() * 1.1,
      });
    }

    let width = 1;
    let height = 1;
    let spin = Math.random() * Math.PI * 2;
    let clock = 0;
    let thinking = 0;
    let thinkingTarget = 0;
    let last = 0;
    let running = false;

    const visible = () => canvas.isConnected && canvas.getClientRects().length > 0;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(rect.width, 1);
      height = Math.max(rect.height, 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function rgba(c, a) {
      return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${Math.max(0, Math.min(1, a))})`;
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);
      const opacity = idle + (peak - idle) * thinking;
      const cx = width * 0.5;
      const cy = height * (opts.centerY ?? 0.48);
      const R = Math.min(width, height) * radius * (1 + 0.04 * thinking);
      const scale = Math.max(opts.minScale ?? 1, R / 60);
      const tilt = -0.2;
      const cosY = Math.cos(spin);
      const sinY = Math.sin(spin);
      const cosX = Math.cos(tilt);
      const sinX = Math.sin(tilt);

      const projected = points.map((p) => {
        const x1 = p.x * cosY - p.z * sinY;
        const z1 = p.x * sinY + p.z * cosY;
        const y2 = p.y * cosX - z1 * sinX;
        const z2 = p.y * sinX + z1 * cosX;
        const persp = 1 / (1.9 - z2 * 0.55);
        return { p, sx: cx + x1 * R * persp * 1.55, sy: cy + y2 * R * persp * 1.55, depth: (z2 + 1) / 2, z: z2 };
      });
      projected.sort((a, b) => a.z - b.z);

      const accents = projected.filter((q) => q.p.accent && q.z > -0.15);
      const link = R * 0.42;
      ctx.lineWidth = opts.lineWidth ?? 0.8;
      for (let i = 0; i < accents.length; i += 1) {
        for (let j = i + 1; j < accents.length; j += 1) {
          const d = Math.hypot(accents[i].sx - accents[j].sx, accents[i].sy - accents[j].sy);
          if (d > link) continue;
          ctx.strokeStyle = rgba(colors.link, (1 - d / link) * 0.3 * opacity);
          ctx.beginPath();
          ctx.moveTo(accents[i].sx, accents[i].sy);
          ctx.lineTo(accents[j].sx, accents[j].sy);
          ctx.stroke();
        }
      }

      const scan = (Math.sin(clock * 0.55) + 1) / 2;
      for (const { p, sx, sy, depth } of projected) {
        const pulse = 0.7 + 0.3 * Math.sin(clock * p.pulseRate + p.pulse);
        const near = 1 - Math.min(1, Math.abs(depth - scan) * 5.5);
        const boost = 1 + near * 1.1;
        const size = p.size * (0.45 + depth * 0.95) * pulse * (1 + near * 0.5) * scale;
        const base = (0.2 + depth * 0.85) * (p.accent ? 1 : 0.75);
        const alpha = Math.min(1, base * boost) * opacity;
        const col = colors[p.hue];
        if (p.accent) {
          ctx.fillStyle = rgba(col, alpha * 0.18);
          ctx.beginPath();
          ctx.arc(sx, sy, size * 3.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = rgba(col, alpha);
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(minDot, size), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function frame(time) {
      const dt = last ? Math.min(0.1, (time - last) / 1000) : 0.016;
      last = time;
      const ease = thinkingTarget > thinking ? dt / 0.45 : dt / 0.9;
      thinking += Math.sign(thinkingTarget - thinking) * Math.min(Math.abs(thinkingTarget - thinking), ease);
      clock += dt * (1 + 1.5 * thinking);
      spin += dt * (opts.spin ?? 0.16) * (1 + 4 * thinking);
      draw();
      if (visible() && !reduceMotion) {
        requestAnimationFrame(frame);
      } else {
        running = false;
      }
    }

    function start() {
      if (running || !visible()) return;
      resize();
      if (reduceMotion) {
        draw();
        return;
      }
      running = true;
      last = 0;
      requestAnimationFrame(frame);
    }

    function setThinking(on) {
      thinkingTarget = on ? 1 : 0;
      if (reduceMotion) {
        thinking = thinkingTarget;
        draw();
      }
      start();
    }

    window.addEventListener("resize", () => {
      resize();
      if (reduceMotion) draw();
    });
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(() => {
        resize();
        start();
      }).observe(canvas);
    }
    return { start, setThinking };
  }

  const globes = [];
  const main = document.getElementById("ira-globe");
  if (main) {
    const nia = main.classList.contains("nia-globe");
    globes.push(createGlobe(main, nia ? { idle: 0.3, peak: 0.6, radius: 0.34 } : {}));
  }
  document.querySelectorAll("canvas.orb-globe").forEach((c) => {
    globes.push(
      createGlobe(c, {
        palette: "light",
        count: 140,
        idle: 0.95,
        peak: 1,
        radius: 0.4,
        centerY: 0.5,
        minScale: 0.45,
        minDot: 0.35,
        lineWidth: 0.5,
        spin: 0.35,
      })
    );
  });
  const kick = () => globes.forEach((g) => g.start());
  kick();
  document.addEventListener("visibilitychange", () => !document.hidden && kick());

  window.iraGlobe = {
    create: createGlobe,
    start: kick,
    setThinking(on) {
      globes.forEach((g) => g.setThinking(on));
    },
  };
})();
