// static/js/login.js
import { saveTokens, apiFetch } from './utils.js';

async function doLogin(username, password) {
  try {
    // 1) call JWT token endpoint
    const tokenResp = await fetch('/accounts/api/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const tokenData = await tokenResp.json();
    if (!tokenResp.ok || !tokenData.access || !tokenData.refresh) {
      const msgEl = document.getElementById('loginMsg');
      if (msgEl) msgEl.innerText = tokenData.detail || 'Login failed';
      else alert(tokenData.detail || 'Login failed');
      return;
    }

    // 2) save tokens (so apiFetch will handle them)
    saveTokens({ access: tokenData.access, refresh: tokenData.refresh });

    // 3) fetch profile (to know role)
    const prof = await apiFetch('/accounts/api/profile/');
    if (!prof.ok) {
      const msgEl = document.getElementById('loginMsg');
      if (msgEl) msgEl.innerText = `Profile fetch failed (${prof.status})`;
      else alert('Profile fetch failed');
      return;
    }

    const role = prof.data?.role || '';
    // 4) redirect to right dashboard
    if (role === 'recruiter') {
      window.location.href = '/resumes/static/recruiter-dashboard/';
    } else {
      window.location.href = '/resumes/candidate-dashboard/';
    }

  } catch (err) {
    console.error('Login error', err);
    const msgEl = document.getElementById('loginMsg');
    if (msgEl) msgEl.innerText = 'Network/server error';
    else alert('Network/server error');
  }
}

// hook up form submit
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('password').value;
    doLogin(u, p);
  });
});