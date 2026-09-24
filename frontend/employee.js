/* SmartStart — Employee Experience (locked to signed-in joiner) */

const params = new URLSearchParams(window.location.search);
const session = requireEmployeeSession();
if (!session) {
  /* redirect in progress */
}

const state = {
  employeeId: session?.employeeId || "",
  roleFilter: session?.role || "INTERN",
  profile: null,
  track: null,
  notifications: null,
  feedback: [],
  workspace: null,
  chatbot: null,
  tab: "home",
};

function showError(msg) {
  const box = document.getElementById("load-error");
  if (!box) {
    console.error(msg);
    return;
  }
  box.hidden = false;
  box.textContent = msg;
}

async function fetchJSON(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) {
    let detail = await res.text();
    try {
      const parsed = JSON.parse(detail);
      if (parsed?.detail) detail = typeof parsed.detail === "string" ? parsed.detail : JSON.stringify(parsed.detail);
    } catch {
      /* keep raw text */
    }
    throw new Error(detail || `${path} → ${res.status}`);
  }
  return res.json();
}

async function loadWorkspace() {
  if (!state.employeeId) {
    throw new Error("No employee session. Sign in from the portal.");
  }
  // URL id must match signed-in identity — ignore attempts to browse others
  const urlId = params.get("id");
  if (urlId && urlId !== state.employeeId) {
    window.history.replaceState({}, "", `/employee?id=${encodeURIComponent(state.employeeId)}`);
  }
  const id = encodeURIComponent(state.employeeId);
  const [profile, track, notifications, feedback, workspace, chatbot, iraProfile, basics] =
    await Promise.all([
      fetchJSON(`/api/employee/${id}`),
      fetchJSON(`/api/learningtrack/${id}`),
      fetchJSON(`/api/notifications/${id}`),
      fetchJSON(`/api/feedback?joiner_id=${id}`),
      fetchJSON(`/api/employee/${id}/workspace`),
      fetchJSON(`/api/chatbot/${id}`),
      fetchJSON(`/api/ira/${id}/profile`),
      fetchJSON(`/api/ira/${id}/basics`),
    ]);
  state.iraProfile = iraProfile;
  state.basics = basics;
  state.profile = profile;
  state.track = track;
  state.notifications = notifications;
  state.feedback = feedback.feedback || [];
  state.workspace = workspace;
  state.chatbot = chatbot;
  renderAll();
}

function setTab(name) {
  state.tab = name;
  document.querySelectorAll(".emp-tab").forEach((el) => el.classList.remove("active"));
  document.querySelectorAll(".wx-nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === name);
  });
  const tab = document.getElementById(`tab-${name}`);
  if (tab) tab.classList.add("active");
  if (name === "ask") window.iraGlobe?.start();
}

function renderAll() {
  const err = document.getElementById("load-error");
  if (err) err.hidden = true;
  const p = state.profile;
  if (!p) {
    showError("Profile failed to load.");
    return;
  }
  document.getElementById("workspace-sub").textContent =
    `${p.role_type} workspace · ${p.department}`;
  const locked = document.getElementById("session-name");
  if (locked) locked.textContent = `${p.name} · ${p.role_type}`;
  renderProfile();
  renderNotifications();
  renderLearning();
  renderChat();
  renderConsult();
  renderTeam();
  renderFeedback();
  renderHomeExtras();
  renderBasics();
  renderOnboard();
  setTab(state.tab || "home");
}

const STAGES = [
  ["OFFER_ACCEPTED", "Offer"],
  ["DOCS_SUBMITTED", "Documents"],
  ["IT_PROVISIONED", "IT setup"],
  ["DAY1_ORIENTED", "Day 1"],
  ["PROJECT_READY", "Project ready"],
];

function askFromHome(question) {
  setTab("ask");
  askChat(question).catch((err) => showError(`Chat failed: ${err.message}`));
}

function renderHomeExtras() {
  const el = document.getElementById("home-recs");
  if (el) {
    const recs = (state.workspace?.suggested_questions || []).slice(0, 3);
    el.innerHTML = recs
      .map((q) => `<button type="button" class="chip" data-q="${esc(q)}">${esc(q)}</button>`)
      .join("");
    el.querySelectorAll(".chip").forEach((btn) =>
      btn.addEventListener("click", () => askFromHome(btn.dataset.q))
    );
  }

  const people = document.getElementById("home-people");
  if (people) {
    const rows = (state.workspace?.consult || []).slice(0, 4);
    people.innerHTML = rows
      .map(
        (c, i) => `<button type="button" class="wx-person" data-person="${i}" title="${esc(c.email)}">
        <span class="wx-person-avatar" aria-hidden="true">${initials(c.name)}</span>
        <span class="wx-person-copy">
          <strong>${esc(c.name)}</strong>
          <span class="muted tiny">${esc(c.role_label)}</span>
          <span class="wx-person-channel">${esc(c.channel)}</span>
        </span>
      </button>`
      )
      .join("");
    people.querySelectorAll("[data-person]").forEach((btn) =>
      btn.addEventListener("click", () => openPerson(personFromConsult(rows[Number(btn.dataset.person)])))
    );
  }

  const t = state.track;
  if (t) {
    document.getElementById("stat-learning").textContent = `${Math.round(t.completion_pct)}%`;
    document.getElementById("stat-learning-bar").style.width = `${t.completion_pct}%`;
    document.getElementById("stat-learning-sub").textContent =
      `${t.completed_count} of ${t.total_count} modules`;
  }
}

function nextModule() {
  const mods = state.track?.modules || [];
  return (
    mods.find((m) => m.status === "in_progress") ||
    mods.find((m) => m.status === "available") ||
    null
  );
}

