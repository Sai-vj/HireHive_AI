document.getElementById("registerForm").addEventListener("submit", async function(e) {
  e.preventDefault();

  const username = document.getElementById("username").value;
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const role = document.getElementById("role").value;
  const msgBox = document.getElementById("registerMsg");

  try {
    const res = await fetch("/api/accounts/register/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password, role })
    });

    if (!res.ok) {
      const err = await res.json();
      msgBox.textContent = err.detail || "Registration failed.";
      return;
    }

    msgBox.classList.remove("text-danger");
    msgBox.classList.add("text-success");
    msgBox.textContent = "Registered successfully! Redirecting to login...";

    setTimeout(() => {
      window.location.href = "/login/";
    }, 1500);

  } catch (err) {
    msgBox.textContent = "Error: " + err.message;
  }
});