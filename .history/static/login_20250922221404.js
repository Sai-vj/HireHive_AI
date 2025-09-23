// static/login.js (JWT version)

import { saveTokens, clearTokens, apiFetchAsJson } from "./utils.js";

const LOGIN_URL    = '/accounts/token/c';
const PROFILE_URL  = '/accounts/profile-api/';

function routeByRole(role) {
  const r = (role || '').toString().toLowerCase();
  if (r === 'recruiter') {
    window.location.href = '/accounts/recruiter-dashboard/';
  } else {
    window.location.href = '/accounts/candidate-dashboard/';
  }
}

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
      body: JSON.stringify({ username, password })
    });
    const body = await res.json().catch(()=>null);
    if (!res.ok) return { ok:false, status: res.status, detail: body?.detail || 'Login failed' };
    return { ok:true, status: res.status, data: body };
  } catch (err) {
    return { ok:false, status: 0, detail: 'Network error' };
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = form.querySelector('input[name="username"]').value.trim();
    const password = form.querySelector('input[name="password"]').value.trim();

    const result = await attemptLogin(username, password);
    if (!result.ok) {
      alert(result.detail || 'Login failed');
      return;
    }

    // Save tokens
    saveTokens(result.data);

    // Get profile with Authorization header
    const profileRes = await apiFetchAsJson(PROFILE_URL);
    if (profileRes.ok) {
      const role = getRoleFromProfile(profileRes.data);
      if (role) {
        routeByRole(role);
        return;
      }
    }

    alert('Login success, but could not fetch profile');
  });
});