function renderProfile() {
  const p = state.profile;
  if (!p) return;
  const isIntern = String(p.role_type).toUpperCase() === "INTERN";
  const first = String(p.name || "there").split(/\s+/)[0];

  const hello = document.getElementById("wx-hello");
  if (hello) hello.textContent = `Hi, ${first}`;
  const today = document.getElementById("wx-today");
  if (today) {
    today.textContent = new Date().toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }

  const [headline, ...rest] = String(p.next_action || "Welcome to Waters").split(" — ");
  document.getElementById("next-headline").textContent = headline;
  const detail = rest.join(" — ");
  const detailEl = document.getElementById("next-detail");
  detailEl.textContent = detail ? detail.charAt(0).toUpperCase() + detail.slice(1) : "";
  detailEl.hidden = !detail;

  const joined = p.joining_date
    ? new Date(`${p.joining_date}T00:00:00`).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";
  const meta = [
    p.department,
    p.mentor_name ? `${isIntern ? "Mentor" : "Buddy"}: ${p.mentor_name}` : "",
    joined ? `Joined ${joined}` : "",
    p.learning_track,
  ].filter(Boolean);
  document.getElementById("emp-meta").innerHTML = meta
    .map((m) => `<span>${esc(m)}</span>`)
    .join("");

  const badge = document.getElementById("role-badge");
  badge.textContent = p.role_type;
  badge.className = `badge role-${String(p.role_type).toLowerCase()}`;

  const current = STAGES.findIndex(([key]) => key === p.current_state);
  document.getElementById("wx-stages").innerHTML = STAGES.map(([, label], i) => {
    const cls = i < current || current === STAGES.length - 1 ? "done" : i === current ? "current" : "";
    return `<li class="${cls}"><span class="wx-stage-dot">${cls === "done" ? "✓" : i + 1}</span>${label}</li>`;
  }).join("");

  document.getElementById("avatar").textContent = initials(p.name);
  document.getElementById("profile-card").dataset.role = p.role_type;
  const shell = document.getElementById("workspace");
  if (shell) shell.dataset.role = p.role_type;

  const tasks = (p.assigned_tasks || []).slice();
  const mod = nextModule();
  const items = [];
  if (mod) {
    items.push({
      text: `${mod.status === "in_progress" ? "Continue" : "Start"} ${mod.title}`,
      tag: `Learning · ${mod.duration_minutes} min`,
      goto: "learning",
    });
  }
  tasks.forEach((t) => items.push({ text: t, tag: isIntern ? "Mentor" : "Readiness" }));
  if (!items.length && !isIntern) {
    items.push({ text: "Complete department readiness modules", tag: "Readiness", goto: "learning" });
  }

  document.getElementById("tasks-count").textContent = items.length ? `${items.length} open` : "";
  document.getElementById("stat-tasks").textContent = String(items.length);
  document.getElementById("stat-tasks-sub").textContent = items.length
    ? "on your checklist"
    : "Nothing waiting on you";

  const list = document.getElementById("task-list");
  list.innerHTML = items.length
    ? items
        .map(
          (it) => `<li${it.goto ? ` data-goto="${it.goto}" class="is-link"` : ""}>
          <span class="wx-check" aria-hidden="true"></span>
          <span class="wx-check-text">${esc(it.text)}</span>
          <span class="wx-check-tag">${esc(it.tag)}</span>
        </li>`
        )
        .join("")
    : `<li class="muted">You're all caught up.</li>`;
  list.querySelectorAll("[data-goto]").forEach((li) =>
    li.addEventListener("click", () => setTab(li.dataset.goto))
  );
}

function relTime(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 0) return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

const NOTE_PREVIEW = 3;

function renderNotifications() {
  const data = state.notifications;
  if (!data) return;
  const badge = document.getElementById("unread-badge");
  badge.textContent = String(data.unread_count || 0);
  badge.hidden = !data.unread_count;
  const list = document.getElementById("notifications-list");
  const more = document.getElementById("notif-more");
  const all = data.notifications || [];
  if (!all.length) {
    list.innerHTML = `<p class="muted">No updates right now.</p>`;
    more.hidden = true;
    return;
  }
  const shown = state.notesExpanded ? all : all.slice(0, NOTE_PREVIEW);
  list.innerHTML = shown
    .map(
      (n) => `<article class="note kind-${n.kind} ${n.read ? "read" : "unread"}">
      <span class="note-dot" aria-hidden="true"></span>
      <div class="note-body">
        <div class="note-top">
          <strong>${esc(n.title)}</strong>
          <time datetime="${esc(n.created_at)}" title="${esc(fmt(n.created_at))}">${relTime(n.created_at)}</time>
        </div>
        <p>${esc(n.message)}</p>
      </div>
    </article>`
    )
    .join("");
  more.hidden = all.length <= NOTE_PREVIEW;
  more.textContent = state.notesExpanded ? "Show less" : `View all ${all.length} notifications`;
  revealAll(list, ".note", 40);
}

function renderLearning() {
  const t = state.track;
  if (!t) return;
  document.getElementById("track-summary").textContent =
    `${t.track_name} · ${t.role_type} · ${t.department_track}`;
  document.getElementById("progress-label").textContent = `${Math.round(t.completion_pct)}%`;
  document.getElementById("progress-counts").textContent =
    `${t.completed_count} / ${t.total_count} modules`;
  const bar = document.getElementById("progress-bar");
  const fill = document.getElementById("progress-fill");
  bar.setAttribute("aria-valuenow", String(t.completion_pct));
  fill.style.width = `${t.completion_pct}%`;

  const modulesList = document.getElementById("modules-list");
  modulesList.innerHTML = (t.modules || [])
    .map((m) => {
      const pct =
        m.status === "complete"
          ? 100
          : m.status === "in_progress"
            ? 55
            : m.status === "available"
              ? 15
              : 0;
      return `<button type="button" class="module status-${m.status}" data-module="${esc(m.id)}">
        <div class="module-top">
          <div>
            <div class="module-title">${esc(m.title)}</div>
            <div class="muted tiny">${esc(m.category)} · ${m.duration_minutes} min</div>
          </div>
          <span class="badge mod-${m.status}">${labelStatus(m.status)}</span>
        </div>
        ${
          m.assigned_by
            ? `<span class="learn-added">Added by ${esc(m.assigned_by)}${m.due_date ? ` · due ${esc(m.due_date)}` : ""}</span>`
            : ""
        }
        <p class="module-desc">${esc(m.assigned_note || m.description)}</p>
        <div class="module-progress">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
        <span class="module-cta">${MODULE_CTA[m.status] || "Open"} →</span>
      </button>`;
    })
    .join("");
  modulesList.querySelectorAll("[data-module]").forEach((el) =>
    el.addEventListener("click", () => openModule(el.dataset.module))
  );
  revealAll(modulesList, ".module", 45);
}

const MODULE_CTA = {
  complete: "Review",
  in_progress: "Continue",
  available: "Start",
  locked: "Preview",
};

/* ---------- drawer ---------- */

const drawerStack = [];

function openDrawer(render) {
  drawerStack.push(render);
  paintDrawer();
}

function paintDrawer() {
  const render = drawerStack[drawerStack.length - 1];
  if (!render) return closeDrawer();
  const drawer = document.getElementById("wx-drawer");
  const body = document.getElementById("wx-drawer-body");
  document.getElementById("wx-drawer-back").hidden = drawerStack.length < 2;
  drawer.hidden = false;
  document.getElementById("wx-drawer-backdrop").hidden = false;
  body.scrollTop = 0;
  render(body);
}

function drawerBack() {
  drawerStack.pop();
  paintDrawer();
}

