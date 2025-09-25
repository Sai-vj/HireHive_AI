// static/navbar-auth.js — cleaned + more robust
(async function () {
  const PROFILE_URL = "/accounts/profile-api/";
  const LOGOUT_URL = "/accounts/logout/";

  const containerSelectors = [
    '#navMenu .navbar-nav',
    '.navbar .navbar-nav'
  ];

  function debugLog(...args) { try { console.debug('navbar-auth:', ...args); } catch(e){} }

  function findContainer() {
    for (const sel of containerSelectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  async function fetchProfile() {
    try {
      const res = await fetch(PROFILE_URL, { credentials: 'include' });
      if (!res.ok) return null;
      return await res.json().catch(()=>null);
    } catch (e) { debugLog('fetchProfile error', e); return null; }
  }

  function normalizeProfile(p) {
    if (!p) return null;
    const role = p.role || (p.profile && p.profile.role) || (p.user && p.user.role) || null;
    const username = p.username || (p.user && p.user.username) || null;
    return { role, username, raw: p };
  }

  function removeInjected(container) {
    container.querySelectorAll('.nav-item.nav-injected').forEach(x => x.remove());
  }

  function renderGuest(container) {
    try {
      if (container.tagName.toLowerCase() === 'ul') {
        removeInjected(container);
        const loginLi = document.createElement('li');
        loginLi.className = 'nav-item nav-injected';
        loginLi.innerHTML = `<a class="btn btn-primary" href="/accounts/login/">Login</a>`;

        const regLi = document.createElement('li');
        regLi.className = 'nav-item nav-injected ms-2';
        regLi.innerHTML = `<a class="btn btn-outline-primary" href="/accounts/register/">Register</a>`;

        container.appendChild(loginLi);
        container.appendChild(regLi);
      } else {
        container.innerHTML = `<a class="btn btn-primary me-2" href="/accounts/login/">Login</a>
          <a class="btn btn-outline-primary" href="/accounts/register/">Register</a>`;
      }
    } catch (e) {
      debugLog('renderGuest err', e);
    }
  }

  // Read cookie helper
  function getCookie(name) {
    const v = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return v ? v.pop() : '';
  }

  function clearClientTokens() {
    try {
      localStorage.removeItem('recruiter_token_v1');
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    } catch (e) { /* ignore */ }
  }

  function renderUser(container, norm) {
    try {
      const role = (norm && norm.role) ? String(norm.role).toLowerCase() : '';
      const dashUrl = (role === 'recruiter') ? '/accounts/recruiter-dashboard/' : '/accounts/candidate-dashboard/';

      if (container.tagName.toLowerCase() === 'ul') {
        removeInjected(container);
        const dashLi = document.createElement('li');
        dashLi.className = 'nav-item nav-injected';
        dashLi.innerHTML = `<a class="btn btn-outline-primary" href="${dashUrl}">Dashboard</a>`;

        const outLi = document.createElement('li');
        outLi.className = 'nav-item nav-injected ms-2';
        outLi.innerHTML = `<button id="navLogoutBtn" class="btn btn-outline-danger">Logout</button>`;

        container.appendChild(dashLi);
        container.appendChild(outLi);
      } else {
        container.innerHTML = `<a class="btn btn-primary me-2" href="${dashUrl}">Dashboard</a>
          <button id="navLogoutBtn" class="btn btn-outline-danger">Logout</button>`;
      }

      // attach logout handler (use event listener safely)
      setTimeout(() => {
        const btn = document.getElementById('navLogoutBtn');
        if (!btn) return;
        btn.addEventListener('click', async () => {
          // clear tokens immediately on client
          clearClientTokens();

          // Try POST logout with CSRF
          let ok = false;
          try {
            const csrftoken = getCookie('csrftoken') || getCookie('CSRF-TOKEN') || '';
            const headers = csrftoken ? { 'X-CSRFToken': csrftoken } : {};
            const r = await fetch(LOGOUT_URL, {
              method: 'POST',
              credentials: 'include',
              headers
            });
            ok = r.ok || r.status === 302;
          } catch (e) {
            debugLog('logout POST failed', e);
          }

          // Fallback to GET logout
          if (!ok) {
            try {
              const r2 = await fetch(LOGOUT_URL, { method: 'GET', credentials: 'include' });
              ok = r2.ok || r2.status === 302;
            } catch (e) {
              debugLog('logout GET failed', e);
            }
          }

          // final client cleanup & reload so server templates update
          clearClientTokens();
          window.location.reload();
        });
      }, 40);
    } catch (e) {
      debugLog('renderUser err', e);
    }
  }

  // bootstrap
  const container = findContainer();
  debugLog('container found?', !!container, container);
  if (!container) return;

  // initial guest UI (fast paint)
  renderGuest(container);

  // try fetch profile and switch UI if authenticated
  const rawProfile = await fetchProfile();
  const profile = normalizeProfile(rawProfile);
  if (profile && (profile.username || profile.role)) {
    renderUser(container, profile);
  } else {
    debugLog('not authenticated or profile missing', rawProfile);
  }
})();
