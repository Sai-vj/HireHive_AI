// static/login.js
// IMPORTANT: include this script in template as:
// <script type="module" src="{% static 'js/login.js' %}"></script>

import { saveTokens, apiFetchAsJson } from './utils.js';   // <-- use apiFetchAsJson from utils.js

async function doLogin(username, password) {
  try {
    // 1) request tokens
    const tokenResp = await fetch('/api/autgtoken/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const tokenData = await tokenResp.json();
    if (!tokenResp.ok || !tokenData.access || !tokenData.refresh) {
      const msgEl = document.getElementById('loginMsg');
      const errMsg = tokenData?.detail || tokenData?.error || 'Login failed';
      if (msgEl) msgEl.innerText = errMsg;
      else alert(errMsg);
      return;
    }

    // 2) save tokens for later API calls
    saveTokens({ access: tokenData.access, refresh: tokenData.refresh });

    // 3) fetch profile via helper that attaches Authorization
    const prof = await apiFetch('http://127.0.0.1:8000/accounts/api/profile/');
    if (!prof.ok) {
      const msgEl = document.getElementById('loginMsg');
      if (msgEl) msgEl.innerText = `Profile fetch failed (${prof.status})`;
      else alert('Profile fetch failed');
      return;
    }

    const role = prof.data?.role || '';
    // 4) redirect to correct dashboard (use accounts/ path as in accounts/urls.py)
    if (role === 'recruiter') {
      window.location.href = '/accounts/recruiter-dashboard/';
    } else {
      window.location.href = '/accounts/candidate-dashboard/';
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