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
    const detail = await res.text();
    throw new Error(`${path} → ${res.status}${detail ? `: ${detail}` : ""}`);
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
  const [profile, track, notifications, feedback, workspace, chatbot] =
    await Promise.all([
      fetchJSON(`/api/employee/${id}`),
      fetchJSON(`/api/learningtrack/${id}`),
      fetchJSON(`/api/notifications/${id}`),
      fetchJSON(`/api/feedback?joiner_id=${id}`),
      fetchJSON(`/api/employee/${id}/workspace`),
      fetchJSON(`/api/chatbot/${id}`),
    ]);
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
  renderFeedbackHistory();
  renderHomeExtras();
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
        (c) => `<button type="button" class="wx-person" data-goto="people">
        <span class="wx-person-avatar" aria-hidden="true">${initials(c.name)}</span>
        <span class="wx-person-copy">
          <strong>${esc(c.name)}</strong>
          <span class="muted tiny">${esc(c.role_label)}</span>
          <span class="wx-person-channel">${esc(c.channel)}</span>
        </span>
      </button>`
      )
      .join("");
    people.querySelectorAll("[data-goto]").forEach((btn) =>
      btn.addEventListener("click", () => setTab(btn.dataset.goto))
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
  document.getElementById("progress-label").textContent = `${t.completion_pct}%`;
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
      return `<div class="module status-${m.status}">
        <div class="module-top">
          <div>
            <div class="module-title">${esc(m.title)}</div>
            <div class="muted tiny">${esc(m.category)} · ${m.duration_minutes} min</div>
          </div>
          <span class="badge mod-${m.status}">${labelStatus(m.status)}</span>
        </div>
        <p class="module-desc">${esc(m.description)}</p>
        <div class="module-progress">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
      </div>`;
    })
    .join("");
  revealAll(modulesList, ".module", 45);
}

function renderChat() {
  const data = state.chatbot;
  if (!data) return;
  if (!state.chatTurns) state.chatTurns = (data.turns || []).slice();

  const bubbles = state.chatTurns.map((t) => {
    const label = t.role === "user" ? "You" : "IRA";
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
  const suggested = (state.chatSuggestions || initial)
    .filter((q) => !asked.has(q.trim().toLowerCase()))
    .slice(0, 3);
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
  const log = document.getElementById("chat-log");
  log.scrollTop = log.scrollHeight;
}

async function askChat(query) {
  if (state.chatThinking) return;
  const id = encodeURIComponent(state.employeeId);
  if (!state.chatTurns) state.chatTurns = (state.chatbot?.turns || []).slice();
  const asked = state.chatTurns.filter((t) => t.role === "user").map((t) => t.text);
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
    if (reply) state.chatTurns.push(reply);
    if (data.suggestions?.length) state.chatSuggestions = data.suggestions;
  } finally {
    state.chatThinking = false;
    window.iraGlobe?.setThinking(false);
    renderChat();
  }
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
      (c) => `<article class="consult-card">
      <div class="consult-avatar" aria-hidden="true">${initials(c.name)}</div>
      <div>
        <strong>${esc(c.name)}</strong>
        <div class="muted tiny">${esc(c.role_label)}</div>
        <p>${esc(c.focus)}</p>
        <dl class="consult-meta">
          <div><dt>Channel</dt><dd>${esc(c.channel)}</dd></div>
          <div><dt>Availability</dt><dd>${esc(c.availability)}</dd></div>
        </dl>
      </div>
    </article>`
    )
    .join("");
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
      (m) => `<article class="wx-member ${m.is_self ? "is-self" : ""}">
      <header>
        <span class="wx-person-avatar" aria-hidden="true">${initials(m.name)}</span>
        <div class="wx-member-id">
          <strong>${esc(m.name)}</strong>
          <span class="muted tiny">${esc(m.title)}</span>
        </div>
        ${m.relationship ? `<span class="wx-member-rel">${esc(m.relationship)}</span>` : ""}
      </header>
      ${
        m.expertise.length
          ? `<ul class="wx-member-tags">${m.expertise.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`
          : ""
      }
      ${m.ask_about ? `<p class="wx-member-ask"><span>Ask about</span>${esc(m.ask_about)}</p>` : ""}
      ${
        m.is_self
          ? `<p class="wx-member-ask muted">This is you — your expertise will grow here.</p>`
          : `<footer class="muted tiny">${esc(m.channel)}</footer>`
      }
    </article>`
    )
    .join("");
  revealAll(teamList, ".wx-member", 40);
}

const RATING_LABELS = ["", "Very poor", "Poor", "Okay", "Good", "Great"];

function renderFeedbackHistory() {
  const box = document.getElementById("feedback-history");
  if (!box) return;
  if (!state.feedback.length) {
    box.innerHTML = `<p class="muted tiny">Nothing yet — your first note will show here, only to you.</p>`;
    return;
  }
  box.innerHTML = state.feedback
    .slice()
    .reverse()
    .map(
      (f) => `<div class="wx-fb-item">
        <div class="wx-fb-item-top">
          <strong>${esc(f.step)}</strong>
          <span class="wx-fb-score r${f.rating}">${f.rating} · ${RATING_LABELS[f.rating]}</span>
        </div>
        ${f.comment ? `<p>${esc(f.comment)}</p>` : ""}
        <span class="muted tiny">${f.anonymous ? "Anonymous" : "Shared with your name"} · ${relTime(
          f.submitted_at
        )}</span>
      </div>`
    )
    .join("");
}

async function submitFeedback(event) {
  event.preventDefault();
  const status = document.getElementById("feedback-status");
  status.textContent = "Sending…";
  const rating = Number(
    document.querySelector('input[name="rating"]:checked')?.value || 3
  );
  const step =
    document.querySelector('input[name="step"]:checked')?.value || "Day-1 orientation";
  const anonymous = document.getElementById("feedback-anon").checked;
  try {
    await fetchJSON("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        joiner_id: state.employeeId,
        step,
        rating,
        comment: document.getElementById("feedback-comment").value.trim(),
        anonymous,
      }),
    });
    status.textContent = anonymous ? "Thanks — sent anonymously." : "Thanks — feedback sent.";
    document.getElementById("feedback-comment").value = "";
    document.getElementById("feedback-count").textContent = "0 / 500";
    const refreshed = await fetchJSON(
      `/api/feedback?joiner_id=${encodeURIComponent(state.employeeId)}`
    );
    state.feedback = refreshed.feedback || [];
    renderFeedbackHistory();
  } catch (err) {
    status.textContent = `Failed: ${err.message}`;
  }
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

  document.getElementById("feedback-form").addEventListener("submit", submitFeedback);
  document.getElementById("team-search").addEventListener("input", (e) => {
    state.teamSearch = e.target.value;
    renderTeam();
  });
  document.getElementById("feedback-comment").addEventListener("input", (e) => {
    document.getElementById("feedback-count").textContent = `${e.target.value.length} / 500`;
  });
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
