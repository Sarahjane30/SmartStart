/* Mock Jira frontend — boards / For you (no Home dashboard) */

const STATUS_ORDER = ["Backlog", "To Do", "In Progress", "Done"];
let currentBoard = "BOARD-ONB";

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function chip(label, tone = "") {
  const t =
    tone ||
    (label === "Done"
      ? "ok"
      : label === "In Progress"
        ? ""
        : label === "To Do" || label === "Backlog"
          ? "muted"
          : "");
  return `<span class="chip ${t}">${esc(label)}</span>`;
}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.hidden = true;
  }, 3000);
}

function showError(msg) {
  const el = document.getElementById("global-error");
  if (!msg) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...JiraSession.headers(),
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    JiraSession.clear();
    window.location.replace("/");
    throw new Error("Session expired");
  }
  if (!res.ok) {
    let detail = `${res.status}`;
    try {
      detail = (await res.json()).detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

function showSection(name) {
  document.querySelectorAll(".section").forEach((s) => s.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
  const section = document.getElementById(`section-${name}`);
  if (section) section.classList.add("active");
  document.querySelector(`.nav-btn[data-section="${name}"]`)?.classList.add("active");
  if (name !== "detail" && name !== "settings") loadSection(name);
  else if (name === "settings") {
    /* static */
  }
}

async function loadSection(name) {
  showError("");
  try {
    if (name === "foryou") await renderForYou();
    else if (name === "board") await renderBoard(currentBoard);
    else if (name === "filters") await renderFilters();
    else if (name === "integrations") await renderIntegrations();
  } catch (e) {
    showError(String(e.message || e));
  }
}

async function loadSpaces() {
  const data = await api("/api/boards");
  const list = document.getElementById("space-list");
  list.innerHTML = (data.boards || [])
    .map(
      (b) => `<button type="button" class="space-item" data-board="${esc(b.id)}">
        <span class="space-icon">${esc(b.key.slice(0, 2))}</span>
        <span>${esc(b.name)}</span>
      </button>`
    )
    .join("");
  list.querySelectorAll("[data-board]").forEach((btn) => {
    btn.onclick = () => {
      currentBoard = btn.getAttribute("data-board");
      showSection("board");
    };
  });

  document.getElementById("rec-spaces").innerHTML = (data.boards || [])
    .slice(0, 3)
    .map(
      (b) => `<article class="space-card" data-board="${esc(b.id)}">
        <h3>${esc(b.name)}</h3>
        <p class="muted tiny">${esc(b.project)} · ${esc(b.issue_count)} issues</p>
      </article>`
    )
    .join("");
  document.querySelectorAll("#rec-spaces [data-board]").forEach((el) => {
    el.onclick = () => {
      currentBoard = el.getAttribute("data-board");
      showSection("board");
    };
  });
}

function issueMeta(i) {
  return `<span class="type-icon" title="Story"></span>Story · <span class="mono">${esc(i.key)}</span> · ${esc(i.project)} Onboarding`;
}

async function renderForYou() {
  const data = await api("/api/for-you");
  document.getElementById("assigned-count").textContent = String(data.total_open || 0);
  const root = document.getElementById("assigned-list");
  const groups = data.groups || {};
  root.innerHTML = STATUS_ORDER.filter((s) => s !== "Done")
    .map((status) => {
      const items = groups[status] || [];
      if (!items.length) return "";
      return `<div class="status-group">
        <h3>${esc(status)}</h3>
        ${items
          .map(
            (i) => `<div class="issue-row" data-key="${esc(i.key)}">
            <div>
              <p class="title">${esc(i.summary)}</p>
              <div class="meta">${issueMeta(i)}</div>
            </div>
            <div>${chip(i.status)}</div>
          </div>`
          )
          .join("")}
      </div>`;
    })
    .join("") || `<p class="muted">No open assigned issues</p>`;

  root.querySelectorAll("[data-key]").forEach((row) => {
    row.onclick = () => openIssue(row.getAttribute("data-key"));
  });
}

async function renderBoard(boardId) {
  const data = await api(`/api/boards/${boardId}`);
  document.getElementById("board-title").textContent = data.board?.name || "Board";
  document.getElementById("board-sub").textContent =
    `${data.board?.project || ""} · ${data.total || 0} issues · move cards to emit SmartStart events`;
  const cols = data.columns || {};
  document.getElementById("board-grid").innerHTML = STATUS_ORDER.map((status) => {
    const cards = cols[status] || [];
    return `<div class="board-col">
      <h3>${esc(status)} · ${cards.length}</h3>
      ${cards
        .map(
          (i) => `<div class="card" data-key="${esc(i.key)}">
          <strong>${esc(i.summary)}</strong>
          <div class="key">${esc(i.key)} · ${esc(i.assignee)}</div>
          <div style="margin-top:0.45rem">
            ${STATUS_ORDER.filter((s) => s !== status)
              .map(
                (s) =>
                  `<button type="button" class="btn-mini primary" data-move="${esc(i.key)}" data-status="${esc(s)}">${esc(s)}</button>`
              )
              .join("")}
          </div>
        </div>`
        )
        .join("")}
    </div>`;
  }).join("");

  document.querySelectorAll("#board-grid .card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest("[data-move]")) return;
      openIssue(card.getAttribute("data-key"));
    });
  });
  document.querySelectorAll("[data-move]").forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const key = btn.getAttribute("data-move");
      const status = btn.getAttribute("data-status");
      const res = await api(`/api/issues/${key}/transition`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      toast(`${res.event.event_type} · ${key}`);
      renderBoard(boardId);
    };
  });
}

