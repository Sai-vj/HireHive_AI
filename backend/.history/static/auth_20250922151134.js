document.addEventListener('DOMContentLoaded', function() {
  // password show toggle on login
  const toggle = document.getElementById('togglePwd');
  if (toggle) {
    toggle.addEventListener('click', function() {
      const pwd = document.getElementById('password');
      if (!pwd) return;
      if (pwd.type === 'password') { pwd.type = 'text'; toggle.innerText = 'Hide'; }
      else { pwd.type = 'password'; toggle.innerText = 'Show'; }
    });
  }

  // register validation
  const reg = document.getElementById('registerForm');
  if (reg) {
    reg.addEventListener('submit', function(e) {
      const p1 = document.getElementById('regPwd').value;
      const p2 = document.getElementById('regPwd2').value;
      if (p1 !== p2) {
        e.preventDefault();
        hh.showToast('Passwords do not match');
        return false;
      }
      if (p1.length < 6) {
        e.preventDefault();
        hh.showToast('Password should be at least 6 characters');
        return false;
      }
      return true;
    });
  }

  // login form small validation
  const login = document.getElementById('loginForm');
  if (login) {
    login.addEventListener('submit', function(e) {
      const user = login.querySelector('input[name="username"]').value.trim();
      const pwd = login.querySelector('input[name="password"]').value.trim();
      if (!user || !pwd) {
        e.preventDefault();
        hh.showToast('Please fill both fields');
        return false;
      }
    });
  }
});
