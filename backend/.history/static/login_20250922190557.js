// static/login.js (cookie-based login)
// NOTE: this uses cookie flow: backend must respond Set-Cookie and frontend uses credentials.
import { saveTokens, clearTokens } from './utils.js'; // keep import (optional) — not used in cookie flow

// Cookie-login endpoints
const LOGIN_URL    = '/accounts/token/cookie/';      // cookie-based login (sets HttpOnly cookies)
const PROFILE_URL  = '/api/accounts/profile-api/';      // profile endpoint (now uses cookie auth on server)
const REGISTER_URL = '/api/accounts/register/';
const REFRESH_URL  = '/accounts/token/refresh/cookie/'; // optional refresh endpoint (cookie-based)

// Role based dashboard paths (update if your path differs)
const DASH_PATHS = {
  recruiter: [
    '/recruiter-dashboard/',  // or your recruiter path
  ],
  candidate: [
    '/candidate-dashboard/',
  ]
};

// attempt cookie login: send credentials and allow browser to store Set-Cookie
async function attemptLogin(username, password) {
  const res = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    credentials: 'same-origin',     // IMPORTANT: let browser store Set-Cookie
    body: JSON.stringify({ username, password })
  });

  // backend returns {ok: true} on success (your view) — no tokens in body expected
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    return { ok: false, status: res.status, detail: body?.detail || 'Login failed' };
  }
  // success: cookie stored by browser
  return { ok: true, status: res.status, data: body };
}

// fetch profile using cookie auth (do not send Authorization header)
async function fetchProfile() {
  const res = await fetch(PROFILE_URL, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    credentials: 'same-origin'    // IMPORTANT: send cookie with request
  });
  if (!res.ok) return null;
  return await res.json().catch(() => null);
}

function routeByRole(role) {
  const list = role === 'recruiter' ? DASH_PATHS.recruiter : DASH_PATHS.candidate;
  // safe redirect: if you have multiple, choose first
  window.location.href = list[0];
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const msg = document.getElementById('msg');
  const loginBtn = document.getElementById('loginBtn');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.innerText = '';
    loginBtn.disabled = true;

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    const result = await attemptLogin(username, password);
    if (!result.ok) {
      msg.innerText = result.detail || `Error ${result.status}`;
      loginBtn.disabled = false;
      return;
    }

    // cookie stored by browser now — we can fetch profile using cookie auth
    const profile = await fetchProfile();
    if (profile && (profile.role || (profile.profile && profile.profile.role))) {
      // optional: clear local token stores if any leftover
      try { clearTokens(); } catch (e) { /* ignore */ }
      routeByRole(profile.role || profile.profile.role);
    } else {
      // sometimes profile endpoint might require a short delay after set-cookie;
      // fallback: reload once to let cookies take effect and backend auth kick in
      // (usually not needed, but safe)
      await new Promise(r => setTimeout(r, 300));
      const profile2 = await fetchProfile();
      if (profile2 && (profile2.role || (profile2.profile && profile2.profile.role))) {
        try { clearTokens(); } catch (e) { /* ignore */ }
        routeByRole(profile2.role || profile2.profile.role);
      } else {
        msg.innerText = 'Could not fetch profile. Make sure cookies are enabled and server sets cookie.';
        loginBtn.disabled = false;
      }
    }
  });
});
