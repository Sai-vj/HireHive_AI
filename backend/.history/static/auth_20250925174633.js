// static/navbar-auth.js — inject dashboard/logout after login
(async function () {
  const PROFILE_URL = "/accounts/profile-api/";
  const LOGOUT_URL = "/accounts/token/logout/";

  const navMenu = document.querySelector("#navMenu .navbar-nav") || document.querySelector("#navMenu");
  const loginBtn = document.querySelector('a[href*="/accounts/login/"]');
  const registerBtn = document.querySelector('a[href*="/accounts/register/"]');

  function createNavItem(html) {
    const li = document.createElement("li");
    li.className = "nav-item";
    li.innerHTML = html;
    return li;
  }

  async function checkProfile() {
    try {
      const res = await fetch(PROFILE_URL, { credentials: "include" });
      if (!res.ok) return null;
      return await res.json().catch(() => null);
    } catch {
      return null;
    }
  }

  function showLoggedInUI(user) {
    if (loginBtn) loginBtn.style.display = "none";
    if (registerBtn) registerBtn.style.display = "none";
    if (!navMenu) return;

    if (navMenu.querySelector('a[href*="dashboard"]')) return;

    const dashUrl =
      user.role === "recruiter"
        ? "/accounts/recruiter-dashboard/"
        : "/accounts/candidate-dashboard/";

    const dashLi = createNavItem(
      `<a class="btn btn-outline-primary ms-2" href="${dashUrl}">Dashboard</a>`
    );
    const logoutLi = createNavItem(
      `<a href="#" id="navLogout" class="nav-link small text-muted">Logout</a>`
    );

    navMenu.appendChild(dashLi);
    navMenu.appendChild(logoutLi);

    // logout click
    const navLogout = document.getElementById("navLogout");
    if (navLogout) {
      navLogout.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
          await fetch(LOGOUT_URL, { method: "POST", credentials: "include" });
        } catch (err) {
          console.error("Logout error", err);
        }
        window.location.href = "/";
      });
    }
  }

  // run on page load
  const profile = await checkProfile();
  if (profile && profile.username) {
    showLoggedInUI(profile);
  }
})();

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registerForm');
  const pwd = document.getElementById('regPwd');
  const pwd2 = document.getElementById('regPwd2');
  const email = form.querySelector('input[type="email"]');

  // Create msg containers
  const statusWrap = document.createElement('div');
  statusWrap.className = 'my-2';
  form.insertBefore(statusWrap, form.querySelector('button'));

  const pwdStatus = document.createElement('div');
  const emailStatus = document.createElement('div');
  const matchStatus = document.createElement('div');
  statusWrap.appendChild(emailStatus);
  statusWrap.appendChild(pwdStatus);
  statusWrap.appendChild(matchStatus);

  // helpers
  const emailValid = (v) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  };
  const strengthResult = (v) => {
    const hasLower = /[a-z]/.test(v);
    const hasUpper = /[A-Z]/.test(v);
    const hasNum = /[0-9]/.test(v);
    const hasSpec = /[^A-Za-z0-9]/.test(v);
    const len = v.length;
    if (hasLower && hasUpper && hasNum && hasSpec && len >= 8) return {text: 'Strong', level: 3};
    if ((hasLower || hasUpper) && hasNum && len >= 8) return {text: 'Medium', level: 2};
    if (len > 0) return {text: 'Weak', level: 1};
    return {text: '', level: 0};
  };
  const colorFor = (lvl) => lvl === 3 ? 'green' : lvl === 2 ? 'orange' : 'red';

  // realtime email check
  email.addEventListener('input', () => {
    if (email.value.trim() === '') {
      emailStatus.innerHTML = '';
      return;
    }
    if (emailValid(email.value.trim())) {
      emailStatus.innerHTML = `<small style="color:green">Valid email</small>`;
    } else {
      emailStatus.innerHTML = `<small style="color:red">Invalid email format</small>`;
    }
  });

  // realtime pwd strength
  pwd.addEventListener('input', () => {
    const r = strengthResult(pwd.value);
    if (!r.text) {
      pwdStatus.innerHTML = '';
      return;
    }
    pwdStatus.innerHTML = `<small style="color:${colorFor(r.level)}">Password: ${r.text}</small>`;
  });

  // confirm match
  const updateMatch = () => {
    if (pwd2.value === '') { matchStatus.innerHTML = ''; return; }
    if (pwd.value === pwd2.value) {
      matchStatus.innerHTML = `<small style="color:green">Passwords match</small>`;
    } else {
      matchStatus.innerHTML = `<small style="color:red">Passwords do not match</small>`;
    }
  };
  pwd.addEventListener('input', updateMatch);
  pwd2.addEventListener('input', updateMatch);

  // final submit guard
  form.addEventListener('submit', (e) => {
    const em = email.value.trim();
    const r = strengthResult(pwd.value);
    const errors = [];

    if (!emailValid(em)) errors.push('Please enter a valid email.');
    if (r.level < 2) errors.push('Password must be at least Medium strength (use upper+lower+numbers, min 8 chars).');
    if (pwd.value !== pwd2.value) errors.push('Passwords do not match.');

    if (errors.length) {
      e.preventDefault();
      // show combined message
      const box = document.getElementById('msg') || (() => {
        const d = document.createElement('div'); d.id = 'msg'; form.prepend(d); return d;
      })();
      box.innerHTML = errors.map(it => `<div style="color:#b91c1c">${it}</div>`).join('');
      box.focus();
      window.scrollTo({ top: box.getBoundingClientRect().top + window.scrollY - 20, behavior: 'smooth' });
    }
  });
});

