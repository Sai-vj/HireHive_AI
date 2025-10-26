// _apiFetch.js
export default async function _apiFetch(path, opts = {}) {
  opts = Object.assign({}, opts);
  // default credentials: same-origin (use 'include' if cross-origin)
  opts.credentials = opts.credentials || 'same-origin';
  // default headers
  opts.headers = Object.assign({ 'Accept': 'application/json' }, opts.headers || {});

  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch (e) { /* no json */ }
  return { ok: res.ok, status: res.status, data, raw: res };
}
