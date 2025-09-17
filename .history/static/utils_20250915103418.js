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

