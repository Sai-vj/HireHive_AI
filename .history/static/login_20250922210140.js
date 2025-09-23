// static/login.js (patched)
// Expects utils.js to attach saveTokens/clearTokens to window (optional).

// fallback utils
const saveTokens = window.saveTokens || function(){};
const clearTokens = window.clearTokens || function(){};

// endpoints (keep as your server expects)
const LOGIN_URL    = '/accounts/token/cookie/';
const PROFILE_URL  = '/accounts/profile-jd/';
const REFRESH_URL  = '/accounts/token/refresh/cookie/';

function routeByRole(role) {
  const r = (role || '').toString().toLowerCase();
  if (r === 'recruiter') {
    window.location.href = '/accounts/recruiter-dashboard/';
  } else {
    window.location.href = '/accounts/candidate-dashboard/';
  }
}

function getRoleFromProfile(profile) {
  // support multiple shapes: { role }, { profile: { role } }, { user: { role } }, etc.
  if (!profile) return null;
  if (profile.role) return profile.role;
  if (profile.profile && profile.profile.role) return profile.profile.role;
  if (profile.user && profile.user.role) return profile.user.role;
  // last-ditch: search shallow for any "role" prop
  for (const k of Object.keys(profile)) {
    if (k.toLowerCase() === 'role') return profile[k];
  }
  return null;
}

async function attemptLogin(username, password) {
  try {
    const res = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ username, password })
    });
    const body = await res.json().catch(()=>null);
    if (!res.ok) return { ok:false, status: res.status, detail: body?.detail || 'Login failed' };
    return { ok:true, status: res.status, data: body };
  } catch (err) {
    return { ok:false, status: 0, detail: 'Network error — please check connection' };
  }
}

async function fetchProfile() {
  try {
    const res = await fetch(PROFILE_URL, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'same-origin'
    });
    if (!res.ok) return null;
    return await res.json().catch(()=>null);
  } catch (err) {
    return null;
  }
}

function ensureMsgContainer(form) {
  if (!form) {
    // fallback: create top-level container
    let wrapper = document.getElementById('msg-wrap');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.id = 'msg-wrap';
      wrapper.style.margin = '0.8rem';
      document.body.insertBefore(wrapper, document.body.firstChild);
    }
    return wrapper;
  }
  let d = document.getElementById('msg');
  if (!d) {
    d = document.createElement('div');
    d.id = 'msg';
    // insert at top of form
    form.insertBefore(d, form.firstChild);
  }
  return d;
}

function showMessage(el, text, type='danger') {
  // el can be container or element
  const container = (el && el instanceof HTMLElement) ? el : document.getElementById('msg');
  if (!container) return;
  container.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">
    ${text}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  </div>`;
  // focus to message for a11y
  const firstAlert = container.querySelector('.alert');
  if (firstAlert) firstAlert.setAttribute('tabindex', '-1'), firstAlert.focus();
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const msg = ensureMsgContainer(form);
  const loginBtn = document.getElementById('loginBtn') || form && form.querySelector('button[type="submit"]');

  if (!form) {
    // nothing to do
    console.warn('login.js: #loginForm not found');
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (loginBtn) loginBtn.disabled = true;
    msg.innerText = '';

    const usernameEl = document.getElementById('username') || form.querySelector('input[name="username"]');
    const passwordEl = document.getElementById('password') || form.querySelector('input[name="password"]');
    const username = (usernameEl && (usernameEl.value || '').trim()) || '';
    const password = (passwordEl && passwordEl.value) || '';

    if (!username || !password) {
      showMessage(msg, 'Please enter both username and password.', 'warning');
      if (loginBtn) loginBtn.disabled = false;
      return;
    }

    // attempt login
    const result = await attemptLogin(username, password);
    if (!result.ok) {
      showMessage(msg, result.detail || `Error ${result.status}`, 'danger');
      if (loginBtn) loginBtn.disabled = false;
      return;
    }

    // optional: if your login returns tokens in body and you want to save them
    try {
      if (result.data && (result.data.access || result.data.refresh)) {
        try { saveTokens(result.data); } catch(e){}
      }
    } catch(e){ /* ignore */ }

    // fetch profile (may be set via cookie on server)
    let profile = await fetchProfile();
    let role = getRoleFromProfile(profile);

    if (!role) {
      // wait briefly and try again (some servers set cookie after redirect)
      await new Promise(r => setTimeout(r, 300));
      profile = await fetchProfile();
      role = getRoleFromProfile(profile);
    }

    if (role) {
      try { clearTokens(); } catch(e){}
      routeByRole(role);
      return;
    }

    // failure
    showMessage(msg, 'Could not fetch profile. Make sure cookies are enabled and server sets cookie.', 'danger');
    if (loginBtn) loginBtn.disabled = false;
  });
});

function updateNavbarUI(isLoggedIn) {
  // Prefer selecting by data attributes or IDs if possible; fallback to href match.
  let loginLink = document.querySelector('a[href*="/accounts/login/"]') || document.querySelector('a[href*="login"]');
  let registerLink = document.querySelector('a[href*="/accounts/register/"]') || document.querySelector('a[href*="register"]');

  if (isLoggedIn) {
    if (loginLink) {
      loginLink.innerText = 'Logout';
      loginLink.href = '/accounts/token/logout/';
      loginLink.setAttribute('role', 'button');
    }
    if (registerLink) {
      registerLink.remove();
    }
  } else {
    if (loginLink) {
      loginLink.innerText = 'Login';
      loginLink.href = '/accounts/login/';
    }
  }
}
