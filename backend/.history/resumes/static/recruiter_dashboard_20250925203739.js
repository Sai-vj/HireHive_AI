// static/recruiter_dashboard.js
// Consolidated, defensive recruiter dashboard script
// - Safe bootstrap modal usage (avoids "backdrop" / undefined errors)
// - Robust API fetch with token support and retries to multiple endpoints
// - Creates fallback modals if HTML missing (add job, invite, attempts)
// - Attach UI behaviors: load jobs, create/edit/delete, matches, applications, shortlist, invites

(function () {
  'use strict';

  /* ---------------- Config ---------------- */
  const API_ROOT = '/api';
  const JOBS_ENDPOINT = `${API_ROOT}/resumes/jobs/`;
  const TOKEN_KEY = 'recruiter_token_v1';

  // Interview invite endpoint by job (adjust if your backend differs)
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
      } catch (e) {
        console.warn('plainShow failed', e);
      }
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
        } catch (e) {
          console.warn('bootstrap hide attempt failed', e);
        }
      }
    } catch (e) {
      console.warn('bootstrap hide wrapper failed', e);
    }

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
   /* ---------------- API fetch wrappers (CSRF + FormData + credentials) ---------------- */
  function getCsrfFromCookie() {
    try { return document.cookie.split('; ').find(c=>c.startsWith('csrftoken='))?.split('=')[1] || null; } catch(e){ return null; }
  }

  async function normalizeResponse(r) {
    if (!r) return { ok:false, status:0, data:null, text:null };
    if (r.status === 401 || r.status === 403) {
      localStorage.removeItem(TOKEN_KEY);
      showToast('Not authorized — paste a valid token and retry', 'error', 4000);
    }
    const text = await r.text().catch(()=>null);
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch(e) { data = text; }
    return { ok: r.ok, status: r.status, data, text };
  }

  async function apiFetch(path, opts = {}) {
    opts = Object.assign({}, opts);
    opts.headers = Object.assign({}, opts.headers || {}, authHeaders());

    // If body is FormData, don't set Content-Type (browser will set boundary)
    const bodyIsForm = (typeof FormData !== 'undefined') && (opts.body instanceof FormData);
    if (!bodyIsForm) {
      // default Content-Type for JSON requests unless already provided
      if (!opts.headers['Content-Type'] && !opts.headers['content-type']) opts.headers['Content-Type'] = 'application/json';
    } else {
      // ensure we don't send incorrect content-type
      delete opts.headers['Content-Type'];
      delete opts.headers['content-type'];
    }

    // Add CSRF for "unsafe" methods when csrftoken cookie exists
    const method = (opts.method || 'GET').toUpperCase();
    const unsafe = ['POST','PUT','PATCH','DELETE'].includes(method);
    try {
      const csr = getCsrfFromCookie();
      if (unsafe && csr && !opts.headers['X-CSRFToken'] && !opts.headers['x-csrftoken']) {
        opts.headers['X-CSRFToken'] = csr;
      }
    } catch(e){ /* ignore */ }

    // include credentials so session cookies (and CSRF) are sent
    if (typeof opts.credentials === 'undefined') opts.credentials = 'include';

    log('apiFetch', path, opts.method || 'GET', opts.headers);
    try {
      const r = await fetch(path, opts);
      return await normalizeResponse(r);
    } catch (e) {
      errlog('apiFetch error', e);
      return { ok: false, status: 0, error: true, exception: String(e) };
    }
  }

  // simple variant that reuses same logic (keeps same signature)
  async function apiFetchSimple(path, opts = {}) {
    return await apiFetch(path, opts);
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
      btn.addEventListener('click', async ev => {
        ev.stopPropagation();
        if (!confirm('Generate interview questions for this job?')) return;
        const jobId = btn.dataset.jobId;
        if (!jobId) return showToast('No job id', 'error');
        const n = parseInt(btn.dataset.nQuestions || btn.getAttribute('data-n-questions') || 5, 10) || 5;
        showToast('Starting interview-question generation...', 'info', 2500);
        try {
          const result = await generateQuestionsForJobCreateInterviewThenGenerate(jobId, n);
          if (result && result.ok) {
            showToast('Interview questions generated', 'success', 3500);
            try { await loadJobs(); } catch(e){}
          } else {
            console.warn('generation result', result);
            showToast('Generation failed', 'error', 4000);
          }
        } catch (err) {
          console.error('generate interview error', err);
          showToast('Generation error', 'error', 4000);
        }
      });
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
   // inside attachJobCardEvents() after other qsa(...) blocks
  qsa('.review-attempts-btn').forEach(btn => {
    if (btn._boundReview) return;
    btn._boundReview = true;
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const jid = btn.dataset.jobId || btn.getAttribute('data-job-id');
      if (!jid) {
        return showToast('No job id', 'error');
      }
      // open in same tab:
      // window.location.href = `/recruiter/review/?job_id=${encodeURIComponent(jid)}`;

      // open in new tab - recommended for review UI
      window.open(`/recruiter/review/?job_id=${encodeURIComponent(jid)}`, '_blank');

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
    if (!jobId) { showToast('Missing job id', 'error'); return null; }
    try {
      const r = await apiFetch(`${JOBS_ENDPOINT}${encodeURIComponent(jobId)}/`, { method: 'GET' });
      console.log('openJobDetail: response', r);
      if (!r || !r.ok) { showToast('Unable to load job', 'error'); return r; }

      selectedJob = r.data;

      const noJobEl = document.getElementById('noJob');
      const detailsEl = document.getElementById('jobDetails');

      if (noJobEl) noJobEl.classList.add('d-none');
      if (detailsEl) {
        detailsEl.classList.remove('d-none');
        detailsEl.style.display = 'block';
      }

      const titleEl = qs('#selectedJobTitle');
      if (titleEl) titleEl.textContent = selectedJob.title || '';

      const metaEl = qs('#jobMeta');
      if (metaEl) metaEl.textContent = `${selectedJob.company || ''} • Experience required: ${selectedJob.experience_required || 0}`;

      qsa('#showMatchesBtn, #showShortlistsBtn, #exportCsvBtn, #showApplicationsBtn, .generate-quiz-btn').forEach(b => { if (b) b.dataset.jobId = jobId; });
      qs('#generateQuestionsBtn')?.setAttribute('data-job-id', jobId);

      qs('#matchesList') && (qs('#matchesList').innerHTML = '');
      qs('#applicationsList') && (qs('#applicationsList').innerHTML = '');

      return r;
    } catch (e) {
      console.error('openJobDetail error', e);
      showToast('Failed to load job (network)', 'error');
      return { ok:false, error:String(e) };
    }
  }
