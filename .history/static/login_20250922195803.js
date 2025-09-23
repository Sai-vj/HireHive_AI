// static/login.js (no imports — works as classic script, not a module)
// Expects utils.js to attach saveTokens/clearTokens to window (optional).

// ensure utils functions fallback
const saveTokens = window.saveTokens || function(){};
const clearTokens = window.clearTokens || function(){};

// Cookie-login endpoints
const LOGIN_URL    = '/accounts/token/cookie/';
const PROFILE_URL  = '/accounts/profile-api/';
const REFRESH_URL  = '/accounts/token/refresh/cookie/';

function routeByRole(role) {
  const DASH_PATHS = {
    recruiter: ['/accounts/recruiter-dashboard/'],
    candidate: ['/accounts/candidate-dashboard/']
  };
  const list = role === 'recruiter' ? DASH_PATHS.recruiter : DASH_PATHS.candidate;
  window.location.href = list[0];  // MUST start with leading slash
}

async function attemptLogin(username, password) {
  const res = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ username, password })
  });
  const body = await res.json().catch(()=>null);
  if (!res.ok) return { ok:false, status: res.status, detail: body?.detail || 'Login failed' };
  return { ok:true, status: res.status, data: body };
}

async function fetchProfile() {
  const res = await fetch(PROFILE_URL, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    credentials: 'same-origin'
  });
  if (!res.ok) return null;
  return await res.json().catch(()=>null);
}

function routeByRole(role){
  const list = role === 'recruiter' ? DASH_PATHS.recruiter : DASH_PATHS.candidate;
  window.location.href = list[0];
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const msg = document.getElementById('msg') || (function(){const d=document.createElement('div'); d.id='msg'; form?.insertBefore(d, form.firstChild); return d; })();
  const loginBtn = document.getElementById('loginBtn');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.innerText = '';
    if (loginBtn) loginBtn.disabled = true;

    const usernameEl = document.getElementById('username') || form.querySelector('input[name="username"]');
    const passwordEl = document.getElementById('password') || form.querySelector('input[name="password"]');
    const username = (usernameEl && usernameEl.value || '').trim();
    const password = (passwordEl && passwordEl.value) || '';

    const result = await attemptLogin(username, password);
    if (!result.ok) {
      msg.innerText = result.detail || `Error ${result.status}`;
      if (loginBtn) loginBtn.disabled = false;
      return;
    }

    const profile = await fetchProfile();
    if (profile && (profile.role || (profile.profile && profile.profile.role))) {
      try { clearTokens(); } catch(e){}
      routeByRole(profile.role || profile.profile.role);
    } else {
      await new Promise(r => setTimeout(r, 300));
      const profile2 = await fetchProfile();
      if (profile2 && (profile2.role || (profile2.profile && profile2.profile.role))) {
        try { clearTokens(); } catch(e){}
        routeByRole(profile2.role || profile2.profile.role);
      } else {
        msg.innerText = 'Could not fetch profile. Make sure cookies are enabled and server sets cookie.';
        if (loginBtn) loginBtn.disabled = false;
      }
    }
  });
});
