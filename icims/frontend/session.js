/* Mock iCIMS session — separate from SmartStart */

const ICIMS_KEY = "icims_mock_session";

const IcimsSession = {
  read() {
    try {
      const raw = sessionStorage.getItem(ICIMS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  write(data) {
    sessionStorage.setItem(ICIMS_KEY, JSON.stringify(data));
  },
  clear() {
    sessionStorage.removeItem(ICIMS_KEY);
  },
  headers() {
    const s = this.read();
    if (!s?.token) return {};
    return {
      Authorization: `Bearer ${s.token}`,
      "X-iCIMS-Token": s.token,
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
