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

function renderHomeExtras() {
  const el = document.getElementById("home-recs");
  if (!el) return;
  const recs = state.workspace?.suggested_questions || [];
  el.textContent = recs.length ? `Try asking: “${recs[0]}”` : "";
}

function renderProfile() {
  const p = state.profile;
  if (!p) return;
  const isIntern = String(p.role_type).toUpperCase() === "INTERN";
  const first = String(p.name || "there").split(/\s+/)[0];

  const hello = document.getElementById("wx-hello");
  if (hello) hello.textContent = `Hi, ${first}`;
  document.getElementById("emp-name").textContent = p.name || "—";
  document.getElementById("emp-email").textContent = p.email || "";
  document.getElementById("emp-dept").textContent = p.department || "—";
  document.getElementById("emp-track").textContent =
    `${p.department_track || ""} · ${p.learning_track || ""}`;
  document.getElementById("emp-state").innerHTML = stateBadge(p.current_state);
  document.getElementById("emp-join").textContent = p.joining_date || "—";
  document.getElementById("emp-days").textContent = String(p.days_in_pipeline ?? "—");
  document.getElementById("emp-mentor").textContent = p.mentor_name || "—";
  const mentorDt = document.querySelector("#mentor-row dt");
  if (mentorDt) mentorDt.textContent = isIntern ? "Mentor" : "Buddy / mentor";

  const badge = document.getElementById("role-badge");
  badge.textContent = p.role_type;
  badge.className = `badge role-${String(p.role_type).toLowerCase()}`;

  document.getElementById("avatar").textContent = initials(p.name);
  document.getElementById("next-action").textContent = p.next_action || "";
  document.getElementById("profile-card").dataset.role = p.role_type;
  const shell = document.getElementById("workspace");
  if (shell) shell.dataset.role = p.role_type;

  const tasksBlock = document.getElementById("tasks-block");
  const taskList = document.getElementById("task-list");
  const tasksTitle = document.getElementById("tasks-title");
  tasksTitle.textContent = isIntern
    ? "Mentor check-ins & basics"
    : "Project readiness tasks";
  if (p.assigned_tasks && p.assigned_tasks.length) {
    tasksBlock.hidden = false;
    taskList.innerHTML = p.assigned_tasks.map((t) => `<li>${esc(t)}</li>`).join("");
  } else if (!isIntern) {
    tasksBlock.hidden = false;
    taskList.innerHTML =
      '<li class="muted">Complete department readiness modules to unlock project tasks.</li>';
  } else {
    tasksBlock.hidden = true;
    taskList.innerHTML = "";
  }
}

function renderNotifications() {
  const data = state.notifications;
  if (!data) return;
  const badge = document.getElementById("unread-badge");
  badge.textContent = String(data.unread_count || 0);
  badge.hidden = !data.unread_count;
  const list = document.getElementById("notifications-list");
  if (!data.notifications || !data.notifications.length) {
    list.innerHTML = `<p class="muted">No notifications.</p>`;
    return;
  }
  list.innerHTML = data.notifications
    .map(
      (n) => `<article class="note kind-${n.kind} ${n.read ? "read" : "unread"}">
      <div class="note-top">
        <strong>${esc(n.title)}</strong>
        <time datetime="${esc(n.created_at)}">${fmt(n.created_at)}</time>
      </div>
      <p>${esc(n.message)}</p>
      <span class="note-kind">${esc(n.kind)}</span>
    </article>`
    )
    .join("");
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
  document.getElementById("chat-log").innerHTML = (data.turns || [])
    .map(
      (t) =>
        `<div class="bubble ${t.role}"><div class="bubble-meta">${t.role}</div><p>${esc(
          t.text
        )}</p></div>`
    )
    .join("");

  const suggested =
    state.workspace?.suggested_questions ||
    (data.faqs || []).slice(0, 6).map((f) => f.question);
  document.getElementById("faq-chips").innerHTML = suggested
    .map(
      (q) =>
        `<button type="button" class="chip" data-q="${esc(q)}">${esc(q)}</button>`
    )
    .join("");
  document.querySelectorAll("#faq-chips .chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById("chat-input").value = btn.dataset.q;
      askChat(btn.dataset.q);
    });
  });
  const log = document.getElementById("chat-log");
  log.scrollTop = log.scrollHeight;
}

async function askChat(query) {
  const id = encodeURIComponent(state.employeeId);
  state.chatbot = await fetchJSON(
    `/api/chatbot/${id}?q=${encodeURIComponent(query)}`
  );
  renderChat();
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
  document.getElementById("team-title").textContent = ws.team_name;
  document.getElementById("team-count").textContent =
    `${ws.team.length} people in your department pod`;
  document.getElementById("team-blurb").textContent =
    String(state.profile?.role_type).toUpperCase() === "INTERN"
      ? "Your department pod only — not the full company roster."
      : "Your department cohort only — not the full company roster.";
  const teamList = document.getElementById("team-list");
  teamList.innerHTML = (ws.team || [])
    .map(
      (m) => `<div class="team-row ${m.is_self ? "is-self" : ""}">
      <div>
        <strong>${esc(m.name)}${m.is_self ? " (you)" : ""}</strong>
        <div class="muted tiny">${m.role_type} · mentor ${esc(m.mentor_name)}</div>
      </div>
      <div>${stateBadge(m.current_state)}</div>
      <div class="muted tiny">${m.days_in_pipeline}d in pipeline</div>
    </div>`
    )
    .join("");
  revealAll(teamList, ".team-row", 40);
}

function renderFeedbackHistory() {
  const box = document.getElementById("feedback-history");
  if (!box) return;
  if (!state.feedback.length) {
    box.innerHTML = `<p class="muted tiny">No feedback submitted yet for this joiner.</p>`;
    return;
  }
  box.innerHTML =
    `<h3>Your submissions</h3>` +
    state.feedback
      .map(
        (f) => `<div class="fb-item">
        <strong>${esc(f.step)}</strong>
        <span class="stars">${"★".repeat(f.rating)}${"☆".repeat(5 - f.rating)}</span>
        <span class="muted tiny">${fmt(f.submitted_at)}</span>
        ${f.comment ? `<p>${esc(f.comment)}</p>` : ""}
      </div>`
      )
      .join("");
}

async function submitFeedback(event) {
  event.preventDefault();
  const status = document.getElementById("feedback-status");
  status.textContent = "Submitting…";
  const rating = Number(
    document.querySelector('input[name="rating"]:checked')?.value || 3
  );
  try {
    const res = await fetchJSON("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        joiner_id: state.employeeId,
        step: document.getElementById("feedback-step").value,
        rating,
        comment: document.getElementById("feedback-comment").value.trim(),
      }),
    });
    status.textContent = res.message || "Feedback recorded.";
    document.getElementById("feedback-comment").value = "";
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

  document.getElementById("chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("chat-input");
    const q = input.value.trim();
    if (!q) return;
    try {
      await askChat(q);
      input.value = "";
    } catch (err) {
      showError(`Chat failed: ${err.message}`);
    }
  });

  document.getElementById("feedback-form").addEventListener("submit", submitFeedback);
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
