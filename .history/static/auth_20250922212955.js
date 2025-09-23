// static/auth-fixed.js (JWT version)

import { clearTokens, apiFetchAsJson } from "./utils.js";

(async function() {
  const PROFILE = '/accounts/profile-api/';

  const loginBtn = document.querySelector('a[href*="/accounts/login/"]');
  const registerBtn = document.querySelector('a[href*="/accounts/register/"]');
  const navMenu = document.querySelector('#navMenu .navbar-nav') || document.querySelector('#navMenu');

  function createNavItem(html) {
    const li = document.createElement('li');
    li.className = 'nav-item';
    li.innerHTML = html;
    return li;
  }

  function showLoggedInUI(user) {
    if (loginBtn) loginBtn.style.display = 'none';
    if (registerBtn) registerBtn.style.display = 'none';
    if (!navMenu) return;

    const dashUrl = (user.role && user.role.toLowerCase() === 'recruiter')
      ? '/accounts/recruiter-dashboard/' : '/accounts/candidate-dashboard/';

    const dashLi = createNavItem(`<a class="btn btn-outline-primary" href="${dashUrl}">Dashboard</a>`);
    const logoutLi = createNavItem(`<a href="#" id="navLogout" class="nav-link small text-muted">Logout</a>`);

    navMenu.appendChild(dashLi);
    navMenu.appendChild(logoutLi);

    document.getElementById('navLogout').addEventListener('click', (e) => {
      e.preventDefault();
      clearTokens();
      window.location.href = '/';
    });
  }

  const profileRes = await apiFetchAsJson(PROFILE);
  if (profileRes.ok) {
    const profile = profileRes.data;
    const role = profile.role || (profile.user && profile.user.role);
    showLoggedInUI({ ...profile, role });
  }
})();
