const BASE = "/api";

async function handle(res) {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  login: (password) =>
    fetch(`${BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }).then(handle),
  summary: () => fetch(`${BASE}/analytics/summary`).then(handle),
  moduleRecords: (module) => fetch(`${BASE}/modules/${module}`).then(handle),
  coql: (select_query) =>
    fetch(`${BASE}/coql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ select_query }),
    }).then(handle),
};