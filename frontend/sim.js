/* Command Center — live new-hire simulation.
   One synthetic joiner is hired and walks offer → Project Ready in the shared store, so every
   panel (KPIs, Needs you now, alerts, analytics, NIA, the drawer) reacts as it would to a real
   hire. Steps owned by the signed-in role pause until they decide; everything else plays on. */
(function () {
  const root = document.getElementById("sim");
  const startBtn = document.getElementById("sim-btn");
  if (!root || !startBtn || typeof employerSession === "undefined" || !employerSession) return;

  const STAGES = ["Offer", "Docs", "IT", "Day 1", "Ready"];
  const SRC = {
    iCIMS: "icims", ServiceNow: "snow", Jira: "jira", NIA: "nia",
    HR: "hr", IT: "it", Manager: "mgr", SmartStart: "ss",
  };
  const TEAM = { HR: "HR", IT: "IT", Manager: "Hiring manager" };
  const BEAT = 3400;
  const SPEEDS = [1, 2, 4];
  const sim = { data: null, paused: false, speed: 1, timer: null, busy: false, seen: 0, collapsed: false };

  const jid = () => sim.data?.joiner?.id;
  const firstName = () => (sim.data?.joiner?.name || "").split(" ")[0];
  const initials = (n) => n.split(" ").map((p) => p[0]).slice(0, 2).join("");

  function startsLabel(d) {
    if (d.done) return "Project Ready";
    if (d.starts_in > 1) return `starts in ${d.starts_in} days`;
    if (d.starts_in === 1) return "starts tomorrow";
    if (d.starts_in === 0) return "starts today";
    return `started ${-d.starts_in} day${d.starts_in === -1 ? "" : "s"} ago`;
  }

  function healthPill(d) {
    if (d.done) return `<span class="sim-pill ok">Project Ready</span>`;
    const map = { on_track: ["ok", "On track"], at_risk: ["warn", "At risk"], blocked: ["bad", "Blocked"] };
    const [tone, label] = map[d.health] || ["warn", d.health];
    return `<span class="sim-pill ${tone}">${label}</span>`;
  }

  function track(d) {
    const blocked = d.health === "blocked" && !d.done;
    const pct = (d.stage / (STAGES.length - 1)) * 100;
    return `<div class="sim-track ${blocked ? "is-blocked" : ""}">
      <div class="sim-rail"><div class="sim-fill" style="width:${pct}%"></div></div>
      ${STAGES.map((s, i) => {
        const cls = i < d.stage || d.done ? "done" : i === d.stage ? "now" : "";
        return `<div class="sim-node ${cls}" style="left:${(i / (STAGES.length - 1)) * 100}%">
          <span class="sim-dot"></span><span class="sim-lbl">${s}</span></div>`;
      }).join("")}
    </div>`;
  }

  function feed(d) {
    const items = d.events.slice(-6).reverse();
    return `<ol class="sim-feed">${items
      .map((e) => {
        const fresh = e.n > sim.seen ? "fresh" : "";
        const src = e.you ? "You" : e.source;
        return `<li class="sim-ev ${e.tone} ${fresh}">
          <span class="sim-src src-${e.you ? "you" : SRC[e.source] || "ss"}">${esc(src)}</span>
          <span class="sim-day">D${e.day}</span>
          <span class="sim-txt">${esc(e.text)}</span></li>`;
      })
      .join("")}</ol>`;
  }

  function moveCard(d) {
    if (d.done) {
      const s = d.summary;
      const lost = s.lost.length
        ? `<ul class="sim-lost">${s.lost.map((x) => `<li><b>+${x.days}d</b> ${esc(x.why)}</li>`).join("")}</ul>`
        : `<p class="sim-why">No days lost. Every step happened as early as it could.</p>`;
      return `<div class="sim-done">
        <p class="sim-kicker">Simulation complete</p>
        <h3><span class="sim-big">${s.days}</span> days, offer to Project Ready</h3>
        <p class="sim-why">Fastest possible was ${s.best} days. ${s.good_calls} of ${s.calls} calls kept things moving${
          s.slipped ? `; the start date slipped ${s.slipped} day${s.slipped > 1 ? "s" : ""}` : ""
        }.</p>
        ${lost}
        <div class="sim-acts">
          <button type="button" class="sim-opt primary" data-open="${esc(jid())}">Open ${esc(firstName())}'s record</button>
          <button type="button" class="sim-opt" data-sim="start">Hire someone else</button>
          <button type="button" class="sim-opt ghost" data-sim="end">End and remove</button>
        </div>
      </div>`;
    }
    if (d.waiting) {
      const a = d.ask;
      return `<div class="sim-ask">
        <p class="sim-kicker"><span class="sim-ping"></span>Your move · ${esc(TEAM[a.owner] || a.owner)}</p>
        <h3>${esc(a.title)}</h3>
        <p class="sim-why">${esc(a.why)}</p>
        <div class="sim-opts">${a.options
          .map(
            (o, i) => `<button type="button" class="sim-opt ${i === 0 ? "primary" : ""}" data-sim-choice="${esc(o.id)}">
              <span>${esc(o.label)}</span><small>${esc(o.hint)}</small></button>`
          )
          .join("")}</div>
      </div>`;
    }
    const nx = d.next;
    const who = nx.by ? `${esc(nx.by)} · ${esc(TEAM[nx.owner] || nx.owner)}` : "Happening on its own";
    return `<div class="sim-next">
      <p class="sim-kicker">${sim.paused ? "Paused" : "Up next"}</p>
      <h3>${esc(nx.text)}</h3>
      <p class="sim-why">${who}</p>
      <div class="sim-beat"><i style="animation-duration:${BEAT / sim.speed}ms"></i></div>
    </div>`;
  }

  function render() {
    const d = sim.data;
    window.ssSimJoinerId = d && d.active && !d.done ? d.joiner.id : null;
    if (!d || !d.active) {
      root.hidden = true;
      startBtn.hidden = false;
      return;
    }
    root.hidden = false;
    startBtn.hidden = true;
    const j = d.joiner;
    root.classList.toggle("is-waiting", d.waiting);
    root.classList.toggle("is-done", d.done);
    root.classList.toggle("is-paused", sim.paused);
    root.classList.toggle("is-collapsed", sim.collapsed);
    const ctl = d.done
      ? ""
      : `<button type="button" class="sim-ctl" data-sim="pause" aria-label="${sim.paused ? "Play" : "Pause"}">${
          sim.paused ? "▶" : "❚❚"
        }</button>
        <div class="sim-speed" role="group" aria-label="Speed">${SPEEDS.map(
          (s) => `<button type="button" class="${s === sim.speed ? "on" : ""}" data-sim-speed="${s}">${s}×</button>`
        ).join("")}</div>`;
    const last = d.events[d.events.length - 1];
    root.innerHTML = `
      <header class="sim-head">
        <span class="sim-live"><i></i>${d.done ? "Simulation" : "Live simulation"}</span>
        <span class="sim-clock">Day <b>${d.day}</b> · ${esc(startsLabel(d))}</span>
        <span class="sim-peek">${d.waiting ? `<b>Your move:</b> ${esc(d.ask.title)}` : esc(last ? last.text : "")}</span>
        <div class="sim-ctls">${ctl}
          <button type="button" class="sim-ctl" data-sim="collapse" aria-label="${sim.collapsed ? "Expand" : "Collapse"}">${
            sim.collapsed ? "▾" : "▴"
          }</button>
          ${d.done ? "" : `<button type="button" class="sim-ctl text" data-sim="end">End</button>`}
        </div>
      </header>
      <div class="sim-body">
        <div class="sim-who">
          <div class="sim-ava ${d.done ? "done" : ""}"><span>${esc(initials(j.name))}</span></div>
          <div>
            <button type="button" class="sim-name" data-open="${esc(j.id)}">${esc(j.name)}</button>
            <p class="sim-role">${esc(j.position)} · ${esc(j.department)}</p>
            <p class="sim-meta">Manager ${esc(j.manager_name)} · Mentor ${esc(j.mentor)}</p>
            ${healthPill(d)}
          </div>
        </div>
        <div class="sim-mid">${track(d)}${feed(d)}</div>
        <div class="sim-move">${moveCard(d)}</div>
      </div>`;
    sim.seen = d.events.length ? d.events[d.events.length - 1].n : 0;
  }

  function mark(fresh) {
    const id = jid();
    if (!id) return;
    const sel = `[data-id="${CSS.escape(id)}"], [data-open="${CSS.escape(id)}"]`;
    document.querySelectorAll(sel).forEach((n) => {
      if (root.contains(n)) return;
      const host = n.closest(".joiner-row, .nn-row, .joiner-line, .action-card, .al-row, .alert, li, tr") || n;
      host.classList.add("sim-mark");
      if (fresh) {
        host.classList.remove("sim-flash");
        void host.offsetWidth;
        host.classList.add("sim-flash");
      }
    });
  }

  async function refreshWorld(alerted) {
    window.ssQuietRender = true;
    try {
      await loadAll();
    } finally {
      window.ssQuietRender = false;
    }
    mark(alerted);
    const drawer = document.getElementById("joiner-drawer");
    if (drawer && !drawer.hidden && state.selectedId === jid()) openJoinerDrawer(jid());
  }

  async function apply(next) {
    const before = sim.seen;
    const prev = sim.data;
    const same = prev && next.active && prev.active && prev.run === next.run &&
      prev.events.length === next.events.length && prev.waiting === next.waiting && prev.done === next.done;
    sim.data = next;
    if (same) return;
    const fresh = next.active ? next.events.filter((e) => e.n > before) : [];
    const alerted = fresh.some((e) => e.tone === "bad");
    if (next.waiting && !(prev && prev.waiting)) sim.collapsed = false;
    render();
    if (sim.collapsed) fresh.filter((e) => e.tone === "bad").forEach((e) => showToast(e.text));
    await refreshWorld(alerted || fresh.length > 0);
  }

  /* While it's your move the world holds still; a slow poll still notices if you acted elsewhere
     (for example, approving the plan from NIA's case view). */
  function schedule() {
    clearTimeout(sim.timer);
    const d = sim.data;
    if (!d || !d.active || d.done || sim.paused) return;
    sim.timer = setTimeout(step, d.waiting ? 5000 : BEAT / sim.speed);
  }

  async function step() {
    if (sim.busy) return;
    if (document.hidden) return schedule();
    sim.busy = true;
    try {
      await apply(await postJSON("/api/sim/tick"));
    } catch (err) {
      sim.paused = true;
      render();
      showToast(`Simulation paused: ${err.message}`);
    } finally {
      sim.busy = false;
      schedule();
    }
  }

  async function start() {
    sim.paused = false;
    sim.collapsed = false;
    sim.seen = 0;
    startBtn.disabled = true;
    try {
      await apply(await postJSON("/api/sim/start"));
      showToast(`New hire: ${sim.data.joiner.name} accepted an offer in iCIMS`);
    } catch (err) {
      showToast(`Couldn't start the simulation: ${err.message}`);
    } finally {
      startBtn.disabled = false;
      schedule();
    }
  }

  async function end() {
    clearTimeout(sim.timer);
    try {
      await postJSON("/api/sim/end");
    } catch {}
    sim.data = null;
    render();
    await refreshWorld(false);
  }

  async function choose(choice) {
    if (sim.busy) {
      setTimeout(() => choose(choice), 150);
      return;
    }
    sim.busy = true;
    root.querySelectorAll("[data-sim-choice]").forEach((b) => (b.disabled = true));
    try {
      await apply(await postJSON("/api/sim/act", { choice }));
    } catch (err) {
      showToast(err.message);
      render();
    } finally {
      sim.busy = false;
      schedule();
    }
  }

  const baseRender = window.render;
  if (typeof baseRender === "function") {
    window.render = function () {
      baseRender.apply(this, arguments);
      mark(false);
    };
  }

  startBtn.addEventListener("click", start);
  root.addEventListener("click", (e) => {
    const c = e.target.closest("[data-sim-choice]");
    if (c) return choose(c.dataset.simChoice);
    const sp = e.target.closest("[data-sim-speed]");
    if (sp) {
      sim.speed = Number(sp.dataset.simSpeed);
      render();
      return schedule();
    }
    const a = e.target.closest("[data-sim]");
    if (!a) return;
    const what = a.dataset.sim;
    if (what === "start") start();
    else if (what === "end") end();
    else if (what === "collapse") {
      sim.collapsed = !sim.collapsed;
      render();
    } else if (what === "pause") {
      sim.paused = !sim.paused;
      render();
      schedule();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) schedule();
  });

  fetchJSON("/api/sim")
    .then((d) => {
      if (!d.active) return;
      sim.data = d;
      sim.seen = d.events.length ? d.events[d.events.length - 1].n : 0;
      render();
      setTimeout(() => mark(false), 800);
      schedule();
    })
    .catch(() => {});
})();
