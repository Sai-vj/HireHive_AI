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