function closeDrawer() {
  drawerStack.length = 0;
  document.getElementById("wx-drawer").hidden = true;
  document.getElementById("wx-drawer-backdrop").hidden = true;
}

function toast(msg) {
  const el = document.getElementById("wx-toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 2400);
}

async function copyText(text, label = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  toast(label);
}

/* ---------- learning module drawer ---------- */

async function openModule(moduleId) {
  const id = encodeURIComponent(state.employeeId);
  openDrawer((body) => (body.innerHTML = `<p class="muted">Loading module…</p>`));
  try {
    const detail = await fetchJSON(
      `/api/learningtrack/${id}/modules/${encodeURIComponent(moduleId)}`
    );
    drawerStack[drawerStack.length - 1] = (body) => renderModuleDrawer(body, detail);
    paintDrawer();
  } catch (err) {
    drawerStack[drawerStack.length - 1] = (body) =>
      (body.innerHTML = `<p class="muted">Couldn't load this module: ${esc(err.message)}</p>`);
    paintDrawer();
  }
}

function resourceIcon(kind) {
  return { policy: "📄", portal: "↗", person: "✉", ira: "✦" }[kind] || "•";
}

function renderModuleDrawer(body, d) {
  const m = d.module;
  const locked = m.status === "locked";
  const done = m.status === "complete";
  const check = d.check;
  body.innerHTML = `
    <header class="wx-dr-head">
      <span class="muted tiny">${esc(m.category)} · ${m.duration_minutes} min</span>
      <h2 id="wx-drawer-title">${esc(m.title)}</h2>
      <p>${esc(d.summary)}</p>
      <span class="badge mod-${m.status}">${labelStatus(m.status)}</span>
    </header>
    ${d.unlock_hint ? `<p class="wx-dr-note">${esc(d.unlock_hint)}</p>` : ""}

    <section class="wx-dr-sec">
      <h3>Lessons</h3>
      <ol class="wx-lessons">
        ${d.lessons
          .map(
            (l, i) => `<li>
              <span class="wx-lesson-n">${i + 1}</span>
              <div><strong>${esc(l.title)}</strong><p>${esc(l.body)}</p></div>
            </li>`
          )
          .join("")}
      </ol>
    </section>

    ${
      d.takeaways.length
        ? `<section class="wx-dr-sec wx-takeaways">
            <h3>Key takeaways</h3>
            <ul>${d.takeaways.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
          </section>`
        : ""
    }

    ${
      d.resources.length
        ? `<section class="wx-dr-sec">
            <h3>Materials &amp; links</h3>
            <div class="wx-resources">
              ${d.resources
                .map(
                  (r, i) => `<button type="button" class="wx-resource kind-${r.kind}" data-res="${i}">
                    <span class="wx-resource-ic" aria-hidden="true">${resourceIcon(r.kind)}</span>
                    <span class="wx-resource-copy">
                      <strong>${esc(r.label)}</strong>
                      <span class="muted tiny">${esc(r.note || RESOURCE_HINT[r.kind] || "")}</span>
                    </span>
                  </button>`
                )
                .join("")}
            </div>
          </section>`
        : ""
    }

    ${
      check
        ? `<section class="wx-dr-sec wx-quiz">
            <h3>Quick check</h3>
            <p class="wx-quiz-q">${esc(check.question)}</p>
            <div class="wx-quiz-opts">
              ${check.options
                .map(
                  (o, i) =>
                    `<button type="button" class="wx-quiz-opt" data-opt="${i}" ${done ? "disabled" : ""}>${esc(o)}</button>`
                )
                .join("")}
            </div>
            <p class="wx-quiz-result" id="quiz-result" hidden></p>
          </section>`
        : ""
    }

    ${
      d.ask_ira.length
        ? `<section class="wx-dr-sec">
            <h3>Ask IRA</h3>
            <div class="wx-dr-chips">
              ${d.ask_ira.map((q) => `<button type="button" class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join("")}
            </div>
          </section>`
        : ""
    }

    <footer class="wx-dr-foot">
      <button type="button" class="btn-primary" id="module-complete" ${
        locked || done || check ? "disabled" : ""
      }>${done ? "Completed ✓" : locked ? "Locked" : "Mark as complete"}</button>
      <span class="muted tiny" id="module-foot-hint">${
        done ? "Nice work — this module is done." : locked ? "" : check ? "Answer the quick check to finish." : ""
      }</span>
    </footer>`;

  body.querySelectorAll("[data-res]").forEach((btn) =>
    btn.addEventListener("click", () => openResource(d.resources[Number(btn.dataset.res)], m))
  );
  body.querySelectorAll(".wx-dr-chips .chip").forEach((btn) =>
    btn.addEventListener("click", () => {
      closeDrawer();
      askFromHome(btn.dataset.q);
    })
  );
  body.querySelectorAll(".wx-quiz-opt").forEach((btn) =>
    btn.addEventListener("click", () => {
      const pick = Number(btn.dataset.opt);
      const ok = pick === check.answer_index;
      body.querySelectorAll(".wx-quiz-opt").forEach((b) => {
        b.classList.remove("is-right", "is-wrong");
        if (Number(b.dataset.opt) === pick) b.classList.add(ok ? "is-right" : "is-wrong");
      });
      const result = body.querySelector("#quiz-result");
      result.hidden = false;
      result.className = `wx-quiz-result ${ok ? "ok" : "no"}`;
      result.textContent = ok ? `Correct — ${check.explanation}` : "Not quite — have another look at the lessons and try again.";
      if (ok && !locked) {
        body.querySelector("#module-complete").disabled = false;
        body.querySelector("#module-foot-hint").textContent = "You're ready to mark this module complete.";
      }
    })
  );
  body.querySelector("#module-complete").addEventListener("click", () => completeModule(m));
}

const RESOURCE_HINT = {
  policy: "Read the approved policy",
  portal: "Ask your contact — not a system you open",
  person: "IRA drafts the email for you",
  ira: "Ask IRA",
};

function contactFor(key) {
  const consult = state.workspace?.consult || [];
  const suffix = { mentor: "mentor", manager: "mgr", hr: "hr", it: "it" }[key];
  const c = consult.find((x) => x.id.endsWith(`-C-${suffix}`));
  return c ? personFromConsult(c) : null;
}

function openResource(r, module) {
  if (r.kind === "policy") return openDrawer((body) => renderPolicyDrawer(body, r.target));
  if (r.kind === "portal") {
    // Employees don't open iCIMS / ServiceNow / Jira — route them to the right person.
    const who = { icims: "hr", servicenow: "it", jira: "manager" }[r.target];
    const person = who ? contactFor(who) : null;
    if (person) {
      toast("That system is for HR / IT / managers — contact them instead.");
      return openPerson(person);
    }
    return toast("Ask your mentor — that system isn't available from your workspace.");
  }
  if (r.kind === "ira") {
    closeDrawer();
    return askFromHome(r.target);
  }
  if (r.kind === "person") {
    const person = contactFor(r.target);
    if (!person) return toast("No contact on your record yet.");
    return openPerson(person, module?.title);
  }
}

async function completeModule(m) {
  const id = encodeURIComponent(state.employeeId);
  const btn = document.getElementById("module-complete");
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    state.track = await fetchJSON(
      `/api/learningtrack/${id}/modules/${encodeURIComponent(m.id)}/complete`,
      { method: "POST" }
    );
    renderLearning();
    renderHomeExtras();
    renderProfile();
    toast(`“${m.title}” complete — ${Math.round(state.track.completion_pct)}% of your track done`);
    closeDrawer();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Mark as complete";
    toast(`Couldn't save: ${err.message}`);
  }
}

/* ---------- policy reader ---------- */

async function renderPolicyDrawer(body, slug) {
  body.innerHTML = `<p class="muted">Loading policy…</p>`;
  try {
    const p = state.policyCache?.[slug] || (await fetchJSON(`/api/policies/${encodeURIComponent(slug)}`));
    state.policyCache = { ...(state.policyCache || {}), [slug]: p };
    body.innerHTML = `
      <header class="wx-dr-head">
        <span class="muted tiny">${esc(p.category)} · Owner: ${esc(p.owner)} · Updated ${esc(p.updated)}</span>
        <h2 id="wx-drawer-title">${esc(p.title)}</h2>
      </header>
      <div class="wx-policy">
        ${p.sections.map((s) => `<section><h3>${esc(s.heading)}</h3><p>${esc(s.body)}</p></section>`).join("")}
      </div>
      <footer class="wx-dr-foot">
        <button type="button" class="btn-secondary" id="policy-ask">Ask IRA about this policy</button>
      </footer>`;
    body.querySelector("#policy-ask").addEventListener("click", () => {
      closeDrawer();
      askFromHome(`Where is the ${p.title}?`);
    });
  } catch (err) {
    body.innerHTML = `<p class="muted">Couldn't load this policy: ${esc(err.message)}</p>`;
  }
}

/* ---------- people ---------- */

const CONSULT_TOPICS = {
  mentor: ["an intro chat", "a weekly check-in", "reviewing my work"],
  hr: ["my document packet", "leave next week", "benefits enrolment"],
  it: ["VPN access", "my laptop", "software access"],
  mgr: ["project assignment", "my 30-day goals", "an intro chat"],
};

function personFromConsult(c) {
  const key = c.id.split("-C-").pop();
  return {
    name: c.name,
    title: c.role_label,
    email: c.email,
    about: c.focus,
    channel: c.channel,
    availability: c.availability,
    topics: CONSULT_TOPICS[key] || [],
  };
}

function personFromMember(m) {
  return {
    name: m.name,
    title: m.title,
    email: m.email,
    about: m.ask_about,
    channel: m.channel,
    relationship: m.relationship,
    expertise: m.expertise,
    topics: String(m.ask_about || "")
      .split(/,\s*/)
      .filter(Boolean)
      .slice(0, 3)
      .map((t) => t.charAt(0).toLowerCase() + t.slice(1)),
  };
}

function draftWithIra(person, topic) {
  closeDrawer();
  const about = String(topic || "").trim();
  askFromHome(`Draft an email to ${person.name}${about ? ` about ${about}` : ""}`);
}

function renderPersonDrawer(body, person, suggestedTopic) {
  const topics = [...new Set([suggestedTopic, ...(person.topics || [])].filter(Boolean))];
  const first = String(person.name || "").split(/\s+/)[0] || "them";
  body.innerHTML = `
    <header class="wx-dr-person">
      <span class="wx-person-avatar lg" aria-hidden="true">${initials(person.name)}</span>
      <div>
        <h2 id="wx-drawer-title">${esc(person.name)}</h2>
        <span class="muted">${esc(person.title)}${person.relationship ? ` · ${esc(person.relationship)}` : ""}</span>
      </div>
    </header>

    <section class="wx-dr-sec">
      <div class="wx-email-row">
        <span class="wx-email-ic" aria-hidden="true">✉</span>
        <a href="mailto:${esc(person.email)}" class="wx-email">${emailHtml(person.email)}</a>
        <button type="button" class="wx-mini" id="p-copy">Copy</button>
      </div>
      <dl class="wx-dr-meta">
        ${person.about ? `<div><dt>Ask about</dt><dd>${esc(person.about)}</dd></div>` : ""}
        ${person.channel ? `<div><dt>Channel</dt><dd>${esc(person.channel)}</dd></div>` : ""}
        ${person.availability ? `<div><dt>Availability</dt><dd>${esc(person.availability)}</dd></div>` : ""}
      </dl>
      ${
        person.expertise?.length
          ? `<ul class="wx-member-tags">${person.expertise.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`
          : ""
      }
    </section>

    <section class="wx-dr-sec wx-draft-box">
      <h3>Need help writing to ${esc(first)}?</h3>
      <p class="muted tiny">IRA drafts it — you review, edit and send from your own mail app.</p>
      <div class="wx-dr-chips">
        ${topics.map((t) => `<button type="button" class="chip" data-topic="${esc(t)}">About ${esc(t)}</button>`).join("")}
      </div>
      <form class="wx-draft-form" id="p-draft-form">
        <input id="p-topic" type="text" maxlength="120" placeholder="What's it about? e.g. my VPN access" autocomplete="off" />
        <button type="submit" class="btn-primary">Draft with IRA</button>
      </form>
    </section>

    <footer class="wx-dr-foot">
      <a class="btn-secondary" href="mailto:${esc(person.email)}">Open in email app</a>
    </footer>`;
  body.querySelector("#p-copy").addEventListener("click", () => copyText(person.email, "Email copied"));
  body.querySelectorAll("[data-topic]").forEach((btn) =>
    btn.addEventListener("click", () => draftWithIra(person, btn.dataset.topic))
  );
  body.querySelector("#p-draft-form").addEventListener("submit", (e) => {
    e.preventDefault();
    draftWithIra(person, body.querySelector("#p-topic").value);
  });
}

function wirePersonCards(root, people) {
  root.querySelectorAll("[data-person]").forEach((card) => {
    const person = people[Number(card.dataset.person)];
    card.addEventListener("click", (e) => {
      if (e.target.closest("[data-stop], [data-skill], [data-add-skill], [data-remove-skill]")) return;
      openPerson(person);
    });
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target === card) openPerson(person);
    });
  });
}

