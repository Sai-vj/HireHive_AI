// after login
localStorage.setItem('token', token);
const profile = await fetch('/api/accounts/profile/', { headers: { 'Authorization':'Bearer '+token } }).then(r=>r.json());
if (profile.role==='recruiter') window.location='/resumes/recruiter_dashboard/';
else window.location='/resumes/candidate_dashboard/';



