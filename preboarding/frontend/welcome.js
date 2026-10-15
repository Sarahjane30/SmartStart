/* The joiner's Day-1 pack, opened from the link in HR's welcome email. No account needed. */
(() => {
  const token = location.pathname.split("/").filter(Boolean).pop();
  const api = (p = "") => `/api/welcome/${encodeURIComponent(token)}${p}`;
  const root = document.getElementById("pb-root");
  const P = { pack: null, target: 0, mode: null, sending: false };
  const ticks = () => JSON.parse(localStorage.getItem(`pb-bring-${token}`) || "{}");

  const esc = (v) =>
    String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  async function call(path, body) {
    const res = await fetch(api(path), {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(Array.isArray(out.detail) ? out.detail.map((d) => d.msg).join("; ") : out.detail || `Error ${res.status}`);
    return out;
  }

  function when(iso) {
    try {
      return new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  /* ---------- countdown (the synthetic data has its own "today", so we count from it) ---------- */

  function countdownHtml() {
    const left = P.target - Date.now();
    if (left <= 0)
      return `<div class="pb-count done"><strong>It's Day 1 — welcome to Waters.</strong><span>Reception by ${esc(P.pack.start.arrive)}.</span></div>`;
    const s = Math.floor(left / 1000);
    const cells = [
      [Math.floor(s / 86400), Math.floor(s / 86400) === 1 ? "day" : "days"],
      [Math.floor((s % 86400) / 3600), "hours"],
      [Math.floor((s % 3600) / 60), "minutes"],
      [s % 60, "seconds"],
    ];
    return `<div class="pb-count" role="timer" aria-label="${cells[0][0]} days and ${cells[1][0]} hours until your first day">
      ${cells.map(([n, l]) => `<div><b>${String(n).padStart(2, "0")}</b><span>${l}</span></div>`).join("")}</div>`;
  }

  function tick() {
    const el = document.getElementById("pb-count");
    if (el) el.innerHTML = countdownHtml();
  }

  /* ---------- sections ---------- */

  function hero(p) {
    const st = p.start;
    const c = p.state.confirmed;
    const status = c
      ? c.attending
        ? `<span class="pb-chip ok">You confirmed you'll be there</span>`
        : `<span class="pb-chip warn">You told HR Day 1 may not work</span>`
      : `<a class="pb-chip" href="#pb-confirm">Let HR know you're coming</a>`;
    return `<section class="pb-hero">
      <div class="pb-hero-text">
        <p class="pb-kicker">${esc(p.joiner.position)} · ${esc(p.joiner.team)}</p>
        <h1>Welcome to Waters, ${esc(p.joiner.first_name)}.</h1>
        <p class="pb-lead">Everything you need for your first day, in one place. Your laptop and accounts come on Day 1 — you don't need anything from IT before then.</p>
        <div class="pb-hero-acts">
          <a class="pb-btn light" href="${api("/day1.ics")}">Add Day 1 to your calendar</a>
          ${status}
        </div>
      </div>
      <div class="pb-hero-clock">
        <p class="pb-clock-label">Your first day</p>
        <p class="pb-clock-date">${esc(st.long)}</p>
        <p class="pb-clock-sub">Reception by <strong>${esc(st.arrive)}</strong> ${esc(p.site.tz)} · ${esc(p.site.city)}</p>
        <div id="pb-count">${countdownHtml()}</div>
        <p class="pb-clock-note">Counting from ${esc(new Date(st.as_of).toLocaleDateString([], { day: "numeric", month: "long", year: "numeric" }))}, the date of this synthetic demo.</p>
      </div>
    </section>`;
  }

  function schedule(p) {
    return `<section class="pb-card">
      <header class="pb-card-h"><h2>Your first day</h2><span class="pb-muted">${esc(p.start.long)}</span></header>
      <ol class="pb-day">${p.schedule
        .map(
          (s) => `<li>
          <time>${esc(s.time)}</time>
          <div>
            <h3>${esc(s.title)}</h3>
            <p class="pb-meta">${esc(s.with)} · ${esc(s.where)}</p>
            <p>${esc(s.detail)}</p>
          </div>
        </li>`
        )
        .join("")}</ol>
      ${p.policy ? `<p class="pb-src">Times and what to bring come from the approved ${esc(p.policy.title)} · ${esc(p.policy.owner)} · updated ${esc(p.policy.updated)}</p>` : ""}
    </section>`;
  }

  function people(p) {
    const initials = (n) => n.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
    return `<section class="pb-card">
      <header class="pb-card-h"><h2>Who you'll meet</h2><span class="pb-muted">${p.people.length} people on Day 1</span></header>
      <div class="pb-people">${p.people
        .map(
          (m) => `<article class="pb-person">
          <span class="pb-avatar ${m.relation === "Teammate" ? "t" : ""}" aria-hidden="true">${esc(initials(m.name))}</span>
          <div>
            <p class="pb-rel">${esc(m.relation)}</p>
            <h3>${esc(m.name)}</h3>
            <p class="pb-meta">${esc(m.role)}</p>
            <p class="pb-help">${esc(m.help)}</p>
            <p class="pb-when">You'll meet: <strong>${esc(m.meet)}</strong></p>
          </div>
        </article>`
        )
        .join("")}</div>
    </section>`;
  }

  function where(p) {
    const s = p.site;
    return `<section class="pb-card">
      <header class="pb-card-h"><h2>Where to go</h2></header>
      <p class="pb-place"><strong>${esc(s.name)}</strong><br />${esc(s.building)}<br /><span class="pb-muted">${esc(s.address)}</span></p>
      <p>${esc(s.arrival_hint)}</p>
      <ul class="pb-list">${s.getting_there.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>
    </section>`;
  }

  function bring(p) {
    const t = ticks();
    const done = p.bring.filter((b) => t[b.id]).length;
    return `<section class="pb-card">
      <header class="pb-card-h"><h2>What to bring</h2><span class="pb-muted">${done} of ${p.bring.length} ready</span></header>
      <ul class="pb-check">${p.bring
        .map(
          (b) => `<li><label>
          <input type="checkbox" data-bring="${esc(b.id)}" ${t[b.id] ? "checked" : ""} />
          <span><strong>${esc(b.label)}</strong>${b.required ? "" : ` <em>optional</em>`}<small>${esc(b.why)}</small></span>
        </label></li>`
        )
        .join("")}</ul>
    </section>`;
  }

  function ready(p) {
    const d = p.documents;
    const l = p.laptop;
    const docs =
      d.state === "complete"
        ? `<span class="pb-chip ok">Documents complete</span>`
        : `<span class="pb-chip warn">${d.state === "rework" ? "One document needs a correction" : `${d.form_count} forms still open in iCIMS`}</span>`;
    return `<section class="pb-card">
      <header class="pb-card-h"><h2>Before Day 1</h2></header>
      <div class="pb-ready">
        <div><p class="pb-rel">Onboarding documents</p>${docs}</div>
        <div><p class="pb-rel">Your laptop</p><span class="pb-chip ${l.state === "ready" ? "ok" : ""}">${l.state === "ready" ? "Ready" : "Being prepared"}</span>
          <p class="pb-muted">${esc(l.text)}</p></div>
      </div>
    </section>`;
  }

  function confirm(p) {
    const c = p.state.confirmed;
    let body;
    if (P.mode === "change")
      body = `<form class="pb-form" data-form="change">
        <textarea name="note" rows="3" maxlength="300" required placeholder="What's come up? e.g. I can only arrive at 11 AM"></textarea>
        <div class="pb-form-acts"><button class="pb-btn" type="submit">Send to HR</button><button class="pb-btn ghost" type="button" data-act="cancel">Cancel</button></div>
      </form>`;
    else if (c)
      body = `<p class="pb-done ${c.attending ? "" : "warn"}">${
        c.attending ? "Thanks — HR knows you'll be there." : `HR has your note: “${esc(c.note)}”. They'll get back to you.`
      } <span class="pb-muted">${esc(when(c.at))}</span></p>
      <button class="pb-link" type="button" data-act="${c.attending ? "change" : "coming"}">${c.attending ? "Something's come up" : "Actually, I'll be there"}</button>`;
    else
      body = `<p>Let HR know you're all set — it helps them plan your badge, laptop and lunch.</p>
      <div class="pb-form-acts"><button class="pb-btn" type="button" data-act="coming">Yes, I'll be there</button>
      <button class="pb-btn ghost" type="button" data-act="change">Something's come up</button></div>`;
    return `<section class="pb-card" id="pb-confirm"><header class="pb-card-h"><h2>Will you be there?</h2></header>${body}</section>`;
  }

  function questions(p) {
    const asked = p.state.questions || [];
    return `<section class="pb-card">
      <header class="pb-card-h"><h2>Questions</h2><span class="pb-muted">Answers from approved Waters policies</span></header>
      <div class="pb-faq">${(p.faq || [])
        .map(
          (f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p>
          <p class="pb-src">From ${esc(f.source)} · ${esc(f.owner)}${f.updated ? ` · updated ${esc(f.updated)}` : ""}</p></details>`
        )
        .join("")}</div>
      <form class="pb-form" data-form="ask">
        <label for="pb-q">Something else? Ask HR</label>
        <textarea id="pb-q" name="text" rows="2" maxlength="500" required minlength="3" placeholder="e.g. Is there a dress code for the team I'm joining?"></textarea>
        <div class="pb-form-acts"><button class="pb-btn" type="submit">Send to ${esc(p.sender.name || "HR")}</button></div>
      </form>
      ${
        asked.length
          ? `<ul class="pb-asked">${asked
              .slice()
              .reverse()
              .map((q) => `<li>“${esc(q.text)}” <span class="pb-muted">sent ${esc(when(q.at))} · HR replies by email</span></li>`)
              .join("")}</ul>`
          : ""
      }
    </section>`;
  }

  function paint() {
    const p = P.pack;
    document.title = `Your first day at Waters · ${p.joiner.first_name}`;
    document.getElementById("pb-who").textContent = p.joiner.name;
    root.innerHTML = `
      ${hero(p)}
      <div class="pb-grid">
        <div class="pb-col">${schedule(p)}${people(p)}</div>
        <aside class="pb-col">${where(p)}${bring(p)}${ready(p)}${confirm(p)}${questions(p)}</aside>
      </div>
      <p class="pb-foot">Sent by ${esc(p.sender.name)} · ${esc(p.sender.team)}. Mock pre-boarding portal for the SmartStart demo — all names and data are synthetic.</p>`;
    wire();
  }

  async function send(path, body, ok) {
    if (P.sending) return;
    P.sending = true;
    try {
      const out = await call(path, body);
      ok(out);
      P.mode = null;
      paint();
    } catch (err) {
      alert(err.message);
    } finally {
      P.sending = false;
    }
  }

  function wire() {
    root.querySelectorAll("[data-bring]").forEach((cb) =>
      cb.addEventListener("change", () => {
        const t = ticks();
        t[cb.dataset.bring] = cb.checked;
        localStorage.setItem(`pb-bring-${token}`, JSON.stringify(t));
        paint();
      })
    );
    root.querySelectorAll("[data-act]").forEach((b) =>
      b.addEventListener("click", () => {
        const act = b.dataset.act;
        if (act === "coming") return send("/confirm", { attending: true }, (o) => (P.pack.state.confirmed = o.confirmed));
        P.mode = act === "change" ? "change" : null;
        paint();
        root.querySelector('[data-form="change"] textarea')?.focus();
      })
    );
    root.querySelector('[data-form="change"]')?.addEventListener("submit", (e) => {
      e.preventDefault();
      const note = new FormData(e.target).get("note");
      send("/confirm", { attending: false, note }, (o) => (P.pack.state.confirmed = o.confirmed));
    });
    root.querySelector('[data-form="ask"]')?.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = new FormData(e.target).get("text");
      send("/questions", { text }, (o) => P.pack.state.questions.push(o.question));
    });
  }

  async function load() {
    try {
      P.pack = await call();
    } catch (err) {
      root.innerHTML = `<section class="pb-card pb-center"><h1>This link isn't working</h1><p>${esc(err.message)}</p></section>`;
      return;
    }
    const st = P.pack.start;
    P.target = Date.now() + (new Date(st.starts_at) - new Date(st.as_of));
    paint();
    setInterval(tick, 1000);
  }

  load();
})();