async function renderFilters() {
  const params = new URLSearchParams();
  const q = document.getElementById("issue-q").value.trim();
  const status = document.getElementById("issue-status").value;
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  const data = await api(`/api/issues${params.toString() ? `?${params}` : ""}`);
  document.querySelector("#issue-table tbody").innerHTML = (data.issues || [])
    .map(
      (i) => `<tr data-key="${esc(i.key)}" style="cursor:pointer">
      <td class="mono">${esc(i.key)}</td>
      <td>${esc(i.summary)}</td>
      <td>${chip(i.status)}</td>
      <td>${esc(i.assignee)}</td>
      <td>${esc(i.reporter)}</td>
    </tr>`
    )
    .join("");
  document.querySelectorAll("#issue-table tr[data-key]").forEach((tr) => {
    tr.onclick = () => openIssue(tr.getAttribute("data-key"));
  });
}

async function openIssue(key) {
  const data = await api(`/api/issues/${key}`);
  const i = data.issue;
  showSection("detail");
  // detail isn't in nav — clear nav active
  document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));

  document.getElementById("issue-detail").innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start">
      <div>
        <p class="mono muted tiny" style="margin:0">${esc(i.key)} · ${esc(i.issue_type)}</p>
        <h2 style="margin:0.25rem 0 0.5rem">${esc(i.summary)}</h2>
        ${chip(i.status)}
      </div>
      <button type="button" class="btn-secondary" id="back-foryou">Back</button>
    </div>
    <dl class="dl-grid" style="margin-top:1rem">
      <dt>Assignee</dt><dd>${esc(i.assignee)}</dd>
      <dt>Reporter</dt><dd>${esc(i.reporter)}</dd>
      <dt>Joiner</dt><dd>${esc(i.joiner_name)}</dd>
      <dt>Department</dt><dd>${esc(i.department)}</dd>
      <dt>Learning track</dt><dd>${esc(i.learning_track)}</dd>
      <dt>Labels</dt><dd>${esc((i.labels || []).join(", "))}</dd>
    </dl>
    <h3 style="margin:1.1rem 0 0.4rem;font-size:0.95rem">Move to</h3>
    <div>
      ${STATUS_ORDER.map(
        (s) =>
          `<button type="button" class="btn-mini primary" data-tr="${esc(s)}" ${
            s === i.status ? "disabled" : ""
          }>${esc(s)}</button>`
      ).join("")}
    </div>
    <h3 style="margin:1.1rem 0 0.4rem;font-size:0.95rem">Sub-tasks</h3>
    ${(i.subtasks || [])
      .map(
        (s) => `<div class="subtask">
        <span>${s.done ? "✓" : "○"} ${esc(s.summary)}</span>
        ${
          s.done
            ? chip("Done", "ok")
            : `<button type="button" class="btn-mini primary" data-sub="${esc(s.id)}">Complete</button>`
        }
      </div>`
      )
      .join("") || "<p class='muted'>No sub-tasks</p>"}
  `;

  document.getElementById("back-foryou").onclick = () => showSection("foryou");
  document.querySelectorAll("[data-tr]").forEach((btn) => {
    btn.onclick = async () => {
      const res = await api(`/api/issues/${key}/transition`, {
        method: "POST",
        body: JSON.stringify({ status: btn.getAttribute("data-tr") }),
      });
      toast(`${res.event.event_type} · ${key}`);
      openIssue(key);
    };
  });
  document.querySelectorAll("[data-sub]").forEach((btn) => {
    btn.onclick = async () => {
      const res = await api(
        `/api/issues/${key}/subtasks/${btn.getAttribute("data-sub")}/complete`,
        { method: "POST" }
      );
      toast(`${res.event.event_type} · ${key}`);
      openIssue(key);
    };
  });
}

async function renderIntegrations() {
  const data = await api("/api/integration/status");
  const integ = (data.integrations || [])[0] || {};
  document.getElementById("integ-status").innerHTML = `
    <dl class="dl-grid">
      <dt>Integration</dt><dd>${esc(integ.name || "External Onboarding Platform")}</dd>
      <dt>Status</dt><dd>${chip(integ.status || "Connected", "ok")}</dd>
      <dt>Type</dt><dd>${esc(integ.type || "REST API / Event Feed")}</dd>
      <dt>Last transmission</dt><dd class="mono">${esc(integ.last_successful_transmission || "—")}</dd>
      <dt>Events today</dt><dd>${esc(integ.events_today ?? 0)}</dd>
    </dl>
    <p class="muted tiny" style="margin-top:0.75rem">Public feed: <code class="mono">GET /api/events</code></p>`;

  document.querySelector("#integ-log tbody").innerHTML = (data.activity || [])
    .map(
      (a) => `<tr>
      <td class="mono tiny">${esc(a.at)}</td>
      <td><strong>${esc(a.event_type)}</strong></td>
      <td class="mono">${esc(a.record)}</td>
      <td>${chip(a.delivery, a.delivery === "Delivered" ? "ok" : "warn")}</td>
    </tr>`
    )
    .join("") ||
    `<tr><td colspan="4" class="muted">No events yet — move an issue to Done</td></tr>`;
}

const session = JiraSession.require();
if (session) {
  document.getElementById("user-name").textContent = session.display_name || "Ava Chen";
  document.getElementById("user-title").textContent = session.title || "";
  const parts = (session.display_name || "AC").split(" ");
  document.getElementById("avatar").textContent =
    ((parts[0]?.[0] || "A") + (parts[1]?.[0] || "C")).toUpperCase();

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => showSection(btn.getAttribute("data-section")));
  });
  document.getElementById("sign-out").onclick = () => {
    JiraSession.clear();
    window.location.href = "/";
  };
  document.getElementById("reseed-btn").onclick = async () => {
    await api("/api/admin/reseed?seed=42", { method: "POST" });
    toast("Cohort reseeded");
    showSection("foryou");
  };
  document.getElementById("toast-create").onclick = () =>
    toast("Create is synthetic-only in this demo");
  document.getElementById("issue-q").addEventListener("input", () => {
    if (document.getElementById("section-filters").classList.contains("active")) renderFilters();
  });
  document.getElementById("issue-status").addEventListener("change", () => {
    if (document.getElementById("section-filters").classList.contains("active")) renderFilters();
  });
  document.getElementById("global-search").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      document.getElementById("issue-q").value = e.target.value;
      showSection("filters");
    }
  });

  loadSpaces().then(() => showSection("foryou"));
}
