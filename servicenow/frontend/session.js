/* Mock ServiceNow session — separate from SmartStart / iCIMS */

const SNOW_KEY = "servicenow_mock_session";

const SnowSession = {
  read() {
    try {
      const raw = sessionStorage.getItem(SNOW_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  write(data) {
    sessionStorage.setItem(SNOW_KEY, JSON.stringify(data));
  },
  clear() {
    sessionStorage.removeItem(SNOW_KEY);
  },
  headers() {
    const s = this.read();
    if (!s?.token) return {};
    return {
      Authorization: `Bearer ${s.token}`,
      "X-ServiceNow-Token": s.token,
    };
  },
  require() {
    const s = this.read();
    if (!s?.token) {
      window.location.replace("/");
      return null;
    }
    return s;
  },
};
