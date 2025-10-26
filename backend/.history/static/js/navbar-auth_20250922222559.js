// static/navbar-auth.js
(async function () {
  async function fetchProfile() {
    try {
      const r = await fetch('/accounts/profile-api/', { credentials: 'same-origin' });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  }

  function updateNavbar(user) {
    const container = document.querySelector('.navbar .d-flex.ms-3');
    if (!container) return;

    container.innerHTML = ''; // clear old buttons

    if (user) {
      // show dashboard + logout
      const dashUrl = user.role === 'recruiter' ? '/accounts/recruiter-dashboard/' : '/accounts/candidate-dashboard/';
      container.innerHTML = `
        <a class="btn btn-primary me-2" href="${dashUrl}">Dashboard</a>
        <button class="btn btn-outline-danger" id="logoutBtn">Logout</button>
      `;
      document.getElementById('logoutBtn').addEventListener('click', async () => {
        await fetch('/accounts/token/logout/', { method: 'POST', credentials: 'same-origin' });
        location.href = '/'; // back to home
      });
    } else {
      // guest view
      container.innerHTML = `
        <a class="btn btn-primary me-2" href="/accounts/login/">Login</a>
        <a class="btn btn-outline-primary" href="/accounts/register/">Register</a>
      `;
    }
  }

  const profile = await fetchProfile();
  updateNavbar(profile);
})();
