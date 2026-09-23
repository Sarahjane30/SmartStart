/* SmartStart portal — persona + employer login + employee identity picker */

const portalState = {
  role: "INTERN",
  joiners: [],
  demoAccounts: [],
};

function showError(msg) {
  const box = document.getElementById("portal-error");
  box.hidden = false;
  box.textContent = msg;
}

function showEmployerError(msg) {
  const box = document.getElementById("employer-login-error");
  box.hidden = false;
  box.textContent = msg;
}

async function fetchJSON(path, options = {}) {
  const res = await fetch(path, options);
  if (!res.ok) {
    let detail = `${path} → ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return res.json();
}

function syncRoleButtons() {
  document.querySelectorAll(".role-login-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.role === portalState.role);
  });
}

function populateEmployeeSelect() {
  const select = document.getElementById("employee-select");
  const rows = portalState.joiners.filter(
    (j) => String(j.role_type).toUpperCase() === portalState.role
  );
  if (!rows.length) {
    select.innerHTML = `<option value="">No ${portalState.role} profiles</option>`;
    return;
  }
  select.innerHTML = rows
    .map(
      (j) =>
        `<option value="${esc(j.id)}">${esc(j.name)} · ${esc(j.department)} · mgr ${esc(j.manager_name)}</option>`
    )
    .join("");
}

function renderDemoAccounts() {
  const tbody = document.querySelector("#demo-accounts-table tbody");
  if (!portalState.demoAccounts.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">No sample accounts loaded.</td></tr>`;
    return;
  }
  tbody.innerHTML = portalState.demoAccounts
    .map(
      (a) => `<tr class="demo-cred-row" data-user="${esc(a.username)}" data-pass="${esc(a.password)}" tabindex="0" title="Click to fill">
        <td>${esc(a.persona)} · ${esc(a.title)}</td>
        <td><code>${esc(a.username)}</code></td>
        <td><code>${esc(a.password)}</code></td>
        <td>${esc(a.scope)}</td>
      </tr>`
    )
    .join("");
}

function showStep(id) {
  ["persona-step", "employer-step", "employee-step"].forEach((step) => {
    document.getElementById(step).hidden = step !== id;
  });
}

function showPersonaStep() {
  showStep("persona-step");
}

function showEmployeeStep() {
  showStep("employee-step");
  syncRoleButtons();
  populateEmployeeSelect();
}

function showEmployerStep() {
  showStep("employer-step");
  document.getElementById("employer-login-error").hidden = true;
  revealAll(document.getElementById("demo-accounts-table"), ".demo-cred-row", 42);
}

function fillCredentials(user, pass) {
  document.getElementById("employer-user").value = user;
  document.getElementById("employer-pass").value = pass;
}

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function loadDemoAccounts() {
  const data = await fetchJSON("/api/auth/demo-accounts");
  portalState.demoAccounts = data.accounts || [];
  renderDemoAccounts();
}

async function employerLogin() {
  const username = document.getElementById("employer-user").value.trim();
  const password = document.getElementById("employer-pass").value;
  if (!username || !password) {
    showEmployerError("Enter a sample username and password.");
    return;
  }
  try {
    const res = await fetchJSON("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    writeSession({
      persona: "employer",
      role: "employer",
      employeeId: null,
      token: res.token,
      username: res.username,
      displayName: res.display_name,
      employerPersona: res.persona,
      managerId: res.manager_id || null,
      title: res.title,
      at: new Date().toISOString(),
    });
    window.location.href = "/command-center";
  } catch (err) {
    showEmployerError(err.message || "Login failed");
  }
}

function wire() {
  document.getElementById("pick-employer").addEventListener("click", async () => {
    try {
      if (!portalState.demoAccounts.length) {
        await loadDemoAccounts();
      } else {
        renderDemoAccounts();
      }
      showEmployerStep();
    } catch (err) {
      showError(`Could not load sample accounts: ${err.message}`);
    }
  });

  document.getElementById("pick-employee").addEventListener("click", async () => {
    try {
      if (!portalState.joiners.length) {
        portalState.joiners = await fetchJSON("/api/joiners");
      }
      showEmployeeStep();
    } catch (err) {
      showError(`Could not load synthetic joiners: ${err.message}`);
    }
  });

  document.getElementById("back-persona").addEventListener("click", showPersonaStep);
  document.getElementById("back-from-employer").addEventListener("click", showPersonaStep);

  document.getElementById("employer-enter").addEventListener("click", employerLogin);
  document.getElementById("employer-pass").addEventListener("keydown", (e) => {
    if (e.key === "Enter") employerLogin();
  });
  document.getElementById("employer-user").addEventListener("keydown", (e) => {
    if (e.key === "Enter") employerLogin();
  });

  document.getElementById("demo-accounts-table").addEventListener("click", (e) => {
    const row = e.target.closest(".demo-cred-row");
    if (!row) return;
    fillCredentials(row.dataset.user, row.dataset.pass);
  });
  document.getElementById("demo-accounts-table").addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const row = e.target.closest(".demo-cred-row");
    if (!row) return;
    e.preventDefault();
    fillCredentials(row.dataset.user, row.dataset.pass);
  });

  document.querySelectorAll(".role-login-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      portalState.role = btn.dataset.role;
      syncRoleButtons();
      populateEmployeeSelect();
    });
  });

  document.getElementById("employee-enter").addEventListener("click", () => {
    const select = document.getElementById("employee-select");
    const id = select.value;
    if (!id) {
      showError("Pick your synthetic profile to continue.");
      return;
    }
    const joiner = portalState.joiners.find((j) => j.id === id);
    if (!joiner) {
      showError("Selected profile was not found.");
      return;
    }
    writeSession({
      persona: "employee",
      role: String(joiner.role_type).toUpperCase(),
      employeeId: joiner.id,
      employeeName: joiner.name,
      department: joiner.department,
      at: new Date().toISOString(),
    });
    // Bridge identity to the IRA desktop companion
    fetch("/api/ira/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        employee_id: joiner.id,
        employee_name: joiner.name,
        department: joiner.department,
        role_type: String(joiner.role_type).toUpperCase(),
      }),
    }).catch(() => {});
    window.location.href = `/employee?id=${encodeURIComponent(joiner.id)}`;
  });

  const params = new URLSearchParams(window.location.search);
  if (params.get("reset") === "1") {
    clearSession();
    fetch("/api/ira/session", { method: "DELETE" }).catch(() => {});
  }
  const need = params.get("need");
  if (need === "employer") {
    showError("Command Center needs a sample employer ID and password. Sign in below.");
    loadDemoAccounts()
      .then(showEmployerStep)
      .catch((err) => showError(err.message));
  } else if (need === "employee") {
    const iraHint = params.get("ira") === "1"
      ? " IRA is waiting — pick your Intern/FTE profile to unlock the desktop companion."
      : "";
    showError("Sign in as Intern or FTE to open your personal workspace." + iraHint);
    showEmployeeStep();
  }
}

wire();
countUpAll(document.querySelector(".visual-stats"));
