// utils.js (global helpers — don't use `export`)
// Provides: saveTokens, clearTokens, getAccessToken, getRefreshToken,
//           isTokenExpired, refreshAccessToken, fetchWithAuth, apiFetchAsJson

(function(window, document){
  'use strict';

  function saveTokensLocal({ access, refresh }) {
    if (access) localStorage.setItem('access_token', access);
    if (refresh) localStorage.setItem('refresh_token', refresh);
    if (access) localStorage.setItem('token', access);
    localStorage.setItem('token_saved_at', Date.now().toString());
  }

  function clearTokensLocal() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('token');
    localStorage.removeItem('token_saved_at');
  }

  function getAccessTokenLocal() {
    return (localStorage.getItem('access_token') || localStorage.getItem('token') || '').trim();
  }

  function getRefreshTokenLocal() {
    return (localStorage.getItem('refresh_token') || '').trim();
  }

  function parseJwt(token) {
    try {
      const payload = token.split('.')[1];
      const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      return json;
    } catch (e) {
      return null;
    }
  }

  function isTokenExpiredLocal(token, bufferSeconds) {
    bufferSeconds = bufferSeconds || 30;
    if (!token) return true;
    const p = parseJwt(token);
    if (!p || !p.exp) return true;
    const now = Math.floor(Date.now() / 1000);
    return (p.exp <= (now + bufferSeconds));
  }

  async function refreshAccessTokenLocal() {
    const refresh = getRefreshTokenLocal();
    if (!refresh) return null;

    const refreshUrls = [
      '/accounts/api/token/refresh/',
      '/api/token/refresh/',
      '/accounts/token/refresh/',
    ];

    for (const url of refreshUrls) {
      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ refresh })
        });

        if (resp.status === 404 || resp.status === 405) continue;

        const bodyText = await resp.text().catch(()=>null);
        let data = null;
        try { data = bodyText ? JSON.parse(bodyText) : null; } catch(e) { data = bodyText; }

        if (resp.ok && data) {
          const newAccess = data.access || data.token || data.access_token || null;
          const newRefresh = data.refresh || data.refresh_token || refresh;
          if (newAccess) {
            saveTokensLocal({ access: newAccess, refresh: newRefresh });
            return newAccess;
          }
        } else {
          continue;
        }
      } catch (err) {
        console.warn('refreshAccessToken try failed for url', url, err);
        continue;
      }
    }

    clearTokensLocal();
    return null;
  }

  async function fetchWithAuthLocal(input, init) {
    let opts = { ...(init || {}) };
    opts.headers = { ...(opts.headers || {}) };

    const skipAuth = !!opts.skipAuth;
    if (opts.skipAuth) delete opts.skipAuth;

    let token = getAccessTokenLocal();
    if (!token && typeof document !== 'undefined') {
      const tokenEl = document.getElementById('tokenInput');
      if (tokenEl && tokenEl.value) token = tokenEl.value.trim();
    }

    if (!skipAuth && token) {
      const isJwt = token.split('.').length === 3;
      opts.headers['Authorization'] = (isJwt ? 'Bearer ' : 'Token ') + token;
    }

    if (!opts.headers['Accept']) opts.headers['Accept'] = 'application/json';

    let resp;
    try {
      resp = await fetch(input, opts);
    } catch (err) {
      throw err;
    }

    if (resp.status === 401) {
      const newAccess = await refreshAccessTokenLocal();
      if (newAccess) {
        const isJwtNew = newAccess.split('.').length === 3;
        opts.headers['Authorization'] = (isJwtNew ? 'Bearer ' : 'Token ') + newAccess;
        resp = await fetch(input, opts);
      } else {
        clearTokensLocal();
      }
    }

    return resp;
  }

  async function apiFetchAsJsonLocal(path, opts) {
    try {
      const resp = await fetchWithAuthLocal(path, opts);
      const ct = resp.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        try {
          const data = await resp.json();
          if (resp.status === 401) clearTokensLocal();
          return { ok: resp.ok, status: resp.status, data };
        } catch (e) {
          const text = await resp.text().catch(()=>null);
          return { ok: resp.ok, status: resp.status, data: text };
        }
      } else {
        const text = await resp.text().catch(()=>null);
        if (resp.status === 401) clearTokensLocal();
        return { ok: resp.ok, status: resp.status, data: text };
      }
    } catch (err) {
      console.error('apiFetchAsJson error', err);
      return { ok: false, status: 0, data: null };
    }
  }

  // attach to window
  window.saveTokens = saveTokensLocal;
  window.clearTokens = clearTokensLocal;
  window.getAccessToken = getAccessTokenLocal;
  window.getRefreshToken = getRefreshTokenLocal;
  window.isTokenExpired = isTokenExpiredLocal;
  window.refreshAccessToken = refreshAccessTokenLocal;
  window.fetchWithAuth = fetchWithAuthLocal;
  window.apiFetchAsJson = apiFetchAsJsonLocal;

})(window, document);
