/* interviews/invites.js - plain script (no import/exports)
   Paste this into your static folder and include with a normal <script src="..."></script>
*/
(function () {
  if (window.__interviewsInvitesLoaded) return;
  window.__interviewsInvitesLoaded = true;

  // Helpers
  function getToken() {
    const fromInput = document.getElementById && document.getElementById('tokenInput');
    const val = (fromInput && fromInput.value && fromInput.value.trim()) || localStorage.getItem('token') || '';
    return val ? val.replace(/^Bearer\s+/i, '') : '';
  }

  function showToast(msg, type = 'info', timeout = 3000) {
    const colors = { info: '#eef2ff', success: '#e6ffed', error: '#ffe6e6' };
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.style = 'position:fixed;right:18px;top:18px;z-index:12000;width:320px';
      document.body.appendChild(container);
    }
    const d = document.createElement('div');
    d.style = `margin-bottom:8px;padding:8px;border-radius:6px;background:${colors[type]||colors.info};border:1px solid #ddd;`;
    d.textContent = msg;
    container.appendChild(d);
    setTimeout(()=>d.remove(), timeout);
  }

  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"'`]/g, function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#x60;'})[m]; });
  }

  async function fetchWithAuth(url, opts = {}) {
    const headers = opts.headers ? Object.assign({}, opts.headers) : {};
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    // default json header if body and not formdata
    if (opts.body && !(opts.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    try {
      const res = await fetch(url, Object.assign({ credentials: 'same-origin', method: opts.method || 'GET', headers }, opts));
      let data = null;
      const txt = await res.text().catch(()=>null);
      try { data = txt ? JSON.parse(txt) : null; } catch(e) { data = txt; }
      return { ok: res.ok, status: res.status, data, raw: res };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  // Try sequence of endpoints until success
  async function tryApiUrls(urls, opts = {}) {
    for (const u of urls) {
      const r = await fetchWithAuth(u, opts);
      if (!r) continue;
      // on auth error, return it immediately
      if (r.status === 401 || r.status === 403) return r;
      if (r.ok) return r;
      // else continue trying other shapes
    }
    return null;
  }

  // FRONTEND candidate page route guess
  function frontendInterviewPage(iid, inviteId) {
    return `/interviews/candidate/${encodeURIComponent(iid)}/?invite=${encodeURIComponent(inviteId||'')}`;
  }

  // Open invites modal (expects #invitesModal and #invitesListModal in DOM, fallback to #invitesList section)
  async function openInvitesModal() {
    const modalEl = document.getElementById('invitesModal');
    const listEl = document.getElementById('invitesListModal') || document.getElementById('invitesList');
    if (!listEl) {
      showToast('Invites DOM missing (#invitesModal or #invitesListModal or #invitesList)', 'error', 5000);
      return;
    }
    // show modal if exists
    try { if (modalEl && window.bootstrap && window.bootstrap.Modal) new bootstrap.Modal(modalEl, {backdrop:'static'}).show(); else if (modalEl) modalEl.style.display='block'; } catch (e) {}

    listEl.innerHTML = '<div class="small-muted">Loading invites...</div>';

    const tries = [
      '/api/interviews/candidate/invites/',
      '/api/interviews/invites/candidate/',
      '/api/interviews/candidate/invites',
      '/api/interviews/invites/',
    ];
    let res = await tryApiUrls(tries, { method: 'GET' });
    if (!res) { listEl.innerHTML = '<div class="text-muted">No invites (no usable endpoint)</div>'; return; }
    if (res.status === 401 || res.status === 403) { listEl.innerHTML = '<div class="text-danger">Authentication required — paste token and Save.</div>'; return; }
    const data = Array.isArray(res.data) ? res.data : (res.data && (res.data.results || res.data.invitations) ? (res.data.results || res.data.invitations) : []);
    if (!data || data.length === 0) { listEl.innerHTML = '<div class="text-muted">No invites found.</div>'; return; }

    listEl.innerHTML = '';
    data.forEach(inv => {
      const status = (inv.status || 'pending').toLowerCase();
      const interview = inv.interview || inv.interview_data || {};
      const interviewId = interview.id || interview.pk || inv.interview_id || inv.interview || '';
      const title = interview.title || inv.title || 'Interview';
      const recruiter = inv.recruiter_name || inv.recruiter || (interview.recruiter || '');
      const card = document.createElement('div');
      card.className = 'card p-2 mb-2';
      card.innerHTML = `
        <div class="d-flex justify-content-between">
          <div style="min-width:0">
            <strong style="display:block">${escapeHtml(title)}</strong>
            <div class="small-muted" style="margin-top:4px">${inv.scheduled_at ? new Date(inv.scheduled_at).toLocaleString() : '—'}</div>
            <div class="small-muted" style="margin-top:4px">From: ${escapeHtml(recruiter)}</div>
          </div>
          <div style="text-align:right;min-width:160px">
            <div class="mb-1">Status: <span class="badge ${status==='accepted'?'bg-success':status==='declined'?'bg-danger':'bg-secondary'}">${escapeHtml(status)}</span></div>
            <div>
              ${status==='pending' ? `<button class="btn btn-sm btn-success modal-accept" data-id="${inv.id}">Accept</button> <button class="btn btn-sm btn-outline-danger modal-decline" data-id="${inv.id}">Decline</button>` : ''}
              ${interviewId ? `<button class="btn btn-sm btn-primary modal-start" data-interview-id="${interviewId}" data-invite-id="${inv.id}">Start Interview</button>` : ''}
            </div>
          </div>
        </div>
      `;
      listEl.appendChild(card);
    });

    // wire handlers
    listEl.querySelectorAll('.modal-accept').forEach(b => {
      b.addEventListener('click', async () => {
        b.disabled = true;
        const id = b.dataset.id;
        const r = await respondInvite(id, 'accept');
        if (r && r.ok) showToast('Accepted', 'success'); else showToast('Accept failed', 'error');
        setTimeout(openInvitesModal, 400);
      });
    });
    listEl.querySelectorAll('.modal-decline').forEach(b => {
      b.addEventListener('click', async () => {
        b.disabled = true;
        const id = b.dataset.id;
        const r = await respondInvite(id, 'decline');
        if (r && r.ok) showToast('Declined', 'success'); else showToast('Decline failed', 'error');
        setTimeout(openInvitesModal, 400);
      });
    });
    listEl.querySelectorAll('.modal-start').forEach(b => {
      b.addEventListener('click', async () => {
        b.disabled = true;
        const iid = b.dataset.interviewId;
        const inviteId = b.dataset.inviteId;
        // try server-side start endpoints:
        const startTries = [
          `/api/interviews/candidate/${encodeURIComponent(iid)}/start/`,
          `/api/interviews/${encodeURIComponent(iid)}/start/`,
          `/api/interviews/start/${encodeURIComponent(iid)}/`,
        ];
        let r = await tryApiUrls(startTries, { method: 'POST' });
        if (r && r.ok) {
          // if server returned url
          const url = (r.data && (r.data.redirect_url || r.data.url || r.data.join_url || r.data.attempt_url)) || null;
          if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
            try { if (modalEl && window.bootstrap) bootstrap.Modal.getInstance(modalEl)?.hide(); } catch(e){}
            return;
          }
          // if server returned attempt id
          const attemptId = r.data && (r.data.attempt_id || r.data.id || r.data.pk) || null;
          if (attemptId) {
            const attUrl = `/attempts/${attemptId}/`;
            window.open(attUrl, '_blank', 'noopener,noreferrer');
            try { if (modalEl && window.bootstrap) bootstrap.Modal.getInstance(modalEl)?.hide(); } catch(e){}
            return;
          }
          // else open frontend page fallback
        } else if (r && (r.status === 401 || r.status === 403)) {
          showToast('Authentication required to start interview', 'error');
          b.disabled = false;
          return;
        } else if (r && r.status === 500 && r.data) {
          // show server-side message if provided
          const msg = (r.data.detail || r.data.message || JSON.stringify(r.data));
          showToast('Server error: ' + msg, 'error', 5000);
          b.disabled = false;
          return;
        }

        // Fallback: probe likely frontend routes (HEAD) then open
        const frontTries = [
          `/interviews/candidate/${encodeURIComponent(iid)}/?invite=${encodeURIComponent(inviteId||'')}`,
          `/candidate/interview/${encodeURIComponent(iid)}/?invite=${encodeURIComponent(inviteId||'')}`,
          `/interviews/page/candidate/${encodeURIComponent(iid)}/?invite=${encodeURIComponent(inviteId||'')}`,
          `/interviews/templates/candidate_interview.html?interview=${encodeURIComponent(iid)}&invite=${encodeURIComponent(inviteId||'')}`
        ];
        for (const url of frontTries) {
          try {
            const h = await fetch(url, { method: 'HEAD', credentials: 'same-origin' });
            if (h && h.status >= 200 && h.status < 400) {
              window.open(url, '_blank', 'noopener,noreferrer');
              try { if (modalEl && window.bootstrap) bootstrap.Modal.getInstance(modalEl)?.hide(); } catch(e){}
              return;
            }
          } catch(e) { /* ignore */ }
        }
        // last fallback open canonical guess
        const final = `/interviews/candidate/${encodeURIComponent(iid)}/?invite=${encodeURIComponent(inviteId||'')}`;
        window.open(final, '_blank', 'noopener,noreferrer');
        try { if (modalEl && window.bootstrap) bootstrap.Modal.getInstance(modalEl)?.hide(); } catch(e){}
        b.disabled = false;
      });
    });

  } // openInvitesModal

  async function respondInvite(inviteId, action) {
    if (!inviteId) return { ok: false, error: 'missing inviteId' };
    const tries = [
      `/api/interviews/candidate/invites/${encodeURIComponent(inviteId)}/respond/`,
      `/api/interviews/invites/${encodeURIComponent(inviteId)}/respond/`,
      `/api/interviews/invites/${encodeURIComponent(inviteId)}/respond`,
    ];
    // try JSON payload
    for (const u of tries) {
      const r = await fetchWithAuth(u, { method: 'POST', body: JSON.stringify({ response: action }) });
      if (!r) continue;
      if (r.status === 401 || r.status === 403) return r;
      // accept 200/201 as success
      if (r.ok) return r;
      // try alternate key if 400
      if (r.status === 400 || r.status === 422) {
        const r2 = await fetchWithAuth(u, { method: 'POST', body: JSON.stringify({ action }) });
        if (r2 && r2.ok) return r2;
        // try form encoded
        const fd = new URLSearchParams(); fd.append('response', action);
        const r3 = await fetchWithAuth(u, { method: 'POST', body: fd });
        if (r3 && r3.ok) return r3;
      }
    }
    return { ok: false, status: 404, detail: 'No matching respond endpoint' };
  }

  // quick attach to "View Invites" button if present
  document.addEventListener('click', function(e) {
    const t = e.target.closest && e.target.closest('[data-open-invites-modal]');
    if (t) { e.preventDefault(); openInvitesModal(); }
    const vb = e.target.closest && e.target.closest('#viewInvitesBtn');
    if (vb) { e.preventDefault(); openInvitesModal(); }
  }, false);

  // expose to window for console usage
  window.openInvitesModal = openInvitesModal;
  window.respondInvite = respondInvite;

  console.log('[invites.js] loaded');
})();
