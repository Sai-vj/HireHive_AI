// utils.js
// Provides: saveTokens, clearTokens, getAccessToken, getRefreshToken,
//           isTokenExpired, refreshAccessToken, fetchWithAuth, apiFetchAsJson



// simple helpers used across auth pages
window.hh = window.hh || {};

hh.showToast = function(msg) {
  // tiny toast fallback
  alert(msg);
};

hh.getCsrf = function() {
  const el = document.querySelector('input[name="csrfmiddlewaretoken"]');
  return el ? el.value : '';
};


export function saveTokens({ access, refresh }) {
  if (access) localStorage.setItem('access_token', access);
  if (refresh) localStorage.setItem('refresh_token', refresh);
  if (access) localStorage.setItem('token', access); // legacy
  localStorage.setItem('token_saved_at', Date.now().toString());
}

export function clearTokens() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('token');
  localStorage.removeItem('token_saved_at');
}

export function getAccessToken() {
  return (localStorage.getItem('access_token') || localStorage.getItem('token') || '').trim();
}

export function getRefreshToken() {
  return (localStorage.getItem('refresh_token') || '').trim();
}

// robust base64 decode for JWT payload
function base64UrlDecode(input) {
  try {
    // Replace URL-safe chars and add padding
    let s = input.replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4;
    if (pad === 2) s += '==';
    else if (pad === 3) s += '=';
    else if (pad === 1) return null;
    return atob(s);
  } catch (e) {
    return null;
  }
}

function parseJwt(token) {
  try {
    if (!token || token.split('.').length < 2) return null;
    const payload = token.split('.')[1];
    const jsonStr = base64UrlDecode(payload);
    if (!jsonStr) return null;
    return JSON.parse(jsonStr);
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

/**
 * Try to refresh access token.
 * Tries a few common refresh endpoints under (window.API_ROOT || '/').
 */
export async function refreshAccessToken() {
  const refresh = getRefreshToken();
  if (!refresh) return null;

  const root = (typeof window !== 'undefined' && window.API_ROOT) ? window.API_ROOT.replace(/\/$/, '') : '';
  const refreshUrls = [
    `${root}/accounts/api/token/refresh/`,
    `${root}/api/token/refresh/`,
    `${root}/accounts/token/refresh/`,
    `${root}/auth/token/refresh/`
  ];

  for (const url of refreshUrls) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ refresh })
      });

      if (resp.status === 404 || resp.status === 405) continue;

      const ct = resp.headers.get('content-type') || '';
      let data = null;
      if (ct.includes('application/json')) {
        data = await resp.json().catch(()=>null);
      } else {
        const text = await resp.text().catch(()=>null);
        try { data = text ? JSON.parse(text) : null; } catch(e){ data = null; }
      }

      if (resp.ok && data) {
        const newAccess = data.access || data.token || data.access_token || null;
        const newRefresh = data.refresh || data.refresh_token || refresh;
        if (newAccess) {
          saveTokens({ access: newAccess, refresh: newRefresh });
          return newAccess;
        }
      } else {
        // continue to next endpoint
        continue;
      }
    } catch (err) {
      console.warn('refreshAccessToken try failed for url', url, err);
      continue;
    }
  }

  clearTokens();
  return null;
}

/**
 * fetchWithAuth:
 * - uses access token if available (from getAccessToken())
 * - if token looks like a JWT (three parts separated by '.'), uses 'Bearer '
 * - otherwise uses 'Token '
 * - tries refresh once on 401
 * - preserves any headers passed in init
 */
export async function fetchWithAuth(input, init = {}) {
  let opts = { ...(init || {}) };
  opts.headers = { ...(opts.headers || {}) };

  const skipAuth = !!opts.skipAuth;
  if (opts.skipAuth) delete opts.skipAuth;

  let token = getAccessToken();
  if (!token && typeof document !== 'undefined') {
    const tokenEl = document.getElementById('tokenInput');
    if (tokenEl && tokenEl.value) token = tokenEl.value.trim();
  }

  if (!skipAuth && token) {
    const isJwt = (token.split('.').length === 3);
    opts.headers['Authorization'] = (isJwt ? 'Bearer ' : 'Token ') + token;
  }

  if (!opts.headers['Accept']) opts.headers['Accept'] = 'application/json';

  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData) && !(opts.body instanceof URLSearchParams)) {
    opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
    try { opts.body = JSON.stringify(opts.body); } catch(e) {}
  } else if (opts.body instanceof URLSearchParams) {
    opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/x-www-form-urlencoded';
    opts.body = opts.body.toString();
  }

  let resp;
  try {
    resp = await fetch(input, opts);
  } catch (err) {
    throw err;
  }

  if (resp.status === 401) {
    const newAccess = await refreshAccessToken();
    if (newAccess) {
      const isJwtNew = (newAccess.split('.').length === 3);
      opts.headers['Authorization'] = (isJwtNew ? 'Bearer ' : 'Token ') + newAccess;
      resp = await fetch(input, opts);
    } else {
      clearTokens();
    }
  }

  return resp;
}

/**
 * apiFetchAsJson:
 * - wrapper around fetchWithAuth that returns { ok, status, data }
 */
export async function apiFetchAsJson(path, opts = {}) {
  try {
    const resp = await fetchWithAuth(path, opts);
    const ct = resp.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try {
        const data = await resp.json();
        if (resp.status === 401) clearTokens();
        return { ok: resp.ok, status: resp.status, data };
      } catch (e) {
        const text = await resp.text().catch(()=>null);
        return { ok: resp.ok, status: resp.status, data: text };
      }
    } else {
      const text = await resp.text().catch(()=>null);
      if (resp.status === 401) clearTokens();
      return { ok: resp.ok, status: resp.status, data: text };
    }
  } catch (err) {
    console.error('apiFetchAsJson error', err);
    return { ok: false, status: 0, data: null };
  }
}
