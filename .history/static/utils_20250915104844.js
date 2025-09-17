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

export function getAccessToken() {
  return localStorage.getItem('access_token');
}
export function getRefreshToken() {
  return localStorage.getItem('refresh_token');
}

// tiny JWT decode (no lib)
function parseJwt(token) {
  try {
    const payload = token.split('.')[1];
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch(e) { return null; }
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
    const r = await Afetch('/api/token/refresh/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ refresh })
    });
    const data = await r.json();
    if (r.ok && data.access) {
      saveTokens({ access: data.access, refresh: data.refresh || refresh });
      return data.access;
    } else {
      // refresh failed
      clearTokens();
      return null;
    }
  } catch (e) {
    console.error('refresh error', e);
    return null;
  }
}

