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
  const msg = document.getElementById('msg');

  // helper functions
  const emailValid = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  const strengthResult = (v) => {
    const hasLower = /[a-z]/.test(v);
    const hasUpper = /[A-Z]/.test(v);
    const hasNum = /[0-9]/.test(v);
    const hasSpec = /[^A-Za-z0-9]/.test(v);
    if (v.length >= 8 && hasLower && hasUpper && hasNum && hasSpec) return "Strong";
    if (v.length >= 8 && (hasLower || hasUpper) && hasNum) return "Medium";
    if (v.length > 0) return "Weak";
    return "";
  };

  // realtime checks
  email.addEventListener('input', () => {
    if (!email.value) return msg.innerHTML = "";
    msg.innerHTML = emailValid(email.value)
      ? `<small style="color:green">✅ Valid email</small>`
      : `<small style="color:red">❌ Invalid email</small>`;
  });

  pwd.addEventListener('input', () => {
    const res = strengthResult(pwd.value);
    if (!res) return (msg.innerHTML = "");
    const color = res === "Strong" ? "green" : res === "Medium" ? "orange" : "red";
    msg.innerHTML = `<small style="color:${color}">Password strength: ${res}</small>`;
  });

  pwd2.addEventListener('input', () => {
    if (!pwd2.value) return;
    msg.innerHTML = pwd.value === pwd2.value
      ? `<small style="color:green">✅ Passwords match</small>`
      : `<small style="color:red">❌ Passwords do not match</small>`;
  });

  // final submit validation
  form.addEventListener('submit', (e) => {
    const errors = [];
    if (!emailValid(email.value)) errors.push("Please enter a valid email.");
    if (strengthResult(pwd.value) !== "Strong") errors.push("Password must be Strong (8+ chars, upper+lower+number+special).");
    if (pwd.value !== pwd2.value) errors.push("Passwords do not match.");

    if (errors.length) {
      e.preventDefault();
      msg.innerHTML = errors.map(x => `<div style="color:#b91c1c">${x}</div>`).join("");
    }
  });
});

