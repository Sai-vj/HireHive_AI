// static/navbar-auth.js (updated) — use this to replace your existing file
(async function () {
  const PROFILE_URL = "/accounts/profile-api/";
  // set this to your Django logout URL (change if your project uses a different path)
  const LOGOUT_URL = "/accounts/logout/";

  const containerSelectors = [
    '.navbar .d-flex.ms-3',
    '.navbar .d-flex',
    '#navMenu .d-flex',
    '.navbar .navbar-right',
    '.navbar .navbar-nav',
  ];

  function findContainer() {
    for (const s of containerSelectors) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return null;
  }

  function debugLog(...args) { try { console.debug('navbar-auth:', ...args); } catch(e){} }

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

  function renderGuest(container) {
    if (container.tagName.toLowerCase() === 'ul') {
      container.querySelectorAll('.nav-item.nav-injected').forEach(x=>x.remove());
      const loginLi = document.createElement('li'); loginLi.className = 'nav-item nav-injected'; loginLi.innerHTML = `<a class="btn btn-primary" href="/accounts/login/">Login</a>`;
      const regLi = document.createElement('li'); regLi.className = 'nav-item nav-injected ms-2'; regLi.innerHTML = `<a class="btn btn-outline-primary" href="/accounts/register/">Register</a>`;
      container.appendChild(loginLi); container.appendChild(regLi);
      return;
    }
    try {
      container.innerHTML = `<a class="btn btn-primary me-2" href="/accounts/login/">Login</a>
      <a class="btn btn-outline-primary" href="/accounts/register/">Register</a>`;
    } catch(e){ debugLog('renderGuest err', e); }
  }

  function getCookie(name) {
    const v = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return v ? v.pop() : '';
  }

  function clearClientTokens() {
    try {
      localStorage.removeItem('recruiter_token_v1');
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
    } catch(e){ /* ignore */ }
  }

  function renderUser(container, norm) {
    const role = (norm && norm.role) ? String(norm.role).toLowerCase() : '';
    const dashUrl = (role === 'recruiter') ? '/accounts/recruiter-dashboard/' : '/accounts/candidate-dashboard/';

    if (container.tagName.toLowerCase() === 'ul') {
      container.querySelectorAll('.nav-item.nav-injected').forEach(x=>x.remove());
      const dashLi = document.createElement('li'); dashLi.className = 'nav-item nav-injected'; dashLi.innerHTML = `<a class="btn btn-outline-primary" href="${dashUrl}">Dashboard</a>`;
      const outLi = document.createElement('li'); outLi.className = 'nav-item nav-injected ms-2'; outLi.innerHTML = `<button id="navLogoutBtn" class="btn btn-outline-danger">Logout</button>`;
      container.appendChild(dashLi); container.appendChild(outLi);
    } else {
      try {
        container.innerHTML = `<a class="btn btn-primary me-2" href="${dashUrl}">Dashboard</a>
          <button id="navLogoutBtn" class="btn btn-outline-danger">Logout</button>`;
      } catch(e){ debugLog('renderUser err', e); }
    }

    const b = document.getElementById('navLogoutBtn');
    if (b) {
     // inside renderUser(...) after creating #navLogoutBtn
b.addEventListener('click', async () => {
  // 1. clear localStorage tokens immediately
  try {
    localStorage.removeItem('recruiter_token_v1');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  } catch(e){ /* ignore */ }

        // try POST with CSRF token (Django expects CSRF for POST)
        const csrftoken = getCookie('csrftoken') || getCookie('CSRF-TOKEN') || '';
         let ok = false;
  try {
    const csrftoken = (document.cookie.match('(^|;)\\s*csrftoken\\s*=\\s*([^;]+)') || [])[2] || '';
    const r = await fetch(LOGOUT_URL, {
      method: 'POST',
      credentials: 'include',
      headers: csrftoken ? { 'X-CSRFToken': csrftoken } : {}
    });
    ok = r.ok || r.status === 302;
  } catch(e) {
    console.warn('logout POST failed', e);
  }

        // fallback: try GET (some projects use GET logout)
         if (!ok) {
    try {
      const r2 = await fetch(LOGOUT_URL, { method: 'GET', credentials: 'include' });
      ok = r2.ok || r2.status === 302;
    } catch(e) { console.warn('logout GET failed', e); }
  }


  

        // final cleanup & reload
        clearClientTokens();
        // force reload so server-side template re-renders authenticated state
        window.location.reload();
      });
    }
  }

  // bootstrap
  const container = findContainer();
  debugLog('container found?', !!container, container);
  if (!container) return;

  renderGuest(container);
  const rawProfile = await fetchProfile();
  const profile = normalizeProfile(rawProfile);
  if (profile && (profile.username || profile.role)) renderUser(container, profile);
  else debugLog('not authenticated or profile missing', rawProfile);
})();
