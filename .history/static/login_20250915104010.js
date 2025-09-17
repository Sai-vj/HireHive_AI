// after login
localStorage.setItem('token', token);
const profile = await fetch('/api/accounts/profile/', { headers: { 'Authorization':'Bearer '+token } }).then(r=>r.json());
if (profile.role==='recruiter') window.location='/resumes/recruiter_dashboard/';
else window.location='/resumes/candidate_dashboard/';



// login.js - simple login flow using api/token/
async function doLogin(username, password) {
  try {
    const res = await fetch('/accounts/api/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.detail || 'Login failed');
      return;
    }
    // save tokens
    localStorage.setItem('token', data.access);
    localStorage.setItem('refresh', data.refresh);

    // fetch profile to get role and redirect
    const prof = await fetch('/accounts/api/profile/', {
      headers: { 'Authorization': 'Bearer ' + data.access, 'Accept': 'application/json' }
    });
    const pjson = await prof.json();
    if (!prof.ok) {
      // token issue maybe; still redirect to login
      alert('Could not fetch profile');
      return;
    }
    const role = pjson.role || '';
    if (role === 'recruiter') {
      window.location = '/accounts/recruiter-dashboard/';
    } else {
      window.location = '/accounts/candidate-dashboard/';
    }
  } catch (err) {
    console.error(err);
    alert('Network/error during login');
  }
}

// wire form
document.getElementById('loginForm')?.addEventListener('submit', function(e){
  e.preventDefault();
  const u = document.getElementById('username').value.trim();
  const p = document.getElementById('password').value;
  doLogin(u,p);
});

import { saveTokens, apiFetch } from './utils.js';

document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("loginForm");

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    try {
      const resp = await fetch("/api/accounts/login/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const data = await resp.json();

      if (resp.ok && data.access && data.refresh) {
        // step 1: save tokens
        saveTokens({ access: data.access, refresh: data.refresh });

        // step 2: get profile
        const profile = await apiFetch("/api/accounts/profile/");
        if (profile.ok) {
          if (profile.data.role === "recruiter") {
            window.location.href = "/accounts/recruiter-dashboard/";
          } else {
            window.location.href = "/accounts/candidate-dashboard/";
          }
        }
      } else {
        document.getElementById("loginMsg").innerText = data.detail || "Login failed";
      }
    } catch (err) {
      console.error("Login error", err);
      document.getElementById("loginMsg").innerText = "Server error. Try again.";
    }
  });
});