// after login
localStorage.setItem('token', token);
const profile = await fetch('/api/accounts/profile/', { headers: { 'Authorization':'Bearer '+token } }).then(r=>r.json());
if (profile.role==='recruiter') window.location='/resumes/recruiter_dashboard/';
else window.location='/resumes/candidate_dashboard/';



// login.js - simple login flow using api/token/
async function doLogin(username, password) {
  try {
    const res = await fetch('/accounts/api/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.detail || 'Login failed');
      return;
    }
    // save tokens
    localStorage.setItem('token', data.access);
    localStorage.setItem('refresh', data.refresh);

    // fetch profile to get role and redirect
    const prof = await fetch('/accounts/api/profile/', {
      headers: { 'Authorization': 'Bearer ' + data.access, 'Accept': 'application/json' }
    });
    const pjson = await prof.json();
    if (!prof.ok) {
      // token issue maybe; still redirect to login
      alert('Could not fetch profile');
      return;
    }
    const role = pjson.role || '';
    if (role === 'recruiter') {
      window.location = '/accounts/recruiter-dashboard/';
    } else {
      window.location = '/accounts/candidate-dashboard/';
    }
  } catch (err) {
    console.error(err);
    alert('Network/error during login');
  }
}

// wire form
document.getElementById('loginForm')?.addEventListener('submit', function(e){
  e.preventDefault();
  const u = document.getElementById('username').value.trim();
  const p = document.getElementById('password').value;
  doLogin(u,p);
});

