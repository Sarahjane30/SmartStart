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
  const params = new URLSearchParams(window.location.search);
  if (params.get("persona") === "employer") {
    writeSession({
      persona: "employer",
      role: "employer",
      employeeId: null,
      at: new Date().toISOString(),
    });
    // Clean the URL without reloading
    params.delete("persona");
    const qs = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }
  const s = readSession();
  if (!s || s.persona !== "employer") {
    // Fallback for browsers that block sessionStorage: still allow demo via query once
    if (params.get("demo") === "1") {
      return { persona: "employer", role: "employer", employeeId: null };
    }
    window.location.replace("/?need=employer");
    return null;
  }
  return s;
}

function requireEmployeeSession() {
  const params = new URLSearchParams(window.location.search);
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
