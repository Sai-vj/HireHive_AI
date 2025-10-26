// static/navbar-auth.js — robust navbar injector (cookie mode)
// Put this file in your project's static/ and hard-refresh the page.

(async function () {
  const PROFILE_URL = "/accounts/profile-api/";
  const LOGOUT_URL = "/accounts/token/logout/";

  // Try several selectors to find the right button container in your navbar
  const containerSelectors = [
    '.navbar .d-flex.ms-3',
    '.navbar .d-flex',
    '#navMenu .d-flex',
    '.navbar .navbar-right',
    '.navbar .navbar-nav', // fallback (we will append items)
  ];

  function findContainer() {
    for (const s of containerSelectors) {
      const el = document.querySelector(s);
      if (el) {
        // if we found a ul.navbar-nav, we prefer to append list items
        return el;
      }
    }
    return null;
  }

  function debugLog(...args) {
    try { console.debug('navbar-auth:', ...args); } catch(e){ }
  }

  async function fetchProfile() {
    try {
      debugLog('fetching profile...');
      const res = await fetch(PROFILE_URL, { credentials: 'include' });
      debugLog('profile status', res.status);
      if (!res.ok) return null;
      const json = await res.json().catch(()=>null);
      debugLog('profile json', json);
      return json;
    } catch (e) {
      debugLog('fetchProfile error', e);
      return null;
    }
  }

  function normalizeProfile(p) {
    if (!p) return null;
    // Try multiple shapes
    const role = p.role || (p.profile && p.profile.role) || (p.user && p.user.role) || null;
    const username = p.username || (p.user && p.user.username) || null;
    return { role, username, raw: p };
  }

  function renderGuest(container) {
    // If container is a ul (navbar-nav), append as li
    if (container.tagName.toLowerCase() === 'ul') {
      // remove any existing injected items
      const existing = container.querySelectorAll('.nav-item.nav-injected');
      existing.forEach(x => x.remove());

      const loginLi = document.createElement('li'); loginLi.className = 'nav-item nav-injected';
      loginLi.innerHTML = `<a class="btn btn-primary" href="/accounts/login/">Login</a>`;
      const regLi = document.createElement('li'); regLi.className = 'nav-item nav-injected ms-2';
      regLi.innerHTML = `<a class="btn btn-outline-primary" href="/accounts/register/">Register</a>`;
      container.appendChild(loginLi);
      container.appendChild(regLi);
      return;
    }

    // otherwise replace innerHTML (safe simple case)
    try { container.innerHTML = `<a class="btn btn-primary me-2" href="/accounts/login/">Login</a>
      <a class="btn btn-outline-primary" href="/accounts/register/">Register</a>`; } catch(e){ debugLog('renderGuest err', e); }
  }

  function renderUser(container, norm) {
    const role = (norm && norm.role) ? String(norm.role).toLowerCase() : '';
    const dashUrl = (role === 'recruiter') ? '/accounts/recruiter-dashboard/' : '/accounts/candidate-dashboard/';

    if (container.tagName.toLowerCase() === 'ul') {
      // remove previous injected
      const existing = container.querySelectorAll('.nav-item.nav-injected');
      existing.forEach(x => x.remove());

      const dashLi = document.createElement('li'); dashLi.className = 'nav-item nav-injected';
      dashLi.innerHTML = `<a class="btn btn-outline-primary" href="${dashUrl}">Dashboard</a>`;
      const outLi = document.createElement('li'); outLi.className = 'nav-item nav-injected ms-2';
      outLi.innerHTML = `<button id="navLogoutBtn" class="btn btn-outline-danger">Logout</button>`;
      container.appendChild(dashLi);
      container.appendChild(outLi);
    } else {
      try {
        container.innerHTML = `<a class="btn btn-primary me-2" href="${dashUrl}">Dashboard</a>
          <button id="navLogoutBtn" class="btn btn-outline-danger">Logout</button>`;
      } catch(e){ debugLog('renderUser err', e); }
    }

    // attach logout
    const b = document.getElementById('navLogoutBtn');
    if (b) {
      b.addEventListener('click', async () => {
        try { await fetch(LOGOUT_URL, { method: 'POST', credentials: 'include' }); } catch (e) { console.error(e); }
        window.location.href = '/';
      });
    }
  }

  // bootstrap
  const container = findContainer();
  debugLog('container found?', !!container, container);
  if (!container) {
    // nothing to do
    debugLog('No navbar container found — aborting');
    return;
  }

  // render guest initially (so UI is not empty)
  renderGuest(container);

  // fetch profile, then update
  const rawProfile = await fetchProfile();
  const profile = normalizeProfile(rawProfile);

  if (profile && (profile.username || profile.role)) {
    debugLog('rendering logged-in view', profile);
    renderUser(container, profile);
  } else {
    debugLog('no profile or not authenticated', rawProfile);
    // keep guest view
  }
})();
