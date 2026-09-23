/* SmartStart Layer 4 — Prototype AI Features */

const DEFAULT_ID = "SYN-J-0042-023";

const state = {
  joinerId: new URLSearchParams(window.location.search).get("id") || DEFAULT_ID,
  chatbot: null,
  predict: null,
  recommendations: null,
};

async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${path} → ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return res.json();
}

async function loadJoiners() {
  const joiners = await fetchJSON("/api/joiners");
  const select = document.getElementById("joiner-select");
  select.innerHTML = joiners
    .map(
      (j) =>
        `<option value="${esc(j.id)}" ${j.id === state.joinerId ? "selected" : ""}>${esc(
          j.name
        )} · ${j.role_type}</option>`
    )
    .join("");
  if (!joiners.some((j) => j.id === state.joinerId) && joiners.length) {
    state.joinerId = joiners[0].id;
    select.value = state.joinerId;
  }
}

async function loadAll() {
  const id = encodeURIComponent(state.joinerId);
  const [chatbot, predict, recommendations] = await Promise.all([
    fetchJSON(`/api/chatbot/${id}`),
    fetchJSON(`/api/predict/${id}`),
    fetchJSON(`/api/recommendations/${id}`),
  ]);
  state.chatbot = chatbot;
  state.predict = predict;
  state.recommendations = recommendations;
  render();
}

async function askChat(query) {
  const id = encodeURIComponent(state.joinerId);
  state.chatbot = await fetchJSON(`/api/chatbot/${id}?q=${encodeURIComponent(query)}`);
  renderChat();
}

function render() {
  document.getElementById("dashboard").hidden = false;
  document.getElementById("load-error").hidden = true;
  renderChat();
  renderPredict();
  renderRecs();
}

function renderChat() {
  const data = state.chatbot;
  if (!data) return;
  document.getElementById("chat-role").textContent = `${data.role_type} · IRA companion`;
  document.getElementById("chat-log").innerHTML = (data.turns || [])
    .map((t) => {
      const label = t.role === "user" ? "You" : "IRA";
      return `<div class="bubble ${t.role}"><div class="bubble-meta">${label}</div><p>${esc(
        t.text
      )}</p></div>`;
    })
    .join("");
  document.getElementById("faq-chips").innerHTML = (data.faqs || [])
    .slice(0, 8)
    .map(
      (f) =>
        `<button type="button" class="chip" data-q="${esc(f.question)}">${esc(
          f.question
        )}</button>`
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

function renderPredict() {
  const data = state.predict;
  if (!data) return;
  const pill = document.getElementById("overall-risk");
  pill.textContent = `${String(data.overall_risk_level).toUpperCase()} · ${data.overall_risk_score}`;
  pill.className = `risk-pill level-${data.overall_risk_level}`;
  document.getElementById("predict-note").textContent = data.note || "Synthetic risk scores only.";
  const alertsList = document.getElementById("alerts-list");
  alertsList.innerHTML = (data.alerts || [])
    .map(
      (a) => `<article class="ai-alert level-${a.risk_level}">
      <div class="ai-alert-top">
        <strong>${esc(a.title)}</strong>
        <span class="score">${a.risk_score}</span>
      </div>
      <p>${esc(a.message)}</p>
      <ul class="drivers">${(a.drivers || []).map((d) => `<li>${esc(d)}</li>`).join("")}</ul>
      <div class="action">${esc(a.recommended_action)}</div>
    </article>`
    )
    .join("");
  revealAll(alertsList, ".ai-alert", 45);
}

function renderRecs() {
  const data = state.recommendations;
  if (!data) return;
  document.getElementById("recs-focus").textContent = data.focus;
  document.getElementById("track-pct").textContent = `${data.track_completion_pct}%`;
  const bar = document.getElementById("track-bar");
  const fill = document.getElementById("track-fill");
  bar.setAttribute("aria-valuenow", String(data.track_completion_pct));
  fill.style.width = `${data.track_completion_pct}%`;
  const recsList = document.getElementById("recs-list");
  recsList.innerHTML = (data.recommendations || [])
    .map(
      (r) => `<div class="rec-item">
      <div class="rec-top">
        <div>
          <div class="rec-title">${esc(r.title)}</div>
          <div class="muted tiny">${esc(r.category)} · ${r.estimated_minutes} min · priority ${r.priority}</div>
        </div>
        <span class="badge mod-${r.status}">${String(r.status).replaceAll("_", " ")}</span>
      </div>
      <p class="rec-reason">${esc(r.reason)}</p>
      <div class="module-progress"><div class="progress-fill" style="width:${r.progress_pct}%"></div></div>
    </div>`
    )
    .join("");
  revealAll(recsList, ".rec-item", 45);
}

function esc(v) {
  return String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function syncUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set("id", state.joinerId);
  window.history.replaceState({}, "", url);
}

function wireUI() {
  document.getElementById("sign-out-btn")?.addEventListener("click", exitToPortal);
  document.getElementById("joiner-select").addEventListener("change", async (e) => {
    state.joinerId = e.target.value;
    syncUrl();
    await loadAll();
  });
  document.getElementById("refresh-btn").addEventListener("click", () => loadAll());
  document.getElementById("chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("chat-input");
    const q = input.value.trim();
    if (!q) return;
    await askChat(q);
    input.value = "";
  });
}

async function boot() {
  const session = requireEmployerSession();
  if (!session) return;
  wireUI();
  try {
    await loadJoiners();
    syncUrl();
    await loadAll();
  } catch (err) {
    console.error(err);
    document.getElementById("dashboard").hidden = true;
    const box = document.getElementById("load-error");
    box.hidden = false;
    box.textContent = `Failed to load synthetic AI APIs: ${err.message}`;
  }
}

boot();
