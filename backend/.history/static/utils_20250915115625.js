// utils.js
export function saveTokens({ access, refresh }) {
  if (access) localStorage.setItem('access_token', access);
  if (refresh) localStorage.setItem('refresh_token', refresh);
  localStorage.setItem('token_saved_at', Date.now());
}

export function clearTokens() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('token_saved_at');
}

export function getAccessToken() { return localStorage.getItem('access_token'); }
export function getRefreshToken() { return localStorage.getItem('refresh_token'); }

// small jwt decode to check exp (client-side)
function parseJwt(t) {
  try {
    const p = t.split('.')[1];
    return JSON.parse(atob(p.replace(/-/g,'+').replace(/_/g,'/')));
  } catch(e){ return null; }
}
export function isTokenExpired(token, bufferSeconds=30) {
  if (!token) return true;
  const p = parseJwt(token);
  if (!p || !p.exp) return true;
  const now = Math.floor(Date.now()/1000);
  return (p.exp <= (now + bufferSeconds));
}

// refresh helper (calls your refresh endpoint)
export async function refreshAccessToken() {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  try {
    const res = await fetch('/api/accounts/token/refresh/', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Accept':'application/json' },
      body: JSON.stringify({ refresh })
    });
    const data = await res.json();
    if (res.ok && data.access) {
      saveTokens({ access: data.access, refresh: data.refresh || refresh });
      return data.access;
    }
    clearTokens();
    return null;
  } catch(e) {
    console.error('refreshAccessToken error', e);
    return null;
  }
}

// universal apiFetch that auto-refreshes if needed
export async function apiFetch(path, opts={}) {
  // ensure headers object exists
  opts.headers = opts.headers || {};
  opts.headers['Accept'] = 'application/json';

  // attach token (and attempt refresh if expired)
  let token = getAccessToken();
  if (isTokenExpired(token)) {
    token = await refreshAccessToken();
  }
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;

  // stringify body automatically for json objects
  if (opts.body && !(opts.body instanceof FormData) && typeof opts.body === 'object') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }

  const res = await fetch(path, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch(e){ data = text; }
  return { ok: res.ok, status: res.status, data };
}