function openPerson(person, suggestedTopic) {
  openDrawer((body) => renderPersonDrawer(body, person, suggestedTopic));
}

const SKILL_IDEAS = ["Python", "Excel", "Git", "Communication", "Research", "Writing", "SQL", "Design"];

function selfSkillsBlock(m) {
  const skills = m.expertise || [];
  const isIntern = String(state.profile?.role_type || "").toUpperCase() === "INTERN";
  const ideas = SKILL_IDEAS.filter((s) => !skills.some((x) => x.toLowerCase() === s.toLowerCase())).slice(0, 4);
  return `<div class="wx-skills" data-self-skills>
      <div class="wx-skills-head">
        <span>${isIntern ? "Your skills" : "Your expertise"}</span>
        <span class="muted tiny">Shows on your team card</span>
      </div>
      <ul class="wx-member-tags wx-skills-list">
        ${
          skills.length
            ? skills
                .map(
                  (s) => `<li class="wx-skill">
              ${esc(s)}
              <button type="button" class="wx-skill-x" data-remove-skill="${esc(s)}" aria-label="Remove ${esc(s)}">×</button>
            </li>`
                )
                .join("")
            : `<li class="wx-skill-empty muted tiny">Add what you know — teammates will see it</li>`
        }
        <li>
          <button type="button" class="wx-skill-add" data-add-skill aria-label="Add a skill">+</button>
        </li>
      </ul>
      ${
        isIntern && ideas.length && skills.length < 3
          ? `<div class="wx-skill-ideas">${ideas
              .map((s) => `<button type="button" class="chip" data-skill="${esc(s)}">+ ${esc(s)}</button>`)
              .join("")}</div>`
          : ""
      }
      <form class="wx-skill-form" hidden>
        <input type="text" maxlength="32" placeholder="e.g. Python, Excel…" autocomplete="off" />
        <button type="submit" class="wx-mini primary">Add</button>
        <button type="button" class="wx-mini" data-cancel-skill>Cancel</button>
      </form>
    </div>`;
}

