// static/js/recruiter_dashboard.js
// Cleaned & defensive recruiter dashboard script
// - Use window.RDASH_API_ROOT override
// - Consistent apiFetch usage, safer event binding, fewer null refs
// - Preserve features: jobs CRUD, matches, applications, shortlists, invites, quiz, attempts

(function () {
  'use strict';

  /* ---------------- Config (overridable from template) ---------------- */
  const API_ROOT = (window && (window.RDASH_API_ROOT || window.API_ROOT)) || '/api';
  const JOBS_ENDPOINT = `${API_ROOT}/resumes/jobs/`;
  const TOKEN_KEY = (window && window.RDASH_TOKEN_KEY) || 'recruiter_token_v1';

  /* ---------------- helpers ---------------- */
  function log(...args) { console.debug('[Rdash]', ...args); }
  function errlog(...args) { console.error('[Rdash]', ...args); }

  function qs(sel, root = document) { try { return root.querySelector(sel); } catch (e) { return null; } }
  function qsa(sel, root = document) { try { return Array.from(root.querySelectorAll(sel)); } catch (e) { return []; } }

  function savedToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
  function setSavedToken(t) { try { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); } catch (e) { console.warn('localStorage failed', e); } }
  function authHeaders() {
    const t = savedToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

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

  function showToast(msg, type = 'info', ms = 3500) {
    const container = ensureToastContainer();
    const el = document.createElement('div');
    el.className = 'rdash-toast';
    el.style = 'padding:10px 14px;border-radius:8px;margin-bottom:8px;box-shadow:0 1px 4px rgba(0,0,0,0.06);max-width:360px;';
    el.innerHTML = `<div style="background:${type==='error'?'#fde2e2':type==='success'?'#e7f7ef':'#fff9db'};border:1px solid #eee;padding:8px;border-radius:6px;color:#111">${msg}</div>`;
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
    if (!document.body.contains(modalEl)) document.body.appendChild(modalEl);
    try {
      if (!modalEl.classList.contains('modal')) modalEl.classList.add('modal');
      modalEl.setAttribute('tabindex', modalEl.getAttribute('tabindex') || '-1');
      modalEl.setAttribute('role', modalEl.getAttribute('role') || 'dialog');
      if (!modalEl.getAttribute('aria-hidden')) modalEl.setAttribute('aria-hidden', 'true');
    } catch(e){ /* ignore */ }

    if (typeof bootstrap !== 'undefined' && typeof bootstrap.Modal === 'function') {
      try {
        let inst = null;
        try { inst = bootstrap.Modal.getInstance(modalEl); } catch(e) { inst = null; }
        if (!inst) inst = new bootstrap.Modal(modalEl, Object.assign({ backdrop: 'static' }, options));
        inst.show();
        return inst;
      } catch (e) { console.warn('bootstrap.Modal show failed (fallback)', e); }
    }

    // fallback
    try { modalEl.style.display = 'block'; modalEl.classList.remove('d-none'); document.body.style.overflow = 'hidden'; } catch(e){}
    return null;
  }

  function safeHideBootstrapModal(modalEl) {
    if (!modalEl) return;
    try {
      if (typeof bootstrap !== 'undefined' && typeof bootstrap.Modal === 'function') {
        const inst = bootstrap.Modal.getInstance(modalEl);
        if (inst && typeof inst.hide === 'function') { inst.hide(); return; }
      }
    } catch (e) { console.warn('bootstrap hide failed', e); }
    try { modalEl.style.display = 'none'; modalEl.classList.add('d-none'); document.body.style.overflow = ''; } catch(e){}
  }

  /* ---------------- API fetch wrappers ---------------- */
  async function apiFetch(path, opts = {}) {
    opts = Object.assign({}, opts);
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}, authHeaders());
    log('apiFetch', path, opts.method || 'GET');
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

  /* ---------------- DOM / fallback modal creation ---------------- */
  function createFallbackAddJobModal() {
    if (document.getElementById('addJobModal')) return document.getElementById('addJobModal');
    const modal = document.createElement('div');
    modal.id = 'addJobModal';
    modal.className = 'modal fade d-none';
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width:720px">
        <div class="modal-content p-3">
          <div class="modal-header"><h5 class="modal-title">Create job</h5><button type="button" class="btn-close" aria-label="Close"></button></div>
          <form id="addJobForm">
            <div class="modal-body">
              <div class="mb-2"><label class="form-label">Title</label><input id="jobTitle" required class="form-control" /></div>
              <div class="mb-2"><label class="form-label">Company</label><input id="jobCompany" class="form-control" /></div>
              <div class="mb-2"><label class="form-label">Skills (comma)</label><input id="jobSkills" class="form-control" /></div>
              <div class="mb-2"><label class="form-label">Experience (years)</label><input id="jobExperience" type="number" class="form-control" value="0" /></div>
              <div class="mb-2"><label class="form-label">Vacancies</label><input id="jobVacancies" type="number" class="form-control" value="1" /></div>
              <div class="mb-2"><label class="form-label">Description</label><textarea id="jobDescription" class="form-control" rows="4"></textarea></div>
            </div>
            <div class="modal-footer"><button type="button" class="btn btn-outline-secondary cancel-btn">Cancel</button><button type="submit" class="btn btn-primary">Create</button></div>
          </form>
        </div>
      </div>`;
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
    modal.innerHTML = `
      <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Invite candidate</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="invite_interview_id" />
            <div class="mb-2"><label class="form-label">Candidate ID</label><input id="invite_candidate_id" class="form-control" autocomplete="off" /></div>
            <div class="mb-2"><label class="form-label">Schedule at</label><input id="invite_scheduled_at" type="datetime-local" class="form-control" /></div>
            <div class="mb-2"><label class="form-label">Message</label><textarea id="invite_message" class="form-control" rows="3">Hi, you are invited for interview.</textarea></div>
          </div>
          <div class="modal-footer"><button id="inviteCancelBtn" type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button id="inviteSendBtn" type="button" class="btn btn-success">Send Invite</button></div>
        </div>
      </div>`;
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
    modal.innerHTML = `
      <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header"><h5 class="modal-title" id="attempts-modal-title">Attempt history</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
          <div class="modal-body"><div id="attempts-loading" class="small-muted">Loading attempts…</div><div id="attempts-list" style="display:none;margin-top:12px"></div></div>
          <div class="modal-footer"><button id="attempts-modal-close" class="btn btn-secondary" data-bs-dismiss="modal">Close</button><button id="attempts-modal-ok" class="btn btn-primary">OK</button></div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    return modal;
  }

  /* ---------------- Core: Jobs, Matches, Applications ---------------- */
  let selectedJob = null;

  async function loadJobs() {
    const container = qs('#jobsList');
    if (!container) { errlog('#jobsList missing'); return; }
    container.innerHTML = '<div class="small-muted">Loading jobs...</div>';
    const res = await apiFetch(JOBS_ENDPOINT);
    if (!res || !res.ok) { container.innerHTML = `<div class="small-muted">Failed to load jobs (${res ? res.status : 'network'})</div>`; return; }
    const jobs = res.data || [];
    if (!Array.isArray(jobs) || jobs.length === 0) { container.innerHTML = `<div class="small-muted">No jobs available</div>`; return; }
    container.innerHTML = '';
    jobs.forEach(j => {
      const row = document.createElement('div');
      row.className = 'list-group-item job-card d-flex align-items-start justify-content-between';
      row.dataset.jobId = j.id;
      const left = document.createElement('div'); left.style.minWidth='0'; left.style.flex='1';
      left.innerHTML = `<h4 style="margin:0 0 4px 0; font-size:1rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(j.title||'')}</h4>
                        <div class="small-muted" style="font-size:.9rem;color:#666;">${escapeHtml(j.company||'')} • ${escapeHtml(j.skills_required||j.skills||'')}</div>`;
      const right = document.createElement('div'); right.style.minWidth='180px'; right.className='text-end';
      right.innerHTML = `
  <div class="btn-group" role="group">
    <a class="btn btn-sm btn-outline-primary" href="/jobs/${encodeURIComponent(j.id)}/">View</a>
    <button class="btn btn-sm btn-warning edit-job-btn" data-job-id="${j.id}">Edit</button>
    <button class="btn btn-sm btn-danger delete-job-btn" data-job-id="${j.id}">Delete</button>
  </div>
  
`;

        <div style="margin-top:6px;"><button class="btn btn-sm btn-secondary generate-quiz-btn" data-job-id="${j.id}">Generate Quiz</button></div>`;
      row.appendChild(left); row.appendChild(right);
      left.addEventListener('click', () => openJobDetail(j.id));
      container.appendChild(row);
    });
    attachJobCardEvents();
  }

  function attachJobCardEvents() {
    qsa('.view-job-btn').forEach(btn => { if (btn._rd_bound) return; btn._rd_bound = true; btn.addEventListener('click', (ev)=>{ ev.stopPropagation(); openJobDetail(btn.dataset.jobId); }); });
    qsa('.edit-job-btn').forEach(btn => { if (btn._rd_bound) return; btn._rd_bound = true; btn.addEventListener('click', (ev)=>{ ev.stopPropagation(); openEditJob(btn.dataset.jobId); }); });
    qsa('.delete-job-btn').forEach(btn => { if (btn._rd_bound) return; btn._rd_bound = true; btn.addEventListener('click', (ev)=>{ ev.stopPropagation(); confirmAndDeleteJob(btn.dataset.jobId); }); });
    qsa('.generate-quiz-btn').forEach(btn => { if (btn._rd_bound) return; btn._rd_bound = true; btn.addEventListener('click', (ev)=>{ ev.stopPropagation(); if (!confirm('Generate quiz questions for this job?')) return; generateQuizForJob(btn.dataset.jobId,5); }); });
  }

  async function openJobDetail(jobId) {
    if (!jobId) { showToast('Missing job id','error'); return; }
    const r = await apiFetch(`${JOBS_ENDPOINT}${encodeURIComponent(jobId)}/`, { method: 'GET' });
    if (!r || !r.ok) { showToast('Unable to load job','error'); return; }
    selectedJob = r.data;
    qs('#noJob') && (qs('#noJob').style.display='none');
    const jobDetailsEl = qs('#jobDetails');
    if (jobDetailsEl) jobDetailsEl.style.display='block';
    qs('#selectedJobTitle') && (qs('#selectedJobTitle').textContent = selectedJob.title || '');
    qs('#jobMeta') && (qs('#jobMeta').textContent = `${selectedJob.company||''} • Experience required: ${selectedJob.experience_required||0}`);
    qsa('#showMatchesBtn, #showShortlistsBtn, #exportCsvBtn, #showApplicationsBtn, .generate-quiz-btn').forEach(b=>{ if (b) b.dataset.jobId = jobId; });
    qs('#generateQuestionsBtn')?.setAttribute('data-job-id', jobId);
    qs('#matchesList') && (qs('#matchesList').innerHTML = '');
    qs('#applicationsList') && (qs('#applicationsList').innerHTML = '');
  }

  /* ---------------- Add/Edit job ---------------- */
  function openAddJobModal() {
    let modalEl = document.getElementById('addJobModal');
    if (!modalEl) modalEl = createFallbackAddJobModal();
    const form = modalEl.querySelector('#addJobForm');
    if (form && !form._rd_boundSubmit) { form._rd_boundSubmit = true; form.addEventListener('submit', submitAddJob); }
    safeShowBootstrapModal(modalEl, { backdrop: 'static' });
  }

  function openEditJob(jobId) {
    if (!jobId) return showToast('No job id','error');
    apiFetch(`${JOBS_ENDPOINT}${encodeURIComponent(jobId)}/`, { method: 'GET' }).then(r=>{
      if (!r || !r.ok) return showToast('Failed to load job for edit','error');
      const job = r.data || {};
      let modalEl = document.getElementById('addJobModal'); if (!modalEl) modalEl = createFallbackAddJobModal();
      modalEl.querySelector('#jobTitle').value = job.title || '';
      modalEl.querySelector('#jobCompany').value = job.company || '';
      const skillsField = modalEl.querySelector('#jobSkills'); if (skillsField) skillsField.value = job.skills_required || job.skills || '';
      modalEl.querySelector('#jobExperience').value = job.experience_required ?? job.experience ?? 0;
      modalEl.querySelector('#jobVacancies').value = job.vacancies ?? job.openings ?? 1;
      modalEl.querySelector('#jobDescription').value = job.description || job.short_description || '';
      modalEl.querySelector('#addJobForm').dataset.editing = String(jobId);
      safeShowBootstrapModal(modalEl);
    }).catch(e=>{ errlog('openEditJob error', e); showToast('Load failed','error'); });
  }

  async function submitAddJob(e) {
    if (e && e.preventDefault) e.preventDefault();
    const modalEl = document.getElementById('addJobModal');
    const form = modalEl && modalEl.querySelector('#addJobForm');
    if (!form) return showToast('Form missing','error');
    const title = (form.querySelector('#jobTitle')?.value || '').trim();
    if (!title) return showToast('Title required','error');
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
        if (!res || !res.ok) res = await apiFetch(`/api/recruiter/job/${encodeURIComponent(editingId)}/`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        res = await apiFetch(JOBS_ENDPOINT, { method: 'POST', body: JSON.stringify(payload) });
      }
      if (!res || !res.ok) { console.warn('Job save failed response:', res); showToast('Save failed','error'); return; }
      const createdJob = res?.data || null;
      const newId = createdJob?.id || editingId || null;
      showToast(editingId ? 'Job updated' : 'Job created', 'success');
      safeHideBootstrapModal(modalEl);
      delete form.dataset.editing;
      await loadJobs();
      if (newId) await openJobDetail(newId);
    } catch (err) { errlog('submitAddJob error', err); showToast('Save failed','error'); }
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
        if (r.ok) { showToast('Job deleted','success'); await loadJobs(); if (selectedJob && String(selectedJob.id) === String(jobId)) { selectedJob = null; qs('#jobDetails')&&(qs('#jobDetails').style.display='none'); qs('#noJob')&&(qs('#noJob').style.display='block'); } return; }
        else { const txt = await r.text().catch(()=>null); lastErr = `${r.status} ${txt||''}`; continue; }
      } catch (e) { lastErr = String(e); continue; }
    }
    showToast('Delete failed: ' + (lastErr || 'unknown'), 'error');
  }

  /* ---------------- Matches / Applications / Shortlist ---------------- */
  async function showMatchesForSelectedJob(evt) {
    const callerJobId = evt && evt.currentTarget && evt.currentTarget.dataset && evt.currentTarget.dataset.jobId ? evt.currentTarget.dataset.jobId : null;
    const jobId = selectedJob?.id || callerJobId || null;
    if (!jobId) { showToast('Select a job first','error'); return; }
    const listEl = qs('#matchesList'); if (!listEl) { showToast('Matches container missing','error'); return; }
    listEl.innerHTML = '<div class="small-muted">Loading matches...</div>';
    const res = await apiFetch(`${API_ROOT}/resumes/jobs/${encodeURIComponent(jobId)}/match`);
    if (!res || !res.ok) { listEl.innerHTML = `<div class="small-muted">Failed to load matches (${res?res.status:'network'})</div>`; return; }
    const matches = res.data?.matched_resumes || res.data || [];
    listEl.innerHTML = '';
    if (!Array.isArray(matches) || matches.length === 0) { listEl.innerHTML = '<div class="small-muted">No matches found.</div>'; qs('#matchesSection')&&(qs('#matchesSection').style.display='block'); return; }
    matches.forEach(m => {
      const scoreRaw = m.score ?? m.score_percent ?? 0;
      let score = parseFloat(scoreRaw) || 0; if (score > 0 && score <= 1) score = Math.round(score*100);
      const badge = score >= 75 ? 'bg-success' : (score >=50 ? 'bg-warning text-dark' : 'bg-danger');
      const card = document.createElement('div'); card.className='card mb-2 p-2';
      card.innerHTML = `<div class="d-flex justify-content-between">
          <div>
            <strong>${escapeHtml(m.user||m.username||m.candidate_name||'candidate')}</strong> — ${escapeHtml(m.experience||0)} yrs
            <div class="small-muted">skills: ${escapeHtml(m.skills||'')}</div>
            <div class="small-muted">missing: ${escapeHtml((m.missing_skills||[]).join(', '))}</div>
          </div>
          <div style="text-align:right;">
            <span class="badge ${badge}" style="font-size:1rem;padding:.5rem .6rem">${score}%</span>
            <div style="margin-top:8px;">
              <button class="btn btn-sm btn-primary view-attempts-btn" data-job-id="${jobId}" data-candidate-id="${m.candidate_id||m.user_id||''}">View Attempts</button>
              <button class="btn btn-sm btn-outline-secondary ms-1 shortlist-manual-btn" data-job-id="${jobId}" data-resume-id="${m.resume_id||m.id||0}">Shortlist</button>
            </div>
          </div>
        </div>`;
      listEl.appendChild(card);
    });
    qsa('.view-attempts-btn').forEach(b => { if (b._rd_bound) return; b._rd_bound = true; b.addEventListener('click', ()=> window.openAttemptHistoryModal(Number(b.dataset.jobId), Number(b.dataset.candidateId))); });
    qsa('.shortlist-manual-btn').forEach(b => { if (b._rd_bound) return; b._rd_bound = true; b.addEventListener('click', ()=> shortlist(Number(b.dataset.jobId), Number(b.dataset.resumeId))); });
    qs('#matchesSection') && (qs('#matchesSection').style.display='block');
  }

  async function loadApplicationsForSelectedJob(jobIdParam) {
    const jobToUse = jobIdParam || (selectedJob && selectedJob.id);
    if (!jobToUse) return showToast('Select job first','error');
    if (!selectedJob || String(jobToUse) !== String(selectedJob.id)) { try { await openJobDetail(jobToUse); } catch(e){} }
    const listEl = qs('#applicationsList'); if (!listEl) return;
    listEl.innerHTML = '<div class="small-muted">Loading applications...</div>';
    const urlsToTry = [
      `${API_ROOT}/resumes/applications/?job_id=${encodeURIComponent(jobToUse)}`,
      `${API_ROOT}/resumes/jobs/${encodeURIComponent(jobToUse)}/applications/`,
      `${API_ROOT}/applications/?job_id=${encodeURIComponent(jobToUse)}`,
      `${API_ROOT}/recruiter/job/${encodeURIComponent(jobToUse)}/applications/`
    ];
    let res = null;
    for (const u of urlsToTry) {
      try {
        res = await apiFetch(u);
        if (res && res.ok) break;
      } catch (e) { log('applications try failed', u, e); }
    }
    if (!res || !res.ok) { listEl.innerHTML = `<div class="small-muted">No applications (${res?res.status:'no response'})</div>`; return; }
    let apps = [];
    if (Array.isArray(res.data)) apps = res.data;
    else if (res.data && Array.isArray(res.data.results)) apps = res.data.results;
    else if (res.data && Array.isArray(res.data.applications)) apps = res.data.applications;
    else if (res.data && Array.isArray(res.data.data)) apps = res.data.data;
    if (!apps || apps.length === 0) { listEl.innerHTML = '<div class="small-muted">No applications yet.</div>'; return; }
    listEl.innerHTML = '';
    apps.forEach(a => {
      const id = a.id || a.application_id || a.pk || '';
      const resume_id = a.resume_id || (a.resume && (a.resume.id || a.resume)) || '';
      const resume_file = a.resume_file || (a.resume && a.resume.file) || a.file || '';
      const name = a.candidate_name || a.user || a.username || a.applicant || '';
      const status = a.status || '';
      const applied = a.applied_at || a.created_at || a.created || '';
      const card = document.createElement('div');
      card.className = 'card mb-2 p-2 application-row';
      if (resume_id) card.dataset.candidateId = String(resume_id);
      if (name) card.dataset.candidateName = String(name);
      if (selectedJob && selectedJob.id) card.dataset.jobId = String(selectedJob.id);
      card.innerHTML = `<div class="d-flex justify-content-between align-items-start">
          <div style="min-width:0;">
            <strong>${escapeHtml(name||`Resume ${resume_id||''}`)}</strong>
            <div class="small-muted">Applied: ${escapeHtml(applied)}</div>
            <div class="small-muted">Message: ${escapeHtml(a.message||'')}</div>
          </div>
          <div style="min-width:180px;text-align:right;">
            <div class="mb-1"><span class="badge ${status==='shortlisted'?'bg-success':status==='rejected'?'bg-danger':'bg-secondary'}">${escapeHtml(status||'')}</span></div>
            <div>
              ${resume_file?`<a class="btn btn-sm btn-outline-primary me-1" href="${escapeHtml(resume_file)}" target="_blank" rel="noopener">View</a>`:''}
              <button class="btn btn-sm btn-primary shortlist-btn" data-job="${selectedJob.id}" data-resume="${resume_id}">Shortlist</button>
              <button class="btn btn-sm btn-outline-danger reject-btn" data-app-id="${id}">Reject</button>
            </div>
          </div>
        </div>
        <div><button class="btn btn-sm btn-success invite-btn" data-job-id="${selectedJob.id}" data-candidate-id="${resume_id}" data-candidate-name="${escapeHtml(name)}">Invite</button></div>`;
      listEl.appendChild(card);
    });
    setTimeout(()=> injectInviteButtonsIntoAppRows('.application-row'), 50);
    listEl.querySelectorAll('.shortlist-btn').forEach(b=>{ if (b._rd_bound) return; b._rd_bound = true; b.addEventListener('click', ()=> { shortlist(Number(b.dataset.job), Number(b.dataset.resume)); }); });
    listEl.querySelectorAll('.reject-btn').forEach(b=>{ if (b._rd_bound) return; b._rd_bound = true; b.addEventListener('click', ()=> { changeApplicationStatus(Number(b.dataset.appId), 'rejected'); }); });
    qs('#applicationsSection') && (qs('#applicationsSection').style.display='block');
  }

  /* ---------------- Invite modal + interview creation ---------------- */
  function ensureInviteBindings() {
    const mod = ensureInviteModal();
    if (!mod) return;
    mod.querySelector('#inviteCancelBtn')?.addEventListener('click', (e)=>{ e.preventDefault(); safeHideBootstrapModal(mod); });
    mod.addEventListener('click', (e)=>{ if (e.target === mod) safeHideBootstrapModal(mod); });
    window.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') safeHideBootstrapModal(mod); });
    const sendBtn = mod.querySelector('#inviteSendBtn');
    if (sendBtn && !sendBtn._rd_bound) {
      sendBtn._rd_bound = true;
      sendBtn.addEventListener('click', async (ev) => {
        ev.preventDefault(); sendBtn.disabled = true;
        const modal = mod;
        const candidateId = (modal.querySelector('#invite_candidate_id')?.value || '').trim();
        const scheduled = modal.querySelector('#invite_scheduled_at')?.value || null;
        const message = modal.querySelector('#invite_message')?.value || '';
        const currJobId = modal.dataset.jobId || modal.querySelector('#invite_interview_id')?.value || (selectedJob && selectedJob.id) || null;
        if (!candidateId) { alert('Enter candidate id'); sendBtn.disabled=false; return; }
        if (!currJobId) { if (!confirm('No job selected for invite. Create/select interview first?')) { sendBtn.disabled=false; return; } window.open('/interviews/recruiter/','_blank'); sendBtn.disabled=false; return; }
        try {
          const body = JSON.stringify({ candidate_id: candidateId, scheduled_at: scheduled, message });
          const res = await apiFetch(`${API_ROOT}/interviews/recruiter/${encodeURIComponent(currJobId)}/invite/`, { method: 'POST', body });
          if (res && res.ok) { showToast('Invite sent','success'); safeHideBootstrapModal(modal); if (typeof loadApplicationsForSelectedJob === 'function') try{ await loadApplicationsForSelectedJob(currJobId); }catch(e){} }
          else { const detail = res && res.data ? (res.data.detail || res.data.message || JSON.stringify(res.data)) : `Status ${res?res.status:'no response'}`; alert('Invite failed: ' + detail); }
        } catch(e) { errlog('sendInvite error', e); alert('Error sending invite'); } finally { sendBtn.disabled = false; }
      });
    }
  }

  document.body.addEventListener('click', (ev) => {
    const btn = ev.target.closest && ev.target.closest('.invite-btn');
    if (!btn) return;
    const jobId = btn.dataset.jobId || btn.getAttribute('data-job-id') || (selectedJob && selectedJob.id);
    const candidateId = btn.dataset.candidateId || btn.getAttribute('data-candidate-id') || '';
    const candidateName = btn.dataset.candidateName || btn.getAttribute('data-candidate-name') || '';
    showInviteModal({ jobId, candidateId, candidateName });
  });

  function showInviteModal({ jobId=null, interviewId=null, candidateId='', candidateName='' } = {}) {
    const modal = ensureInviteModal();
    if (!modal) return;
    const idInput = modal.querySelector('#invite_interview_id');
    const candInput = modal.querySelector('#invite_candidate_id');
    const msgInput = modal.querySelector('#invite_message');
    if (idInput) idInput.value = interviewId || '';
    if (candInput) candInput.value = candidateId || '';
    if (msgInput) msgInput.value = `Hi ${candidateName || ''}, you are invited for interview.`;
    if (jobId) modal.dataset.jobId = String(jobId);
    ensureInviteBindings();
    safeShowBootstrapModal(modal);
  }

  function injectInviteButtonsIntoAppRows(selector = '.application-row') {
    const rows = document.querySelectorAll(selector);
    rows.forEach(row => {
      if (row._inviteInjected) return;
      row._inviteInjected = true;
      const candidateId = row.dataset.candidateId || row.getAttribute('data-candidate-id') || '';
      const candidateName = row.dataset.candidateName || row.getAttribute('data-candidate-name') || '';
      const jobId = row.dataset.jobId || (row.closest('[data-job-id]') && row.closest('[data-job-id]').dataset.jobId) || '';
      let actions = row.querySelector('.app-actions') || row.querySelector('.actions');
      if (!actions) { actions = document.createElement('div'); actions.className = 'app-actions'; actions.style.marginTop = '6px'; row.appendChild(actions); }
      const btn = document.createElement('button'); btn.type='button'; btn.className='btn btn-sm btn-success invite-btn'; btn.textContent='Invite';
      if (candidateId) btn.dataset.candidateId = candidateId;
      if (candidateName) btn.dataset.candidateName = candidateName;
      if (jobId) btn.dataset.jobId = jobId;
      btn.addEventListener('click', (e) => {
        const jd = e.currentTarget.dataset.jobId || jobId || (window.state && window.state.selectedJobId) || '';
        showInviteModal({ jobId: jd || null, candidateId: e.currentTarget.dataset.candidateId || '', candidateName: e.currentTarget.dataset.candidateName || '' });
      });
      actions.appendChild(btn);
    });
  }

  /* ---------------- Shortlist & status ---------------- */
  async function shortlist(job_id, resume_id) {
    if (!job_id || !resume_id) return showToast('Invalid shortlist','error');
    const res = await apiFetch(`${API_ROOT}/resumes/shortlist/`, { method: 'POST', body: JSON.stringify({ job_id, resume_id }) });
    if (res.ok) { showToast('Shortlisted','success'); loadApplicationsForSelectedJob(); showShortlistsForSelectedJob(); }
    else { showToast('Shortlist failed','error'); }
  }
  async function changeApplicationStatus(applicationId, newStatus) {
    if (!applicationId) return;
    const res = await apiFetch(`${API_ROOT}/resumes/applications/${applicationId}/`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
    if (res.ok) { showToast('Status updated','success'); loadApplicationsForSelectedJob(); } else showToast('Update failed','error');
  }

  async function showShortlistsForSelectedJob() {
    if (!selectedJob) return showToast('Select job first','error');
    const res = await apiFetch(`${API_ROOT}/resumes/shortlist/?job_id=${selectedJob.id}`);
    const container = qs('#shortlistList'); if (!container) return;
    if (!res || !res.ok) { container.innerHTML = `<div class="small-muted">Failed to load shortlist</div>`; return; }
    const list = res.data || [];
    container.innerHTML = '';
    if (!list.length) { container.innerHTML = `<div class="small-muted">No shortlists found.</div>`; return; }
    list.forEach(s => {
      const resumeDisplay = s.resume && (s.resume.id || s.resume) ? (s.resume.id || s.resume) : 'N/A';
      const shortlistedBy = s.shortlisted_by || '';
      const jobId = s.job && (s.job.id || s.job) ? (s.job.id || s.job) : '';
      const div = document.createElement('div'); div.className='card mb-2 p-2';
      div.innerHTML = `<div class="d-flex justify-content-between"><div><strong>Resume #${escapeHtml(String(resumeDisplay))}</strong><div class="small-muted">${escapeHtml(String(shortlistedBy))}</div></div><div><button class="btn btn-sm btn-outline-primary resend-btn" data-job="${escapeHtml(String(jobId))}" data-resume="${escapeHtml(String(resumeDisplay))}">Resend</button><button class="btn btn-sm btn-outline-danger remove-shortlist-btn" data-id="${escapeHtml(String(s.id))}">Remove</button></div></div>`;
      container.appendChild(div);
    });
    container.querySelectorAll('.resend-btn').forEach(b=>{ if (b._rd_bound) return; b._rd_bound = true; b.addEventListener('click', ()=> resend(b.dataset.job, b.dataset.resume)); });
    container.querySelectorAll('.remove-shortlist-btn').forEach(b=>{ if (b._rd_bound) return; b._rd_bound = true; b.addEventListener('click', ()=> removeShortlist(b.dataset.id)); });
    qs('#shortlistSection') && (qs('#shortlistSection').style.display='block');
  }

  async function removeShortlist(id) {
    if (!id) return;
    if (!confirm('Remove shortlist?')) return;
    const res = await apiFetch(`${API_ROOT}/resumes/shortlist/`, { method: 'DELETE', body: JSON.stringify({ id }) });
    if (res.ok) { showToast('Removed','success'); showShortlistsForSelectedJob(); }
    else showToast('Remove failed','error');
  }

  async function resend(job_id, resume_id) {
    const payload = { job_id: Number(job_id), resume_id: Number(resume_id), resend: true };
    const res = await apiFetch(`${API_ROOT}/resumes/shortlist/`, { method: 'POST', body: JSON.stringify(payload) });
    if (res.ok) showToast('Resend queued','success'); else { const err = res && res.data ? (res.data.error || res.data.detail || JSON.stringify(res.data)) : 'Resend failed'; showToast(err,'error'); }
  }

  /* ---------------- Quiz / Results / Attempts ---------------- */
  async function generateQuizForJob(jobId, questionsCount = 5) {
    if (!jobId) return showToast('No job id','error');
    if (!confirm('Generate quiz for this job now?')) return;
    try {
      const r = await apiFetch(`${API_ROOT}/quiz/${encodeURIComponent(jobId)}/generate/`, { method: 'POST', body: JSON.stringify({ questions_count: questionsCount }) });
      if (!r || !r.ok) { showToast('Generate failed','error', 5000); return null; }
      showToast('Quiz generated', 'success');
      return r.data;
    } catch (e) { errlog('generateQuiz err', e); showToast('Network error','error'); return null; }
  }

  async function fetchRecruiterResults(jobId) {
    if (!jobId) return;
    const r = await apiFetch(`${API_ROOT}/quiz/${jobId}/recruiter/results/`);
    if (!r || !r.ok) { showToast('Failed to fetch results','error'); errlog('results fetch failed', r); return; }
    renderResults(r.data?.results || [], r.data?.job_title || '');
  }

  function renderResults(rows, jobTitle) {
    const tbody = qs('#results-table tbody'); if (!tbody) return;
    tbody.innerHTML = '';
    const filter = qs('#filter')?.value || 'all';
    rows.forEach(r => {
      if (filter==='passed' && !r.last_passed) return;
      if (filter==='failed' && r.last_passed) return;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(r.name||r.username||r.candidate_name||'—')}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">${r.attempts_count??0}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">${r.last_score??'—'}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">${r.last_passed?'<strong style="color:green">Passed</strong>':'<strong style="color:crimson">Failed</strong>'}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">${r.last_finished_at? (new Date(r.last_finished_at)).toLocaleString() : '—'}</td>
        <td style="padding:8px;border-bottom:1px solid #eee"><button class="btn btn-sm btn-outline-primary view-attempts" data-cid="${r.candidate_id||r.id||''}" data-job="${r.job_id||''}">View Attempts</button>
        <button class="btn btn-sm btn-outline-danger reset-attempts" data-cid="${r.candidate_id||r.id||''}" data-job="${r.job_id||''}">Reset</button></td>`;
      tbody.appendChild(tr);
    });
    qsa('.view-attempts').forEach(b=>{ if (b._rd_bound) return; b._rd_bound = true; b.addEventListener('click', ()=> window.openAttemptHistoryModal(Number(b.dataset.job), Number(b.dataset.cid))); });
    qsa('.reset-attempts').forEach(b=>{ if (b._rd_bound) return; b._rd_bound = true; b.addEventListener('click', async ()=>{ if (!confirm('Reset attempts for this candidate?')) return; const job=b.dataset.job, cid=b.dataset.cid; const r = await apiFetch(`${API_ROOT}/quiz/${encodeURIComponent(job)}/reset/${encodeURIComponent(cid)}/`, { method: 'POST' }); if (r.ok) { showToast('Reset OK','success'); fetchRecruiterResults(job);} else showToast('Reset failed','error'); }); });
    qs('#job-title') && (qs('#job-title').textContent = `Results — ${jobTitle||''}`);
  }

  /* ---------------- Attempt history modal ---------------- */
  function ensureAttemptBindings() {
    const modal = ensureAttemptsModal();
    if (!modal) return;
    modal.querySelector('#attempts-modal-close')?.addEventListener('click', ()=> safeHideBootstrapModal(modal));
    modal.querySelector('#attempts-modal-ok')?.addEventListener('click', ()=> safeHideBootstrapModal(modal));
  }

  async function fetchAttempts(jobId, candidateId) {
    if (!jobId) return [];
    const headers = Object.assign({ 'Content-Type':'application/json' }, authHeaders());
    const tries = [
      `${API_ROOT}/quiz/${encodeURIComponent(jobId)}/attempts/`,
      `${API_ROOT}/quiz/attempts/?job_id=${encodeURIComponent(jobId)}&candidate=${candidateId}`,
      `${API_ROOT}/quiz/attempts/?job=${encodeURIComponent(jobId)}`
    ];
    for (const u of tries) {
      try {
        const r = await fetch(u, { method: 'GET', headers });
        if (!r) continue;
        const txt = await r.text().catch(()=>null);
        let data = null;
        try { data = txt ? JSON.parse(txt): null; } catch(e) { data = txt; }
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
    const container = qs('#attempts-list'); if (!container) return;
    container.innerHTML = '';
    if (!attempts || attempts.length === 0) { container.innerHTML = '<div class="small-muted">No attempts yet.</div>'; return; }
    const table = document.createElement('table'); table.style.width='100%'; table.style.borderCollapse='collapse';
    table.innerHTML = `<thead><tr>
      <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Attempt</th>
      <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Finished</th>
      <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Score</th>
      <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Result</th>
      <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Answers</th>
    </tr></thead><tbody></tbody>`;
    const tbody = table.querySelector('tbody');
    attempts.slice().sort((a,b)=> new Date(b.finished_at||b.started_at||0)- new Date(a.finished_at||a.started_at||0)).forEach(at=>{
      const id = at.attempt_id ?? at.id ?? '';
      const finished = at.finished_at ? new Date(at.finished_at).toLocaleString() : (at.started_at ? new Date(at.started_at).toLocaleString() : '');
      const total = at.total ?? at.total_questions ?? '';
      const score = (at.score ?? '') + (total ? ` / ${total}` : '');
      const passed = at.passed ? '<strong style="color:green">Passed</strong>' : '<strong style="color:crimson">Failed</strong>';
      let answersHtml = '<span class="small-muted">—</span>';
      if (at.answers) { try { answersHtml = `<pre style="white-space:pre-wrap;margin:0;font-size:.9rem">${escapeHtml(typeof at.answers === 'string' ? at.answers : JSON.stringify(at.answers, null, 2))}</pre>`; } catch(e){} }
      else if (at.data && at.data.answers) { answersHtml = `<pre style="white-space:pre-wrap;margin:0;font-size:.9rem">${escapeHtml(JSON.stringify(at.data.answers, null, 2))}</pre>`; }
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
    qs('#attempts-modal-title') && (qs('#attempts-modal-title').textContent = `Attempts — job ${jobId} candidate ${candidateId || 'all'}`);
    loading && (loading.style.display='block'); list && (list.style.display='none'); if(list) list.innerHTML='';
    safeShowBootstrapModal(modal);
    const data = await fetchAttempts(jobId, candidateId);
    loading && (loading.style.display='none');
    if (!data) { if(list) { list.style.display='block'; list.innerHTML = '<div class="text-danger">Error fetching attempts</div>'; } return; }
    renderAttemptList(data);
    list && (list.style.display='block');
  };

  /* ---------------- CSV helpers ---------------- */
  function toCsv(rows) {
    if (!rows || !rows.length) return '';
    const keys = Object.keys(rows[0]);
    const lines = [keys.join(',')];
    rows.forEach(r => {
      const line = keys.map(k => {
        let v = r[k]; if (v === null || v === undefined) v = '';
        v = String(v).replace(/"/g, '""');
        return `"${v}"`;
      }).join(',');
      lines.push(line);
    });
    return lines.join('\n');
  }
  function downloadFile(filename, content, mime='text/csv') {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
  async function exportResultsCsv(jobId) {
    if (!jobId) return showToast('Select job first','error');
    const r = await apiFetch(`${API_ROOT}/quiz/attempts/?job_id=${jobId}`, { method: 'GET' });
    if (!r || !r.ok) { showToast('Failed to fetch attempts','error'); return; }
    const rows = (r.data && (r.data.results || r.data)) || [];
    const csv = toCsv(rows.map(x => ({ candidate: x.candidate||'', score: x.score||'', passed: x.passed ? 'yes' : 'no', finished_at: x.finished_at || '', answers: JSON.stringify(x.answers||{}) })));
    downloadFile(`quiz_results_job_${jobId}.csv`, csv);
  }

  /* ---------------- UI Wiring ---------------- */
  function attachUI() {
    ensureToastContainer();
    createFallbackAddJobModal();
    ensureInviteModal();
    ensureAttemptsModal();

    if (qs('#tokenInput') && savedToken()) qs('#tokenInput').value = savedToken();
    const saveBtn = qs('#saveTokenBtn');
    if (saveBtn && !saveBtn._rd_bound) {
      saveBtn._rd_bound = true;
      saveBtn.addEventListener('click', () => {
        const v = (qs('#tokenInput')?.value || '').trim();
        if (!v) { showToast('Paste token first','error'); return; }
        setSavedToken(v); qs('#tokenStatus') && (qs('#tokenStatus').innerText='Token saved'); showToast('Token saved','success');
      });
    }

    qs('#refreshJobs') && qs('#refreshJobs').addEventListener('click', loadJobs);
    qs('#addJobBtn') && qs('#addJobBtn').addEventListener('click', openAddJobModal);
    // addJobForm may be inside fallback modal — ensure binding when it exists
    const addForm = qs('#addJobForm'); if (addForm && !addForm._rd_boundSubmit) { addForm._rd_boundSubmit = true; addForm.addEventListener('submit', submitAddJob); }

    // action buttons (guarded)
    qs('#showMatchesBtn') && qs('#showMatchesBtn').addEventListener('click', showMatchesForSelectedJob);
    qs('#showShortlistsBtn') && qs('#showShortlistsBtn').addEventListener('click', showShortlistsForSelectedJob);
    qs('#showApplicationsBtn') && qs('#showApplicationsBtn').addEventListener('click', () => loadApplicationsForSelectedJob());
    qs('#exportCsvBtn') && qs('#exportCsvBtn').addEventListener('click', () => exportResultsCsv(selectedJob ? selectedJob.id : null));
    qs('#filter') && qs('#filter').addEventListener('change', () => { if (selectedJob) fetchRecruiterResults(selectedJob.id); });

    loadJobs();

    // MutationObserver for dynamic app rows (best-effort)
    try {
      const appsContainer = document.querySelector('#applicationsList') || document.body;
      const mo = new MutationObserver((muts) => {
        muts.forEach(m => { m.addedNodes && m.addedNodes.forEach(n => { if (n.nodeType===1) { if (n.matches && n.matches('.application-row')) injectInviteButtonsIntoAppRows(); n.querySelectorAll && n.querySelectorAll('.application-row').forEach(r=>injectInviteButtonsIntoAppRows()); } }); });
      });
      mo.observe(appsContainer, { childList:true, subtree:true });
    } catch(e){ console.warn('observer failed', e); }
  }

  /* ---------------- boot ---------------- */
  document.addEventListener('DOMContentLoaded', () => {
    try { attachUI(); log('recruiter dashboard initialized'); } catch (e) { errlog('init error', e); }
  });

  /* ---------------- expose for debugging ---------------- */
  window.rdash = { loadJobs, openJobDetail, generateQuizForJob, openAttemptHistoryModal, showInviteModal, apiFetch, setSavedToken, savedToken };

})();
