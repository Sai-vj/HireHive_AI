// static/navbar-auth.js
(async function () {
  const PROFILE_URL = "/accounts/profile-api/";
  const LOGOUT_URL = "/accounts/token/logout/";

  const container = document.querySelector('.navbar .d-flex.ms-3') || document.querySelector('.navbar .d-flex');
  if (!container) return;

  async function fetchProfile() {
    try {
      const res = await fetch(PROFILE_URL, { credentials: 'include' });
      if (!res.ok) return null;
      return await res.json().catch(()=>null);
    } catch (e) { return null; }
  }

  function setGuestView() {
    container.innerHTML = `
      <a class="btn btn-primary me-2" href="/accounts/login/">Login</a>
      <a class="btn btn-outline-primary" href="/accounts/register/">Register</a>
    `;
  }

  function setUserView(user) {
    const role = (user && user.role) ? String(user.role).toLowerCase() : '';
    const dashUrl = (role === 'recruiter') ? '/accounts/recruiter-dashboard/' : '/accounts/candidate-dashboard/';
    container.innerHTML = `
      <a class="btn btn-primary me-2" href="${dashUrl}">Dashboard</a>
      <button id="navLogoutBtn" class="btn btn-outline-danger">Logout</button>
    `;
    const b = document.getElementById('navLogoutBtn');
    if (b) {
      b.addEventListener('click', async () => {
        try { await fetch(LOGOUT_URL, { method: 'POST', credentials: 'include' }); } catch(e){ console.error(e); }
        window.location.href = '/';
      });
    }
  }

  // bootstrap
  setGuestView();
  const profile = await fetchProfile();
  if (profile && (profile.username || profile.user)) setUserView(profile);
})();
