// static/js/login.js (module)
import { saveTokens, getAccessToken, clearTokens } from './utils.js';

const LOGIN_URL = '/api/accounts/token/';
const PROFILE_URL = '/api/accounts/profile/';
const REGISTER_URL='/api/accounts/register/';
const REFRESH_URL='api/accounts/token/refresh';

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



// list candidate & recruiter dashboard path variants to try (adjust if you use other mount)
const DASH_PATHS = {
  recruiter: [
    '/resumes/recruiter-dashboard/',
    '/resumes/recruiter_dashboard/',
    '/accounts/recruiter-dashboard/',
    '/accounts/recruiter_dashboard/',
    '/recruiter-dashboard/',
    '/recruiter_dashboard/'
  ],
  candidate: [
    '/resumes/candidate-dashboard/',
    '/resumes/candidate_dashboard/',
    '/accounts/candidate-dashboard/',
    '/accounts/candidate_dashboard/',
    '/candidate-dashboard/',
    '/candidate_dashboard/'
  ]
};

// tries each URL (HEAD) and returns first that returns 200 or 204 (exists)
async function findValidUrl(list) {
  for (const p of list) {
    try {
      const r = await fetch(p, { method: 'HEAD' });
      if (r.ok) return p;
      // if server returns 405 for HEAD, try GET quickly
      if (r.status === 405) {
        const r2 = await fetch(p, { method: 'GET', headers: { 'Accept': 'text/html' }});
        if (r2.ok) return p;
      }
    } catch (e) {
      // network error, try next
      console.debug('probe fail', p, e);
    }
  }
  return null;
}

async function routeByRoleSmart(role) {
  const list = role === 'recruiter' ? DASH_PATHS.recruiter : DASH_PATHS.candidate;
  const okPath = await findValidUrl(list);
  if (okPath) {
    window.location.href = okPath;
    return;
  }
  // fallback: try simpler known path or show message
  console.warn('No dashboard path found for role:', role);
  alert('Dashboard not found (check server URLs). Opening home.');
  window.location.href = '/';
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
      routeByRoleSmart(profile.role || profile.profile.role);
    } else {
      msg.innerText = 'Could not fetch profile';
      clearTokens();
    }
  });
});