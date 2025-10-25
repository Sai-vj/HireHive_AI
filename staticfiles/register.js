// static/register.js — improved with toggle + strength + validation

const REGISTER_URL = '/api/accounts/register/';

// Small helper
function showMsg(text, type = 'muted', timeout = 4000) {
  const el = document.getElementById('msg');
  if (!el) return;
  el.className = 'small text-' + (type === 'error' ? 'danger' : (type === 'success' ? 'success' : 'muted'));
  el.innerText = text || '';
  if (timeout) setTimeout(() => { if (el.innerText === text) el.innerText = ''; }, timeout);
}

// Password strength
function getStrength(value) {
  const hasLower = /[a-z]/.test(value);
  const hasUpper = /[A-Z]/.test(value);
  const hasNumber = /[0-9]/.test(value);
  const hasSpecial = /[^A-Za-z0-9]/.test(value);
  const isLong = value.length >= 8;

  let level = 'weak';
  let text = 'Weak — use 8+ chars, upper/lower, digit & symbol';

  if ((hasLower || hasUpper) && hasNumber && isLong) {
    level = 'medium';
    text = 'Medium — add Uppercase & symbol';
  }
  if (hasLower && hasUpper && hasNumber && hasSpecial && isLong) {
    level = 'strong';
    text = 'Strong password ✓';
  }
  return { level, text };
}

async function doRegister(username, email, password, role) {
  try {
    const res = await fetch(REGISTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ username, email, password, role })
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      // try field error
      const fieldErr =
        data?.username?.[0] || data?.email?.[0] || data?.password?.[0] ||
        data?.role?.[0] || data?.detail || 'Register failed';
      showMsg(fieldErr, 'error');
      return;
    }

    showMsg('Registered successfully!', 'success', 1500);
    setTimeout(() => { window.location.href = '/login/'; }, 1500);

  } catch (err) {
    console.error('Register error', err);
    showMsg('Network/server error', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registerForm');
  const btn = document.getElementById('registerBtn'); // optional
  const uEl = document.getElementById('username');
  const emEl = document.getElementById('email');
  const pEl = document.getElementById('password');
  const rEl = document.getElementById('role');

  const toggle = document.getElementById('togglePwd');
  const pwdMsg = document.getElementById('pwdMessage');

  // Show/Hide toggle
  if (toggle && pEl) {
    toggle.addEventListener('click', (e) => {
      e.preventDefault();
      const isPwd = pEl.type === 'password';
      pEl.type = isPwd ? 'text' : 'password';
      toggle.innerText = isPwd ? 'Hide' : 'Show';
      toggle.setAttribute('aria-pressed', String(!isPwd));
    });
  }

  // Strength message (below input)
  if (pEl && pwdMsg) {
    pEl.addEventListener('input', () => {
      const v = pEl.value;
      if (!v) { pwdMsg.textContent = ''; pwdMsg.dataset.level = ''; return; }
      const { level, text } = getStrength(v);
      pwdMsg.textContent = text;
      pwdMsg.dataset.level = level; // style via CSS if needed
    });
  }

  // Submit
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = (uEl?.value || '').trim();
    const em = (emEl?.value || '').trim();
    const p = pEl?.value || '';
    const r = rEl?.value || '';

    if (!u || !em || !p) { showMsg('Fill all fields', 'error'); return; }

    // basic client validation
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em);
    if (!emailOk) { showMsg('Enter a valid email', 'error'); return; }

    const s = getStrength(p);
    if (s.level === 'weak') { showMsg('Password too weak — add upper, digit & symbol', 'error'); return; }

    btn && (btn.disabled = true);
    doRegister(u, em, p, r).finally(() => { btn && (btn.disabled = false); });
  });
});