async function refreshWorkspaceSkills() {
  const id = encodeURIComponent(state.employeeId);
  state.workspace = await fetchJSON(`/api/employee/${id}/workspace`);
  renderTeam();
}

async function postSkill(skill) {
  const id = encodeURIComponent(state.employeeId);
  try {
    await fetchJSON(`/api/employee/${id}/skills`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skill }),
    });
    await refreshWorkspaceSkills();
    toast(`Added “${skill}”`);
  } catch (err) {
    toast(err.message || "Couldn't add skill");
  }
}

async function deleteSkill(skill) {
  const id = encodeURIComponent(state.employeeId);
  try {
    await fetchJSON(`/api/employee/${id}/skills/${encodeURIComponent(skill)}`, { method: "DELETE" });
    await refreshWorkspaceSkills();
    toast(`Removed “${skill}”`);
  } catch (err) {
    toast(err.message || "Couldn't remove skill");
  }
}

function wireSelfSkills(root) {
  const box = root.querySelector("[data-self-skills]");
  if (!box) return;
  const form = box.querySelector(".wx-skill-form");
  const input = form?.querySelector("input");
  box.querySelector("[data-add-skill]")?.addEventListener("click", (e) => {
    e.stopPropagation();
    form.hidden = false;
    input.value = "";
    input.focus();
  });
  box.querySelector("[data-cancel-skill]")?.addEventListener("click", (e) => {
    e.stopPropagation();
    form.hidden = true;
  });
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const skill = input.value.trim();
    if (!skill) return;
    form.hidden = true;
    postSkill(skill);
  });
  box.querySelectorAll("[data-skill]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      form.hidden = true;
      postSkill(btn.dataset.skill);
    })
  );
  box.querySelectorAll("[data-remove-skill]").forEach((btn) =>
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteSkill(btn.dataset.removeSkill);
    })
  );
}

function renderChat() {
  const data = state.chatbot;
  if (!data) return;
  if (!state.chatTurns) state.chatTurns = (data.turns || []).slice();

  const bubbles = state.chatTurns.map((t, i) => {
    const label = t.role === "user" ? "You" : "IRA";
    if (t.coachResult) return coachCard(t.coachResult, i);
    if (t.persona) {
      const who = t.persona === "your team" ? "Team" : t.persona;
      return `<div class="bubble assistant cx-persona"><div class="bubble-meta">${esc(who)} · played by IRA</div><p>${esc(
        t.text
      )}</p></div>`;
    }
    if (t.draft) {
      const intro = t.text.split("\n\nTo:")[0];
      return `<div class="bubble ${t.role} has-draft"><div class="bubble-meta">${label}</div><p>${esc(intro)}</p>
        ${draftCard(t.draft, i)}</div>`;
    }
    return `<div class="bubble ${t.role}"><div class="bubble-meta">${label}</div><p>${esc(
      t.text
    )}</p></div>`;
  });
  if (state.chatThinking) {
    bubbles.push(
      `<div class="bubble assistant thinking"><div class="bubble-meta">IRA</div><p>IRA is thinking…</p></div>`
    );
  }
  document.getElementById("chat-log").innerHTML = bubbles.join("");

  const initial =
    state.workspace?.suggested_questions ||
    (data.faqs || []).slice(0, 6).map((f) => f.question);
  const asked = new Set(
    state.chatTurns.filter((t) => t.role === "user").map((t) => t.text.trim().toLowerCase())
  );
  const suggested = state.coach
    ? []
    : (state.chatSuggestions || initial).filter((q) => !asked.has(q.trim().toLowerCase())).slice(0, 4);
  document.getElementById("faq-chips").innerHTML = suggested
    .map(
      (q) =>
        `<button type="button" class="chip" data-q="${esc(q)}" ${
          state.chatThinking ? "disabled" : ""
        }>${esc(q)}</button>`
    )
    .join("");
  document.querySelectorAll("#faq-chips .chip").forEach((btn) => {
    btn.addEventListener("click", () => askChat(btn.dataset.q));
  });
  wireDraftCards();
  wireCoachCards();
  renderCoachBanner();
  const log = document.getElementById("chat-log");
  log.scrollTop = log.scrollHeight;
}

