/* SmartStart demo session (browser-only, not real auth) */

const SS_SESSION_KEY = "smartstart_demo_session";

function readSession() {
  try {
    const raw = sessionStorage.getItem(SS_SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.persona) return null;
    return data;
  } catch {
    return null;
  }
}

function writeSession(data) {
  try {
    sessionStorage.setItem(SS_SESSION_KEY, JSON.stringify(data));
  } catch {
    // sessionStorage may be blocked in some IDE browsers
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SS_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function employerAuthHeaders() {
  const s = readSession();
  if (!s?.token) return {};
  return {
    Authorization: `Bearer ${s.token}`,
    "X-SmartStart-Token": s.token,
  };
}

function requireEmployerSession() {
  const s = readSession();
  if (!s || s.persona !== "employer" || !s.token) {
    window.location.replace("/?need=employer");
    return null;
  }
  return s;
}

function requireEmployeeSession() {
  const s = readSession();
  if (!s || s.persona !== "employee" || !s.employeeId) {
    window.location.replace("/?need=employee");
    return null;
  }
  return s;
}

function exitToPortal() {
  clearSession();
  fetch("/api/ira/session", { method: "DELETE" }).catch(() => {});
  window.location.href = "/?reset=1";
}
