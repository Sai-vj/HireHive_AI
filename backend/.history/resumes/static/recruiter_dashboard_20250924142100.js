// static/recruiter_dashboard.js
// Patched consolidated recruiter dashboard script
(function () {
  'use strict';

  /* ---------------- Config ---------------- */
  const API_ROOT = '/api';
  const JOBS_ENDPOINT = `${API_ROOT}/resumes/jobs/`;
  const TOKEN_KEY = 'recruiter_token_v1';

  const INTERVIEWS_INVITE_BY_JOB = (jobId) => `${API_ROOT}/interviews/recruiter/${encodeURIComponent(jobId)}/invite/`;

  /* ---------------- helpers ---------------- */
  function log(...args) { console.debug('[Rdash]', ...args); }
  function errlog(...args) { console.error('[Rdash]', ...args); }

  function qs(sel, root = document) { try { return root.querySelector(sel); } catch (e) { return null; } }
  function qsa(sel, root = document) { try { return Array.from(root.querySelectorAll(sel)); } catch (e) { return []; } }

  function savedToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
  function setSavedToken(t) { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }
  function authHeaders() {
    const t = savedToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  function showToast(msg, type = 'info', ms = 3500) {
    ensureToastContainer();
    const container = document.getElementById('toastContainer') || document.body;
    const el = document.createElement('div');
    el.className = 'rdash-toast';
    el.style = 'padding:10px 14px;border-radius:8px;margin-bottom:8px;box-shadow:0 1px 4px rgba(0,0,0,0.06);max-width:360px;';
    el.innerHTML = `<div style="background:${
      type === 'error' ? '#fde2e2' : type === 'success' ? '#e7f7ef' : '#fff9db'
    };border:1px solid #eee;padding:8px;border-radius:6px;color:#111">${msg}</div>`;
    container.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch(e){} }, ms);
  }

  function escapeHtml(s = '') {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"'`]/g, (m) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#x60;' }[m])
    );
  }

  /* ---------------- Safe bootstrap modal helpers ---------------- */
  function safeShowBootstrapModal(modalEl, options = {}) {
    if (!modalEl) return null;
    try { if (!document.body.contains(modalEl)) document.body.appendChild(modalEl); } catch (e) {}
    try {
      if (!modalEl.classList.contains('modal')) modalEl.classList.add('modal');
      modalEl.setAttribute('tabindex', modalEl.getAttribute('tabindex') || '-1');
      modalEl.setAttribute('role', modalEl.getAttribute('role') || 'dialog');
      if (!modalEl.getAttribute('aria-hidden')) modalEl.setAttribute('aria-hidden', 'true');
    } catch (e) {}
    function plainShow() {
      try {
        modalEl.style.display = 'block';
        modalEl.classList.remove('d-none');
        modalEl.classList.add('show');
        modalEl.setAttribute('aria-modal', 'true');
        modalEl.setAttribute('aria-hidden', 'false');
        if (!document.querySelector('.modal-backdrop.custom-rdash-backdrop')) {
          const bd = document.createElement('div');
          bd.className = 'modal-backdrop fade show custom-rdash-backdrop';
          document.body.appendChild(bd);
        }
        document.body.style.overflow = 'hidden';
        try {
          const focusable = modalEl.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
          if (focusable) focusable.focus(); else modalEl.focus();
        } catch (e) {}
      } catch (e) { console.warn('plainShow failed', e); }
      return null;
    }
    if (window.RDASH_FORCE_NO_BOOTSTRAP) return plainShow();
    try {
      if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        let inst = null;
        try {
          if (typeof bootstrap.Modal.getOrCreateInstance === 'function') {
            inst = bootstrap.Modal.getOrCreateInstance(modalEl, Object.assign({ backdrop: 'static' }, options));
          } else {
            try { inst = bootstrap.Modal.getInstance(modalEl); } catch (e) { inst = null; }
            if (!inst) inst = new bootstrap.Modal(modalEl, Object.assign({ backdrop: 'static' }, options));
          }
        } catch (createErr) {
          console.warn('bootstrap instance creation error, falling back to plainShow:', createErr);
          return plainShow();
        }
        try {
          requestAnimationFrame(() => {
            try {
              if (inst && typeof inst.show === 'function') {
                try {
                  inst.show();
                  return;
                } catch (errShow) {
                  console.warn('inst.show() failed, falling back to plainShow', errShow);
                  plainShow();
                  return;
                }
              }
              plainShow();
            } catch (frameErr) {
              console.warn('requestAnimationFrame show error, fallback to plainShow', frameErr);
              plainShow();
            }
          });
          return inst;
        } catch (showErr) {
          console.warn('bootstrap show wrapper failed, falling back to plainShow', showErr);
          return plainShow();
        }
      }
    } catch (outerErr) {
      console.warn('bootstrap try/catch outer failed, fallback to plainShow', outerErr);
      return plainShow();
    }
    return plainShow();
  }

  function safeHideBootstrapModal(modalEl) {
    if (!modalEl) return;
    try {
      if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        try {
          const inst = bootstrap.Modal.getInstance(modalEl);
          if (inst && typeof inst.hide === 'function') {
            inst.hide();
            document.querySelectorAll('.modal-backdrop.custom-rdash-backdrop').forEach(el => el.remove());
            document.body.style.overflow = '';
            return;
          }
        } catch (e) { console.warn('bootstrap hide attempt failed', e); }
      }
    } catch (e) { console.warn('bootstrap hide wrapper failed', e); }
    try {
      modalEl.style.display = 'none';
      modalEl.classList.remove('show');
      modalEl.classList.add('d-none');
      modalEl.setAttribute('aria-hidden', 'true');
      modalEl.removeAttribute('aria-modal');
    } catch (e) {}
    document.querySelectorAll('.modal-backdrop.custom-rdash-backdrop').forEach(el => el.remove());
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
    document.body.style.overflow = '';
  }

  /* ---------------- API fetch wrappers ---------------- */
  async function apiFetch(path, opts = {}) {
    opts = Object.assign({}, opts);
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}, authHeaders());
    log('apiFetch', path, opts.method || 'GET', opts.headers);
    try {
      const r = await fetch(path, opts);
      if (r.status === 401 || r.status === 403) {
        localStorage.removeItem(TOKEN_KEY);
        showToast('Not authorized — paste a valid token and retry', 'error', 4000);
        return { ok: false, status: r.status, data: null };
      }
      const text = await r.text().catch(() => null);
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
      return { ok: r.ok, status: r.status, data, text };
    } catch (e) {
      errlog('apiFetch error', e);
      return { ok: false, status: 0, error: true, exception: String(e) };
    }
  }

  async function apiFetchSimple(path, opts = {}) {
    opts = Object.assign({}, opts);
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}, authHeaders());
    log('apiFetchSimple', path, opts.method || 'GET');
    try {
      const r = await fetch(path, opts);
      if (r.status === 401 || r.status === 403) {
        localStorage.removeItem(TOKEN_KEY);
        showToast('Not authorized — paste a valid token and retry', 'error', 4000);
        return { ok: false, status: r.status, data: null };
      }
      const text = await r.text().catch(()=>null);
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch(e){ data = text; }
      return { ok: r.ok, status: r.status, data, text };
    } catch (e) {
      errlog('apiFetchSimple error', e);
      return { ok: false, status: 0, error: true, exception: String(e) };
    }
  }

  /* ---------------- DOM / fallback modal creation ---------------- */
  function ensureToastContainer() {
    let c = document.getElementById('toastContainer');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toastContainer';
      c.style = 'position:fixed;right:18px;top:18px;z-index:12000;width:320px;max-width:calc(100% - 40px);';
      document.body.appendChild(c);
    }
    return c;
  }

  function createFallbackAddJobModal() {
    if (document.getElementById('addJobModal')) return document.getElementById('addJobModal');
    const modal = document.createElement('div');
    modal.id = 'addJobModal';
    modal.className = 'modal fade d-none';
    modal.style = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.35);z-index:99999';
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width:720px">
        <div class="modal-content p-3">
          <div class="modal-header"><h5 class="modal-title">Create job</h5><button type="button" class="btn-close" aria-label="Close"></button></div>
          <form id="addJobForm">
            <div class="modal-body">
              <div class="mb-2"><label class="form-label">Title</label><input id="jobTitle" required class="form-control" /></div>
              <div class="mb-2"><label class="form-label">Company</label><input id="jobCompany" class="form-control" /></div>
              <div class="mb-2"><label class="form-label">Skills (comma separated)</label><input id="jobSkills" class="form-control" /></div>
              <div class="mb-2"><label class="form-label">Experience required (years)</label><input id="jobExperience" type="number" class="form-control" value="0" /></div>
              <div class="mb-2"><label class="form-label">Vacancies</label><input id="jobVacancies" type="number" class="form-control" value="1" /></div>
              <div class="mb-2"><label class="form-label">Description</label><textarea id="jobDescription" class="form-control" rows="4"></textarea></div>
            </div>
            <div class="modal-footer"><button type="button" class="btn btn-outline-secondary cancel-btn">Cancel</button><button type="submit" class="btn btn-primary">Create</button></div>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('.btn-close')?.addEventListener('click', () => safeHideBootstrapModal(modal));
    modal.querySelector('.cancel-btn')?.addEventListener('click', () => safeHideBootstrapModal(modal));
    return modal;
  }

  function ensureInviteModal() {
    let modal = document.getElementById('inviteModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'inviteModal';
    modal.className = 'modal fade';
    modal.setAttribute('tabindex', '-1');
    modal.setAttribute('role', 'dialog');

    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable';
    dialog.setAttribute('role', 'document');

    const content = document.createElement('div');
    content.className = 'modal-content';

    content.innerHTML = `
  <div class="modal-header">
    <h5 class="modal-title">Invite candidate</h5>
    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
  </div>
  <div class="modal-body">
    <input type="hidden" id="invite_interview_id" />
    <div class="mb-2">
      <label class="form-label">Candidate</label>
      <input id="invite_candidate_display" class="form-control" readonly />
    </div>
    <div class="mb-2">
      <label class="form-label">Schedule at</label>
      <input id="invite_scheduled_at" type="datetime-local" class="form-control" />
    </div>
    <div class="mb-2">
      <label class="form-label">Message</label>
      <textarea id="invite_message" class="form-control" rows="3">Hi, you are invited for interview.</textarea>
    </div>
  </div>
  <div class="modal-footer">
    <button id="inviteCancelBtn" type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
    <button id="inviteSendBtn" type="button" class="btn btn-success">Send Invite</button>
  </div>
`;
    dialog.appendChild(content);
    modal.appendChild(dialog);
    document.body.appendChild(modal);
    return modal;
  }

  function ensureAttemptsModal() {
    let modal = document.getElementById('attempts-modal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'attempts-modal';
    modal.className = 'modal fade';
    modal.setAttribute('tabindex', '-1');
    modal.setAttribute('role', 'dialog');

    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable';
    dialog.setAttribute('role', 'document');

    const content = document.createElement('div');
    content.className = 'modal-content';
    content.innerHTML = `
      <div class="modal-header">
        <h5 class="modal-title" id="attempts-modal-title">Attempt history</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body">
        <div id="attempts-loading" class="small-muted">Loading attempts…</div>
        <div id="attempts-list" style="display:none;margin-top:12px"></div>
      </div>
      <div class="modal-footer">
        <button id="attempts-modal-close" type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
        <button id="attempts-modal-ok" type="button" class="btn btn-primary">OK</button>
      </div>
    `;
    dialog.appendChild(content);
    modal.appendChild(dialog);
    document.body.appendChild(modal);

    modal.querySelector('#attempts-modal-close')?.addEventListener('click', () => safeHideBootstrapModal(modal));
    modal.querySelector('#attempts-modal-ok')?.addEventListener('click', () => safeHideBootstrapModal(modal));
    modal.addEventListener('click', (e) => { if (e.target === modal) safeHideBootstrapModal(modal); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') safeHideBootstrapModal(modal); });

    return modal;
  }

  /* ---------------- Core: Jobs, Matches, Applications ---------------- */
  let selectedJob = null;

  async function loadJobs() {
    const container = document.getElementById('jobsList');
    if (!container) return;
    container.innerHTML = '<div class="small-muted">Loading jobs...</div>';
    const res = await apiFetch(JOBS_ENDPOINT);
    if (!res || !res.ok) { container.innerHTML = `<div class="small-muted">Failed to load jobs (${res ? res.status : 'network'})</div>`; return; }
    const jobs = res.data || [];
    if (!Array.isArray(jobs) || jobs.length === 0) { container.innerHTML = `<div class="small-muted">No jobs available</div>`; return; }

    container.innerHTML = '';
    jobs.forEach(j => {
      const row = document.createElement('div');
      row.className = 'list-group-item job-card';
      row.dataset.jobId = j.id;

      const titleEl = document.createElement('h4');
      titleEl.style.margin = '0 0 6px 0';
      titleEl.style.fontSize = '1rem';
      titleEl.style.whiteSpace = 'nowrap';
      titleEl.style.overflow = 'hidden';
      titleEl.style.textOverflow = 'ellipsis';
      titleEl.textContent = j.title || '';

      const metaEl = document.createElement('div');
      metaEl.className = 'small-muted';
      metaEl.style.fontSize = '.9rem';
      metaEl.style.color = '#666';
      metaEl.textContent = `${j.company || ''} • ${j.skills_required || j.skills || ''}`;

      const actions = document.createElement('div');
      actions.className = 'mt-2 d-flex flex-wrap gap-2';
      actions.innerHTML = `
        <button class="btn btn-sm btn-outline-primary view-job-btn" data-job-id="${j.id}">View</button>
        <button class="btn btn-sm btn-warning edit-job-btn" data-job-id="${j.id}">Edit</button>
        <button class="btn btn-sm btn-danger delete-job-btn" data-job-id="${j.id}">Delete</button>
        <button class="btn btn-sm btn-secondary generate-quiz-btn" data-job-id="${j.id}">Generate Quiz</button>
      `;

      row.appendChild(titleEl);
      row.appendChild(metaEl);
      row.appendChild(actions);
      container.appendChild(row);
    });

    attachJobCardEvents();
  }

  function attachJobCardEvents() {
    qsa('.view-job-btn').forEach(btn => {
      if (btn._bound) return; btn._bound = true;
      btn.addEventListener('click', ev => { ev.stopPropagation(); openJobDetail(btn.dataset.jobId); });
    });
    qsa('.edit-job-btn').forEach(btn => {
      if (btn._bound) return; btn._bound = true;
      btn.addEventListener('click', ev => { ev.stopPropagation(); openEditJob(btn.dataset.jobId); });
    });
    qsa('.delete-job-btn').forEach(btn => {
      if (btn._bound) return; btn._bound = true;
      btn.addEventListener('click', ev => { ev.stopPropagation(); confirmAndDeleteJob(btn.dataset.jobId); });
    });
    qsa('.generate-quiz-btn').forEach(btn => {
      if (btn._boundQuiz) return; btn._boundQuiz = true;
      btn.addEventListener('click', async ev => { ev.stopPropagation(); if (!confirm('Generate quiz for this job?')) return; await generateQuizForJob(btn.dataset.jobId, 5); });
    });

    qsa('.job-card').forEach(card => {
      if (card._cardBound) return; card._cardBound = true;
      card.addEventListener('click', ev => {
        const btn = ev.target.closest('button');
        if (btn) return;
        const jid = card.dataset.jobId;
        if (jid) openJobDetail(jid);
      });
    });

    try {
      if (typeof attachGenerateInterviewButtons === 'function') attachGenerateInterviewButtons();

      const genHeaderBtn = qs('#generateQuestionsBtn');
      if (genHeaderBtn && !genHeaderBtn._boundGenHeader) {
        genHeaderBtn._boundGenHeader = true;
        genHeaderBtn.addEventListener('click', async (ev) => {
          ev.stopPropagation(); ev.preventDefault();
          const jobId = genHeaderBtn.dataset.jobId || genHeaderBtn.getAttribute('data-job-id') || (selectedJob && selectedJob.id) || null;
          if (!jobId) return showToast('No job selected', 'error');
          if (!confirm('Create interview for this job and generate questions?')) return;
          await generateQuestionsForJobCreateInterviewThenGenerate(jobId, 5);
          try { await loadJobs(); } catch(e){}
        });
      }
    } catch(e) { console.warn('attach generate buttons failed', e); }
  }

  async function openJobDetail(jobId) {
    if (!jobId) { showToast('Missing job id', 'error'); return; }
    const r = await apiFetch(`${JOBS_ENDPOINT}${encodeURIComponent(jobId)}/`, { method: 'GET' });
    if (!r || !r.ok) { showToast('Unable to load job', 'error'); return; }
    selectedJob = r.data;
    document.getElementById('noJob') && (document.getElementById('noJob').style.display = 'none');
    document.getElementById('jobDetails') && (document.getElementById('jobDetails').style.display = 'block');
    qs('#selectedJobTitle') && (qs('#selectedJobTitle').textContent = selectedJob.title || '');
    qs('#jobMeta') && (qs('#jobMeta').textContent = `${selectedJob.company || ''} • Experience required: ${selectedJob.experience_required || 0}`);

    qsa('#showMatchesBtn, #showShortlistsBtn, #exportCsvBtn, #showApplicationsBtn, .generate-quiz-btn').forEach(b => { if (b) b.dataset.jobId = jobId; });
    qs('#generateQuestionsBtn')?.setAttribute('data-job-id', jobId);

    qs('#matchesList') && (qs('#matchesList').innerHTML = '');
    qs('#applicationsList') && (qs('#applicationsList').innerHTML = '');
  }

  /* ---------------- Add/Edit job ---------------- */
  function openAddJobModal() {
    let modalEl = document.getElementById('addJobModal');
    if (!modalEl) modalEl = createFallbackAddJobModal();
    const form = modalEl.querySelector('#addJobForm');
    if (form && !form._boundSubmit) {
      form._boundSubmit = true;
      form.addEventListener('submit', submitAddJob);
    }
    safeShowBootstrapModal(modalEl, { backdrop: 'static' });
  }

  function openEditJob(jobId) {
    if (!jobId) return showToast('No job id', 'error');
    apiFetch(`${JOBS_ENDPOINT}${encodeURIComponent(jobId)}/`, { method: 'GET' }).then(r => {
      if (!r || !r.ok) return showToast('Failed to load job for edit', 'error');
      const job = r.data || {};
      let modalEl = document.getElementById('addJobModal');
      if (!modalEl) modalEl = createFallbackAddJobModal();
      modalEl.querySelector('#jobTitle').value = job.title || '';
      modalEl.querySelector('#jobCompany').value = job.company || '';
      const skillsField = modalEl.querySelector('#jobSkills');
      if (skillsField) skillsField.value = job.skills_required || job.skills || '';
      modalEl.querySelector('#jobExperience').value = job.experience_required ?? job.experience ?? 0;
      modalEl.querySelector('#jobVacancies').value = job.vacancies ?? job.openings ?? 1;
      modalEl.querySelector('#jobDescription').value = job.description || job.short_description || '';
      modalEl.querySelector('#addJobForm').dataset.editing = String(jobId);
      safeShowBootstrapModal(modalEl);
    }).catch(e => { errlog('openEditJob error', e); showToast('Load failed', 'error'); });
  }

  async function submitAddJob(e) {
    if (e && e.preventDefault) e.preventDefault();
    const modalEl = document.getElementById('addJobModal');
    const form = modalEl && modalEl.querySelector('#addJobForm');
    if (!form) return showToast('Form missing', 'error');
    const title = (form.querySelector('#jobTitle')?.value || '').trim();
    if (!title) return showToast('Title required', 'error');
    const payload = {
      title,
      company: form.querySelector('#jobCompany')?.value || '',
      skills_required: form.querySelector('#jobSkills')?.value || '',
      description: form.querySelector('#jobDescription')?.value || ''
    };
    const editingId = form.dataset.editing || null;

    try {
      let res;
      if (editingId) {
        res = await apiFetch(`${JOBS_ENDPOINT}${encodeURIComponent(editingId)}/`, { method: 'PATCH', body: JSON.stringify(payload) });
        if (!res || !res.ok) {
          res = await apiFetch(`/api/recruiter/job/${encodeURIComponent(editingId)}/`, { method: 'PATCH', body: JSON.stringify(payload) });
        }
      } else {
        res = await apiFetch(JOBS_ENDPOINT, { method: 'POST', body: JSON.stringify(payload) });
      }

      if (!res || !res.ok) {
        console.warn('Job save failed response:', res);
        showToast('Save failed', 'error');
        return;
      }

      const createdJob = res?.data || null;
      const newId = createdJob?.id || editingId || null;

      showToast(editingId ? 'Job updated' : 'Job created', 'success');
      safeHideBootstrapModal(modalEl);
      delete form.dataset.editing;
      await loadJobs();

      if (newId) {
        await openJobDetail(newId);
      }
    } catch (err) {
      errlog('submitAddJob error', err);
      showToast('Save failed', 'error');
    }
  }

  async function confirmAndDeleteJob(jobId) {
    if (!jobId) return;
    if (!confirm('Delete job permanently?')) return;
    const endpoints = [
      `${JOBS_ENDPOINT}${encodeURIComponent(jobId)}/`,
      `/api/resumes/recruiter/job/${encodeURIComponent(jobId)}/delete/`,
    ];
    let lastErr = null;
    for (const url of endpoints) {
      try {
        const r = await fetch(url, { method: 'DELETE', headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()) });
        if (r.ok) {
          showToast('Job deleted', 'success');
          await loadJobs();
          if (selectedJob && String(selectedJob.id) === String(jobId)) {
            selectedJob = null;
            document.getElementById('jobDetails') && (document.getElementById('jobDetails').style.display = 'none');
            document.getElementById('noJob') && (document.getElementById('noJob').style.display = 'block');
          }
          return;
        } else {
          const txt = await r.text().catch(()=>null);
          lastErr = `${r.status} ${txt || ''}`;
          continue;
        }
      } catch (e) { lastErr = String(e); continue; }
    }
    showToast('Delete failed: ' + (lastErr || 'unknown'), 'error');
  }

  /* ---------------- Matches / Applications / Shortlist ---------------- */
  async function showMatchesForSelectedJob(evt) {
    const callerJobId = (evt && evt.currentTarget && evt.currentTarget.dataset && evt.currentTarget.dataset.jobId) ? evt.currentTarget.dataset.jobId : null;
    const jobId = (selectedJob && selectedJob.id) ? selectedJob.id : (callerJobId || null);
    if (!jobId) { showToast('Select a job first (or open a job)', 'error'); return; }

    const listEl = document.getElementById('matchesList');
    if (!listEl) { showToast('Matches container missing', 'error'); return; }
    listEl.innerHTML = '<div class="small-muted">Loading matches...</div>';

    let res;
    try {
      res = await apiFetch(`/api/resumes/jobs/${encodeURIComponent(jobId)}/match`);
    } catch (e) {
      errlog('showMatches fetch error', e);
      listEl.innerHTML = `<div class="small-muted">Network error loading matches</div>`;
      return;
    }
    if (!res || !res.ok) {
      listEl.innerHTML = `<div class="small-muted">Failed to load matches (${res ? res.status : 'network'})</div>`;
      return;
    }

    const matches = res.data?.matched_resumes || res.data || [];
    listEl.innerHTML = '';
    if (!Array.isArray(matches) || matches.length === 0) {
      listEl.innerHTML = `<div class="small-muted">No matches found.</div>`;
      qs('#matchesSection') && (qs('#matchesSection').style.display = 'block');
      return;
    }

    matches.forEach(m => {
      const scoreRaw = m.score ?? m.score_percent ?? 0;
      let score = parseFloat(scoreRaw) || 0; if (score > 0 && score <= 1) score = Math.round(score * 100);
      const badge = score >= 75 ? 'bg-success' : (score >= 50 ? 'bg-warning text-dark' : 'bg-danger');
      const card = document.createElement('div');
      card.className = 'card mb-2 p-2';
      card.innerHTML = `
        <div class="d-flex justify-content-between">
          <div>
            <strong>${escapeHtml(m.user || m.username || m.candidate_name || 'candidate')}</strong> — ${escapeHtml(m.experience || 0)} yrs
            <div class="small-muted">skills: ${escapeHtml(m.skills || '')}</div>
            <div class="small-muted">missing: ${escapeHtml((m.missing_skills || []).join(', '))}</div>
          </div>
          <div style="text-align:right;">
            <span class="badge ${badge}" style="font-size:1rem;padding:.5rem .6rem">${score}%</span>
            <div style="margin-top:8px;">
              <button class="btn btn-sm btn-primary view-attempts-btn" data-job-id="${jobId}" data-candidate-id="${m.candidate_id || m.user_id || ''}">View Attempts</button>
              <button class="btn btn-sm btn-outline-secondary ms-1 shortlist-manual-btn" data-job-id="${jobId}" data-resume-id="${m.resume_id || m.id || 0}">Shortlist</button>
            </div>
          </div>
        </div>
      `;
      listEl.appendChild(card);
    });

    qsa('.view-attempts-btn').forEach(b => { if (b._bound) return; b._bound = true; b.addEventListener('click', () => openAttemptHistoryModal(Number(b.dataset.jobId), Number(b.dataset.candidateId))); });
    qsa('.shortlist-manual-btn').forEach(b => { if (b._bound) return; b._bound = true; b.addEventListener('click', () => shortlist(Number(b.dataset.jobId), Number(b.dataset.resumeId))); });

    qs('#matchesSection') && (qs('#matchesSection').style.display = 'block');
  }

  async function loadApplicationsForSelectedJob(jobIdParam) {
    const jobToUse = jobIdParam || (selectedJob && selectedJob.id);
    if (!jobToUse) return showToast('Select job first', 'error');
    if (!selectedJob || String(jobToUse) !== String(selectedJob.id)) { try { await openJobDetail(jobToUse); } catch(e){} }

    const listEl = qs('#applicationsList');
    if (!listEl) return;
    listEl.innerHTML = '<div class="small-muted">Loading applications...</div>';

    const urlsToTry = [
      `/api/resumes/applications/?job_id=${encodeURIComponent(jobToUse)}`,
      `/api/resumes/jobs/${encodeURIComponent(jobToUse)}/applications/`,
      `/api/applications/?job_id=${encodeURIComponent(jobToUse)}`,
      `/api/recruiter/job/${encodeURIComponent(jobToUse)}/applications/`
    ];

    let res = null;
    for (const u of urlsToTry) {
      try {
        res = await apiFetch(u);
        if (res && res.ok) break;
      } catch (e) {
        log('applications try failed', u, e);
      }
    }

    if (!res || !res.ok) {
      listEl.innerHTML = `<div class="small-muted">No applications (${res ? res.status : 'no response'})</div>`;
      return;
    }

    let apps = [];
    if (Array.isArray(res.data)) apps = res.data;
    else if (res.data && Array.isArray(res.data.results)) apps = res.data.results;
    else if (res.data && Array.isArray(res.data.applications)) apps = res.data.applications;
    else if (res.data && Array.isArray(res.data.data)) apps = res.data.data;

    if (!apps || apps.length === 0) {
      listEl.innerHTML = '<div class="small-muted">No applications yet.</div>';
      return;
    }

    async function fetchResumeNameIfNeeded(resumeObjOrId) {
      try {
        if (!resumeObjOrId) return null;
        if (typeof resumeObjOrId === 'object') {
          return resumeObjOrId.candidate_name || resumeObjOrId.name || resumeObjOrId.user_name || (resumeObjOrId.user && (resumeObjOrId.user.full_name || resumeObjOrId.user.username)) || null;
        }
        const rid = resumeObjOrId;
        const r = await apiFetch(`/api/resumes/${encodeURIComponent(rid)}/`);
        if (r && r.ok && r.data) {
          return r.data.candidate_name || r.data.name || r.data.user_name || (r.data.user && (r.data.user.full_name || r.data.user.username)) || null;
        }
      } catch(e){ /* ignore */ }
      return null;
    }

    listEl.innerHTML = '';
    for (const a of apps) {
      const id = a.id || a.application_id || a.pk || '';
      const resumeRef = a.resume || (a.resume_id || (a.resume && a.resume.id)) || '';
      const resumeId = (typeof resumeRef === 'object' ? (resumeRef.id || '') : resumeRef);
      let candidateName = await fetchResumeNameIfNeeded(resumeRef);
      if (!candidateName) {
        candidateName = a.candidate_name || a.user || a.username || a.applicant || '';
      }
      const nameDisplay = candidateName ? escapeHtml(candidateName) : (resumeId ? `Resume #${escapeHtml(String(resumeId))}` : `Resume ${escapeHtml(String(id||''))}`);

      const status = a.status || '';
      const applied = a.applied_at || a.created_at || a.created || '';

      const card = document.createElement('div');
      card.className = 'card mb-2 p-2 application-row';
      const candidateId = a.candidate_id || a.user_id || (a.resume && a.resume.user && a.resume.user.id) || resumeId;
      if (nameDisplay) card.dataset.candidateName = String(nameDisplay);
      if (selectedJob && selectedJob.id) card.dataset.jobId = String(selectedJob.id);
      if (candidateId) card.dataset.candidateId = String(candidateId);

      card.innerHTML = `
        <div class="d-flex justify-content-between align-items-start">
          <div style="min-width:0;">
            <strong>${nameDisplay}</strong>
            <div class="small-muted">Applied: ${escapeHtml(applied)}</div>
            <div class="small-muted">Message: ${escapeHtml(a.message || '')}</div>
          </div>
          <div style="min-width:180px;text-align:right;">
            <div class="mb-1"><span class="badge ${status === 'shortlisted' ? 'bg-success' : status === 'rejected' ? 'bg-danger' : 'bg-secondary'}">${escapeHtml(status || '')}</span></div>
            <div>
              ${a.resume_file ? `<a class="btn btn-sm btn-outline-primary me-1" href="${escapeHtml(a.resume_file)}" target="_blank" rel="noopener">View</a>` : ''}
              <button class="btn btn-sm btn-primary shortlist-btn" data-job="${selectedJob.id}" data-resume="${escapeHtml(String(resumeId))}">Shortlist</button>
              <button class="btn btn-sm btn-outline-danger reject-btn" data-app-id="${escapeHtml(String(id))}">Reject</button>
            </div>
          </div>
        </div>
        <div>
          <button class="btn btn-sm btn-success invite-btn" data-job-id="${selectedJob.id}" data-candidate-id="${escapeHtml(String(resumeId))}" data-candidate-name="${escapeHtml(String(nameDisplay))}">Invite</button>
        </div>
      `;
      listEl.appendChild(card);
    }

    setTimeout(() => injectInviteButtonsIntoAppRows('.application-row'), 50);

    listEl.querySelectorAll('.shortlist-btn').forEach(b => { if (b._bound) return; b._bound = true; b.addEventListener('click', () => { const jobId = b.dataset.job; const resumeId = b.dataset.resume; shortlist(Number(jobId), Number(resumeId)); }); });
    listEl.querySelectorAll('.reject-btn').forEach(b => { if (b._bound) return; b._bound = true; b.addEventListener('click', () => { const appId = b.dataset.appId; changeApplicationStatus(Number(appId), 'rejected'); }); });

    qs('#applicationsSection') && (qs('#applicationsSection').style.display = 'block');
  }

  /* ---------------- Invite modal + interview creation ---------------- */
  window.ensureInviteModal = window.ensureInviteModal || function() {
    const el = document.getElementById('inviteModal');
    if (el) return el;
    const tmp = document.createElement('div');
    tmp.id = 'inviteModal';
    tmp.style.display = 'none';
    document.body.appendChild(tmp);
    return tmp;
  };

  function ensureInviteBindings() {
    const mod = ensureInviteModal();
    if (!mod) return;

    mod.querySelector('#inviteCancelBtn')?.addEventListener('click', (e) => { e.preventDefault(); safeHideBootstrapModal(mod); });
    mod.addEventListener('click', (e) => { if (e.target === mod) safeHideBootstrapModal(mod); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') safeHideBootstrapModal(mod); });

    const sendBtn = mod.querySelector('#inviteSendBtn');
    if (sendBtn && !sendBtn._bound) {
      sendBtn._bound = true;
      sendBtn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        sendBtn.disabled = true;
        const modal = mod;

        const candFromDataset = (modal.dataset.candidateId || '').trim();
        const candFromInput = (modal.querySelector('#invite_candidate_id')?.value || '').trim();
        let candidateIdRaw = candFromDataset || candFromInput || '';

        const resumeFromDataset = (modal.dataset.resumeId || '').trim();
        const resumeFromInput = (modal.querySelector('#invite_resume_id')?.value || '').trim();
        const resumeId = resumeFromDataset || resumeFromInput || '';

        const scheduledRaw = modal.querySelector('#invite_scheduled_at')?.value || '';
        const message = modal.querySelector('#invite_message')?.value || '';
        const currJobId = modal.dataset.jobId || modal.querySelector('#invite_interview_id')?.value || (window.selectedJob && window.selectedJob.id) || null;

        if (!/^\d+$/.test(candidateIdRaw)) {
          candidateIdRaw = '';
          const candInput = modal.querySelector('#invite_candidate_id');
          if (candInput) candInput.value = '';
          if (modal.dataset.candidateId) delete modal.dataset.candidateId;
        }

        const candidateId = candidateIdRaw ? parseInt(candidateIdRaw, 10) : null;
        const hasCandidate = !!candidateId;
        const hasResume = !!resumeId;

        if (!hasCandidate && !hasResume) {
          alert('Enter a valid candidate id (numeric) or select resume.');
          sendBtn.disabled = false;
          return;
        }

        if (!currJobId) {
          if (!confirm('No job selected for invite. Create/select interview first?')) { sendBtn.disabled = false; return; }
          window.open('/interviews/recruiter/', '_blank');
          sendBtn.disabled = false;
          return;
        }

        let scheduled_at_iso = null;
        let scheduled_at_local = null;
        if (scheduledRaw) {
          try {
            const dt = new Date(scheduledRaw);
            if (!isNaN(dt.getTime())) {
              scheduled_at_iso = dt.toISOString();
              scheduled_at_local = dt.toLocaleString();
            } else scheduled_at_local = scheduledRaw;
          } catch (e) { scheduled_at_local = scheduledRaw; }
        }

        try {
          const bodyObj = { message };

          // CRITICAL: prefer resume_id when present
          if (hasResume) {
            bodyObj.resume_id = resumeId;
          } else if (hasCandidate) {
            bodyObj.candidate_id = candidateId;
          }

          if (scheduled_at_iso) bodyObj.scheduled_at = scheduled_at_iso;
          if (scheduled_at_local) bodyObj.scheduled_at_local = scheduled_at_local;

          console.log('INVITE: sending body=', bodyObj, 'modal.dataset=', modal.dataset);

          const res = await apiFetchSimple(INTERVIEWS_INVITE_BY_JOB(currJobId), {
            method: 'POST',
            body: JSON.stringify(bodyObj)
          });

          if (res && res.ok) {
            showToast('Invite sent', 'success');
            safeHideBootstrapModal(modal);
            if (typeof loadApplicationsForSelectedJob === 'function') {
              try { await loadApplicationsForSelectedJob(currJobId); } catch(e){ /* ignore */ }
            }
          } else {
            const detail = res && res.data ? (res.data.detail || res.data.message || JSON.stringify(res.data)) : `Status ${res ? res.status : 'no response'}`;
            console.warn('invite failed', res);
            alert('Invite failed: ' + detail);
          }
        } catch (e) {
          errlog('sendInvite error', e);
          alert('Error sending invite');
        } finally {
          sendBtn.disabled = false;
        }
      });
    }
  }

  function showInviteModal({ jobId=null, interviewId=null, candidateId='', candidateName='', resumeId='' } = {}) {
    const modal = ensureInviteModal();
    if (!modal) return;

    const idInput = modal.querySelector('#invite_interview_id');
    const candInput = modal.querySelector('#invite_candidate_id');
    const resumeInput = modal.querySelector('#invite_resume_id');
    const candDisplay = modal.querySelector('#invite_candidate_display');
    const msgInput = modal.querySelector('#invite_message');
    const jobDisplay = modal.querySelector('#invite_job_display');

    if (idInput) idInput.value = interviewId || '';
    if (candInput) candInput.value = candidateId || '';
    if (resumeInput) resumeInput.value = resumeId || '';

    if (candDisplay) candDisplay.value = candidateName ? `${candidateName} (ID: ${candidateId || ''})` : (resumeId ? `Resume ID: ${resumeId}` : candidateId || '');
    if (msgInput) msgInput.value = `Hi ${candidateName || ''}, you are invited for interview.`;
    if (jobDisplay) jobDisplay.value = jobId ? `Job ID: ${jobId}` : '';

    if (candidateId && !resumeId) {
      modal.dataset.candidateId = String(candidateId);
    } else if (modal.dataset.candidateId) {
      delete modal.dataset.candidateId;
    }

    if (resumeId) {
      modal.dataset.resumeId = String(resumeId);
      if (candInput) candInput.value = '';
    } else if (modal.dataset.resumeId) {
      delete modal.dataset.resumeId;
    }

    if (jobId) {
      modal.dataset.jobId = String(jobId);
      if (jobDisplay) jobDisplay.value = `Job ID: ${jobId}`;
    }

    ensureInviteBindings();
    safeShowBootstrapModal(modal);
  }

  /* ---------------- Inject invite buttons into rows ---------------- */
  // Robust resolveCandidateIdFromElement (single version)
  function resolveCandidateIdFromElement(el) {
    if (!el) return null;
    const prefer = ['userId','candidateId','userid','candidateid','user_id','candidate_id','id'];
    for (const k of prefer) {
      if (el.dataset && el.dataset[k]) {
        const v = String(el.dataset[k]).trim();
        if (/^\d+$/.test(v)) return v;
      }
    }
    const attrChecks = ['data-user-id','data-candidate-id','data-resume-owner-id','data-resume-user-id'];
    for (const a of attrChecks) {
      const v = el.getAttribute && el.getAttribute(a);
      if (v && /^\d+$/.test(String(v).trim())) return String(v).trim();
    }
    return null;
  }

  function injectInviteButtonsIntoAppRows(selector = '.application-row') {
    const rows = document.querySelectorAll(selector);
    rows.forEach(row => {
      if (row._inviteInjected) return;
      row._inviteInjected = true;

      // prefer resume id if present (do NOT treat resume id as candidate id)
      const resumeIdFromRow = row.dataset.resumeId || row.getAttribute('data-resume-id') ||
        (row.querySelector && (row.querySelector('[data-resume-id]')?.dataset?.resumeId || row.querySelector('[data-resume-id]')?.getAttribute('data-resume-id'))) ||
        row.dataset?.resume || (row.getAttribute && row.getAttribute('data-resume'));

      const candidateIdResolved = resumeIdFromRow ? null : (resolveCandidateIdFromElement(row) || resolveCandidateIdFromElement(row.querySelector('.invite-btn') || row));
      const candidateName = row.dataset.candidateName || row.getAttribute('data-candidate-name') || '';
      const jobAncestor = row.closest && row.closest('[data-job-id]');
      const jobId = row.dataset.jobId || (jobAncestor && jobAncestor.dataset.jobId) || row.getAttribute('data-job-id') || '';

      let actions = row.querySelector('.app-actions') || row.querySelector('.actions');
      if (!actions) {
        actions = document.createElement('div');
        actions.className = 'app-actions';
        actions.style.marginTop = '6px';
        row.appendChild(actions);
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-sm btn-success invite-btn';
      btn.textContent = 'Invite';

      // only set candidateId when it is resolved and no resumeId present
      if (candidateIdResolved) btn.dataset.candidateId = candidateIdResolved;

      if (resumeIdFromRow) btn.dataset.resumeId = resumeIdFromRow;

      if (candidateName) btn.dataset.candidateName = candidateName;
      if (jobId) btn.dataset.jobId = jobId;

      btn.addEventListener('click', (e) => {
        const el = e.currentTarget;
        let jd = el.dataset.jobId || jobId || (window.state && window.state.selectedJobId) || null;
        if (!jd) {
          const ancestor = el.closest && el.closest('[data-job-id]');
          if (ancestor && ancestor.dataset && ancestor.dataset.jobId) jd = ancestor.dataset.jobId;
        }
        if (!jd) {
          const pageJob = document.querySelector && document.querySelector('#page_job_id');
          if (pageJob && pageJob.value) jd = pageJob.value;
        }
        if (!jd && window.selectedJob && window.selectedJob.id) jd = window.selectedJob.id;

        const resumeLocal = el.dataset.resumeId || '';
        const candLocal = resumeLocal ? '' : (el.dataset.candidateId || '');

        showInviteModal({
          jobId: jd || null,
          interviewId: el.dataset.interviewId || '',
          candidateId: candLocal || '',
          candidateName: el.dataset.candidateName || '',
          resumeId: resumeLocal || ''
        });
      });

      actions.appendChild(btn);
    });
  }

  /* ---------------- Shortlist & status ---------------- */
  async function shortlist(job_id, resume_id) {
    if (!job_id || !resume_id) return showToast('Invalid shortlist', 'error');
    const res = await apiFetch('/api/resumes/shortlist/', { method: 'POST', body: JSON.stringify({ job_id, resume_id }) });
    if (res.ok) { showToast('Shortlisted', 'success'); loadApplicationsForSelectedJob(); showShortlistsForSelectedJob(); }
    else { showToast('Shortlist failed', 'error'); }
  }
  async function changeApplicationStatus(applicationId, newStatus) {
    if (!applicationId) return;
    const res = await apiFetch(`/api/resumes/applications/${applicationId}/`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
    if (res.ok) { showToast('Status updated', 'success'); loadApplicationsForSelectedJob(); } else showToast('Update failed', 'error');
  }

  async function showShortlistsForSelectedJob() {
    if (!selectedJob) return showToast('Select job first', 'error');
    const res = await apiFetch(`/api/resumes/shortlist/?job_id=${selectedJob.id}`);
    const container = qs('#shortlistList'); if (!container) return;
    if (!res.ok) { container.innerHTML = `<div class="small-muted">Failed to load shortlist</div>`; return; }
    const list = res.data || [];
    container.innerHTML = '';
    if (!list.length) { container.innerHTML = `<div class="small-muted">No shortlists found.</div>`; return; }

    async function fetchResumeNameFromId(rid) {
      if (!rid) return null;
      try {
        const r = await apiFetch(`/api/resumes/${encodeURIComponent(rid)}/`);
        if (r && r.ok && r.data) {
          return r.data.candidate_name || r.data.name || r.data.user_name || (r.data.user && (r.data.user.full_name || r.data.user.username)) || null;
        }
      } catch (e) { /* ignore */ }
      return null;
    }

    for (const s of list) {
      let candidateName = null;
      let resumeId = null;

      if (typeof s.resume === 'number' || (typeof s.resume === 'string' && /^\d+$/.test(String(s.resume)))) {
        resumeId = s.resume;
        candidateName = await fetchResumeNameFromId(resumeId);
      } else if (s.resume && typeof s.resume === 'object') {
        resumeId = s.resume.id || null;
        candidateName = s.resume.candidate_name || s.resume.name || s.resume.user_name || (s.resume.user && s.resume.user.full_name) || null;
      }

      const displayName = candidateName ? escapeHtml(candidateName) : (resumeId ? `Resume #${escapeHtml(String(resumeId))}` : `Resume ${escapeHtml(String(s.id || ''))}`);

      const shortlistedBy = s.shortlisted_by || '';
      const jobId = s.job && (s.job.id || s.job) ? (s.job.id || s.job) : '';
      const div = document.createElement('div'); div.className = 'card mb-2 p-2';
      div.innerHTML = `
        <div class="d-flex justify-content-between align-items-start">
          <div style="min-width:0">
            <strong>${displayName}</strong>
            ${ shortlistedBy ? `<div class="small-muted">Shortlisted by: ${escapeHtml(String(shortlistedBy))}</div>` : '' }
          </div>
          <div>
            <button class="btn btn-sm btn-outline-primary resend-btn" data-job="${escapeHtml(String(jobId))}" data-resume="${escapeHtml(String(resumeId||''))}">Resend</button>
            <button class="btn btn-sm btn-outline-danger remove-shortlist-btn" data-id="${escapeHtml(String(s.id))}">Remove</button>
          </div>
        </div>
      `;
      container.appendChild(div);
    }

    container.querySelectorAll('.resend-btn').forEach(b => {
      if (b._bound) return; b._bound = true;
      b.addEventListener('click', () => resend(b.dataset.job, b.dataset.resume));
    });
    container.querySelectorAll('.remove-shortlist-btn').forEach(b => {
      if (b._bound) return; b._bound = true;
      b.addEventListener('click', () => removeShortlist(b.dataset.id));
    });
    qs('#shortlistSection') && (qs('#shortlistSection').style.display = 'block');
  }

  async function removeShortlist(id) {
    if (!id) return;
    if (!confirm('Remove shortlist?')) return;
    const res = await apiFetch('/api/resumes/shortlist/', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
      headers: { 'Content-Type': 'application/json' }
    });
    if (res.ok) { showToast('Removed', 'success'); showShortlistsForSelectedJob(); }
    else showToast('Remove failed', 'error');
  }

  async function removeShortlistByPath(id) {
    if (!id) return;
    if (!confirm('Remove shortlist?')) return;
    const res = await apiFetch(`/api/resumes/shortlist/${encodeURIComponent(id)}/`, {
      method: 'DELETE'
    });
    if (res.ok) { showToast('Removed', 'success'); showShortlistsForSelectedJob(); }
    else {
      const msg = (res && res.data && res.data.error) ? res.data.error : 'Remove failed';
      showToast(msg, 'error');
    }
  }

  async function resend(job_id, resume_id) {
    const payload = { job_id: Number(job_id), resume_id: Number(resume_id), resend: true };
    const res = await apiFetch('/api/resumes/shortlist/', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' }
    });
    if (res.ok) showToast('Resend queued', 'success');
    else {
      const err = res && res.data ? (res.data.error || res.data.detail || JSON.stringify(res.data)) : 'Resend failed';
      showToast(err, 'error');
    }
  }

  /* ---------------- Quiz / Results / Attempts ---------------- */
  async function generateQuizForJob(jobId, questionsCount = 5) {
    if (!jobId) return showToast('No job id', 'error');
    if (!confirm('Generate quiz for this job now?')) return;
    const token = savedToken();
    const headers = Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: `Bearer ${token}` } : {});
    try {
      const r = await fetch(`/api/quiz/${encodeURIComponent(jobId)}/generate/`, { method: 'POST', headers, body: JSON.stringify({ questions_count: questionsCount }) });
      const txt = await r.text().catch(()=>null);
      let data = null;
      try { data = txt ? JSON.parse(txt) : null; } catch(e){ data = null; }
      if (!r.ok) { showToast('Generate failed: ' + (data?.detail || r.status), 'error', 5000); return null; }
      showToast('Quiz generated', 'success');
      return data;
    } catch (e) { errlog('generateQuiz err', e); showToast('Network error', 'error'); return null; }
  }

  async function fetchRecruiterResults(jobId) {
    if (!jobId) return;
    const token = savedToken();
    const headers = Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: `Bearer ${token}` } : {});
    const r = await fetch(`/api/quiz/${jobId}/recruiter/results/`, { headers });
    if (!r.ok) { const txt = await r.text().catch(()=>null); showToast('Failed to fetch results', 'error'); errlog('results fetch failed', r.status, txt); return; }
    const data = await r.json().catch(()=>null);
    renderResults(data?.results || [], data?.job_title || '');
  }

  function renderResults(rows, jobTitle) {
    const tbody = qs('#results-table tbody'); if (!tbody) return;
    tbody.innerHTML = '';
    const filter = qs('#filter')?.value || 'all';
    rows.forEach(r => {
      if (filter === 'passed' && !r.last_passed) return;
      if (filter === 'failed' && r.last_passed) return;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(r.name || r.username || r.candidate_name || '—')}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">${r.attempts_count ?? 0}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">${r.last_score ?? '—'}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">${r.last_passed ? '<strong style="color:green">Passed</strong>' : '<strong style="color:crimson">Failed</strong>'}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">${r.last_finished_at ? (new Date(r.last_finished_at)).toLocaleString() : '—'}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">
          <button class="btn btn-sm btn-outline-primary view-attempts" data-cid="${r.candidate_id || r.id || ''}" data-job="${r.job_id || ''}">View Attempts</button>
          <button class="btn btn-sm btn-outline-danger reset-attempts" data-cid="${r.candidate_id || r.id || ''}" data-job="${r.job_id || ''}">Reset</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    qsa('.view-attempts').forEach(b => { if (b._bound) return; b._bound = true; b.addEventListener('click', () => openAttemptHistoryModal(Number(b.dataset.job), Number(b.dataset.cid))); });
    qsa('.reset-attempts').forEach(b => { 
      if (b._bound) return; 
      b._bound = true; 
      b.addEventListener('click', async () => { 
        if (!confirm('Reset attempts for this candidate?')) return; 
        const job = b.dataset.job, cid = b.dataset.cid;
        const r = await apiFetch(`/api/quiz/${encodeURIComponent(job)}/reset/${encodeURIComponent(cid)}/`, { method: 'POST' });
        if (r.ok) { showToast('Reset OK', 'success'); fetchRecruiterResults(job); } else showToast('Reset failed', 'error');
      }); 
    });

    document.getElementById('job-title') && (document.getElementById('job-title').textContent = `Results — ${jobTitle || ''}`);
  }

  /* ---------------- Attempt history modal (fallback + API tries) ---------------- */
  function ensureAttemptBindings() {
    const modal = ensureAttemptsModal();
    modal.querySelector('#attempts-modal-close')?.addEventListener('click', () => { modal.style.display = 'none'; document.body.style.overflow = ''; });
    modal.querySelector('#attempts-modal-ok')?.addEventListener('click', () => { modal.style.display = 'none'; document.body.style.overflow = ''; });
  }

  async function fetchAttempts(jobId, candidateId) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, authHeaders());
    const tries = [
      `/api/quiz/${encodeURIComponent(jobId)}/attempts/`,
      `/api/quiz/attempts/?job_id=${encodeURIComponent(jobId)}&candidate=${candidateId}`,
      `/api/quiz/attempts/?job=${encodeURIComponent(jobId)}`
    ];

    for (const u of tries) {
      try {
        const r = await fetch(u, { method: 'GET', headers });
        if (!r) continue;
        const txt = await r.text().catch(()=>null);
        let data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch(e){ data = txt; }
        if (r.ok) {
          if (Array.isArray(data)) return data.filter(a => !candidateId || String(a.candidate) === String(candidateId) || String(a.candidate_id) === String(candidateId));
          if (Array.isArray(data.results)) return data.results;
          if (Array.isArray(data.attempts)) return data.attempts;
          return [];
        }
      } catch (e) { log('fetchAttempts try failed', e, u); }
    }
    return [];
  }

  function renderAttemptList(attempts) {
    const container = qs('#attempts-list');
    if (!container) return;
    container.innerHTML = '';
    if (!attempts || attempts.length === 0) { container.innerHTML = '<div class="small-muted">No attempts yet.</div>'; return; }
    const table = document.createElement('table'); table.style.width = '100%'; table.style.borderCollapse = 'collapse';
    table.innerHTML = `<thead><tr>
      <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Attempt</th>
      <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Finished</th>
      <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Score</th>
      <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Result</th>
      <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Answers</th>
    </tr></thead><tbody></tbody>`;
    const tbody = table.querySelector('tbody');
    attempts.slice().sort((a,b) => new Date(b.finished_at||b.started_at||0) - new Date(a.finished_at||a.started_at||0)).forEach(at => {
      const id = at.attempt_id ?? at.id ?? '';
      const finished = at.finished_at ? new Date(at.finished_at).toLocaleString() : (at.started_at ? new Date(at.started_at).toLocaleString() : '');
      const total = at.total ?? at.total_questions ?? '';
      const score = (at.score ?? '') + (total ? ` / ${total}` : '');
      const passed = at.passed ? '<strong style="color:green">Passed</strong>' : '<strong style="color:crimson">Failed</strong>';
      let answersHtml = '<span class="small-muted">—</span>';
      if (at.answers) {
        try { answersHtml = `<pre style="white-space:pre-wrap;margin:0;font-size:.9rem">${escapeHtml(typeof at.answers === 'string' ? at.answers : JSON.stringify(at.answers, null, 2))}</pre>`; } catch(e){}
      } else if (at.data && at.data.answers) {
        answersHtml = `<pre style="white-space:pre-wrap;margin:0;font-size:.9rem">${escapeHtml(JSON.stringify(at.data.answers, null, 2))}</pre>`;
      }
      const tr = document.createElement('tr');
      tr.innerHTML = `<td style="padding:8px;border-bottom:1px solid #f2f2f2">${escapeHtml(id)}</td>
                      <td style="padding:8px;border-bottom:1px solid #f2f2f2">${escapeHtml(finished)}</td>
                      <td style="padding:8px;border-bottom:1px solid #f2f2f2">${escapeHtml(String(score))}</td>
                      <td style="padding:8px;border-bottom:1px solid #f2f2f2">${passed}</td>
                      <td style="padding:8px;border-bottom:1px solid #f2f2f2">${answersHtml}</td>`;
      tbody.appendChild(tr);
    });
    container.appendChild(table);
  }

  window.openAttemptHistoryModal = async function (jobId, candidateId) {
    const modal = ensureAttemptsModal();
    ensureAttemptBindings();
    const loading = qs('#attempts-loading'); const list = qs('#attempts-list');
    qs('#attempts-modal-title').textContent = `Attempts — job ${jobId} candidate ${candidateId || 'all'}`;
    loading.style.display = 'block'; list.style.display = 'none'; list.innerHTML = '';
    safeShowBootstrapModal(modal);
    const data = await fetchAttempts(jobId, candidateId);
    loading.style.display = 'none';
    if (!data) { list.style.display = 'block'; list.innerHTML = '<div class="text-danger">Error fetching attempts</div>'; return; }
    renderAttemptList(data);
    list.style.display = 'block';
  };

  /* ---------------- CSV helpers & export ---------------- */
  function toCsv(rows) {
    if (!rows || !rows.length) return '';
    const keys = Object.keys(rows[0]);
    const lines = [keys.join(',')];
    rows.forEach(r => {
      const line = keys.map(k => {
        let v = r[k];
        if (v === null || v === undefined) v = '';
        v = String(v).replace(/"/g, '""');
        return `"${v}"`;
      }).join(',');
      lines.push(line);
    });
    return lines.join('\n');
  }
  function downloadFile(filename, content, mime = 'text/csv') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
  async function exportResultsCsv(jobId) {
    if (!jobId) return showToast('Select job first', 'error');
    const r = await apiFetch(`/api/quiz/attempts/?job_id=${jobId}`, { method: 'GET' });
    if (!r.ok) { showToast('Failed to fetch attempts', 'error'); return; }
    const rows = (r.data && (r.data.results || r.data)) || [];
    const csv = toCsv(rows.map(x => ({ candidate: x.candidate || '', score: x.score || '', passed: x.passed ? 'yes' : 'no', finished_at: x.finished_at || '', answers: JSON.stringify(x.answers || {}) })));
    downloadFile(`quiz_results_job_${jobId}.csv`, csv);
  }

  /* ---------------- UI Wiring ---------------- */
  function attachUI() {
    ensureToastContainer();
    createFallbackAddJobModal();
    ensureInviteModal();
    ensureAttemptsModal();

    if (qs('#tokenInput') && savedToken()) qs('#tokenInput').value = savedToken();
    qs('#saveTokenBtn')?.addEventListener('click', () => {
      const v = (qs('#tokenInput')?.value || '').trim();
      if (!v) { showToast('Paste token first', 'error'); return; }
      setSavedToken(v); qs('#tokenStatus') && (qs('#tokenStatus').innerText = 'Token saved'); showToast('Token saved', 'success');
    });
    qs('#clearTokenBtn')?.addEventListener('click', () => { setSavedToken(''); qs('#tokenInput') && (qs('#tokenInput').value = ''); qs('#tokenStatus') && (qs('#tokenStatus').innerText = 'No token saved'); showToast('Token cleared', 'success'); });

    qs('#refreshJobs')?.addEventListener('click', loadJobs);
    qs('#addJobBtn')?.addEventListener('click', openAddJobModal);
    qs('#addJobForm')?.addEventListener('submit', submitAddJob);
    qs('#showMatchesBtn')?.addEventListener('click', showMatchesForSelectedJob);
    qs('#showShortlistsBtn')?.addEventListener('click', showShortlistsForSelectedJob);
    qs('#showApplicationsBtn')?.addEventListener('click', () => loadApplicationsForSelectedJob());
    qs('#exportCsvBtn')?.addEventListener('click', () => exportResultsCsv(selectedJob ? selectedJob.id : null));
    qs('#filter')?.addEventListener('change', () => { if (selectedJob) fetchRecruiterResults(selectedJob.id); });

    const showMatchesBtn = qs('#showMatchesBtn');
    if (showMatchesBtn) {
      showMatchesBtn.addEventListener('click', (ev) => { showMatchesForSelectedJob(ev); });
    }

    loadJobs();

    try {
      const appsContainer = document.querySelector('#applicationsList') || document.body;
      const mo = new MutationObserver((muts) => {
        muts.forEach(m => {
          m.addedNodes && m.addedNodes.forEach(n => {
            if (n.nodeType === 1) {
              if (n.matches && n.matches('.application-row')) injectInviteButtonsIntoAppRows();
              n.querySelectorAll && n.querySelectorAll('.application-row').forEach(r=>injectInviteButtonsIntoAppRows());
            }
          });
        });
      });
      mo.observe(appsContainer, { childList:true, subtree:true });
    } catch(e){ console.warn('observer failed', e); }
  }

  /* ---------------- boot ---------------- */
  document.addEventListener('DOMContentLoaded', () => {
    try { attachUI(); log('recruiter dashboard initialized'); } catch (e) { errlog('init error', e); }
  });

  /* ---------------- expose for debugging ---------------- */
  window.rdash = {
    loadJobs, openJobDetail, generateQuizForJob, openAttemptHistoryModal, showInviteModal,
    apiFetch, apiFetchSimple, setSavedToken, savedToken,
  };

  /* ---------------- Interviews generate helpers ---------------- */
  async function getCsrfTokenFromCookie() {
    try { return document.cookie.split('; ').find(c=>c.startsWith('csrftoken='))?.split('=')[1] || null; } catch(e){ return null; }
  }

  async function createInterviewForJob(jobPk, payload = {}) {
    if (!jobPk) return null;
    const token = (typeof savedToken === 'function') ? savedToken() : (localStorage.getItem('recruiter_token_v1') || '');
    const headers = { 'Content-Type': 'application/json' };
    const csr = await getCsrfTokenFromCookie();
    if (csr) headers['X-CSRFToken'] = csr;
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const url = `/api/interviews/recruiter/job/${encodeURIComponent(jobPk)}/create/`;
    try {
      const r = await fetch(url, { method:'POST', credentials:'include', headers, body: JSON.stringify(Object.assign({ title:`Auto interview for job ${jobPk}`, duration_minutes:45, is_active:true }, payload)) });
      const text = await r.text().catch(()=>null);
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch(e){ data = text; }
      if (!r.ok) return { ok:false, status:r.status, data };
      return { ok:true, status:r.status, data };
    } catch(e){ console.error('createInterviewForJob', e); return { ok:false, error:String(e) }; }
  }

  async function generateInterviewQuestions(interviewPk, nQuestions = 25, autoPublish = false) {
    if (!interviewPk) return { ok:false, error: 'missing interview id' };
    const token = (typeof savedToken === 'function') ? savedToken() : (localStorage.getItem('recruiter_token_v1') || '');
    const headers = { 'Content-Type': 'application/json' };
    const csr = await getCsrfTokenFromCookie();
    if (csr) headers['X-CSRFToken'] = csr;
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const url = `/api/interviews/recruiter/${encodeURIComponent(interviewPk)}/generate_questions/`;
    try {
      const r = await fetch(url, { method:'POST', credentials:'include', headers, body: JSON.stringify({ n_questions: Number(nQuestions)||25, auto_publish: !!autoPublish, params: {} }) });
      const text = await r.text().catch(()=>null);
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch(e) { data = text; }
      return { ok: r.ok, status: r.status, data, text };
    } catch(e){ console.error('generateInterviewQuestions', e); return { ok:false, error:String(e) }; }
  }

  async function generateQuestionsForJobCreateInterviewThenGenerate(jobPk, questionsCount = 25) {
    if (!jobPk) return { ok:false, error:'missing job id' };
    const createRes = await createInterviewForJob(jobPk);
    if (!createRes || !createRes.ok) return { ok:false, createRes };
    const created = createRes.data || {};
    const interviewId = created.id || created.pk || created.pk_id;
    if (!interviewId) return { ok:false, error:'no interview id returned', created };
    const genRes = await generateInterviewQuestions(interviewId, questionsCount, true);
    return Object.assign({ ok: !!(genRes && genRes.ok) }, { createRes, genRes });
  }

  function attachGenerateInterviewButtons() {
    document.querySelectorAll('.generate-questions-btn').forEach(btn => {
      if (btn._genBound) return; btn._genBound = true;
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation(); ev.preventDefault();
        const pk = btn.dataset.interviewId || btn.getAttribute('data-interview-id') || btn.dataset.pk || btn.getAttribute('data-pk');
        if (!pk) return showToast('Missing interview id', 'error');
        const n = parseInt(btn.dataset.nQuestions || btn.getAttribute('data-n-questions') || 25, 10) || 25;
        const res = await generateInterviewQuestions(pk, n, (btn.dataset.autoPublish === 'true'));
        if (res && res.ok) showToast('Generation started/complete', 'success'); else showToast('Generate failed', 'error');
        try { if (typeof loadInterviewDetail === 'function') await loadInterviewDetail(pk); } catch(e){}
        try { if (selectedJob) await loadJobs(); } catch(e){}
      });
    });

    document.querySelectorAll('.generate-quiz-btn').forEach(btn => {
      if (btn._jobGenBound) return; btn._jobGenBound = true;
      btn.addEventListener('click', async (ev) => {
        ev.stopPropagation(); ev.preventDefault();
        const jobId = btn.dataset.jobId || btn.getAttribute('data-job-id') || null;
        if (!jobId) return showToast('No job id', 'error');
        if (!confirm('Create interview for this job and generate questions?')) return;
        const res = await generateQuestionsForJobCreateInterviewThenGenerate(jobId, Number(btn.dataset.questionsCount||5));
        if (res && res.ok) showToast('Generation queued/complete', 'success'); else showToast('Generate failed', 'error');
        try { await loadJobs(); } catch(e){}
      });
    });
  }

  window.generateInterviewQuestions = generateInterviewQuestions;
  window.generateQuestionsForJobCreateInterviewThenGenerate = generateQuestionsForJobCreateInterviewThenGenerate;
  window.attachGenerateInterviewButtons = attachGenerateInterviewButtons;

})();