async function askChat(query) {
  if (state.chatThinking) return;
  const id = encodeURIComponent(state.employeeId);
  if (!state.chatTurns) state.chatTurns = (state.chatbot?.turns || []).slice();
  if (state.coach) return coachSend(query);
  const asked = state.chatTurns.filter((t) => t.role === "user").map((t) => t.text).slice(-12);
  state.chatTurns.push({ role: "user", text: query });
  state.chatThinking = true;
  window.iraGlobe?.setThinking(true);
  renderChat();

  const qs = new URLSearchParams({ q: query });
  asked.forEach((a) => qs.append("asked", a));
  const started = performance.now();
  try {
    const data = await fetchJSON(`/api/chatbot/${id}?${qs.toString()}`);
    const wait = 900 - (performance.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const reply = (data.turns || []).filter((t) => t.role === "assistant").pop();
    if (data.coach) {
      state.chatThinking = false;
      enterCoach(data.coach);
      return;
    }
    if (reply) state.chatTurns.push(data.draft ? { ...reply, draft: { ...data.draft } } : reply);
    if (data.suggestions?.length) state.chatSuggestions = data.suggestions;  } finally {
    state.chatThinking = false;
    window.iraGlobe?.setThinking(false);
    renderChat();
  }
}

function draftCard(d, i) {
  return `<div class="wx-draft" data-draft-turn="${i}">
    <div class="wx-draft-row"><span>To</span><strong>${esc(d.to_name)}</strong><span class="muted">&lt;${esc(d.to_email)}&gt;</span></div>
    <label class="wx-draft-row"><span>Subject</span><input type="text" data-field="subject" value="${esc(d.subject)}" /></label>
    <textarea data-field="body" rows="9">${esc(d.body)}</textarea>
    <div class="wx-draft-actions">
      <button type="button" class="wx-mini primary" data-act="mail">Open in email app</button>
      <button type="button" class="wx-mini" data-act="copy">Copy draft</button>
      <span class="muted tiny">Nothing is sent until you press send in your mail app.</span>
    </div>
  </div>`;
}

function wireDraftCards() {
  document.querySelectorAll("#chat-log [data-draft-turn]").forEach((card) => {
    const turn = state.chatTurns[Number(card.dataset.draftTurn)];
    if (!turn?.draft) return;
    card.querySelectorAll("[data-field]").forEach((el) =>
      el.addEventListener("input", () => (turn.draft[el.dataset.field] = el.value))
    );
    card.querySelector('[data-act="mail"]').addEventListener("click", () => {
      const d = turn.draft;
      const qs = `subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`;
      window.location.href = `mailto:${d.to_email}?${qs}`;
    });
    card.querySelector('[data-act="copy"]').addEventListener("click", () => {
      const d = turn.draft;
      copyText(`To: ${d.to_email}\nSubject: ${d.subject}\n\n${d.body}`, "Draft copied");
    });
  });
}

function renderConsult() {
  const list = document.getElementById("consult-list");
  if (!list) return;
  const rows = state.workspace?.consult || [];
  if (!rows.length) {
    list.innerHTML = `<p class="muted">No consult contacts.</p>`;
    return;
  }
  list.innerHTML = rows
    .map(
      (c, i) => `<article class="consult-card" data-person="${i}" tabindex="0">
      <div class="consult-avatar" aria-hidden="true">${initials(c.name)}</div>
      <div class="consult-main">
        <strong>${esc(c.name)}</strong>
        <div class="muted tiny">${esc(c.role_label)}</div>
        <p>${esc(c.focus)}</p>
        <dl class="consult-meta">
          <div><dt>Email</dt><dd><span class="wx-email">${emailHtml(c.email)}</span></dd></div>
          <div><dt>Channel</dt><dd>${esc(c.channel)}</dd></div>
          <div><dt>Availability</dt><dd>${esc(c.availability)}</dd></div>
        </dl>
      </div>
    </article>`
    )
    .join("");
  wirePersonCards(list, rows.map(personFromConsult));
  revealAll(list, ".consult-card", 50);
}

function renderTeam() {
  const ws = state.workspace;
  if (!ws) return;
  const members = ws.members || [];
  document.getElementById("team-title").textContent = ws.team_name;
  document.getElementById("team-count").textContent = `${members.length} people · ${ws.department}`;

  const term = (state.teamSearch || "").trim().toLowerCase();
  const shown = term
    ? members.filter((m) =>
        [m.name, m.title, m.relationship, m.ask_about, ...m.expertise]
          .join(" ")
          .toLowerCase()
          .includes(term)
      )
    : members;
  const teamList = document.getElementById("team-list");
  if (!shown.length) {
    teamList.innerHTML = `<p class="muted">No one matches “${esc(term)}”. Try asking IRA who handles it.</p>`;
    return;
  }
  teamList.innerHTML = shown
    .map(
      (m, i) => `<article class="wx-member ${m.is_self ? "is-self" : ""}" ${m.is_self ? "" : `data-person="${i}" tabindex="0"`}>
      <header>
        <span class="wx-person-avatar" aria-hidden="true">${initials(m.name)}</span>
        <div class="wx-member-id">
          <strong>${esc(m.name)}</strong>
          <span class="muted tiny">${esc(m.title)}</span>
        </div>
        ${m.relationship ? `<span class="wx-member-rel">${esc(m.relationship)}</span>` : ""}
      </header>
      ${
        m.is_self
          ? selfSkillsBlock(m)
          : `${
              m.expertise.length
                ? `<ul class="wx-member-tags">${m.expertise.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`
                : ""
            }
            ${m.ask_about ? `<p class="wx-member-ask"><span>Ask about</span>${esc(m.ask_about)}</p>` : ""}
            <footer>
              <span class="muted tiny">${esc(m.channel)}</span>
            </footer>`
      }
    </article>`
    )
    .join("");
  wirePersonCards(teamList, shown.map(personFromMember));
  wireSelfSkills(teamList);
  revealAll(teamList, ".wx-member", 40);
}

const RATING_LABELS = ["", "Frustrating", "Difficult", "Okay", "Smooth", "Great"];
const MOUTHS = ["", "M9 22 Q16 15 23 22", "M9 21 Q16 17.5 23 21", "M10 20 L22 20", "M9 18.5 Q16 23 23 18.5", "M8.5 17.5 Q16 26 23.5 17.5"];

function faceSvg(r) {
  return `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14.5" class="fb-face-bg"/>
    <circle cx="11.2" cy="12.6" r="1.7" class="fb-face-ink"/><circle cx="20.8" cy="12.6" r="1.7" class="fb-face-ink"/>
    <path d="${MOUTHS[r]}" class="fb-face-line"/></svg>`;
}

const FB_POSITIVE = ["Clear instructions", "Quick", "Friendly people", "Easy to find", "Well organised", "Felt welcomed"];
const FB_NEGATIVE = ["Unclear steps", "Waited too long", "Hard to find", "Too many steps", "Nobody to ask", "Technical issues"];

function feedbackSteps() {
  const p = state.profile || {};
  const t = state.track || {};
  const isIntern = String(p.role_type).toUpperCase() === "INTERN";
  const stage = STAGES.findIndex(([key]) => key === p.current_state);
  const at = (key) => stage >= STAGES.findIndex(([k]) => k === key);
  const docsDone = String(p.docs_status) === "Complete";
  const laptop = String(p.hardware_status || "");
  const steps = [
    {
      value: "Offer acceptance", label: "Offer", status: "done",
      question: "How was your offer and start-date process?",
      context: "You accepted your offer and got your welcome pack.",
      note: "Was anything unclear about your offer or start date?",
    },
    {
      value: "Document packet", label: "Documents", status: docsDone ? "done" : "now",
      question: "How was completing your document packet?",
      context: `Your document packet is ${String(p.docs_status || "in progress").toLowerCase()}.`,
      note: "What would have made the document packet easier?",
    },
    {
      value: "IT provisioning", label: "Laptop & access",
      status: laptop === "Delivered" ? "done" : docsDone ? "now" : "later",
      question: "How was getting your laptop and access set up?",
      context: laptop ? `Your laptop is marked ${laptop.toLowerCase()}.` : "Laptop and accounts setup.",
      note: "How smooth was getting your laptop, Okta and apps working?",
    },
    {
      value: "Day-1 orientation", label: "Day 1",
      status: at("DAY1_ORIENTED") ? "done" : at("IT_PROVISIONED") ? "now" : "later",
      question: "How was your first day?",
      context: "Orientation, tools setup and meeting your team.",
      note: "What would you change about your first day?",
    },
    {
      value: "Learning modules", label: "Learning",
      status: t.completed_count ? (t.completed_count === t.total_count ? "done" : "now") : "later",
      question: "How are your learning modules going?",
      context: t.total_count ? `${t.completed_count} of ${t.total_count} modules done.` : "Your learning track.",
      note: "Which module helped most — or felt like a waste of time?",
    },
    {
      value: "Mentor intro", label: isIntern ? "Mentor" : "Buddy",
      status: at("DAY1_ORIENTED") ? "done" : "later",
      question: `How are check-ins with your ${isIntern ? "mentor" : "buddy"} going?`,
      context: p.mentor_name ? `${isIntern ? "Mentor" : "Buddy"}: ${p.mentor_name}.` : "Meeting your mentor or buddy.",
      note: "How useful have your check-ins been so far?",
    },
    {
      value: "Project readiness", label: "First project",
      status: at("PROJECT_READY") ? "done" : at("DAY1_ORIENTED") ? "now" : "later",
      question: "How ready do you feel for your first project?",
      context: "Getting ready for your first assigned work.",
      note: "Do you feel ready to start real work? What's missing?",
    },
  ];
  const rated = new Map(state.feedback.map((f) => [f.step, f]));
  return steps.map((st) => ({ ...st, rated: rated.get(st.value) || null }));
}

function nextUnratedStep(steps, except) {
  return steps.find((s) => s.status !== "later" && !s.rated && s.value !== except) || null;
}

function renderFeedback() {
  const steps = feedbackSteps();
  const fb = (state.fb ||= { step: null, rating: 0, tags: new Set() });
  if (!fb.step || !steps.some((s) => s.value === fb.step && s.status !== "later")) {
    fb.step = (nextUnratedStep(steps) || steps.find((s) => s.status !== "later")).value;
  }
  const current = steps.find((s) => s.value === fb.step);

  document.getElementById("fb-steps").innerHTML = steps
    .map((s) => {
      const disabled = s.status === "later";
      const sub = s.rated
        ? `Rated · ${RATING_LABELS[s.rated.rating]}`
        : disabled ? "Not reached yet" : s.status === "now" ? "Happening now" : "Ready to rate";
      return `<button type="button" role="radio" aria-checked="${s.value === fb.step}" class="fb-step is-${s.status} ${
        s.rated ? "is-rated" : ""
      } ${s.value === fb.step ? "is-selected" : ""}" data-step="${esc(s.value)}" ${disabled ? "disabled" : ""}>
        <span class="fb-step-mark" aria-hidden="true">${s.rated ? "✓" : ""}</span>
        <strong>${esc(s.label)}</strong>
        <span class="fb-step-sub">${sub}</span>
      </button>`;
    })
    .join("");
  document.querySelectorAll("#fb-steps [data-step]").forEach((btn) =>
    btn.addEventListener("click", () => {
      fb.step = btn.dataset.step;
      fb.rating = 0;
      fb.tags.clear();
      showFeedbackForm();
      renderFeedback();
    })
  );

  document.getElementById("fb-question").textContent = current.question;
  document.getElementById("fb-context").textContent = current.rated
    ? `${current.context} You rated this ${RATING_LABELS[current.rated.rating].toLowerCase()} — sending again adds an update.`
    : current.context;
  document.getElementById("feedback-comment").placeholder = current.note;

  document.getElementById("rating-row").innerHTML = [1, 2, 3, 4, 5]
    .map(
      (r) => `<button type="button" role="radio" aria-checked="${fb.rating === r}" class="fb-face r${r} ${
        fb.rating === r ? "is-on" : ""
      }" data-rating="${r}">${faceSvg(r)}<span>${RATING_LABELS[r]}</span></button>`
    )
    .join("");
  document.querySelectorAll("#rating-row [data-rating]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const r = Number(btn.dataset.rating);
      const mood = (x) => (x >= 4 ? "up" : x <= 2 ? "down" : "mixed");
      if (mood(r) !== mood(fb.rating)) fb.tags.clear();
      fb.rating = r;
      renderFeedback();
    })
  );

  const tagsWrap = document.getElementById("fb-tags-wrap");
  tagsWrap.hidden = !fb.rating;
  const pool =
    fb.rating >= 4 ? FB_POSITIVE : fb.rating <= 2 ? FB_NEGATIVE : [...FB_POSITIVE.slice(0, 3), ...FB_NEGATIVE.slice(0, 3)];
  document.getElementById("fb-tags").innerHTML = pool
    .map(
      (t) => `<button type="button" class="fb-tag ${fb.tags.has(t) ? "is-on" : ""}" aria-pressed="${fb.tags.has(t)}" data-tag="${esc(
        t
      )}">${esc(t)}</button>`
    )
    .join("");
  document.querySelectorAll("#fb-tags [data-tag]").forEach((btn) =>
    btn.addEventListener("click", () => {
      const t = btn.dataset.tag;
      fb.tags.has(t) ? fb.tags.delete(t) : fb.tags.add(t);
      btn.classList.toggle("is-on", fb.tags.has(t));
      btn.setAttribute("aria-pressed", String(fb.tags.has(t)));
    })
  );

  document.getElementById("fb-submit").disabled = !fb.rating;
  renderFeedbackHistory();
}

