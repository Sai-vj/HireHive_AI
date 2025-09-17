// /static/js/utils.js (ES module)

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

// small safe base64 -> JSON decode for JWT payload
function base64UrlDecode(str) {
  try {
    // replace URL-safe chars and pad with '='
    let s = str.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    // atob returns binary string; try decodeURIComponent trick for unicode
    const decoded = atob(s);
    try {
      // attempt to parse directly
      return decodeURIComponent(
        Array.prototype.map.call(decoded, c =>
          '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
        ).join('')
      );
    } catch (e) {
      return decoded;
    }
  } catch (e) {
    return null;
  }
}

function parseJwt(token) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payload = base64UrlDecode(parts[1]);
    if (!payload) return null;
    return JSON.parse(payload);
  } catch (e) {
    return null;
  }
}

export function isTokenExpired(token, bufferSeconds = 30) {
  if (!token) return true;
  const p = parseJwt(token);
  if (!p || !p.exp) return true;
  const now = Math.floor(Date.now() / 1000);
  return p.exp <= (now + bufferSeconds);
}

/*
  NOTE: refresh endpoint path must match your Django routes.
  In your accounts/urls.py you used: path('api/token/refresh/', ...)
  and that file is included under /accounts/, so final path used below is:
    /accounts/api/token/refresh/
  Change it if your URL structure differs.
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

    let data = null;
    try { data = await resp.json(); } catch (e) { data = null; }

    if (resp.ok && data && data.access) {
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
  // shallow clone
  let opts = Object.assign({}, init);
  opts.headers = Object.assign({}, opts.headers || {});

  let access = getAccessToken();

  // refresh if missing or expired
  if (!access || isTokenExpired(access, 30)) {
    access = await refreshAccessToken();
  }

  if (access) {
    opts.headers['Authorization'] = 'Bearer ' + access;
  }

  let resp = await fetch(input, opts);

  // if 401 try refresh once
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