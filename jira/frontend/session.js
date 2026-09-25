const JIRA_KEY = "jira_mock_session";

const JiraSession = {
  read() {
    try {
      const raw = sessionStorage.getItem(JIRA_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  write(data) {
    sessionStorage.setItem(JIRA_KEY, JSON.stringify(data));
  },
  clear() {
    sessionStorage.removeItem(JIRA_KEY);
  },
  headers() {
    const s = this.read();
    if (!s?.token) return {};
    return {
      Authorization: `Bearer ${s.token}`,
      "X-Jira-Token": s.token,
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
