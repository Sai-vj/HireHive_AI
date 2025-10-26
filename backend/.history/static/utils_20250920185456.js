// utils.js (replace your existing file with this)
// Provides: saveTokens, clearTokens, getAccessToken, getRefreshToken,
//           isTokenExpired, refreshAccessToken, fetchWithAuth, apiFetchAsJson

export function saveTokens({ access, refresh }) {
  if (access) localStorage.setItem('access_token', access);
  if (refresh) localStorage.setItem('refresh_token', refresh);
  // also keep legacy single-token key for backward compatibility with dashboard UI
  if (access) localStorage.setItem('token', access);
  localStorage.setItem('token_saved_at', Date.now().toString());
}

export function clearTokens() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('token');
  localStorage.removeItem('token_saved_at');
}

export function getAccessToken() {
  // prefer explicit access_token, then legacy 'token'
  return (localStorage.getItem('access_token') || localStorage.getItem('token') || '').trim();
}

export function getRefreshToken() {
  return (localStorage.getItem('refresh_token') || '').trim();
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

/**
 * Try to refresh access token.
 * NOTE: your backend refresh URL may differ. This tries common path and fails gracefully.
 */
export async function refreshAccessToken() {
  const refresh = getRefreshToken();
  if (!refresh) return null;

  const refreshUrls = [
    '/accounts/api/token/refresh/', // common JWT refresh (djangorestframework-simplejwt)
    '/api/token/refresh/',          // alternate
    '/accounts/token/refresh/',     // alternate
  ];

  for (const url of refreshUrls) {
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ refresh })
      });
      // if endpoint not found, try next
      if (resp.status === 404 || resp.status === 405) continue;

      const ct = resp.headers.get('content-type') || '';
      const bodyText = await resp.text().catch(()=>null);
      let data = null;
      try { data = bodyText ? JSON.parse(bodyText) : null; } catch(e) { data = bodyText; }

      if (resp.ok && data) {
        // common response shapes: { access: '...', refresh: '...'} or { token: '...' }
        const newAccess = data.access || data.token || data.access_token || null;
        const newRefresh = data.refresh || data.refresh_token || refresh;
        if (newAccess) {
          saveTokens({ access: newAccess, refresh: newRefresh });
          return newAccess;
        }
      } else {
        // non-ok -> treat as failure for this endpoint and return null
        // but continue loop if other refresh endpoints exist
        continue;
      }
    } catch (err) {
      // network error -> continue trying other urls or return null at end
      console.warn('refreshAccessToken try failed for url', url, err);
      continue;
    }
  }

  // if we reach here, no refresh succeeded
  clearTokens();
  return null;
}

/**
 * fetchWithAuth:
 * - uses access token if available (from getAccessToken())
 * - if token looks like a JWT (three parts separated by '.'), uses 'Bearer '
 * - otherwise uses 'Token ' (DRF token)
 * - tries refresh once on 401
 * - preserves any headers passed in init
 */
export async function fetchWithAuth(input, init = {}) {
  let opts = { ...(init || {}) };
  opts.headers = { ...(opts.headers || {}) };

  // allow callers to pass `skipAuth: true` on opts to bypass auth header
  const skipAuth = !!opts.skipAuth;
  if (opts.skipAuth) delete opts.skipAuth;

  // Get token from storage OR fallback to a DOM input with id 'tokenInput' if present
  let token = getAccessToken();
  if (!token) {
    const tokenEl = (typeof document !== 'undefined') ? document.getElementById('tokenInput') : null;
    if (tokenEl && tokenEl.value) token = tokenEl.value.trim();
  }

  // attach header if token available
  if (!skipAuth && token) {
    const isJwt = token.split('.').length === 3;
    opts.headers['Authorization'] = (isJwt ? 'Bearer ' : 'Token ') + token;
  }

  // ensure Accept header exists
  if (!opts.headers['Accept']) opts.headers['Accept'] = 'application/json';
  // --- auto-handle common body types so callers can pass plain objects ---
  // If caller passed a plain object (not FormData / URLSearchParams), stringify to JSON
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData) && !(opts.body instanceof URLSearchParams)) {
    opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/json';
    try { opts.body = JSON.stringify(opts.body); } catch(e) { /* leave as-is if stringify fails */ }
  } else if (opts.body instanceof URLSearchParams) {
    // URLSearchParams -> form urlencoded
    opts.headers['Content-Type'] = opts.headers['Content-Type'] || 'application/x-www-form-urlencoded';
    opts.body = opts.body.toString();
  }

  // perform fetch
  let resp;
  try {
    resp = await fetch(input, opts);
  } catch (err) {
    // network error
    throw err;
  }

  // on 401: try refresh once (but only if we had a JWT-like token or a refresh token)
  if (resp.status === 401) {
    // attempt refresh (if refresh token exists)
    const newAccess = await refreshAccessToken();
    if (newAccess) {
      const isJwtNew = newAccess.split('.').length === 3;
      opts.headers['Authorization'] = (isJwtNew ? 'Bearer ' : 'Token ') + newAccess;
      resp = await fetch(input, opts);
    } else {
      // clear tokens and return original resp (401)
      clearTokens();
    }
  }

  return resp;
}

/**
 * apiFetchAsJson:
 * - wrapper around fetchWithAuth that safely returns parsed JSON if content-type indicates JSON,
 *   otherwise returns text.
 * - normalized return: { ok: boolean, status: number, data: any }
 */
export async function apiFetchAsJson(path, opts = {}) {
  try {
    // allow absolute or relative path
    const resp = await fetchWithAuth(path, opts);

    const ct = resp.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try {
        const data = await resp.json();
        if (resp.status === 401) clearTokens();
        return { ok: resp.ok, status: resp.status, data };
      } catch (e) {
        // invalid json
        const text = await resp.text().catch(()=>null);
        return { ok: resp.ok, status: resp.status, data: text };
      }
    } else {
      // non-json, return text to avoid JSON.parse('<html>')
      const text = await resp.text().catch(()=>null);
      if (resp.status === 401) clearTokens();
      return { ok: resp.ok, status: resp.status, data: text };
    }
  } catch (err) {
    console.error('apiFetchAsJson error', err);
    return { ok: false, status: 0, data: null };
  }
}
