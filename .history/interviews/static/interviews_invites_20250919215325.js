/* interviews_invites.js
   - requires: apiFetch (utils.js), fetchWithAuth (optional), bootstrap, showToast, showSpinner
*/

(function () {
  // guard: don't redeclare escapeHtml if already present
  if (typeof escapeHtml !== 'function') {
    window.escapeHtml = function (s) {
      if (s === null || s === undefined) return '';
      return String(s).replace(/[&<>"'`]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#x60;' })[m]);
    };
  }

  if (typeof showToast !== 'function') {
    window.showToast = function (msg, type = 'info', timeout = 3000) { console.log('TOAST', type, msg); };
  }
  if (typeof showSpinner !== 'function') {
    window.showSpinner = function (on, text = '') { /* noop */ };
  }

  // API paths
  const INVITES_URL_TRIES = [
    '/api/interviews/candidate/invites/',
    '/api/interviews/invites/candidate/',
    '/api/interviews/candidate/invites',
    '/api/interviews/invites/',
  ];

  // load invites for inline dashboard section
  async function loadInvites() {
    const container = document.getElementById('invitesSection');
    const listEl = document.getElementById('invitesList');
    if (!listEl || !container) return;
    listEl.innerHTML = '<div class="small-muted">Loading invites...</div>';
    container.style.display = 'block';

    let data = null;
    for (const u of INVITES_URL_TRIES) {
      try {
        const res = await apiFetch(u, { method: 'GET' });
        if (!res) continue;
        if (res.status === 401 || res.status === 403) {
          listEl.innerHTML = `<div class="text-danger">Authentication required. Paste token and Save.</div>`;
          return;
        }
        if (!res.ok) continue;
        data = Array.isArray(res.data) ? res.data : (res.data?.results || res.data?.invitations || []);
        break;
      } catch (e) { continue; }
    }

    if (!data || data.length === 0) {
      listEl.innerHTML = '<div class="small-muted">No invites found.</div>';
      return;
    }

    listEl.innerHTML = '';
    data.forEach(inv => {
      const status = (inv.status || 'pending').toLowerCase();
      const interview = inv.interview || inv.interview_data || {};
      const interviewId = interview.id || interview.pk || inv.interview_id || inv.interview || '';
      const title = interview.title || inv.title || 'Interview';
      const recruiter = inv.recruiter_name || inv.recruiter || (interview.recruiter || '');
      const div = document.createElement('div');
      div.className = 'card p-2 mb-2';
      div.innerHTML = `
        <div class="d-flex justify-content-between">
          <div style="min-width:0">
            <strong style="display:block">${escapeHtml(title)}</strong>
            <div class="small-muted">${inv.scheduled_at ? new Date(inv.scheduled_at).toLocaleString() : (interview.scheduled_at ? new Date(interview.scheduled_at).toLocaleString() : '—')}</div>
            <div class="small-muted">From: ${escapeHtml(recruiter)}</div>
          </div>
          <div style="text-align:right;min-width:180px">
            <div class="mb-1">Status: <span class="badge ${status==='accepted'?'bg-success':status==='declined'?'bg-danger':'bg-secondary'}">${escapeHtml(status)}</span></div>
            <div>
              ${status==='pending' ? `<button class="btn btn-sm btn-success accept-invite-btn me-1" data-id="${inv.id}">Accept</button><button class="btn btn-sm btn-outline-danger decline-invite-btn" data-id="${inv.id}">Decline</button>` : ''}
              ${status==='accepted' && interviewId ? `<button class="btn btn-sm btn-primary start-interview-btn" data-interview-id="${interviewId}" data-invite-id="${inv.id}">Start Interview</button>` : ''}
            </div>
          </div>
        </div>`;
      listEl.appendChild(div);
    });

    // wire buttons
    listEl.querySelectorAll('.accept-invite-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        await respondInvite(btn.dataset.id, 'accept');
        setTimeout(loadInvites, 400);
      });
    });
    listEl.querySelectorAll('.decline-invite-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        await respondInvite(btn.dataset.id, 'decline');
        setTimeout(loadInvites, 400);
      });
    });
    listEl.querySelectorAll('.start-interview-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        await startInterview(btn.dataset.interviewId, btn.dataset.inviteId);
        btn.disabled = false;
      });
    });
  }

  // open invites modal (requires DOM elements #invitesModal and #invitesListModal)
  async function openInvitesModal() {
    const mEl = document.getElementById('invitesModal');
    const listEl = document.getElementById('invitesListModal');
    if (!mEl || !listEl) {
      alert('Invites modal DOM missing (#invitesModal, #invitesListModal)');
      return;
    }

    try { new bootstrap.Modal(mEl, { backdrop: 'static' }).show(); } catch (e) { mEl.style.display = 'block'; }

    listEl.innerHTML = '<div class="small-muted">Loading invites...</div>';

    let data = null;
    for (const u of INVITES_URL_TRIES) {
      try {
        const res = await apiFetch(u, { method: 'GET' });
        if (!res) continue;
        if (res.status === 401 || res.status === 403) { listEl.innerHTML = '<div class="text-danger">Auth required. Paste token and Save.</div>'; return; }
        if (!res.ok) continue;
        data = Array.isArray(res.data) ? res.data : (res.data?.results || res.data?.invitations || []);
        break;
      } catch (e) { continue; }
    }

    if (!data || data.length === 0) { listEl.innerHTML = '<div class="small-muted">No invites found.</div>'; return; }

    listEl.innerHTML = '';
    data.forEach(inv => {
      const status = (inv.status || 'pending').toLowerCase();
      const interview = inv.interview || inv.interview_data || {};
      const interviewId = interview.id || interview.pk || inv.interview_id || inv.interview || '';
      const title = interview.title || inv.title || 'Interview';
      const recruiter = inv.recruiter_name || inv.recruiter || (interview.recruiter || '');
      const row = document.createElement('div');
      row.className = 'card p-2 mb-2';
      row.innerHTML = `
        <div class="d-flex justify-content-between">
          <div style="min-width:0">
            <strong style="display:block">${escapeHtml(title)}</strong>
            <div class="small text-muted">${inv.scheduled_at ? new Date(inv.scheduled_at).toLocaleString() : (interview.scheduled_at ? new Date(interview.scheduled_at).toLocaleString() : '—')}</div>
            <div class="small text-muted">From: ${escapeHtml(recruiter)}</div>
          </div>
          <div style="min-width:160px;text-align:right">
            <div class="mb-2">Status: <span class="badge ${status==='accepted'?'bg-success':status==='declined'?'bg-danger':'bg-secondary'}">${escapeHtml(status)}</span></div>
            <div>
              ${status==='pending' ? `<button class="btn btn-sm btn-success modal-accept" data-id="${inv.id}">Accept</button>
                                    <button class="btn btn-sm btn-outline-danger modal-decline" data-id="${inv.id}">Decline</button>` : ''}
              ${status==='accepted' && interviewId ? `<button class="btn btn-sm btn-primary modal-start" data-interview-id="${interviewId}" data-invite-id="${inv.id}">Start Interview</button>` : ''}
            </div>
          </div>
        </div>`;
      listEl.appendChild(row);
    });

    // wire modal buttons
    listEl.querySelectorAll('.modal-accept').forEach(b=>{
      b.addEventListener('click', async ()=>{
        b.disabled=true;
        const r = await respondInvite(b.dataset.id,'accept');
        if (r && r.ok) showToast('Accepted','success'); else showToast('Accept failed','error');
        setTimeout(openInvitesModal, 400);
      });
    });
    listEl.querySelectorAll('.modal-decline').forEach(b=>{
      b.addEventListener('click', async ()=>{
        b.disabled=true;
        const r = await respondInvite(b.dataset.id,'decline');
        if (r && r.ok) showToast('Declined','success'); else showToast('Decline failed','error');
        setTimeout(openInvitesModal, 400);
      });
    });
    listEl.querySelectorAll('.modal-start').forEach(b=>{
      b.addEventListener('click', async ()=>{
        b.disabled=true;
        await startInterview(b.dataset.interviewId, b.dataset.inviteId);
        b.disabled=false;
      });
    });
  }

  // respond to invite (form-encoded)
  async function respondInvite(inviteId, action) {
    if (!inviteId || !action) return { ok:false };
    try {
      const form = new URLSearchParams();
      form.append('response', action);
      const res = await apiFetch(`/api/interviews/candidate/invites/${encodeURIComponent(inviteId)}/respond/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString()
      });
      return res;
    } catch (e) {
      console.error('respondInvite error', e);
      return { ok:false, error:e };
    }
  }

  // start interview: call API start and open returned redirect_url or attempts page
  async function startInterview(interviewId, inviteId) {
    if (!interviewId) { showToast('Invalid interview id', 'error'); return { ok:false }; }
    showSpinner(true, 'Starting interview...');
    try {
       const resp = await fetch(`/interviews/candidate/${interviewId}/start/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // include auth header if needed
      },
      body: JSON.stringify({ /* any payload if required */ })
    });
      console.debug('start API ->', res);
      if (!res) { showToast('No response from server', 'error'); return { ok:false }; }

      if (res.ok) {
        const redirect = res.data?.redirect_url || res.data?.url || res.data?.join_url || null;
        if (redirect) {
          window.open(redirect, '_blank', 'noopener,noreferrer');
          return { ok:true, url: redirect };
        }
        const attemptId = res.data?.id || res.data?.attempt_id || res.data?.pk;
        if (attemptId) {
          const attemptUrl = `/attempts/${encodeURIComponent(attemptId)}/`;
          window.open(attemptUrl, '_blank', 'noopener,noreferrer');
          return { ok:true, url: attemptUrl };
        }
        showToast('Interview started', 'success');
        return { ok:true };
      } else {
        if (res.status === 401 || res.status === 403) {
          showToast('Authentication required. Save token or log in.', 'error', 6000);
        } else {
          const detail = res.data?.detail || `Status ${res.status}`;
          showToast('Failed to start interview: ' + detail, 'error', 6000);
        }
        return { ok:false, res };
      }
    } catch (err) {
      console.error('startInterview error', err);
      showToast('Network error while starting interview', 'error');
      return { ok:false, error:err };
    } finally {
      showSpinner(false);
    }
  }

  // expose
  window.loadInvites = loadInvites;
  window.openInvitesModal = openInvitesModal;
  window.respondInvite = respondInvite;
  window.startInterview = startInterview;

  // auto load inline invites if present
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(loadInvites, 200));
  } else {
    setTimeout(loadInvites, 200);
  }

  // attach click for modal opener [data-open-invites-modal]
  document.addEventListener('click', function(e){
    const t = e.target.closest && e.target.closest('[data-open-invites-modal]');
    if (!t) return;
    e.preventDefault();
    openInvitesModal();
  }, false);

})();
