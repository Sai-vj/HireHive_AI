(async function () {
  const PROFILE_URL = "/accounts/profile-api/";
  const LOGOUT_URL = "/accounts/token/logout/";

  // navbar refs
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
      const res = await fetch(PROFILE_URL, { credentials: "same-origin" });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn("Profile check failed",
