document.getElementById("loginForm").addEventListener("submit", async function(e) {
  e.preventDefault();

  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  try {
    // 1. Get token
    const res = await fetch("/api/auth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) throw new Error("Invalid credentials");
    const data = await res.json();

    // 2. Save token
    localStorage.setItem("token", data.access);

    // 3. Get profile to check role
    const profileRes = await fetch("/api/accounts/profile/", {
      headers: { "Authorization": `Bearer ${data.access}` }
    });
    const profile = await profileRes.json();

    // 4. Redirect based on role
    if (profile.role === "recruiter") {
      window.location.href = "/recruiter-dashboard/";
    } else {
      window.location.href = "/candidate-dashboard/";
    }

  } catch (err) {
    alert("Login failed: " + err.message);
  }
});