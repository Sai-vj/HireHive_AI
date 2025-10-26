// auth-fixed.js — patched version of your auth scripts
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

  // helper toast fallback
  function toast(msg) {
    if (window.hh && typeof window.hh.showToast === 'function') {
      try { window.hh.showToast(msg); return; } catch(e){}
    }
    // fallback
    try { console.info('TOAST:', msg); } catch(e){}
    // last fallback visual
    if (typeof alert === 'function') alert(msg);
  }

  // register validation (if register form present)
  const reg = document.getElementById('registerForm');
  if (reg) {
    reg.addEventListener('submit', function(e) {
      const p1El = document.getElementById('regPwd');
      const p2El = document.getElementById('regPwd2');
      const p1 = p1El ? p1El.value : '';
      const p2 = p2El ? p2El.value : '';
      if (p1 !== p2) {
        e.preventDefault();
        toast('Passwords do not match');
        return false;
      }
      if (p1.length < 6) {
        e.preventDefault();
        toast('Password should be at least 6 characters');
        return false;
      }
      return true;
    });
  }

  // login form small validation
  const login = document.getElementById('loginForm');
  if (login) {
    login.addEventListener('submit', function(e) {
      const userEl = login.querySelector('input[name="username"]');
      const pwdEl = login.querySelector('input[name="password"]');
      const user = userEl ? userEl.value.trim() : '';
      const pwd = pwdEl ? pwdEl.value.trim() : '';
      if (!user || !pwd) {
        e.preventDefault();
        toast('Please fill both fields');
        return false;
      }
      // do NOT prevent default otherwise — your login.js handles the AJAX submit.
      return true;
    });
  }
});

// static/js/auth helpers (login test)
async function loginWithCookies(username, password) {
  try {
    const res = await fetch('/accounts/token/cookie/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ username, password }),
      credentials: 'same-origin'  // include same-origin cookies
    });

    const json = await res.json().catch(()=>null);
    if (!res.ok) {
      const detail = json && (json.detail || json.error) ? (json.detail || json.error) : 'Login failed';
      throw new Error(detail);
    }

    // quick protected API to validate cookie/auth
    const test = await fetch('/api/resumes/my-resumes/', { credentials: 'same-origin' });
    if (!test.ok) {
      throw new Error('Auth test failed (protected endpoint returned ' + test.status + ')');
    }
    return true;
  } catch (err) {
    console.error('loginWithCookies error:', err);
    throw err;
  }
}

// static/navbar-auth.js equivalent (immediately invoked)
(async function() {
  const PROFILE = '/accounts/profile-api/';
  const LOGOUT = '/accounts/token/logout/';

  // navbar link refs: prefer exact match by id or data attr if available; fallback to href search
  const loginBtn = document.querySelector('a[href*="/accounts/login/"]') || document.querySelector('a[href*="login"]');
  const registerBtn = document.querySelector('a[href*="/accounts/register/"]') || document.querySelector('a[href*="register"]');

  // more permissive navMenu selector to match base.html structure
  const navMenu = document.querySelector('#navMenu .navbar-nav') || document.querySelector('#navMenu');

  function createNavItem(html) {
    const li = document.createElement('li');
    li.className = 'nav-item';
    li.innerHTML = html;
    return li;
  }

  function showLoggedInUI(user) {
    try {
      if (loginBtn) loginBtn.style.display = 'none';
      if (registerBtn) registerBtn.style.display = 'none';
    } catch(e){}

    if (!navMenu) return;

    // avoid adding duplicates
    if (navMenu.querySelector('.nav-item .btn[href*="dashboard"], .nav-item a[href*="dashboard"]')) {
      return;
    }

    const dashUrl = (user && user.role && user.role.toLowerCase() === 'recruiter')
      ? '/accounts/recruiter-dashboard/' : '/accounts/candidate-dashboard/';

    const dashLi = createNavItem(`<a class="btn btn-outline-primary" href="${dashUrl}">Dashboard</a>`);
    const logoutLi = createNavItem(`<a href="#" id="navLogout" class="nav-link small text-muted">Logout</a>`);
    // append in safe order
    navMenu.appendChild(dashLi);
    navMenu.appendChild(logoutLi);

    // attach logout handler safely
    const navLogout = document.getElementById('navLogout');
    if (navLogout) {
      navLogout.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          // POST logout; may require CSRF header depending on server
          await fetch(LOGOUT, { method: 'POST', credentials: 'same-origin' });
        } catch(err) { console.error('Logout error', err); }
        // reload to homepage
        window.location.href = '/';
      });
    }
  }

  async function checkProfile() {
    try {
      const res = await fetch(PROFILE, { credentials: 'same-origin' });
      if (!res.ok) return null;
      const json = await res.json().catch(()=>null);
      return json;
    } catch (e) {
      console.warn('checkProfile failed', e);
      return null;
    }
  }

  // run immediately
  try {
    const profile = await checkProfile();
    if (profile && (profile.username || profile.user || profile.email)) {
      // normalize role extraction
      const role = profile.role || (profile.profile && profile.profile.role) || (profile.user && profile.user.role) || null;
      showLoggedInUI(Object.assign({}, profile, { role }));
    }
  } catch (e) {
    console.warn('navbar-auth bootstrap error', e);
  }
})();
