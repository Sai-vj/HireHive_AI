function getToken() {
  return localStorage.getItem("token");
}

async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = options.headers || {};
  if (token) headers["Authorization"] = "Bearer " + token;
  headers["Content-Type"] = "application/json";
  return fetch(url, { ...options, headers });
}