function syncAnonCopy() {
  const anon = document.getElementById("feedback-anon").checked;
  document.getElementById("fb-anon-title").textContent = anon ? "Anonymous" : "Shared with your name";
  document.getElementById("fb-anon-sub").textContent = anon
    ? "Your name isn't attached to this response"
    : `People Operations will see this came from ${state.profile?.name || "you"}`;
}

function showFeedbackForm() {
  document.getElementById("feedback-form").hidden = false;
  document.getElementById("fb-thanks").hidden = true;
}

function renderFeedbackHistory() {
  const box = document.getElementById("feedback-history");
  if (!box) return;
  if (!state.feedback.length) {
    box.innerHTML = `<p class="muted tiny">Nothing yet — what you send shows up here, visible only to you.</p>`;
    return;
  }
  box.innerHTML = state.feedback
    .slice()
    .reverse()
    .map(
      (f) => `<div class="fb-entry">
        <span class="fb-face mini r${f.rating} is-on" aria-hidden="true">${faceSvg(f.rating)}</span>
        <div>
          <div class="fb-entry-top"><strong>${esc(f.step)}</strong><span class="muted tiny">${relTime(f.submitted_at)}</span></div>
          <span class="tiny fb-entry-score">${RATING_LABELS[f.rating]} · ${f.anonymous ? "Anonymous" : "With your name"}</span>
          ${f.tags?.length ? `<div class="fb-entry-tags">${f.tags.map((t) => `<span>${esc(t)}</span>`).join("")}</div>` : ""}
          ${f.comment ? `<p>${esc(f.comment)}</p>` : ""}
        </div>
      </div>`
    )
    .join("");
}

