// login.js
import { saveTokens, apiFetch } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    try {
      const resp = await fetch('/api/accounts/token/', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Accept':'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await resp.json();
      if (!resp.ok) {
        document.getElementById('loginMsg').innerText = data.detail || 'Login failed';
        return;
      }
      // save tokens
      saveTokens({ access: data.access, refresh: data.refresh });

      // fetch profile to decide redirect
      const prof = await apiFetch('/api/accounts/profile/');
      if (!prof.ok) {
        document.getElementById('loginMsg').innerText = 'Could not fetch profile';
        return;
      }
      const role = prof.data?.role || '';
      if (role === 'recruiter') {
        window.location.href = '/accounts/recruiter-dashboard/';
      } else {
        window.location.href = '/accounts/candidate-dashboard/';
      }
    } catch (err) {
      console.error('login error', err);
      document.getElementById('loginMsg').innerText = 'Network error';
    }
  });
});