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
    // atob expects padded base64
    const json = JSON.parse(decodeURIComponent(escape(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))));
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

/*
  refreshAccessToken:
    - Calls refresh endpoint directly (no wrapper) to avoid recursion
    - IMPORTANT: endpoint path used here is based on your accounts/urls.py:
        /accounts/api/token/refresh/
*/
export async function refreshAccessToken() {
  const refresh = getRefreshToken();
  if (!refresh) return null;

  try {
    const resp = await fetch('/accounts/api/token/refresh/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ refresh })
    });

    // parse JSON safely
    let data = null;
    try { data = await resp.json(); } catch(e) { data = null; }

    if (resp.ok && data && data.access) {
      // some servers return a new refresh token too; preserve it if present
      saveTokens({ access: data.access, refresh: data.refresh || refresh });
      return data.access;
    } else {
      // refresh failed -> clear tokens
      clearTokens();
      return null;
    }
  } catch (err) {
    console.error('refreshAccessToken error', err);
    return null;
  }
}

/*
  fetchWithAuth(url, opts)
    - automatically injects Authorization header with access_token
    - if token expired, tries refresh once and retries
    - returns the raw fetch Response (so callers can do await res.json())
*/
export async function fetchWithAuth(input, init = {}) {
  // clone init so we don't mutate caller's object
  let opts = Object.assign({}, init);
  opts.headers = Object.assign({}, opts.headers || {});

  let access = getAccessToken();

  // if token missing or expired, try refresh first
  if (!access || isTokenExpired(access, 30)) {
    access = await refreshAccessToken();
  }

  if (access) {
    opts.headers['Authorization'] = 'Bearer ' + access;
  }

  // perform request
  let resp = await fetch(input, opts);

  // if 401, maybe token expired on server -> try refresh once and retry
  if (resp.status === 401) {
    const newAccess = await refreshAccessToken();
    if (newAccess) {
      opts.headers['Authorization'] = 'Bearer ' + newAccess;
      resp = await fetch(input, opts);
    } else {
      // refresh failed -> ensure tokens cleared
      clearTokens();
    }
  }

  return resp;
}

/* small helper: convenience wrapper returning parsed JSON + ok/status like your previous apiFetch */
export async function apiFetchAsJson(path, opts = {}) {
  try {
    const resp = await fetchWithAuth(path, opts);
    const text = await resp.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (resp.status === 401) {
      clearTokens();
    }
    return { ok: resp.ok, status: resp.status, data };
  } catch (err) {
    console.error('apiFetchAsJson error', err);
    return { ok: false, status: 0, data: null };
  }
}