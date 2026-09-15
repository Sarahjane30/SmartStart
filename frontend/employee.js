/* SmartStart Layer 3 — Employee Experience */

const DEFAULT_ID = "SYN-J-0042-023";

const state = {
  employeeId: new URLSearchParams(window.location.search).get("id") || DEFAULT_ID,
  profile: null,
  track: null,
  notifications: null,
  feedback: [],
};

async function fetchJSON(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${path} → ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return res.json();
}

async function loadJoiners() {
  const joiners = await fetchJSON("/api/joiners");
  const select = document.getElementById("employee-select");
  select.innerHTML = joiners
    .map(
      (j) =>
        `<option value="${esc(j.id)}" ${j.id === state.employeeId ? "selected" : ""}>${esc(
          j.name
        )} · ${j.role_type}</option>`
    )
    .join("");
  if (!joiners.some((j) => j.id === state.employeeId) && joiners.length) {
    state.employeeId = joiners[0].id;
    select.value = state.employeeId;
  }
}

async function loadEmployee() {
  const id = encodeURIComponent(state.employeeId);
  const [profile, track, notifications, feedback] = await Promise.all([
    fetchJSON(`/api/employee/${id}`),
    fetchJSON(`/api/learningtrack/${id}`),
    fetchJSON(`/api/notifications/${id}`),
    fetchJSON(`/api/feedback?joiner_id=${id}`),
  ]);
  state.profile = profile;
  state.track = track;
  state.notifications = notifications;
  state.feedback = feedback.feedback || [];
  render();
}

function render() {
  document.getElementById("dashboard").hidden = false;
  document.getElementById("load-error").hidden = true;
  renderProfile();
  renderLearning();
  renderNotifications();
  renderFeedbackHistory();
}

function renderProfile() {
  const p = state.profile;
  if (!p) return;
  const isIntern = p.role_type === "INTERN";

  document.getElementById("emp-name").textContent = p.name;
  document.getElementById("emp-email").textContent = p.email;
  document.getElementById("emp-dept").textContent = p.department;
  document.getElementById("emp-track").textContent = `${p.department_track} · ${p.learning_track}`;
  document.getElementById("emp-state").innerHTML = stateBadge(p.current_state);
  document.getElementById("emp-join").textContent = p.joining_date;
  document.getElementById("emp-days").textContent = String(p.days_in_pipeline);
  document.getElementById("emp-mentor").textContent = p.mentor_name;
  document.getElementById("mentor-row").hidden = !isIntern && !p.mentor_name;
  if (!isIntern) {
    document.querySelector("#mentor-row dt").textContent = "Buddy / mentor";
  } else {
    document.querySelector("#mentor-row dt").textContent = "Mentor";
  }

  const badge = document.getElementById("role-badge");
  badge.textContent = p.role_type;
  badge.className = `badge role-${p.role_type.toLowerCase()}`;

  const initials = p.name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  document.getElementById("avatar").textContent = initials || "?";

  document.getElementById("next-action").textContent = p.next_action;

  const tasksBlock = document.getElementById("tasks-block");
  const taskList = document.getElementById("task-list");
  const tasksTitle = document.getElementById("tasks-title");
  if (isIntern) {
    tasksTitle.textContent = "Mentor check-ins & basics";
  } else {
    tasksTitle.textContent = "Project readiness tasks";
  }
  if (p.assigned_tasks && p.assigned_tasks.length) {
    tasksBlock.hidden = false;
    taskList.innerHTML = p.assigned_tasks.map((t) => `<li>${esc(t)}</li>`).join("");
  } else if (!isIntern) {
    tasksBlock.hidden = false;
    taskList.innerHTML =
      "<li class=\"muted\">Complete department readiness modules to unlock project tasks.</li>";
  } else {
    tasksBlock.hidden = true;
    taskList.innerHTML = "";
  }

  // Highlight Intern vs FTE layout cues
  document.getElementById("profile-card").dataset.role = p.role_type;
}

function renderLearning() {
  const t = state.track;
  if (!t) return;
  document.getElementById("track-summary").textContent =
    `${t.track_name} · ${t.role_type} · ${t.department_track}`;
  document.getElementById("progress-label").textContent = `${t.completion_pct}% complete`;
  document.getElementById("progress-counts").textContent =
    `${t.completed_count} / ${t.total_count} modules`;
  const bar = document.getElementById("progress-bar");
  const fill = document.getElementById("progress-fill");
  bar.setAttribute("aria-valuenow", String(t.completion_pct));
  fill.style.width = `${t.completion_pct}%`;

  document.getElementById("modules-list").innerHTML = t.modules
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
}

function renderNotifications() {
  const data = state.notifications;
  if (!data) return;
  const badge = document.getElementById("unread-badge");
  badge.textContent = String(data.unread_count);
  badge.hidden = data.unread_count === 0;

  const list = document.getElementById("notifications-list");
  if (!data.notifications.length) {
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
}

function renderFeedbackHistory() {
  const box = document.getElementById("feedback-history");
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
  const payload = {
    joiner_id: state.employeeId,
    step: document.getElementById("feedback-step").value,
    rating,
    comment: document.getElementById("feedback-comment").value.trim(),
  };
  try {
    const res = await fetchJSON("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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

function esc(v) {
  return String(v)
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

function syncUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set("id", state.employeeId);
  window.history.replaceState({}, "", url);
}

function wireUI() {
  document.getElementById("employee-select").addEventListener("change", async (e) => {
    state.employeeId = e.target.value;
    syncUrl();
    await loadEmployee();
  });
  document.getElementById("refresh-btn").addEventListener("click", () => loadEmployee());
  document.getElementById("feedback-form").addEventListener("submit", submitFeedback);
}

async function boot() {
  wireUI();
  try {
    await loadJoiners();
    syncUrl();
    await loadEmployee();
  } catch (err) {
    console.error(err);
    document.getElementById("dashboard").hidden = true;
    const box = document.getElementById("load-error");
    box.hidden = false;
    box.textContent = `Failed to load synthetic employee API: ${err.message}`;
  }
}

boot();
