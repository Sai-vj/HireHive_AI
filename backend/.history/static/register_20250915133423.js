// static/js/register.js
const REGISTER_URL = 'api/accounts/register/'; // your Django view
const LOGIN_PAGE = 'api/accounts/login/';      // url to redirect after success

function showMsg(text, type='muted', timeout=4000) {
  const el = document.getElementById('regMsg');
  el.className = 'small text-' + (type === 'error' ? 'danger' : (type === 'success' ? 'success' : 'muted'));
  el.innerText = text;
  if (timeout) setTimeout(()=>{ el.innerText = ''; }, timeout);
}

async function submitRegister(username, email, password, role) {
  try {
    const res = await fetch(REGISTER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ username, email, password, role })
    });

    const body = await res.json().catch(()=>null);

    if (res.ok) {
      showMsg('Registered successfully — redirecting to login...', 'success', 3000);
      setTimeout(()=> { window.location.href = LOGIN_PAGE; }, 900);
      return;
    }
    // register.js (example)
async function doRegister(username, email, password, role='student') {
  const res = await fetch('/accounts/api/register/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ username, email, password, role })
  });
  const data = await res.json();
  if (!res.ok) {
    console.error('register failed', data);
    alert(data.detail || 'Register failed');
    return false;
  }
  alert('Registered');
  return true;
}

    // non-OK: show server-provided message if any
    const detail = body?.detail || body?.error || JSON.stringify(body) || `Registration failed (${res.status})`;
    showMsg(detail, 'error', 7000);
  } catch (err) {
    console.error('register error', err);
    showMsg('Network/server error during registration', 'error', 7000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registerForm');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const role = document.getElementById('role').value;

    if (!username || !email || !password) {
      showMsg('Please fill all fields', 'error');
      return;
    }

    document.getElementById('registerBtn').disabled = true;
    submitRegister(username, email, password, role).finally(() => {
      document.getElementById('registerBtn').disabled = false;
    });
  });
});