document.addEventListener('DOMContentLoaded', function() {
  // password show toggle on login
  const toggle = document.getElementById('togglePwd');
  if (toggle) {
    toggle.addEventListener('click', function() {
      const pwd = document.getElementById('password');
      if (!pwd) return;
      if (pwd.type === 'password') { pwd.type = 'text'; toggle.innerText = 'Hide'; }
      else { pwd.type = 'password'; toggle.innerText = 'Show'; }
    });
  }

  // register validation
  const reg = document.getElementById('registerForm');
  if (reg) {
    reg.addEventListener('submit', function(e) {
      const p1 = document.getElementById('regPwd').value;
      const p2 = document.getElementById('regPwd2').value;
      if (p1 !== p2) {
        e.preventDefault();
        hh.showToast('Passwords do not match');
        return false;
      }
      if (p1.length < 6) {
        e.preventDefault();
        hh.showToast('Password should be at least 6 characters');
        return false;
      }
      return true;
    });
  }

  // login form small validation
  const login = document.getElementById('loginForm');
  if (login) {
    login.addEventListener('submit', function(e) {
      const user = login.querySelector('input[name="username"]').value.trim();
      const pwd = login.querySelector('input[name="password"]').value.trim();
      if (!user || !pwd) {
        e.preventDefault();
        hh.showToast('Please fill both fields');
        return false;
      }
    });
  }
});

// static/js/auth.js (login helper)
async function loginWithCookies(username, password) {
  const res = await fetch('/accounts/token/cookie/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
    credentials: 'same-origin'  // important: include cookies
  });

  if (!res.ok) {
    const err = await res.json().catch(()=>({detail:'Login failed'}));
    throw new Error(err.detail || 'Login failed');
  }
  // cookies are set now. test a protected API
  const test = await fetch('/api/resumes/my-resumes/', { credentials: 'same-origin' });
  if (!test.ok) throw new Error('Auth test failed');
  return true;
}

// static/navbar-auth.js
(async function() {
  const PROFILE = '/accounts/profile-api/';
  const LOGOUT = '/accounts/token/logout/';

  // navbar link refs
  const loginBtn = document.querySelector('a[href*="login"]');
  const registerBtn = document.querySelector('a[href*="register"]');
  const navMenu = document.querySelector('#navMenu ul.navbar-nav.ms-3');

  function showLoggedInUI(user) {
    if (loginBtn) loginBtn.style.display = 'none';
    if (registerBtn) registerBtn.style.display = 'none';

    // dashboard
    const dashUrl = user.role === 'recruiter' ? '/accounts/recruiter-dashboard/' : '/accounts/candidate-dashboard/';
    const dashLi = document.createElement('li');
    dashLi.className = 'nav-item';
    dashLi.innerHTML = `<a class="btn btn-outline-primary" href="${dashUrl}">Dashboard</a>`;

    // logout
    const logoutLi = document.createElement('li');
    logoutLi.className = 'nav-item ms-2';
    logoutLi.innerHTML = `<a href="#" id="navLogout" class="nav-link small text-muted">Logout</a>`;

    navMenu.appendChild(dashLi);
    navMenu.appendChild(logoutLi);

    document.getElementById('navLogout').addEventListener('click', async (e) => {
      e.preventDefault();
      await fetch(LOGOUT, { method: 'POST', credentials: 'same-origin' });
      window.location.href = '/';
    });
  }

  async function checkProfile() {
    try {
      const res = await fetch(PROFILE, { credentials: 'same-origin' });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  const profile = await checkProfile();
  if (profile && profile.username) {
    showLoggedInUI(profile);
  }
})();

