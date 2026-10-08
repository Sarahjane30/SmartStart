/* Command Center — connected enterprise simulation.
   One synthetic offer is accepted in a mock iCIMS and followed through every system it touches.
   Each click is one human action; the backend writes the consequence into the shared store and
   returns the system events SmartStart detects, which travel across the ecosystem map. */
(function () {
  const btn = document.getElementById("sim-btn");
  if (!btn || typeof employerSession === "undefined" || !employerSession) return;

  const CANCEL = Symbol("cancel");
  const S = { d: null, seen: 0, fast: false, token: 0, open: false };

  /* ---------- ecosystem map ---------- */
  const NODES = {
    icims: { x: 130, y: 44, r: 19, label: "iCIMS", sub: "Recruiting" },
    ss: { x: 130, y: 138, r: 27, label: "SmartStart", sub: "+ NIA" },
    hr: { x: 42, y: 240, r: 18, label: "HR", sub: "People Ops" },
    it: { x: 130, y: 240, r: 18, label: "IT", sub: "Onboarding" },
    mgr: { x: 218, y: 240, r: 18, label: "Manager", sub: "Ava Chen" },
    snow: { x: 70, y: 344, r: 17, label: "ServiceNow", sub: "ITSM" },
    access: { x: 150, y: 344, r: 17, label: "Access", sub: "Management" },
    jira: { x: 226, y: 344, r: 17, label: "Jira", sub: "Projects" },
    emp: { x: 130, y: 452, r: 20, label: "Employee", sub: "Alex Morgan" },
  };
  const EDGES = [
    ["icims", "ss"], ["ss", "hr"], ["ss", "it"], ["ss", "mgr"], ["it", "snow"], ["it", "access"],
    ["mgr", "jira"], ["hr", "emp"], ["snow", "emp"], ["access", "emp"], ["jira", "emp"], ["mgr", "emp"],
  ];
  const SYS_NODE = { icims: "icims", ss: "ss", it: "it", snow: "snow", mgr: "mgr", jira: "jira", access: "access" };
  const SRC = {
    iCIMS: "icims", NIA: "nia", SmartStart: "ss", ServiceNow: "snow", Manager: "mgr",
    "Access Management": "access", Jira: "jira",
  };
  const SYS = {
    icims: { name: "iCIMS", tag: "Recruiting · mock" },
    ss: { name: "SmartStart", tag: "Command Center" },
    it: { name: "SmartStart", tag: "IT workspace" },
    snow: { name: "ServiceNow", tag: "ITSM · mock" },
    mgr: { name: "SmartStart", tag: "Manager workspace" },
    jira: { name: "Jira", tag: "Projects · mock" },
  };
  const LOOP = ["NIA recommends", "Human reviews", "Action", "System update", "SmartStart detects"];

  const ov = document.createElement("div");
  ov.id = "ccx";
  ov.className = "ccx";
  ov.hidden = true;
  ov.setAttribute("role", "dialog");
  ov.setAttribute("aria-modal", "true");
  ov.setAttribute("aria-label", "Connected enterprise simulation");
  ov.innerHTML = `
    <header class="ccx-top">
      <div class="ccx-brand"><span class="ccx-logo">S</span><b>SmartStart</b><span>Connected enterprise simulation</span></div>
      <span class="ccx-syn">Synthetic data</span>
      <div class="ccx-where" id="ccx-where"></div>
      <div class="ccx-tools">
        <button type="button" class="ccx-tool" data-x="restart">Restart</button>
        <button type="button" class="ccx-tool" data-x="close" aria-label="Close simulation">Close <kbd>Esc</kbd></button>
      </div>
    </header>
    <aside class="ccx-map" aria-label="Connected ecosystem">
      <p class="ccx-h">Connected ecosystem</p>
      <svg class="ccx-graph" viewBox="0 0 260 500" role="img" aria-label="Systems connected by SmartStart">
        <defs>
          <radialGradient id="ccx-glow"><stop offset="0" stop-color="#67e8f9"/><stop offset="1" stop-color="#22d3ee" stop-opacity="0"/></radialGradient>
        </defs>
        <g class="g-edges">${EDGES.map(([a, b]) => {
          const p = NODES[a], q = NODES[b];
          return `<line class="g-edge" data-e="${a}-${b}" x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"/>`;
        }).join("")}</g>
        <g class="g-pulses"></g>
        <g class="g-nodes">${Object.entries(NODES).map(([k, n]) => `
          <g class="g-node st-idle" data-n="${k}" transform="translate(${n.x},${n.y})">
            <circle class="g-here" r="${n.r + 7}"/>
            <circle class="g-disc" r="${n.r}"/>
            <text class="g-ini" dy="4">${k === "ss" ? "S" : n.label.slice(0, 2)}</text>
            <path class="g-tick" d="M${n.r * 0.5} ${-n.r * 0.95} l3.5 3.5 l6 -7"/>
            <text class="g-label" y="${n.r + 14}">${n.label}</text>
            <text class="g-sub" y="${n.r + 26}">${n.sub}</text>
          </g>`).join("")}</g>
      </svg>
      <div class="ccx-loop" id="ccx-loop" aria-label="Human-in-the-loop">
        ${LOOP.map((l, i) => `<span data-l="${i}">${l}</span>`).join("")}
      </div>
    </aside>
    <main class="ccx-stage"><div class="ccx-screen" id="ccx-screen"></div></main>
    <aside class="ccx-feed" aria-label="System events">
      <p class="ccx-h">System events <span class="ccx-livedot"></span></p>
      <ol class="ccx-events" id="ccx-events"></ol>
    </aside>`;
  document.body.appendChild(ov);

  const $ = (sel, el = ov) => el.querySelector(sel);
  const $screen = $("#ccx-screen");
  const $events = $("#ccx-events");
  const $pulses = $(".g-pulses");

  const d = () => S.d;
  const C = () => S.d.candidate;
  const P = () => S.d.people;
  const first = () => C().first;
  const fmtDate = (iso) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const clock = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  function wait(ms) {
    const t = S.token;
    if (S.fast) return t === S.token ? Promise.resolve() : Promise.reject(CANCEL);
    return new Promise((res, rej) => setTimeout(() => (t === S.token ? res() : rej(CANCEL)), ms));
  }

  function paintNodes() {
    const nodes = d().nodes;
    ov.querySelectorAll(".g-node").forEach((g) => {
      const st = nodes[g.dataset.n] || "idle";
      g.classList.remove("st-idle", "st-active", "st-done");
      g.classList.add(`st-${st}`);
    });
  }

  function where(sys, persona, role) {
    const s = SYS[sys];
    $("#ccx-where").innerHTML = `<span class="ccx-where-k">You are in</span><b class="w-${sys}">${s.name}</b>
      <span class="ccx-where-t">${esc(s.tag)}</span>${persona ? `<span class="ccx-where-k">acting as</span><b>${esc(persona)}</b><span class="ccx-where-t">${esc(role)}</span>` : ""}`;
    ov.querySelectorAll(".g-node").forEach((g) => g.classList.toggle("here", g.dataset.n === SYS_NODE[sys]));
  }

  function loop(k) {
    ov.querySelectorAll("#ccx-loop span").forEach((s, i) => {
      s.classList.toggle("on", i === k);
      s.classList.toggle("past", k != null && i < k);
    });
  }

  /* Shortest path between two systems, so an event can travel iCIMS → SmartStart → HR → … */
  function path(a, b) {
    const adj = {};
    EDGES.forEach(([x, y]) => {
      (adj[x] ||= []).push(y);
      (adj[y] ||= []).push(x);
    });
    const prev = { [a]: null };
    const q = [a];
    while (q.length) {
      const n = q.shift();
      if (n === b) break;
      (adj[n] || []).forEach((m) => {
        if (!(m in prev)) {
          prev[m] = n;
          q.push(m);
        }
      });
    }
    const out = [];
    for (let n = b; n != null; n = prev[n]) out.unshift(n);
    return out;
  }

  function hop(a, b) {
    const p = NODES[a], q = NODES[b];
    const edge = ov.querySelector(`[data-e="${a}-${b}"], [data-e="${b}-${a}"]`);
    edge?.classList.add("hot");
    setTimeout(() => edge?.classList.remove("hot"), 1100);
    const ns = "http://www.w3.org/2000/svg";
    const halo = document.createElementNS(ns, "circle");
    halo.setAttribute("r", "11");
    halo.setAttribute("fill", "url(#ccx-glow)");
    const dot = document.createElementNS(ns, "circle");
    dot.setAttribute("r", "3.6");
    dot.setAttribute("class", "g-dot");
    $pulses.append(halo, dot);
    const dur = 560;
    return new Promise((res) => {
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur);
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        const x = p.x + (q.x - p.x) * e, y = p.y + (q.y - p.y) * e;
        [halo, dot].forEach((c) => { c.setAttribute("cx", x); c.setAttribute("cy", y); });
        if (k < 1) requestAnimationFrame(step);
        else {
          halo.remove();
          dot.remove();
          const g = ov.querySelector(`[data-n="${b}"]`);
          g?.classList.remove("ping");
          void g?.getBoundingClientRect();
          g?.classList.add("ping");
          res();
        }
      };
      requestAnimationFrame(step);
    });
  }

  async function pulse(route) {
    if (S.fast || !route || route.length < 2) return;
    for (let i = 0; i < route.length - 1; i++) {
      const hops = path(route[i], route[i + 1]);
      for (let j = 0; j < hops.length - 1; j++) await hop(hops[j], hops[j + 1]);
    }
  }

  function eventItem(e, fresh) {
    const li = document.createElement("li");
    li.className = `ccx-ev t-${e.tone}${fresh ? " fresh" : ""}`;
    li.innerHTML = `<div class="ccx-ev-top"><span class="src src-${SRC[e.source] || "ss"}">${esc(e.source)}</span>
      <time>${clock(e.at)}</time></div><code>${esc(e.code)}</code><p>${esc(e.text)}</p>`;
    return li;
  }

  function paintEvents() {
    $events.innerHTML = "";
    const shown = d().events.filter((e) => e.n <= S.seen);
    shown.forEach((e) => $events.prepend(eventItem(e, false)));
    if (!shown.length) $events.innerHTML = `<li class="ccx-ev-empty">Waiting for the first system event…</li>`;
  }

  /* Reveal events SmartStart received, one at a time, each travelling its route on the map. */
  async function flow(until) {
    const fresh = d().events.filter((e) => e.n > S.seen);
    for (const e of fresh) {
      S.seen = e.n;
      $events.querySelector(".ccx-ev-empty")?.remove();
      const li = eventItem(e, !S.fast);
      $events.prepend(li);
      await pulse(e.route);
      await wait(160);
      if (e.code === until) break;
    }
  }

  /* ---------- screen primitives ---------- */
  const URLS = {
    icims: () => `recruiting.icims.synthetic / candidates / ${C().candidate_id}`,
    ss: () => `smartstart / command-center / onboarding / ${d().joiner_id || "new"}`,
    it: () => "smartstart / workspaces / it-onboarding",
    snow: () => `itsm.servicenow.synthetic / sc_req_item / ${d().ticket}`,
    mgr: () => "smartstart / workspaces / my-joiners",
    jira: () => `jira.synthetic / projects / ${d().project.jira}`,
  };

  function screen(sys, html) {
    const s = SYS[sys];
    $screen.className = `ccx-screen sys-${sys}`;
    void $screen.offsetWidth;
    $screen.classList.add("swap");
    $screen.innerHTML = `<div class="win-bar"><i></i><i></i><i></i>
      <span class="win-url">${esc(URLS[sys]())}</span><span class="win-sys">${esc(s.name)} · ${esc(s.tag)}</span></div>
      <div class="win-body">${html}</div>`;
    return $screen.querySelector(".win-body");
  }

  async function show(el, ms = 260, scroll = true) {
    if (!el) return;
    el.classList.add("in");
    if (scroll) el.scrollIntoView({ block: "nearest", behavior: S.fast ? "auto" : "smooth" });
    await wait(ms);
  }

  async function ticks(list, ms = 380) {
    for (const li of list) {
      li.classList.add("ok");
      await wait(ms);
    }
  }

  async function typeInto(el, text) {
    if (S.fast) {
      el.textContent = text;
      return;
    }
    const n = Math.max(1, Math.ceil(text.length / 70));
    for (let i = 0; i <= text.length; i += n) {
      el.textContent = text.slice(0, i);
      await wait(18);
    }
    el.textContent = text;
  }

  async function handoff(from, to, code, title, lines = []) {
    if (S.fast) return;
    $screen.className = "ccx-screen sys-hand";
    void $screen.offsetWidth;
    $screen.classList.add("swap");
    $screen.innerHTML = `<div class="cx-hand">
      <div class="cx-hand-row">
        <div class="cx-hand-sys">${esc(from)}</div>
        <div class="cx-wire"><span class="cx-packet">${esc(code)}</span></div>
        <div class="cx-hand-sys to">${esc(to)}</div>
      </div>
      <p class="cx-hand-title">${esc(title)}</p>
      ${lines.length ? `<ul class="cx-hand-lines">${lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
    </div>`;
    await wait(1900);
  }

  function busy(button, on) {
    if (!button) return;
    button.disabled = on;
    button.classList.toggle("is-busy", on);
  }

  async function act(choice, detail) {
    const t = S.token;
    S.acting = true;
    let next;
    try {
      next = await postJSON("/api/sim/act", { choice, detail: detail || {} });
    } finally {
      S.acting = false;
    }
    if (t !== S.token) throw CANCEL;
    S.d = next;
    paintNodes();
    syncButton();
    return next;
  }

  /* Wire a primary action: disable while working, surface failures, ignore a cancelled run. */
  function on(el, fn) {
    if (!el) return;
    el.addEventListener("click", async (ev) => {
      const b = ev.currentTarget;
      if (b.disabled) return;
      busy(b, true);
      try {
        await fn(b);
      } catch (err) {
        if (err === CANCEL) return;
        busy(b, false);
        showToast(err.message || "Something went wrong");
      }
    });
  }

  const niaLine = (text) => `<p class="cx-nia-line"><span class="cx-nia-dot"></span>${esc(text)}</p>`;

  function composer(kind) {
    const dr = d().drafts[kind];
    return `<div class="cx-mail rv" data-mail="${kind}">
      <div class="cx-mail-head"><span class="cx-nia-dot"></span><b>Draft prepared by NIA</b><span>Nothing is sent until you approve it</span></div>
      <dl class="cx-mail-meta"><dt>To</dt><dd>${esc(dr.to)}</dd><dt>Subject</dt><dd class="cx-subj">${esc(dr.subject)}</dd></dl>
      <pre class="cx-body"></pre>
      <div class="cx-acts"><button type="button" class="cx-btn ghost" data-edit>Edit</button>
        <button type="button" class="cx-btn primary" data-send>${kind === "it" ? "Send to IT" : "Send"}</button></div>
    </div>`;
  }

  function wireComposer(box) {
    const edit = box.querySelector("[data-edit]");
    edit.addEventListener("click", () => {
      const editing = box.classList.toggle("editing");
      box.querySelectorAll(".cx-subj, .cx-body").forEach((n) => (n.contentEditable = editing ? "true" : "false"));
      edit.textContent = editing ? "Done editing" : "Edit";
      if (editing) box.querySelector(".cx-body").focus();
    });
    return () => ({
      subject: box.querySelector(".cx-subj").innerText.trim(),
      body: box.querySelector(".cx-body").innerText.trim(),
    });
  }

  async function sendAway(box) {
    box.querySelectorAll("[contenteditable]").forEach((n) => (n.contentEditable = "false"));
    box.classList.add("sent");
    await wait(700);
  }

  /* ---------- the plan graph NIA builds ---------- */
  const PLAN = [
    { hub: "HR", a: 240, leaves: [["Documents", "docs"], ["Policies", "docs"], ["Offer records", "offer"]] },
    { hub: "IT", a: 0, leaves: [["Laptop", "it"], ["VPN", "it"], ["Microsoft 365", "it"], ["Jira", "it"], ["Engineering tools", "it"]] },
    { hub: "Manager", a: 180, leaves: [["Mentor", "mentor"], ["Day-1 plan", "day1"], ["Team introduction", "day1"], ["First project", "project"]] },
    { hub: "Learning", a: 120, leaves: [["Learning path", "learning"], ["Platform foundations", "learning"]] },
    { hub: "Project", a: 300, leaves: [["Jira project", "project"], ["First-week tasks", "project"], ["Project access", "access"]] },
    { hub: "Employee", a: 60, leaves: [["Portal access", "docs"], ["Day-1 invite", "day1"]] },
  ];

  function planGraph() {
    const ok = Object.fromEntries(d().readiness.map((r) => [r.key, r.ok]));
    const cx = 320, cy = 228, R1 = 98, R2 = 166;
    const rad = (deg) => (deg * Math.PI) / 180;
    let i = 0;
    const parts = { lines: [], hubs: [], leaves: [] };
    PLAN.forEach((h) => {
      const hx = cx + R1 * Math.cos(rad(h.a)), hy = cy + R1 * Math.sin(rad(h.a));
      const n = h.leaves.length;
      const spread = n > 3 ? 12 : 19;
      const done = h.leaves.filter(([, k]) => ok[k]).length;
      const st = done === n ? "ok" : done ? "part" : "todo";
      parts.lines.push(`<line class="pg-l pg-hub-l rv-s" style="--i:${i}" x1="${cx}" y1="${cy}" x2="${hx}" y2="${hy}"/>`);
      parts.hubs.push(`<g class="pg-hub ${st} rv-s" data-hub="${h.hub}" style="--i:${i}" transform="translate(${hx},${hy})">
        <circle r="32"/><text dy="4.5">${h.hub}</text></g>`);
      i++;
      h.leaves.forEach(([label, key], j) => {
        const a = h.a + (j - (n - 1) / 2) * spread;
        const lx = cx + R2 * Math.cos(rad(a)), ly = cy + R2 * Math.sin(rad(a));
        const right = Math.cos(rad(a)) >= 0;
        const anchor = right ? "start" : "end";
        const tx = right ? 9 : -9;
        parts.lines.push(`<line class="pg-l rv-s" style="--i:${i}" x1="${hx}" y1="${hy}" x2="${lx}" y2="${ly}"/>`);
        parts.leaves.push(`<g class="pg-leaf ${ok[key] ? "ok" : ""} rv-s" data-k="${key}" style="--i:${i}" transform="translate(${lx},${ly})">
          <circle r="5.5"/><text x="${tx}" y="4.5" text-anchor="${anchor}">${esc(label)}</text></g>`);
        i++;
      });
    });
    return `<svg class="cx-plan" viewBox="0 0 640 456" role="img" aria-label="Onboarding plan graph">
      ${parts.lines.join("")}
      <g class="pg-core rv-s" style="--i:0" transform="translate(${cx},${cy})"><circle class="pg-core-ring" r="44"/><circle r="34"/>
        <text dy="-2">${esc(C().name.split(" ").map((p) => p[0]).join(""))}</text><text class="pg-core-sub" dy="13">${esc(first())}</text></g>
      ${parts.hubs.join("")}${parts.leaves.join("")}</svg>`;
  }

  async function buildGraph(svg) {
    const items = [...svg.querySelectorAll(".rv-s")].sort((a, b) => a.style.getPropertyValue("--i") - b.style.getPropertyValue("--i"));
    if (S.fast) return items.forEach((n) => n.classList.add("in"));
    const groups = {};
    items.forEach((n) => (groups[n.style.getPropertyValue("--i")] ||= []).push(n));
    for (const k of Object.keys(groups).sort((a, b) => a - b)) {
      groups[k].forEach((n) => n.classList.add("in"));
      await wait(70);
    }
  }

  /* ---------- scenes ---------- */

  async function sceneIcims() {
    const c = C();
    where("icims", c.name, "Candidate");
    loop(null);
    const b = screen("icims", `
      <div class="ic-nav"><span class="ic-logo">iCIMS</span><span class="ic-cloud">Talent Cloud</span>
        <nav><span>Jobs</span><span class="on">Candidates</span><span>Offers</span><span>Reports</span></nav>
        <span class="ic-user">${esc(c.recruiter)} · Recruiter</span></div>
      <div class="ic-crumbs">Candidates › ${esc(c.requisition)} › <b>${esc(c.name)}</b></div>
      <div class="ic-grid">
        <section class="ic-card ic-profile">
          <div class="ic-ava">${esc(c.name.split(" ").map((p) => p[0]).join(""))}</div>
          <div><h2>${esc(c.name)}</h2><p>${esc(c.position)}</p><p class="ic-id">${esc(c.candidate_id)} · ${esc(c.email)}</p></div>
          <dl class="ic-dl">
            <dt>Requisition</dt><dd>${esc(c.requisition)}</dd>
            <dt>Department</dt><dd>${esc(c.team)}</dd>
            <dt>Hiring manager</dt><dd>${esc(c.manager)}</dd>
            <dt>Location</dt><dd>${esc(c.location)}</dd>
            <dt>Recruiter</dt><dd>${esc(c.recruiter)}</dd>
          </dl>
          <ol class="ic-pipe"><li class="ok">Applied</li><li class="ok">Screened</li><li class="ok">Interviewed</li><li class="ok now">Offer</li><li class="hire">Hired</li></ol>
        </section>
        <section class="ic-card ic-offer">
          <header><h3>Offer</h3><span class="ic-status" id="ic-status">Offer sent</span></header>
          <dl class="ic-dl">
            <dt>Offer letter</dt><dd>OL-${esc(c.candidate_id.slice(5))}-v2</dd>
            <dt>Position</dt><dd>${esc(c.position)}</dd>
            <dt>Stipend</dt><dd>₹60,000 / month</dd>
            <dt>Start date</dt><dd>${esc(fmtDate(c.start_date))}</dd>
            <dt>Duration</dt><dd>6 months</dd>
            <dt>Offer status</dt><dd id="ic-state"><span class="ic-flip"><b class="was">Sent</b><b class="now">Accepted</b></span></dd>
          </dl>
          <button type="button" class="ic-accept" id="ic-accept">Accept offer</button>
          <p class="ic-note">Candidate action. In the real flow, ${esc(first())} accepts from the iCIMS candidate portal.</p>
        </section>
        <section class="ic-card ic-activity"><h3>Activity</h3><ul id="ic-log">
          <li><b>Offer sent</b> by ${esc(c.recruiter)}<time>2 days ago</time></li>
          <li><b>Final interview</b> with ${esc(c.manager)}<time>6 days ago</time></li>
        </ul></section>
      </div>
      <div class="ic-detect rv" id="ic-detect"><span class="cx-pulse"></span><b>EVENT DETECTED</b> Candidate accepted offer
        <code>OFFER_ACCEPTED</code><span class="ic-hook">webhook → SmartStart</span></div>`);
    on($("#ic-accept", b), async (button) => {
      const res = act("accept_offer");
      $("#ic-status", b).textContent = "Accepted";
      $("#ic-status", b).classList.add("ok");
      $("#ic-state", b).classList.add("flip");
      b.querySelector(".ic-pipe .hire").classList.add("ok");
      button.textContent = "✓ Offer accepted";
      button.classList.add("done");
      $("#ic-log", b).insertAdjacentHTML("afterbegin", `<li class="new"><b>Offer accepted</b> by ${esc(c.name)}<time>just now</time></li>`);
      await res;
      await wait(700);
      await show($("#ic-detect", b), 500);
      $("#ic-detect", b).classList.add("leave");
      await wait(450);
      await flow("OFFER_ACCEPTED");
      await handoff("iCIMS", "SmartStart", "OFFER_ACCEPTED", "The event leaves iCIMS and enters the SmartStart layer",
        ["iCIMS stays the system of record for the candidate", "SmartStart listens, understands and orchestrates"]);
      await route();
    });
  }

  async function sceneDetect() {
    const c = C(), dd = d();
    where("ss", P().HR, "HR · People Ops");
    loop(null);
    const accepted = dd.events.find((e) => e.code === "OFFER_ACCEPTED");
    const reqs = ["Documents", "Laptop", "VPN", "Microsoft 365", "Jira", "Engineering applications", "Manager preparation",
      "Mentor assignment", "Day-1 orientation", "Learning", "Project assignment"];
    const steps = ["Receiving event…", "Understanding employee profile…", "Checking onboarding requirements…",
      "Mapping dependencies…", "Building onboarding plan…"];
    const b = screen("ss", `
      <div class="cx-split">
        <div class="cx-col">
          <section class="cx-card cx-event rv" id="s-ev">
            <p class="cx-k"><span class="cx-pulse"></span>New onboarding event</p>
            <h3>${esc(c.name)} has accepted an offer.</h3>
            <dl class="cx-kv"><dt>Source</dt><dd><span class="src src-icims">iCIMS</span></dd>
              <dt>Event</dt><dd><code>OFFER_ACCEPTED</code></dd>
              <dt>Timestamp</dt><dd>Just now · ${accepted ? clock(accepted.at) : ""}</dd>
              <dt>Candidate</dt><dd>${esc(c.candidate_id)}</dd></dl>
          </section>
          <section class="cx-card cx-proc rv" id="s-proc">
            <p class="cx-k"><span class="cx-nia-dot"></span>NIA</p>
            <ul class="cx-steps">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>
          </section>
          <section class="cx-card cx-under rv" id="s-under">
            <p class="cx-k violet">NIA understands</p>
            <dl class="cx-kv"><dt>Role</dt><dd>${esc(c.position)}</dd><dt>Team</dt><dd>${esc(c.team)}</dd>
              <dt>Manager</dt><dd>${esc(c.manager)}</dd><dt>Location</dt><dd>${esc(c.location)}</dd>
              <dt>Starts</dt><dd>${esc(fmtDate(c.start_date))}</dd></dl>
            <p class="cx-sub">Onboarding requirements identified</p>
            <ul class="cx-chips">${reqs.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
          </section>
        </div>
        <div class="cx-col wide">
          <section class="cx-card cx-plan-card rv" id="s-plan">
            <p class="cx-k">SmartStart has built an onboarding plan</p>
            <p class="cx-sub">Based on the accepted offer, role, team and existing enterprise requirements.</p>
            ${planGraph()}
            <table class="cx-plan-table" hidden><thead><tr><th>Requirement</th><th>Owner</th><th>System</th></tr></thead><tbody>
              ${[["Documents & policies", "HR", "iCIMS"], ["Laptop, VPN, Microsoft 365, Jira, engineering tools", "IT", "ServiceNow"],
                ["Mentor, Day-1 plan, team introduction", c.manager, "SmartStart"], ["Learning path", "L&D", "SmartStart"],
                ["First project & project access", c.manager, "Jira"]].map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join("")}
            </tbody></table>
          </section>
          <section class="cx-card cx-rec rv" id="s-rec">
            <p class="cx-k violet"><span class="cx-nia-dot"></span>NIA recommends</p>
            <h3>A new onboarding journey has been triggered from iCIMS.</h3>
            <p class="cx-sub">Next actions identified</p>
            <ol class="cx-num"><li>Request required documents</li><li>Prepare IT provisioning</li><li>Notify hiring manager</li>
              <li>Confirm mentor</li><li>Prepare Day-1 requirements</li></ol>
            <div class="cx-acts"><button type="button" class="cx-btn ghost" id="s-review">Review plan</button>
              <button type="button" class="cx-btn primary" id="s-start">Start onboarding</button></div>
            <div class="cx-result" id="s-result"></div>
          </section>
        </div>
      </div>`);
    await show($("#s-ev", b), 500);
    await show($("#s-proc", b), 200);
    await ticks(b.querySelectorAll(".cx-steps li"), 480);
    await show($("#s-under", b), 200);
    await ticks(b.querySelectorAll(".cx-chips li"), 90);
    await show($("#s-plan", b), 100);
    await buildGraph(b.querySelector(".cx-plan"));
    await flow("PLAN_BUILT");
    loop(0);
    await show($("#s-rec", b), 0);
    $("#s-review", b).addEventListener("click", (e) => {
      const t = b.querySelector(".cx-plan-table");
      t.hidden = !t.hidden;
      e.currentTarget.textContent = t.hidden ? "Review plan" : "Hide plan detail";
      b.querySelector(".cx-plan").classList.toggle("lit", !t.hidden);
      loop(1);
      if (!t.hidden) t.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    on($("#s-start", b), async () => {
      loop(2);
      await act("start_onboarding");
      loop(3);
      const r = $("#s-result", b);
      r.innerHTML = `<p class="ok">✓ Onboarding started by ${esc(P().HR)}</p><p>Document packet requested in iCIMS · IT, manager and learning workstreams opened</p>`;
      r.classList.add("in");
      await flow("ONBOARDING_STARTED");
      loop(4);
      await flow();
      r.insertAdjacentHTML("beforeend", `<p class="ok">✓ iCIMS · DOCUMENTS_SUBMITTED — all 30 forms verified</p>`);
      b.querySelectorAll('.pg-leaf[data-k="docs"]').forEach((n) => n.classList.add("ok"));
      await wait(1300);
      await route();
    });
  }

  async function sceneDraft(kind) {
    const isIT = kind === "it";
    where("ss", P().HR, "HR · People Ops");
    loop(0);
    const b = screen("ss", isIT ? `
      <div class="cx-narrow">
        ${niaLine("Next dependency: IT provisioning. NIA is drafting the request from the plan.")}
        <p class="cx-drafting" id="d-ing"><span class="cx-spin"></span>Drafting IT onboarding request…</p>
        ${composer("it")}
      </div>` : "");
    return wireDraft(b, kind);
  }

  async function wireDraft(b, kind) {
    const isIT = kind === "it";
    const box = b.querySelector(`[data-mail="${kind}"]`);
    await wait(900);
    b.querySelector(".cx-drafting")?.classList.add("done");
    await show(box, 0);
    await typeInto(box.querySelector(".cx-body"), d().drafts[kind].body);
    loop(1);
    const read = wireComposer(box);
    on(box.querySelector("[data-send]"), async () => {
      loop(2);
      await act(isIT ? "send_it" : "send_manager", read());
      await sendAway(box);
      loop(3);
      await flow();
      if (isIT) {
        await handoff("SmartStart", "IT workspace", "IT_REQUEST_CREATED", "Communication sent ✓",
          ["IT onboarding request created", `Routed to ${P().IT}'s queue · IT Onboarding Team`]);
      } else {
        await handoff("SmartStart", "Manager workspace", "MANAGER_NOTIFIED", "Communication sent ✓",
          [`${C().manager} has a new joiner to prepare`, "Manager actions are waiting in her SmartStart workspace"]);
      }
      await route();
    });
  }

  function itShell(inner) {
    const p = P();
    return `<div class="ws-head ws-it"><div><p class="ws-k">IT onboarding</p><h2>Needs your attention</h2></div>
      <div class="ws-who"><span class="ws-ava">${esc(p.IT.split(" ").map((x) => x[0]).join(""))}</span>${esc(p.IT)}<small>IT Onboarding Team</small></div></div>
      <div class="ws-body">${inner}</div>`;
  }

  const REQ_STATUS = { Laptop: "Pending", VPN: "Ready to provision", "Microsoft 365": "Ready", Jira: "Ready", "Engineering applications": "Pending" };

  async function sceneIT() {
    const c = C(), dd = d();
    where("it", P().IT, "IT Onboarding");
    loop(null);
    const sent = dd.sent.it || dd.drafts.it;
    const b = screen("it", itShell(`
      <p class="ws-count"><b>1</b> new request · arrived via SmartStart</p>
      <article class="ws-req rv" id="it-req">
        <header><span class="ws-new">New joiner request</span><time>${dd.sent.it ? clock(dd.sent.it.at) : ""}</time></header>
        <h3>${esc(c.name)}</h3><p class="ws-meta">${esc(c.position)} · ${esc(c.team)} · starts ${esc(fmtDate(c.start_date))}</p>
        <p class="cx-sub">NIA prepared</p>
        <ul class="ws-reqs">${dd.standard.map((r) => {
          const st = REQ_STATUS[r] || "Ready";
          return `<li><span class="ok-mark">✓</span>${esc(r)}<em class="st st-${st.toLowerCase().replace(/ /g, "-")}">${esc(st)}</em></li>`;
        }).join("")}</ul>
        <div class="cx-acts"><button type="button" class="cx-btn ghost" id="it-open">Open request</button></div>
        <div class="ws-detail" id="it-detail" hidden>
          <dl class="cx-kv"><dt>From</dt><dd>${esc(P().HR)} via SmartStart</dd><dt>Subject</dt><dd>${esc(sent.subject)}</dd>
            <dt>Manager</dt><dd>${esc(c.manager)}</dd><dt>SLA</dt><dd>3 business days</dd></dl>
          <pre class="ws-mail">${esc(sent.body)}</pre>
          <div class="cx-acts"><button type="button" class="cx-btn primary" id="it-start">Start provisioning</button></div>
          <div class="cx-result" id="it-result"></div>
        </div>
      </article>`));
    await wait(350);
    await show($("#it-req", b), 0);
    $("#it-open", b).addEventListener("click", (e) => {
      $("#it-detail", b).hidden = false;
      e.currentTarget.hidden = true;
      loop(1);
      $("#it-start", b).scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    on($("#it-start", b), async () => {
      loop(2);
      await act("start_provisioning");
      const r = $("#it-result", b);
      r.innerHTML = `<p class="cx-link-card"><span class="src src-ss">SmartStart</span> Created ServiceNow request
        <b>${esc(d().ticket)}</b> · ${d().standard.length} catalog tasks</p>`;
      r.classList.add("in");
      loop(3);
      await flow();
      await wait(600);
      await handoff("SmartStart", "ServiceNow", d().ticket, `ServiceNow request ${d().ticket} opened`,
        ["Requested by SmartStart for " + C().name, "Fulfilment happens in ServiceNow, where IT already works"]);
      await route();
    });
  }

  const SN_TASKS = [
    ["Laptop", "Laptop provisioned", "MacBook Pro 14\" · imaged with Platform Engineering baseline"],
    ["VPN", "VPN enabled", "GlobalProtect profile · Bengaluru gateway"],
    ["Microsoft 365", "Microsoft 365 provisioned", "E3 licence · mailbox and Teams"],
    ["Jira", "Jira access granted", "Jira Software · PLAT space"],
    ["Engineering applications", "Engineering applications installed", "IDE licence, Docker Desktop, AWS CLI"],
  ];

  async function sceneSnow() {
    const c = C(), dd = d();
    where("snow", P().IT, "Fulfiller · IT Onboarding");
    loop(null);
    const b = screen("snow", `
      <div class="sn-nav"><span class="sn-logo">servicenow</span><span>Service Management</span>
        <nav><span>All</span><span>Favorites</span><span class="on">Requested Items</span></nav><span class="sn-user">${esc(P().IT)}</span></div>
      <div class="sn-form">
        <div class="sn-title"><h2>Requested Item <b>${esc(dd.ticket)}</b></h2><span class="sn-state" id="sn-state">Work in Progress</span></div>
        <div class="sn-fields">
          <label>Number<input value="${esc(dd.ticket)}" readonly></label>
          <label>Requested for<input value="${esc(c.name)}" readonly></label>
          <label>Requested by<input value="SmartStart (integration)" readonly></label>
          <label>Assignment group<input value="IT Onboarding" readonly></label>
          <label>Item<input value="New Joiner Setup — ${esc(c.position)}" readonly></label>
          <label>Due<input value="${esc(fmtDate(c.start_date))}" readonly></label>
        </div>
        <div class="sn-tabs"><span class="on">Catalog Tasks (${SN_TASKS.length})</span><span>Approvers</span><span>Activity</span></div>
        <table class="sn-table"><thead><tr><th>Task</th><th>Short description</th><th>Detail</th><th>State</th><th></th></tr></thead>
          <tbody>${SN_TASKS.map(([k, , det], i) => `<tr data-t="${i}"><td>SCTASK00${4410 + i}</td><td>${esc(k)}</td><td>${esc(det)}</td>
            <td class="sn-st">Open</td><td><button type="button" class="sn-close">Close task</button></td></tr>`).join("")}</tbody></table>
        <div class="sn-foot"><button type="button" class="sn-btn" id="sn-all">Fulfil all tasks</button>
          <span class="sn-hint">Close each task as it's done, or fulfil them together.</span></div>
        <ul class="sn-done" id="sn-done"></ul>
        <div class="ic-detect rv" id="sn-detect"><span class="cx-pulse"></span><b>Business rule</b> Request closed
          <code>IT_PROVISIONING_COMPLETED</code><span class="ic-hook">outbound REST → SmartStart</span></div>
      </div>`);
    loop(1);
    let finishing = false;
    const closeRow = async (tr) => {
      if (tr.classList.contains("closed")) return;
      tr.classList.add("closed");
      tr.querySelector(".sn-st").textContent = "Closed Complete";
      tr.querySelector(".sn-close").disabled = true;
      const [, done] = SN_TASKS[Number(tr.dataset.t)];
      $("#sn-done", b).insertAdjacentHTML("beforeend", `<li>✓ ${esc(done)}</li>`);
      if (!b.querySelector("tr[data-t]:not(.closed)") && !finishing) {
        finishing = true;
        $("#sn-all", b).disabled = true;
        loop(2);
        await finish();
      }
    };
    const finish = async () => {
      try {
        await wait(500);
        await act("complete_provisioning");
        const st = $("#sn-state", b);
        st.textContent = "Closed Complete";
        st.classList.add("ok");
        loop(3);
        await wait(700);
        await show($("#sn-detect", b), 600);
        loop(4);
        await flow();
        await handoff("ServiceNow", "SmartStart", "IT_PROVISIONING_COMPLETED", "SmartStart detects the ServiceNow update",
          [`${d().ticket} · Closed Complete`, "IT node marked READY on the onboarding graph"]);
        await route();
      } catch (err) {
        if (err === CANCEL) return;
        finishing = false;
        $("#sn-all", b).disabled = false;
        showToast(err.message);
      }
    };
    b.querySelectorAll(".sn-close").forEach((x) => x.addEventListener("click", () => closeRow(x.closest("tr"))));
    $("#sn-all", b).addEventListener("click", async (e) => {
      e.currentTarget.disabled = true;
      for (const tr of b.querySelectorAll("tr[data-t]:not(.closed)")) {
        try {
          await wait(380);
        } catch {
          return;
        }
        closeRow(tr);
      }
    });
  }

  function hubRow(states) {
    const label = { ok: "✓", part: "◐", todo: "○" };
    return `<ul class="cx-hubs">${states.map(([n, s, txt]) => `<li class="h-${s}"><span>${label[s]}</span>${esc(n)}<em>${esc(txt || "")}</em></li>`).join("")}</ul>`;
  }

  async function sceneITDone() {
    const dd = d();
    where("ss", P().HR, "HR · People Ops");
    loop(4);
    const ev = dd.events.find((e) => e.code === "IT_PROVISIONING_COMPLETED");
    const b = screen("ss", `
      <div class="cx-narrow">
        <section class="cx-card cx-event rv" id="x-ev">
          <p class="cx-k"><span class="cx-pulse"></span>System event detected</p>
          <dl class="cx-kv"><dt>Source</dt><dd><span class="src src-snow">ServiceNow</span></dd>
            <dt>Event</dt><dd><code>IT_PROVISIONING_COMPLETED</code></dd><dt>Request</dt><dd>${esc(dd.ticket)} · Closed Complete</dd>
            <dt>Received</dt><dd>${ev ? clock(ev.at) : ""}</dd></dl>
        </section>
        <section class="cx-card rv" id="x-graph">
          <p class="cx-k">Onboarding graph · ${esc(C().name)}</p>
          <div id="x-hubs">${hubRow([["HR", "ok", "Documents verified"], ["IT", "part", "Provisioning"], ["Manager", "todo"], ["Project", "todo"]])}</div>
        </section>
        <section class="cx-card cx-reason rv" id="x-why">
          <p class="cx-k violet"><span class="cx-nia-dot"></span>NIA</p>
          <p class="cx-think" data-t="IT requirements have been completed: laptop, VPN, Microsoft 365, Jira and engineering applications."></p>
          <p class="cx-think" data-t="Next dependency: manager preparation. The mentor, Day-1 plan and first project are owned by ${C().manager}."></p>
        </section>
        <section class="cx-card cx-rec rv" id="x-rec">
          <p class="cx-k violet"><span class="cx-nia-dot"></span>NIA recommends</p>
          <h3>The hiring manager can now prepare ${esc(first())}'s Day-1 experience.</h3>
          <div class="cx-acts"><button type="button" class="cx-btn primary" id="x-notify">Notify manager</button></div>
        </section>
        <div id="x-draft"></div>
      </div>`);
    await show($("#x-ev", b), 400);
    await show($("#x-graph", b), 500);
    $("#x-hubs", b).innerHTML = hubRow([["HR", "ok", "Documents verified"], ["IT", "ok", "READY"], ["Manager", "todo", "Next"], ["Project", "todo"]]);
    $("#x-hubs", b).classList.add("flash");
    await wait(700);
    await show($("#x-why", b), 0);
    for (const p of b.querySelectorAll(".cx-think")) {
      await typeInto(p, p.dataset.t);
      await wait(250);
    }
    loop(0);
    await show($("#x-rec", b), 0);
    on($("#x-notify", b), async (button) => {
      button.textContent = "NIA is drafting…";
      loop(1);
      const host = $("#x-draft", b);
      host.innerHTML = `<p class="cx-drafting"><span class="cx-spin"></span>Drafting manager communication…</p>${composer("manager")}`;
      host.querySelector(".cx-drafting").scrollIntoView({ block: "nearest", behavior: "smooth" });
      await wireDraft(host, "manager");
      button.textContent = "Draft ready below";
    });
  }

  function mgrShell(inner) {
    const c = C();
    return `<div class="ws-head ws-mgr"><div><p class="ws-k">My joiners</p><h2>${esc(c.name)} <span class="ws-pill">Onboarding</span></h2>
        <p class="ws-meta">${esc(c.position)} · ${esc(c.team)} · starts ${esc(fmtDate(c.start_date))}</p></div>
      <div class="ws-who"><span class="ws-ava mgr">${esc(c.manager.split(" ").map((x) => x[0]).join(""))}</span>${esc(c.manager)}<small>Hiring manager</small></div></div>
      <div class="ws-body">${inner}</div>`;
  }

  function standardAccess() {
    return `<section class="cx-card rv in" id="m-std"><p class="cx-k">SmartStart prepared standard access</p>
      <p class="cx-sub">Provisioned through ServiceNow ${esc(d().ticket)}</p>
      <ul class="cx-ticks">${["VPN", "Jira", "Microsoft 365", "Laptop", "Engineering applications"].map((x) => `<li class="ok">${esc(x)}</li>`).join("")}</ul></section>`;
  }

  async function sceneMgr() {
    const c = C(), dd = d();
    const prepared = dd.step !== "prepare_day1";
    where("mgr", c.manager, "Hiring manager");
    loop(prepared ? 0 : 1);
    const brief = dd.sent.manager || dd.drafts.manager;
    const b = screen("mgr", mgrShell(`
      <div class="cx-split">
        <div class="cx-col">
          <details class="cx-card cx-brief rv in"><summary><span class="src src-ss">SmartStart</span><time>${dd.sent.manager ? clock(dd.sent.manager.at) : ""}</time><b>${esc(brief.subject)}</b></summary>
            <pre class="ws-mail">${esc(brief.body)}</pre></details>
          ${standardAccess()}
          <section class="cx-card rv in" id="m-prep"><p class="cx-k">Your preparation</p>
            <ul class="cx-ticks" id="m-ticks">
              <li class="${prepared ? "ok" : ""}">Confirm mentor <em>${esc(c.mentor)} · suggested by NIA</em></li>
              <li class="${prepared ? "ok" : ""}">Day-1 orientation <em>${esc(fmtDate(c.start_date))} · 10:00</em></li>
              <li class="${prepared ? "ok" : ""}">Team introduction <em>in the Day-1 session</em></li>
              <li>Assign first project <em>after access is in place</em></li>
              <li class="${dd.access.length ? "ok" : ""}" id="m-collab">Review collaboration tools <em>${dd.access.length ? esc(dd.access[0].app) + " requested" : "NIA is checking"}</em></li>
            </ul>
            ${prepared ? "" : `<div class="cx-acts"><button type="button" class="cx-btn primary" id="m-day1">Confirm mentor & book Day 1</button></div>`}
          </section>
        </div>
        <div class="cx-col wide" id="m-right">
          <div class="cx-analyse rv" id="m-analyse"><span class="cx-nia-dot"></span><b>NIA</b>
            <ul class="cx-steps"><li>Analysing role: ${esc(c.position)}</li><li>Comparing tools used across ${esc(c.team)}</li>
              <li>Checking ${esc(first())}'s current access</li></ul></div>
          <section class="cx-card cx-rec big rv" id="m-rec">
            <p class="cx-k violet"><span class="cx-nia-dot"></span>NIA recommends</p>
            <h3>Based on ${esc(first())}'s team and role, additional collaboration access may be useful.</h3>
            <div class="cx-contrast">
              <div><p class="cx-sub">Standard · provisioned automatically</p><ul class="cx-std">${["VPN", "Jira", "Microsoft 365", "Laptop"].map((x) => `<li>✓ ${x}</li>`).join("")}</ul></div>
              <div><p class="cx-sub">Contextual · NIA suggests, you decide</p>
                <ul class="cx-sugg">${dd.suggested.map((s, i) => `<li class="${i === 0 ? "top" : ""}"><span>○</span><b>${esc(s.app)}</b><em>${esc(s.why)}</em>${i === 0 ? '<i class="cx-badge">Not provisioned</i>' : ""}</li>`).join("")}</ul></div>
            </div>
            <p class="cx-why"><b>Reason</b> ${esc(c.team)} commonly uses these tools for project documentation, source control and team collaboration. Confluence access has not been provisioned.</p>
            <p class="cx-guard">Recommendations only. Nothing is granted unless you request it, and IT approves it.</p>
            <div class="cx-acts"><button type="button" class="cx-btn primary" id="m-add">+ Add access</button></div>
          </section>
          <div id="m-panel"></div>
        </div>
      </div>`));
    const recommend = async () => {
      await show($("#m-analyse", b), 100);
      await ticks($("#m-analyse", b).querySelectorAll("li"), 520);
      await flow("CONTEXT_GAP");
      loop(0);
      await show($("#m-rec", b), 0);
      $("#m-add", b).addEventListener("click", (e) => {
        e.currentTarget.disabled = true;
        loop(1);
        accessPicker($("#m-panel", b));
      });
    };
    if (prepared) {
      S.fast = true;
      await recommend();
      S.fast = false;
      return;
    }
    on($("#m-day1", b), async (button) => {
      loop(2);
      await act("prepare_day1");
      button.closest(".cx-acts").remove();
      loop(3);
      await ticks([...$("#m-ticks", b).children].slice(0, 3), 320);
      await flow("DAY1_PREPARED");
      await recommend();
    });
  }

  function accessPicker(host) {
    const dd = d(), c = C();
    const sugg = new Set(dd.suggested.map((s) => s.app));
    host.innerHTML = `<section class="cx-card cx-picker rv">
      <p class="cx-k">Add access for ${esc(first())}</p>
      <div class="cx-cats">${Object.entries(dd.catalog).map(([cat, apps]) => `<div><p class="cx-sub">${esc(cat)}</p>
        ${apps.map((a) => `<button type="button" class="cx-app ${a === "Confluence" ? "nia" : ""}" data-app="${esc(a)}">${esc(a)}${sugg.has(a) ? "<i>NIA</i>" : ""}</button>`).join("")}</div>`).join("")}</div>
      <form class="cx-form" id="m-form" hidden>
        <label>Application<input name="app" readonly></label>
        <label>Workspace<select name="workspace"><option>${esc(c.team)}</option><option>Engineering (all)</option><option>Company wiki (read)</option></select></label>
        <label>Access<select name="level">${dd.levels.map((l) => `<option ${l === "Member" ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
        <label class="full">Reason<textarea name="reason" rows="2">Project documentation and collaboration</textarea></label>
        <div class="cx-acts full"><button type="button" class="cx-btn ghost" id="m-cancel">Cancel</button>
          <button type="submit" class="cx-btn primary" id="m-req">Request access</button></div>
      </form>
      <div class="cx-validate" id="m-val" hidden></div>
    </section>`;
    const card = host.firstElementChild;
    requestAnimationFrame(() => show(card, 0).catch(() => {}));
    const form = $("#m-form", host);
    host.querySelectorAll(".cx-app").forEach((a) => a.addEventListener("click", () => {
      host.querySelectorAll(".cx-app").forEach((x) => x.classList.toggle("sel", x === a));
      form.app.value = a.dataset.app;
      if (a.dataset.app !== "Confluence") form.reason.value = sugg.has(a.dataset.app)
        ? (dd.suggested.find((s) => s.app === a.dataset.app) || {}).why || "" : "";
      form.hidden = false;
      form.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }));
    $("#m-cancel", host).addEventListener("click", () => {
      host.innerHTML = "";
      $("#m-add").disabled = false;
      loop(0);
    });
    form.addEventListener("submit", (e) => e.preventDefault());
    on($("#m-req", host), async () => {
      loop(2);
      const detail = { app: form.app.value, workspace: form.workspace.value, level: form.level.value, reason: form.reason.value };
      await act("request_access", detail);
      const sent = $("#m-req", host);
      busy(sent, false);
      sent.disabled = true;
      sent.textContent = "✓ Requested";
      form.querySelectorAll("input,select,textarea,button").forEach((x) => (x.disabled = true));
      host.querySelector(".cx-cats").hidden = true;
      const v = $("#m-val", host);
      const req = d().access[d().access.length - 1];
      v.hidden = false;
      v.innerHTML = `<p class="cx-drafting"><span class="cx-spin"></span>SmartStart · Processing access request…</p>
        <ul class="cx-ticks"><li>Employee identity <em>${esc(c.name)} · ${esc(d().joiner_id)}</em></li><li>Team <em>${esc(c.team)}</em></li>
          <li>Manager authorization <em>${esc(c.manager)} is ${esc(first())}'s hiring manager</em></li>
          <li>Application requirement <em>${esc(req.app)} · ${esc(req.workspace)}</em></li></ul>
        <div class="cx-created rv"><p class="cx-k">Access request created</p>
          <dl class="cx-kv"><dt>Request</dt><dd>${esc(req.id)}</dd><dt>Application</dt><dd>${esc(req.app)} · ${esc(req.level)}</dd>
            <dt>Requested by</dt><dd>${esc(req.by)}</dd><dt>Destination</dt><dd>IT / Access Management</dd>
            <dt>Status</dt><dd><span class="st st-pending">${esc(req.status)}</span></dd></dl>
          <div class="cx-mini-flow"><span>Manager</span><i></i><span>SmartStart</span><i></i><span>IT / Access Mgmt</span></div></div>`;
      v.scrollIntoView({ block: "nearest", behavior: "smooth" });
      await wait(400);
      await ticks(v.querySelectorAll(".cx-ticks li"), 420);
      v.querySelector(".cx-drafting").classList.add("done");
      await show(v.querySelector(".cx-created"), 300);
      v.querySelector(".cx-mini-flow").classList.add("go");
      loop(3);
      await flow();
      await wait(800);
      await handoff("Manager", "IT / Access Management", "ACCESS_REQUEST_CREATED", "The manager's decision becomes an IT request",
        [`${req.app} · ${req.workspace} · ${req.level}`, "Validated by SmartStart before it reaches IT"]);
      await route();
    });
  }

  async function sceneITAccess() {
    const c = C(), dd = d();
    const req = dd.access[dd.access.length - 1];
    where("it", P().IT, "IT · Access Management");
    loop(null);
    const b = screen("it", itShell(`
      <p class="ws-count"><b>1</b> new request · arrived via SmartStart</p>
      <article class="ws-req ws-live rv" id="a-req">
        <header><span class="ws-new">New access request</span><time>${clock(req.at)}</time></header>
        <h3>${esc(c.name)}</h3><p class="ws-meta">${esc(c.position)} · ${esc(c.team)}</p>
        <dl class="cx-kv"><dt>Requested by</dt><dd>${esc(req.by)} · Hiring manager</dd><dt>Application</dt><dd><b>${esc(req.app)}</b></dd>
          <dt>Workspace</dt><dd>${esc(req.workspace)}</dd><dt>Access</dt><dd>${esc(req.level)}</dd><dt>Reason</dt><dd>${esc(req.reason)}</dd>
          <dt>Status</dt><dd id="a-st"><span class="st st-pending">${esc(req.status)}</span></dd></dl>
        <p class="cx-validated">SmartStart validated · ✓ identity · ✓ team · ✓ manager authorization · ✓ application requirement</p>
        ${niaLine(`${req.app} ${req.level} for ${req.workspace} matches how this team works, and the request came from ${first()}'s own manager.`)}
        <div class="ws-detail" id="a-detail" hidden><dl class="cx-kv"><dt>Policy</dt><dd>Manager request + IT approval</dd>
          <dt>Licence pool</dt><dd>42 of 50 seats in use</dd><dt>Review</dt><dd>Access recertified after 90 days</dd>
          <dt>Request ID</dt><dd>${esc(req.id)}</dd></dl></div>
        <div class="cx-acts"><button type="button" class="cx-btn ghost" id="a-review">Review</button>
          <button type="button" class="cx-btn primary" id="a-approve">Approve</button></div>
        <div class="ic-detect rv" id="a-detect"><span class="cx-pulse"></span><b>Access Management</b> Access granted
          <code>ACCESS_GRANTED</code><span class="ic-hook">event → SmartStart</span></div>
      </article>
      <article class="ws-req ws-done"><header><span>New joiner setup</span><span class="st st-ready">Completed</span></header>
        <h3>${esc(c.name)}</h3><p class="ws-meta">ServiceNow ${esc(dd.ticket)} · Closed Complete · ${dd.standard.length} of ${dd.standard.length} tasks</p></article>`));
    await wait(350);
    await show($("#a-req", b), 0);
    loop(1);
    $("#a-review", b).addEventListener("click", (e) => {
      const det = $("#a-detail", b);
      det.hidden = !det.hidden;
      e.currentTarget.textContent = det.hidden ? "Review" : "Hide details";
    });
    on($("#a-approve", b), async () => {
      loop(2);
      await act("approve_access");
      $("#a-st", b).innerHTML = `<span class="st st-ready">✓ Approved</span>`;
      $("#a-review", b).closest(".cx-acts").remove();
      loop(3);
      await wait(600);
      await show($("#a-detect", b), 500);
      loop(4);
      await flow();
      await handoff("Access Management", "SmartStart", "ACCESS_GRANTED", "SmartStart detects the access grant",
        [`${req.app} · ${req.level} · ${req.workspace}`, `${first()}'s readiness is recalculated`]);
      await route();
    });
  }

  async function sceneReady() {
    const c = C(), dd = d();
    const req = dd.access[dd.access.length - 1];
    where("ss", P().HR, "HR · People Ops");
    loop(4);
    const b = screen("ss", `
      <div class="cx-split">
        <div class="cx-col">
          <section class="cx-card cx-event rv" id="r-ev"><p class="cx-k"><span class="cx-pulse"></span>System event detected</p>
            <dl class="cx-kv"><dt>Source</dt><dd><span class="src src-access">Access Management</span></dd><dt>Event</dt><dd><code>ACCESS_GRANTED</code></dd>
              <dt>Application</dt><dd>${esc(req.app)} · ${esc(req.level)}</dd></dl></section>
          <section class="cx-card rv" id="r-cmp"><p class="cx-k">Readiness</p>
            <p class="cx-sub">Previously</p>${hubRow([["IT", "ok"], ["Manager", "part"], ["Project", "todo"]])}
            <p class="cx-sub">Now</p><div id="r-now" class="flash">${hubRow([["IT", "ok"], ["Manager", "ok"], ["Access", "ok"], ["Project", "part"]])}</div></section>
          <section class="cx-card cx-rec rv" id="r-rec"><p class="cx-k violet"><span class="cx-nia-dot"></span>Access requirement completed</p>
            <h3>${esc(c.name)} now has the collaboration access required for ${esc(c.team)}.</h3>
            <p class="cx-sub">Next recommended action: assign the first project.</p>
            <div class="cx-acts"><button type="button" class="cx-btn primary" id="r-open">Open project readiness</button></div></section>
        </div>
        <div class="cx-col wide"><section class="cx-card cx-plan-card rv" id="r-plan"><p class="cx-k">Onboarding graph · live</p>
          <p class="cx-sub">Every requirement SmartStart mapped from the offer, with what's connected so far.</p>${planGraph()}</section></div>
      </div>`);
    S.fast = true;
    await buildGraph(b.querySelector(".cx-plan"));
    S.fast = false;
    await show($("#r-ev", b), 300);
    await show($("#r-plan", b), 300);
    await show($("#r-cmp", b), 700);
    loop(0);
    await show($("#r-rec", b), 0);
    $("#r-open", b).addEventListener("click", () => projectReadiness().catch((e) => e === CANCEL || showToast(e.message)));
  }

  async function projectReadiness() {
    const c = C(), pr = d().project;
    where("mgr", c.manager, "Hiring manager");
    loop(1);
    const b = screen("mgr", mgrShell(`
      <div class="cx-narrow">
        <section class="cx-card cx-proj rv in"><p class="cx-k">Project readying</p>
          <dl class="cx-kv"><dt>Employee</dt><dd>${esc(c.name)}</dd><dt>Recommended project</dt><dd><b>${esc(pr.name)}</b></dd>
            <dt>Jira project</dt><dd><code>${esc(pr.jira)}</code></dd><dt>Access</dt><dd>✓ Jira · ✓ ${esc((d().access[0] || {}).app || "Confluence")} · ✓ GitHub via engineering apps</dd></dl>
          ${niaLine("Recommended because it matches:")}
          <ul class="cx-ticks">${pr.why.map((w) => `<li class="ok">${esc(w)}</li>`).join("")}</ul>
          <p class="cx-sub">First-week tasks NIA will create</p>
          <ol class="cx-num">${pr.tasks.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>
          <div class="cx-acts"><button type="button" class="cx-btn primary" id="p-assign">Assign project</button></div>
        </section>
      </div>`));
    on($("#p-assign", b), async () => {
      loop(2);
      await act("assign_project");
      await handoff("SmartStart", "Jira", pr.jira, "SmartStart creates the assignment in Jira",
        [`${pr.name} · assigned to ${c.name}`, `${pr.tasks.length} first-week issues`]);
      await sceneJira();
    });
  }

  async function sceneJira() {
    const c = C(), pr = d().project;
    where("jira", c.manager, "Project lead");
    loop(3);
    const b = screen("jira", `
      <div class="jr-nav"><span class="jr-logo">Jira</span><nav><span>Your work</span><span class="on">Projects</span><span>Filters</span></nav></div>
      <div class="jr-body">
        <p class="jr-crumb">Projects / ${esc(pr.jira)}</p>
        <div class="jr-epic rv in"><span class="jr-ico epic">⚡</span><div><p class="jr-k">Epic · ${esc(pr.jira)}-100</p><h2>${esc(pr.name)}</h2>
          <p class="jr-meta">Assignee <b>${esc(c.name)}</b> · Reporter ${esc(c.manager)} · Created by SmartStart integration</p></div>
          <span class="jr-assigned" id="j-ok">Project assigned ✓</span></div>
        <div class="jr-cols">
          <div class="jr-col"><p class="jr-col-h">To do <b>${pr.tasks.length}</b></p>${pr.tasks.map((t, i) => `<div class="jr-issue rv"><span class="jr-ico task">✓</span>
            <p>${esc(t)}</p><span class="jr-key">${esc(pr.jira)}-${101 + i}</span><span class="jr-ava">${esc(c.name.split(" ").map((x) => x[0]).join(""))}</span></div>`).join("")}</div>
          <div class="jr-col"><p class="jr-col-h">In progress <b>0</b></p></div>
          <div class="jr-col"><p class="jr-col-h">Done <b>0</b></p></div>
        </div>
        <div class="ic-detect rv" id="j-detect"><span class="cx-pulse"></span><b>Jira webhook</b> Issue assigned
          <code>PROJECT_ASSIGNED</code><span class="ic-hook">→ SmartStart</span></div>
      </div>`);
    for (const n of b.querySelectorAll(".jr-issue")) await show(n, 380);
    $("#j-ok", b).classList.add("in");
    await wait(600);
    await show($("#j-detect", b), 500);
    loop(4);
    await flow("PROJECT_ASSIGNED");
    await handoff("Jira", "SmartStart", "PROJECT_ASSIGNED", "SmartStart detects project readiness",
      ["All required onboarding dependencies are now connected"]);
    await sceneFinal();
  }

  async function sceneFinal() {
    const c = C(), dd = d();
    where("ss", null);
    loop(null);
    ov.querySelectorAll(".g-node").forEach((g) => g.classList.remove("here"));
    const chain = [["iCIMS", "icims"], ["SmartStart", "ss"], ["HR", "hr"], ["IT / ServiceNow", "snow"], ["Manager", "mgr"], ["Jira", "jira"], ["Employee", "emp"]];
    const b = screen("ss", `
      <div class="cx-final">
        <section class="cx-card cx-ready rv" id="f-ready"><p class="cx-k"><span class="cx-pulse ok"></span>Employee ready</p>
          <h2>${esc(c.name)}</h2><p class="cx-sub">${esc(c.position)} · ${esc(c.team)} · Day 1 on ${esc(fmtDate(c.start_date))} at 10:00 with ${esc(c.mentor)}</p>
          <ul class="cx-ticks big">${dd.readiness.map((r) => `<li data-ok="${r.ok ? 1 : 0}">${esc(r.label)}</li>`).join("")}</ul>
        </section>
        <section class="cx-card cx-chain-card rv" id="f-chain"><p class="cx-k">SmartStart has connected</p>
          <ol class="cx-chain">${chain.map(([n, k]) => `<li class="src-${k}"><span>${esc(n)}</span></li>`).join("")}</ol></section>
        <div class="cx-statement rv" id="f-say"><p>One event started the journey.</p><p><b>SmartStart connected everything that followed.</b></p>
          <div class="cx-acts"><button type="button" class="cx-btn primary" id="f-open">See ${esc(first())} in the Command Center</button>
            <button type="button" class="cx-btn ghost" id="f-again">Run it again</button>
            <button type="button" class="cx-btn ghost" id="f-end">End and remove ${esc(first())}</button></div></div>
        <section class="cx-card cx-trail-card rv" id="f-trail"><p class="cx-k">What happened · ${dd.events.length} system events, one offer</p>
          <ol class="cx-trail">${dd.events.map((e) => `<li><span class="src src-${SRC[e.source] || "ss"}">${esc(e.source)}</span><code>${esc(e.code)}</code><span class="cx-trail-t">${esc(e.text)}</span><time>${clock(e.at)}</time></li>`).join("")}</ol>
        </section>
      </div>`);
    await flow();
    await show($("#f-ready", b), 200, false);
    await ticks([...b.querySelectorAll(".cx-ticks.big li")].filter((li) => li.dataset.ok === "1"), 240);
    await show($("#f-chain", b), 200, false);
    await ticks(b.querySelectorAll(".cx-chain li"), 200);
    b.querySelector(".cx-chain").classList.add("live");
    if (!S.fast) await pulse(["icims", "ss", "hr", "emp"]);
    await show($("#f-say", b), 300, false);
    await show($("#f-trail", b), 0, false);
    $("#f-open", b).addEventListener("click", async () => {
      const id = d().joiner_id;
      await close();
      try {
        openJoinerDrawer(id);
      } catch {}
    });
    $("#f-again", b).addEventListener("click", () => restart());
    $("#f-end", b).addEventListener("click", async () => {
      await postJSON("/api/sim/end").catch(() => {});
      S.d = null;
      await close();
    });
  }

  /* ---------- flow control ---------- */

  async function route() {
    const step = d().step;
    paintNodes();
    if (step === "accept_offer") return sceneIcims();
    if (step === "start_onboarding") return sceneDetect();
    if (step === "send_it") return sceneDraft("it");
    if (step === "start_provisioning") return sceneIT();
    if (step === "complete_provisioning") return sceneSnow();
    if (step === "send_manager") return sceneITDone();
    if (step === "prepare_day1" || step === "request_access") return sceneMgr();
    if (step === "approve_access") return sceneITAccess();
    if (step === "assign_project") return sceneReady();
    return sceneFinal();
  }

  async function run(fast) {
    S.fast = fast;
    try {
      await route();
    } catch (err) {
      if (err !== CANCEL) showToast(err.message || "Simulation error");
    } finally {
      S.fast = false;
    }
  }

  function syncButton() {
    const live = S.d && S.d.active;
    window.ssSimJoinerId = (live && S.d.joiner_id) || L.joiners[0] || null;
    btn.lastChild.textContent = live && !S.d.done ? "Resume simulation" : "Simulate a new hire";
  }

  async function openSim() {
    S.token++;
    try {
      if (!S.d || !S.d.active || S.d.done) {
        S.d = await postJSON("/api/sim/start");
        S.seen = 0;
      } else {
        S.seen = S.d.events.length ? S.d.events[S.d.events.length - 1].n : 0;
      }
    } catch (err) {
      showToast(`Couldn't start the simulation: ${err.message}`);
      return;
    }
    S.open = true;
    ov.hidden = false;
    document.body.classList.add("ccx-open");
    paintNodes();
    paintEvents();
    syncButton();
    const resume = S.seen > 0;
    run(resume);
    $("[data-x=close]").focus({ preventScroll: true });
  }

  async function restart() {
    S.token++;
    S.d = await postJSON("/api/sim/start");
    S.seen = 0;
    paintNodes();
    paintEvents();
    syncButton();
    run(false);
  }

  function mark() {
    const ids = new Set([window.ssSimJoinerId, ...L.joiners].filter(Boolean));
    ids.forEach((id) => {
      document.querySelectorAll(`[data-id="${CSS.escape(id)}"], [data-open="${CSS.escape(id)}"]`).forEach((n) => {
        if (ov.contains(n) || n.closest(".ssn-tray, .ssn-live")) return;
        (n.closest(".joiner-row, .nn-row, .joiner-line, .action-card, .al-row, .alert, li, tr") || n).classList.add("sim-mark");
      });
    });
  }

  async function close() {
    S.token++;
    S.open = false;
    ov.hidden = true;
    document.body.classList.remove("ccx-open");
    syncButton();
    window.ssQuietRender = true;
    try {
      await loadAll();
    } catch {}
    window.ssQuietRender = false;
    mark();
  }

  const baseRender = window.render;
  if (typeof baseRender === "function") {
    window.render = function () {
      baseRender.apply(this, arguments);
      mark();
    };
  }

  btn.addEventListener("click", openSim);
  ov.addEventListener("click", (e) => {
    const x = e.target.closest("[data-x]");
    if (!x) return;
    if (x.dataset.x === "close") close();
    if (x.dataset.x === "restart") restart().catch((err) => showToast(err.message));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && S.open && !e.target.closest("[contenteditable=true], textarea, input, select")) close();
  });

  /* ---------- live link: every open Command Center hears the run ---------- */
  const L = { seq: null, notes: [], joiners: [], open: false, timer: null };
  const seenKey = `ss_sim_seen_${employerSession.username || "employer"}`;
  const ago = (iso) => {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 45) return "just now";
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    return clock(iso).slice(0, 5);
  };
  const FROM = {
    MANAGER_NOTIFIED: "From HR", IT_REQUEST_CREATED: "From HR", ACCESS_REQUEST_CREATED: "From Ava Chen",
    CONTEXT_GAP: "NIA", OFFER_ACCEPTED: "iCIMS", DOCUMENTS_SUBMITTED: "iCIMS", IT_PROVISIONING_COMPLETED: "ServiceNow",
    ACCESS_GRANTED: "Access Management", PROJECT_ASSIGNED: "Jira", DAY1_PREPARED: "Manager", EMPLOYEE_READY: "SmartStart",
  };
  const NOTE_SRC = { "From HR": "ss", "From Ava Chen": "mgr", NIA: "nia", iCIMS: "icims", ServiceNow: "snow",
    "Access Management": "access", Jira: "jira", Manager: "mgr", SmartStart: "ss" };

  const bell = document.createElement("button");
  bell.type = "button";
  bell.className = "ssn-bell";
  bell.setAttribute("aria-label", "Notifications");
  bell.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.6 2H4.4L6 16Z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/></svg><span class="ssn-n" hidden></span>`;
  btn.parentNode.insertBefore(bell, btn);
  const tray = document.createElement("section");
  tray.className = "ssn-tray";
  tray.hidden = true;
  tray.setAttribute("aria-label", "Notifications");
  document.body.appendChild(tray);
  const live = document.createElement("div");
  live.className = "ssn-live";
  live.setAttribute("aria-live", "polite");
  document.body.appendChild(live);

  const seen = () => Number(localStorage.getItem(seenKey) || 0);
  function paintBell() {
    const unread = L.notes.filter((n) => n.seq > seen()).length;
    const badge = bell.querySelector(".ssn-n");
    badge.hidden = !unread;
    badge.textContent = unread > 9 ? "9+" : unread;
    bell.classList.toggle("has", unread > 0);
  }

  function noteHTML(n, compact) {
    const from = FROM[n.code] || n.source;
    return `<div class="ssn-top"><span class="ssn-src s-${NOTE_SRC[from] || "ss"}">${esc(from)}</span>
        <span class="ssn-via">via SmartStart</span><time>${ago(n.at)}</time></div>
      <p class="ssn-title">${esc(n.title)}</p><p class="ssn-text">${esc(n.text)}</p>
      ${!compact && n.body ? `<details class="ssn-body"><summary>Read the message</summary><pre>${esc(n.body)}</pre></details>` : ""}
      <div class="ssn-acts"><button type="button" data-ssn-open="${esc(n.joiner_id)}">View ${esc(n.joiner_name.split(" ")[0])}</button>
        ${n.mine && L.mine && L.mine.step !== "done" ? `<button type="button" data-ssn-sim>Continue in simulation</button>` : ""}</div>`;
  }

  function paintTray() {
    const s = seen();
    tray.innerHTML = `<header><b>Notifications</b><span>Live from the onboarding simulation</span>
        ${L.notes.length ? `<button type="button" data-ssn-read>Mark all read</button>` : ""}</header>
      ${L.notes.length ? `<ol>${L.notes.map((n) => `<li class="${n.seq > s ? "unread" : ""}">${noteHTML(n, false)}</li>`).join("")}</ol>`
        : `<p class="ssn-empty">Nothing yet. When someone runs <b>Simulate a new hire</b>, the steps that need you show up here.</p>`}`;
  }

  function toggleTray(force) {
    const was = L.open;
    L.open = force ?? !L.open;
    if (was && !L.open) {
      localStorage.setItem(seenKey, String(L.seq || 0));
      paintBell();
    }
    tray.hidden = !L.open;
    bell.classList.toggle("on", L.open);
    if (L.open) {
      const r = bell.getBoundingClientRect();
      tray.style.top = `${r.bottom + 10}px`;
      tray.style.right = `${Math.max(12, window.innerWidth - r.right - 8)}px`;
      paintTray();
    }
  }

  function popLive(n) {
    const card = document.createElement("article");
    card.className = `ssn-card t-${n.tone}`;
    card.innerHTML = `<button type="button" class="ssn-x" aria-label="Dismiss">×</button>${noteHTML(n, true)}<i class="ssn-timer"></i>`;
    live.prepend(card);
    [...live.children].slice(3).forEach((c) => c.remove());
    const gone = () => {
      card.classList.add("out");
      setTimeout(() => card.remove(), 350);
    };
    card.querySelector(".ssn-x").addEventListener("click", gone);
    card._t = setTimeout(gone, 9000);
    card.addEventListener("mouseenter", () => clearTimeout(card._t));
    card.addEventListener("mouseleave", () => (card._t = setTimeout(gone, 4000)));
  }

  async function poll() {
    clearTimeout(L.timer);
    if (!document.hidden) {
      try {
        const f = await fetchJSON("/api/sim/feed");
        if (f.seq < seen()) localStorage.setItem(seenKey, "0");
        const first = L.seq == null;
        const fresh = first ? [] : f.notes.filter((n) => n.seq > L.seq);
        L.seq = f.seq;
        L.notes = f.notes;
        L.joiners = f.joiners;
        L.mine = f.mine;
        const pin = (S.d && S.d.active && !S.d.done && S.d.joiner_id) || f.joiners[0] || null;
        const repin = pin !== window.ssSimJoinerId;
        window.ssSimJoinerId = pin;
        paintBell();
        if (L.open) paintTray();
        if (fresh.length || repin) {
          if (fresh.length) {
            bell.classList.remove("ring");
            void bell.offsetWidth;
            bell.classList.add("ring");
          }
          if (!S.open) {
            fresh.slice(0, 3).reverse().forEach(popLive);
            window.ssQuietRender = true;
            try {
              await loadAll();
            } catch {}
            window.ssQuietRender = false;
            mark();
          }
        }
        if (S.open && !S.acting && S.d && f.mine.step && f.mine.run === S.d.run && f.mine.step !== S.d.step) {
          S.d = await fetchJSON("/api/sim");
          S.token++;
          run(false);
        } else if (!S.open && f.mine.run && S.d && f.mine.step !== S.d.step) {
          S.d = await fetchJSON("/api/sim");
          syncButton();
        }
      } catch {}
    }
    L.timer = setTimeout(poll, 4000);
  }

  bell.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleTray();
  });
  document.addEventListener("click", (e) => {
    const o = e.target.closest("[data-ssn-open]");
    if (o) {
      toggleTray(false);
      o.closest(".ssn-card")?.remove();
      try {
        openJoinerDrawer(o.dataset.ssnOpen);
      } catch {}
      return;
    }
    if (e.target.closest("[data-ssn-sim]")) {
      toggleTray(false);
      e.target.closest(".ssn-card")?.remove();
      openSim();
      return;
    }
    if (e.target.closest("[data-ssn-read]")) {
      localStorage.setItem(seenKey, String(L.seq || 0));
      paintBell();
      paintTray();
      return;
    }
    if (L.open && !e.target.closest(".ssn-tray")) toggleTray(false);
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) poll();
  });
  poll();

  fetchJSON("/api/sim")
    .then((data) => {
      if (!data.active) return;
      S.d = data;
      syncButton();
      setTimeout(mark, 800);
    })
    .catch(() => {});
})();
