// static/login.js
// this file assumes utils.js exports: saveTokens, apiFetch
import { saveTokens, apiFetch } from './utils.js';

async function doLogin(username, password) {
  try {
    // === 1) call token endpoint (adjust path to match your backend) ===
    const tokenResp = await fetch('/accounts/api/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const tokenData = await tokenResp.json();
    if (!tokenResp.ok) {
      // show message in page if present
      const msgEl = document.getElementById('loginMsg');
      if (msgEl) msgEl.innerText = tokenData.detail || (tokenData?.message) || 'Login failed';
      else alert(tokenData.detail || 'Login failed');
      return false;
    }

    if (!tokenData.access || !tokenData.refresh) {
      alert('Token response missing. Check backend endpoint.');
      return false;
    }

    // === 2) save tokens (use your util so refresh logic works) ===
    saveTokens({ access: tokenData.access, refresh: tokenData.refresh });

    // === 3) fetch profile to know role (use apiFetch to auto-attach token & refresh if needed) ===
    const prof = await apiFetch('/api/accounts/profile/'); // <- adjust path if backend is different
    if (!prof.ok) {
      // profile fetch failed; show message and stop
      console.warn('Profile fetch failed', prof);
      const msgEl = document.getElementById('loginMsg');
      if (msgEl) msgEl.innerText = `Could not fetch profile (${prof.status})`;
      else alert(`Could not fetch profile (${prof.status})`);
      return false;
    }

    const role = prof.data?.role || '';

    // === 4) redirect based on role (adjust URL paths to your project) ===
    if (role === 'recruiter') {
      window.location.href = '/accounts/recruiter-dashboard/';
    } else {
      // default -> candidate
      window.location.href = '/accounts/candidate-dashboard/';
    }

    return true;
  } catch (err) {
    console.error('Login error', err);
    const msgEl = document.getElementById('loginMsg');
    if (msgEl) msgEl.innerText = 'Network/server error';
    else alert('Network/server error');
    return false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const u = (document.getElementById('username')?.value || '').trim();
    const p = document.getElementById('password')?.value || '';
    if (!u || !p) {
      const msgEl = document.getElementById('loginMsg');
      if (msgEl) msgEl.innerText = 'Enter username and password';
      else alert('Enter username and password');
      return;
    }
    doLogin(u, p);
  });
});