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



// replace your existing routeByRoleSmart with this (keeps probe fallback but prefers exact resume dashboard paths)
async function routeByRoleSmart(role) {
  // first try the canonical paths we use in templates
  if(role=='recruiter'){
    window.location.href='/resumes/dashboard/recruiter/';
  }else{
    window.location.href='resumes/dashboard/candidate/';
  }


  // quick helper to test a path (HEAD then GET if needed)
  async function probe(path) {
    try {
      const r = await fetch(path, { method: 'HEAD' });
      if (r.ok) return true;
      if (r.status === 405) {
        const r2 = await fetch(path, { method: 'GET', headers: { 'Accept': 'text/html' }});
        return r2.ok;
      }
    } catch (e) {
      // ignore network probe errors
    }
    return false;
  }

  // try preferred list first (fast)
  for (const p of preferred) {
    if (await probe(p)) {
      window.location.href = p;
      return;
    }
  }

  // fallback: try broader lists (if you have DASH_PATHS defined)
  if (typeof DASH_PATHS !== 'undefined') {
    const list = role === 'recruiter' ? DASH_PATHS.recruiter : DASH_PATHS.candidate;
  
        window.location.href = list[0];
       
      }
  
  

  // final fallback: warn and go home
  console.warn('No dashboard path found for role:', role);
  alert('Dashboard not found (check server URLs). Opening home.');
  window.location.href = '/';

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