// static/login.js — cookie-based login flow (fixed)

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
      credentials: 'include',
      body: JSON.stringify({ username, password })
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, status: res.status, detail: body?.detail || 'Login failed' };
    }
    return { ok: true, data: body };
  } catch {
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

function showMessage(text, type = 'danger') {
  const container = document.getElementById('msg');
  if (!container) return;
  container.innerHTML = `<div class="alert alert-${type} alert-dismissible fade show" role="alert">
    ${text}
    <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
  </div>`;
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const loginBtn = document.getElementById('loginBtn');

  const pwd = document.getElementById('password');
  const toggle = document.getElementById('togglePwd');
  const pwdMsg = document.getElementById('pwdMessage');


// ----- Show/Hide password with emoji icon -----

if (toggle && pwd) {
  toggle.addEventListener('click', (e) => {
    e.preventDefault();
    
    const isPwd = pwd.type === 'password';
    pwd.type = isPwd ? 'text' : 'password';

    // 👁️ = show, 🙈 = hide
    toggle.textContent = isPwd ? '🙈' : '👁️';
  });
}





  // ----- Strength message (below input) -----
  if (pwd && pwdMsg) {
    const setStrength = (value) => {
      if (!value) { pwdMsg.textContent = ''; pwdMsg.dataset.level = ''; return; }
      const hasLower = /[a-z]/.test(value);
      const hasUpper = /[A-Z]/.test(value);
      const hasNumber = /[0-9]/.test(value);
      const hasSpecial = /[^A-Za-z0-9]/.test(value);
      const isLong = value.length >= 8;

      let level = 'weak';
      let text = 'Weak — use 8+ chars, upper/lower, digit & symbol';

      if ((hasLower || hasUpper) && hasNumber && isLong) {
        level = 'medium';
        text = 'Medium — add symbol & Uppercase for better security';
      }
      if (hasLower && hasUpper && hasNumber && hasSpecial && isLong) {
        level = 'strong';
        text = 'Strong password ✓';
      }

      pwdMsg.textContent = text;
      pwdMsg.dataset.level = level; // style via CSS if needed
    };

    pwd.addEventListener('input', () => setStrength(pwd.value));
  }

  // ----- Login submit -----
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (loginBtn) loginBtn.disabled = true;
    showMessage('', 'light'); // clear

    const username = (document.getElementById('username')?.value || '').trim();
    const password = pwd?.value || '';

    if (!username || !password) {
      showMessage('Please enter both username and password.', 'warning');
      if (loginBtn) loginBtn.disabled = false;
      return;
    }

    const result = await attemptLogin(username, password);
    if (!result.ok) {
      showMessage(result.detail || 'Login failed', 'danger');
      if (loginBtn) loginBtn.disabled = false;
      return;
    }

    // fetch profile to confirm role
    let profile = await fetchProfile();
    let role = getRoleFromProfile(profile);
    if (!role) {
      await new Promise(r => setTimeout(r, 300));
      profile = await fetchProfile();
      role = getRoleFromProfile(profile);
    }

    if (role) {
      window.location.href = '/';
      return;
    }

    showMessage('Login succeeded but profile not available', 'warning');
    if (loginBtn) loginBtn.disabled = false;
  });
});
