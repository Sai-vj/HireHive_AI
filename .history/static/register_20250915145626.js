// absolute URL to backend register API
const REGISTER_URL = '/pi/accounts/rs/';

function showMsg(text, type = 'muted', timeout = 4000) {
  const el = document.getElementById('msg');
  el.className = 'small text-' + (type === 'error' ? 'danger' : (type === 'success' ? 'success' : 'muted'));
  el.innerText = text;
  if (timeout) setTimeout(() => { el.innerText = ''; }, timeout);
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
      showMsg(data?.detail || "Register failed", 'error');
      return;
    }

    showMsg("Registered successfully!", 'success');
    // redirect after 2 sec
    setTimeout(() => {
      window.location.href = '/login/';
    }, 1500);

  } catch (err) {
    console.error("Register error", err);
    showMsg("Network/server error", 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registerForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = document.getElementById('username').value.trim();
    const em = document.getElementById('email').value.trim();
    const p = document.getElementById('password').value;
    const r = document.getElementById('role').value;
    if (!u || !em || !p) {
      showMsg("Fill all fields", 'error');
      return;
    }
    doRegister(u, em, p, r);
  });
});