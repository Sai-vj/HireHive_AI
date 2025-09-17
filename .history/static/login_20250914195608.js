document.getElementById("loginForm").addEventListener("submit", async function(e) {
  e.preventDefault();

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const msgBox = document.getElementById("loginMsg");

  try {
    // Token fetch
    const res = await fetch("/api/auth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) {
      msgBox.textContent = "Invalid credentials. Try again.";
      return;
    }

    const data = await res.json();
    localStorage.setItem("token", data.access);

    // Profile fetch
    const profileRes = await fetch("/api/accounts/profile/", {
      headers: { "Authorization": `Bearer ${data.access}` }
    });
    const profile = await profileRes.json();

    // Redirect role based
    if (profile.role === "recruiter") {
      window.location.href = "/recruiter-dashboard/";
    } else {
      window.location.href = "/candidate-dashboard/";
    }
  } catch (err) {
    msgBox.textContent = "Error: " + err.message;
  }
});