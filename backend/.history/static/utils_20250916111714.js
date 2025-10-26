// utils.js (module)

export function saveTokens({ access, refresh }) {
  if (access) localStorage.setItem('access_token', access);
  if (refresh) localStorage.setItem('refresh_token', refresh);
  localStorage.setItem('token_saved_at', Date.now().toString());
}

export function clearTokens() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('token_saved_at');
}

export function getAccessToken() {
  return localStorage.getItem('access_token');
}

export function getRefreshToken() {
  return localStorage.getItem('refresh_token');
}

// tiny JWT decode (no external lib)
function parseJwt(token) {
  try {
    const payload = token.split('.')[1];
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return json;
  } catch (e) {
    return null;
  }
}

export function isTokenExpired(token, bufferSeconds = 30) {
  if (!token) return true;
  const p = parseJwt(token);
  if (!p || !p.exp) return true;
  const now = Math.floor(Date.now() / 1000);
  return (p.exp <= (now + bufferSeconds));
}

export async function refreshAccessToken() {
  const refresh = getRefreshToken();
  if (!refresh) return null;

  try {
    const resp = await fetch('/accounts/api/token/refresh/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ refresh })
    });
    const data = await resp.json();
    if (resp.ok && data.access) {
      saveTokens({ access: data.access, refresh: data.refresh || refresh });
      return data.access;
    } else {
      clearTokens();
      return null;
    }
  } catch (err) {
    console.error('refreshAccessToken error', err);
    return null;
  }
}

export async function fetchWithAuth(input, init = {}) {
  let opts = { ...init };
  opts.headers = { ...(opts.headers || {}) };

  let access = getAccessToken();
  if (!access || isTokenExpired(access, 30)) {
    access = await refreshAccessToken();
  }
  if (access) {
    opts.headers['Authorization'] = 'Bearer ' + access;
  }

  let resp = await fetch(input, opts);
  if (resp.status === 401) {
    const newAccess = await refreshAccessToken();
    if (newAccess) {
      opts.headers['Authorization'] = 'Bearer ' + newAccess;
      resp = await fetch(input, opts);
    } else {
      clearTokens();
    }
  }
  return resp;
}

export async function apiFetchAsJson(path, opts = {}) {
  try {
    const resp = await fetchWithAuth(path, opts);
    const text = await resp.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (resp.status === 401) clearTokens();
    return { ok: resp.ok, status: resp.status, data };
  } catch (err) {
    console.error('apiFetchAsJson error', err);
    return { ok: false, status: 0, data: null };
  }
}
