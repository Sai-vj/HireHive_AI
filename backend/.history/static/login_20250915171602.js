// static/js/login.js (module)
import { saveTokens, clearTokens } from './utils.js';

const LOGIN_URL    = '/api/accounts/token/';
const PROFILE_URL  = '/api/accounts/profile/';
const REGISTER_URL = '/api/accounts/register/';
const REFRESH_URL  = '/api/accounts/token/refresh/';

// Role based dashboard paths
const DASH_PATHS = {
  recruiter: [
    '/apresumes/dashboard/recruiter/',
  ],
  candidate: [
    '/resumes/dashboard/candidate/',
  ]
};

async function attemptLogin(username, password) {
  const res = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || !body.access) {
    return { ok: false, status: res.status, detail: body?.detail || 'Login failed' };
  }
  return { ok: true, access: body.access, refresh: body.refresh };
}

async function fetchProfile(token) {
  const res = await fetch(PROFILE_URL, {
    headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' }
  });
  if (!res.ok) return null;
  return await res.json().catch(() => null);
}

async function routeByRole(role) {
  const list = role === 'recruiter' ? DASH_PATHS.recruiter : DASH_PATHS.candidate;
  window.location.href = list[0];  // direct redirect
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const msg = document.getElementById('msg');
  const loginBtn = document.getElementById('loginBtn');

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

    // Save tokens
    saveTokens({ access: result.access, refresh: result.refresh });

    // Fetch profile
    const profile = await fetchProfile(result.access);
    if (profile && (profile.role || profile.profile?.role)) {
      routeByRole(profile.role || profile.profile.role);
    } else {
      msg.innerText = 'Could not fetch profile';
      clearTokens();
    }
  });
});