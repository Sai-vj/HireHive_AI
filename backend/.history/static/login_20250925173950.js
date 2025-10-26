// static/login.js — cookie-based login flow

const LOGIN_URL    = '/accounts/token/cookie/';
const PROFILE_URL  = '/accounts/profile-api/';
const REFRESH_URL  = '/accounts/token/refresh/cookie/';

function getRoleFromProfile(profile) {
  if (!profile) return null;
  if (profile.role) return profile.role;
  if (profile.profile && profile.profile.role) return profile.profile.role;
  if (profile.user && profile.user.role) return profile.user.role;
  return null;
}

async function attemptLogin(username, password) {
  try {
    const res = await fetch(LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      credentials: 'include', // send/receive cookies
      body: JSON.stringify({ username, password })
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, status: res.status, detail: body?.detail || 'Login failed' };
    }
    return { ok: true, data: body };
  } catch (err) {
    return { ok: false, status: 0, detail: 'Network error' };
  }
}

async function fetchProfile() {
  try {
    const res = await fetch(PROFILE_URL, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      credentials: 'include'
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

function showMessage(el, text, type = 'danger') {
  const container = document.getElementById('msg');
  if (!container) return;
  container.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">
    ${text}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  </div>`;
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const msg = document.getElementById('msg');
  const loginBtn = document.getElementById('loginBtn');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (loginBtn) loginBtn.disabled = true;
    msg.innerText = '';

    const username = (document.getElementById('username')?.value || '').trim();
    const password = document.getElementById('password')?.value || '';

    if (!username || !password) {
      showMessage(msg, 'Please enter both username and password.', 'warning');
      if (loginBtn) loginBtn.disabled = false;
      return;
    }

    // try login
    const result = await attemptLogin(username, password);
    if (!result.ok) {
      showMessage(msg, result.detail || 'Login failed', 'danger');
      if (loginBtn) loginBtn.disabled = false;
      return;
    }

    // fetch profile to confirm
    let profile = await fetchProfile();
    let role = getRoleFromProfile(profile);

    if (!role) {
      await new Promise(r => setTimeout(r, 300));
      profile = await fetchProfile();
      role = getRoleFromProfile(profile);
    }

    if (role) {
      // success → go home, navbar-auth.js will inject dashboard
      window.location.href = '/';
      return;
    }

    showMessage(msg, 'Login succeeded but profile not available', 'warning');
    if (loginBtn) loginBtn.disabled = false;
  });
});

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('togglePwd');
  const pwd = document.getElementById('password');
  const msg = document.getElementById('msg');

  if (toggle && pwd) {
    toggle.addEventListener('click', () => {
      const isPwd = pwd.type === 'password';
      pwd.type = isPwd ? 'text' : 'password';
      toggle.innerText = isPwd ? 'Hide' : 'Show';
      toggle.setAttribute('aria-pressed', String(!isPwd));
    });
  }

  // ✅ Password strength check
  pwd.addEventListener('input', () => {
    const value = pwd.value;
    let strength = 'Weak';
    let color = 'red';

    // Condition check
    const hasLower = /[a-z]/.test(value);
    const hasUpper = /[A-Z]/.test(value);
    const hasNumber = /[0-9]/.test(value);
    const hasSpecial = /[^A-Za-z0-9]/.test(value);
    const isLong = value.length >= 8;

    if (hasLower && hasUpper && hasNumber && hasSpecial && isLong) {
      strength = 'Strong';
      color = 'green';
    } else if ((hasLower || hasUpper) && hasNumber && isLong) {
      strength = 'Medium';
      color = 'orange';
    }

    msg.innerHTML = `<span style="color:${color};font-weight:600">${strength} password</span>`;
  });
});

