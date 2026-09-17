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
  sessionStorage.setItem(SS_SESSION_KEY, JSON.stringify(data));
}

function clearSession() {
  sessionStorage.removeItem(SS_SESSION_KEY);
}

function requireEmployerSession() {
  const s = readSession();
  if (!s || s.persona !== "employer") {
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
  window.location.href = "/";
}
