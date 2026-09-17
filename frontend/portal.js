/* SmartStart portal — persona + employee identity picker */

const portalState = {
  role: "INTERN",
  joiners: [],
};

function showError(msg) {
  const box = document.getElementById("portal-error");
  box.hidden = false;
  box.textContent = msg;
}

async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
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
        `<option value="${esc(j.id)}">${esc(j.name)} · ${esc(j.department)}</option>`
    )
    .join("");
}

function showPersonaStep() {
  document.getElementById("persona-step").hidden = false;
  document.getElementById("employee-step").hidden = true;
  document.getElementById("portal-shell")?.classList.remove("joining");
}

function showEmployeeStep() {
  document.getElementById("persona-step").hidden = true;
  document.getElementById("employee-step").hidden = false;
  document.getElementById("portal-shell")?.classList.add("joining");
  syncRoleButtons();
  populateEmployeeSelect();
}

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wire() {
  document.getElementById("pick-employer").addEventListener("click", () => {
    writeSession({
      persona: "employer",
      role: "employer",
      employeeId: null,
      at: new Date().toISOString(),
    });
    window.location.href = "/command-center?persona=employer";
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
    window.location.href = `/employee?id=${encodeURIComponent(joiner.id)}`;
  });

  // Do NOT auto-redirect — always show the chooser so a cached tab can't hide it.
  // Clear stale demo sessions when landing with ?reset=1
  const params = new URLSearchParams(window.location.search);
  if (params.get("reset") === "1") {
    clearSession();
  }
  const need = params.get("need");
  if (need === "employer") {
    showError("Employer Command Center is for HR / IT / Manager demo sessions only. Sign in as Employer.");
  } else if (need === "employee") {
    showError("Sign in as Intern or FTE to open your personal workspace.");
  }
}

wire();