async function submitFeedback(event) {
  event.preventDefault();
  const fb = state.fb;
  if (!fb?.rating) return;
  const status = document.getElementById("feedback-status");
  const btn = document.getElementById("fb-submit");
  btn.disabled = true;
  status.textContent = "Sending…";
  const anonymous = document.getElementById("feedback-anon").checked;
  const sentStep = fb.step;
  try {
    await fetchJSON("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        joiner_id: state.employeeId,
        step: sentStep,
        rating: fb.rating,
        tags: [...fb.tags],
        comment: document.getElementById("feedback-comment").value.trim(),
        anonymous,
      }),
    });
    status.textContent = "";
    document.getElementById("feedback-comment").value = "";
    document.getElementById("feedback-count").textContent = "0 / 500";
    const refreshed = await fetchJSON(
      `/api/feedback?joiner_id=${encodeURIComponent(state.employeeId)}`
    );
    state.feedback = refreshed.feedback || [];
    fb.rating = 0;
    fb.tags.clear();
    showThanks(sentStep, anonymous);
  } catch (err) {
    status.textContent = `Couldn't send: ${err.message}`;
    btn.disabled = false;
  }
}

function showThanks(sentStep, anonymous) {
  const steps = feedbackSteps();
  const sent = steps.find((s) => s.value === sentStep);
  const next = nextUnratedStep(steps, sentStep);
  document.getElementById("feedback-form").hidden = true;
  document.getElementById("fb-thanks").hidden = false;
  document.getElementById("fb-thanks-title").textContent = anonymous
    ? "Thanks — sent anonymously"
    : "Thanks — sent with your name";
  document.getElementById("fb-thanks-sub").textContent =
    `Your note on “${sent.label}” goes into this week's review. People Operations shares what changes in “You said, we did”.`;
  const actions = document.getElementById("fb-thanks-actions");
  actions.innerHTML = `${
    next ? `<button type="button" class="btn-primary" data-next="${esc(next.value)}">Next: rate “${esc(next.label)}”</button>` : ""
  }<button type="button" class="btn-secondary" data-close>${next ? "I'm done for now" : "Back to feedback"}</button>`;
  actions.querySelector("[data-next]")?.addEventListener("click", (e) => {
    state.fb.step = e.currentTarget.dataset.next;
    showFeedbackForm();
    renderFeedback();
  });
  actions.querySelector("[data-close]").addEventListener("click", () => {
    showFeedbackForm();
    state.fb.step = null;
    renderFeedback();
  });
  renderFeedback();
  document.getElementById("feedback-form").hidden = true;
}

function stateBadge(s) {
  return `<span class="badge state-${s}">${String(s).replaceAll("_", " ")}</span>`;
}
function labelStatus(s) {
  return String(s).replaceAll("_", " ");
}
function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
function emailHtml(email) {
  return esc(email).replace("@", "@<wbr>");
}
function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
function fmt(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function wireUI() {
  document.getElementById("sign-out-btn")?.addEventListener("click", exitToPortal);

  document.querySelectorAll(".wx-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });
  document.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => setTab(btn.dataset.goto));
  });
  document.getElementById("hero-ask")?.addEventListener("click", () =>
    askFromHome("What should I do now?")
  );
  document.getElementById("notif-more")?.addEventListener("click", () => {
    state.notesExpanded = !state.notesExpanded;
    renderNotifications();
  });

  document.getElementById("chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("chat-input");
    const q = input.value.trim();
    if (!q) return;
    input.value = "";
    try {
      await askChat(q);
    } catch (err) {
      showError(`Chat failed: ${err.message}`);
    }
  });

  document.getElementById("ira-personalise")?.addEventListener("click", openPersonalise);
  document.getElementById("ira-practice")?.addEventListener("click", () => {
    if (state.coach) endCoach(true);
    askChat("Let's practise");
  });
  document.getElementById("wx-drawer-close").addEventListener("click", closeDrawer);
  document.getElementById("wx-drawer-back").addEventListener("click", drawerBack);
  document.getElementById("wx-drawer-backdrop").addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !document.getElementById("wx-drawer").hidden) closeDrawer();
  });

  document.getElementById("feedback-form").addEventListener("submit", submitFeedback);
  document.getElementById("team-search").addEventListener("input", (e) => {
    state.teamSearch = e.target.value;
    renderTeam();
  });
  document.getElementById("feedback-comment").addEventListener("input", (e) => {
    document.getElementById("feedback-count").textContent = `${e.target.value.length} / 500`;
  });
  document.getElementById("feedback-anon").addEventListener("change", syncAnonCopy);
}

async function boot() {
  if (!session) return;
  try {
    wireUI();
    window.history.replaceState(
      {},
      "",
      `/employee?id=${encodeURIComponent(state.employeeId)}`
    );
    await loadWorkspace();
  } catch (err) {
    console.error(err);
    showError(`Failed to load employee workspace: ${err.message}`);
  }
}

boot();
