// static/recruiter_dashboard.js
// Unified recruiter dashboard (merged & deduplicated)
// Features:
// - Jobs list (view, edit, delete)
// - Applications, Matches, Shortlist
// - Invite modal + invite send
// - Quiz generation, recruiter results, export CSV
// - Attempt history modal
// - Small helpers & token handling
//
// NOTE: adjust API paths if your backend uses different endpoints.

const API_ROOT = '/api';
const TOKEN_KEY = 'token'; // used in templates earlier; if you prefer 'recruiter_token_v1' set here
const JOBS_ENDPOINT = `${API_ROOT}/resumes/jobs/`;
const JOB_APPLICATIONS_URL = (jobId) => `${API_ROOT}/resumes/recruiter/job/${jobId}/applications/`;
const QUIZ_GENERATE_URL = (jobId) => `${API_ROOT}/quiz/generate/${jobId}/`;
const QUIZ_RESULTS_URL = (jobId) => `${API_ROOT}/quiz/${jobId}/recruiter/results/`;

/* -------------------- Helpers -------------------- */
function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
function escapeHtml(s = '') {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"'`]/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#x60;' }[m])
  );
}
function showToast(msg, type = 'info', ms = 3000) {
  const container = document.getElementById('toastContainer') || document.body;
  const el = document.createElement('div');
  el.innerHTML = `<div style="padding:10px 14px;border-radius:8px;background:${
    type === 'error' ? '#f8d7da' : type === 'success' ? '#d1e7dd' : '#fff8d6'
  };border:1px solid #ddd;margin-bottom:8px">${msg}</div>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

/* -------------------- Token & headers -------------------- */
function savedToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
function setSavedToken(t) { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }
function authHeaders() {
  const t = savedToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}
function getTokenHeader() {
  const t = savedToken();
  return t ? { 'Authorization': `Bearer ${t}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

/* -------------------- fetch wrappers -------------------- */
async function apiFetch(path, opts = {}) {
  opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}, authHeaders());
  try {
    const r = await fetch(path, opts);
    if (r.status === 401 || r.status === 403) {
      localStorage.removeItem(TOKEN_KEY);
      showToast('Not authorized — paste a valid token and retry', 'error', 4000);
      return { ok: false, status: r.status, data: null };
    }
    const txt = await r.text().catch(() => null);
    let json = null;
    try { json = txt ? JSON.parse(txt) : null; } catch (e) { json = null; }
    return { ok: r.ok, status: r.status, data: json, text: txt, res: r };
  } catch (e) {
    console.error('apiFetch error', e);
    return { ok: false, status: 0, error: true, exception: String(e) };
  }
}

async function fetchJson(url, opts = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, authHeaders(), opts.headers || {});
  const r = await fetch(url, Object.assign({}, opts, { headers }));
  const txt = await r.text().catch(()=>null);
  let data = null;
  try { data = txt ? JSON.parse(txt) : null; } catch(e){ data = txt; }
  return { ok: r.ok, status: r.status, data, res: r };
}

/* -------------------- State -------------------- */
let selectedJob = null;
let state = { jobs: [], selectedJobId: null, selectedJob: null };

/* -------------------- JOBS list & render -------------------- */
async function loadJobs() {
  const container = document.getElementById('jobsList');
  if (!container) return;
  container.innerHTML = '<div class="small-muted">Loading jobs...</div>';
  const res = await apiFetch(JOBS_ENDPOINT);
  if (!res || !res.ok) {
    container.innerHTML = `<div class="small-muted">Failed to load jobs (${res ? res.status : 'network'})</div>`;
    return;
  }
  const jobs = res.data || [];
  state.jobs = Array.isArray(jobs) ? jobs : (jobs.results || []);
  if (!state.jobs.length) {
    container.innerHTML = `<div class="small-muted">No jobs available</div>`;
    return;
  }
  container.innerHTML = '';
  state.jobs.forEach(j => {
    const row = document.createElement('div');
    row.className = 'list-group-item job-card d-flex align-items-start justify-content-between';
    row.dataset.jobId = j.id;
    const left = document.createElement('div'); left.style.minWidth = '0'; left.style.flex = '1';
    left.innerHTML = `
      <h4 style="margin:0 0 4px 0; font-size:1rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(j.title || '')}</h4>
      <div class="small-muted" style="font-size:.9rem; color:#666;">
        ${escapeHtml(j.company || '')} • ${escapeHtml(j.skills_required || j.skills || '')}
      </div>`;
    const right = document.createElement('div'); right.style.minWidth = '180px'; right.className = 'text-end';
    right.innerHTML = `
      <div class="btn-group" role="group">
        <button class="btn btn-sm btn-outline-primary view-job-btn" data-job-id="${j.id}">View</button>
        <button class="btn btn-sm btn-warning edit-job-btn" data-job-id="${j.id}">Edit</button>
        <button class="btn btn-sm btn-danger delete-job-btn" data-job-id="${j.id}">Delete</button>
      </div>
      <div style="margin-top:6px;">
        <button class="btn btn-sm btn-secondary generate-quiz-btn" data-job-id="${j.id}">Generate Quiz</button>
      </div>`;
    row.appendChild(left); row.appendChild(right);
    left.addEventListener('click', () => openJobDetail(j.id));
    container.appendChild(row);
  });
  attachJobCardEvents();
}

function attachJobCardEvents() {
  qsa('.view-job-btn').forEach(btn => {
    if (btn._bound) return; btn._bound = true;
    btn.addEventListener('click', async (ev) => { ev.stopPropagation(); await openJobDetail(btn.dataset.jobId); });
  });
  qsa('.edit-job-btn').forEach(btn => {
    if (btn._bound) return; btn._bound = true;
    btn.addEventListener('click', (ev) => { ev.stopPropagation(); openEditJob(btn.dataset.jobId); });
  });
  qsa('.delete-job-btn').forEach(btn => {
    if (btn._bound) return; btn._bound = true;
    btn.addEventListener('click', (ev) => { ev.stopPropagation(); confirmAndDeleteJob(btn.dataset.jobId); });
  });
  qsa('.generate-quiz-btn').forEach(btn => {
    if (btn._boundQuiz) return; btn._boundQuiz = true;
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (!confirm('Generate quiz questions for this job?')) return;
      await generateQuizForJob(btn.dataset.jobId, 5);
    });
  });
}

/* -------------------- Open job detail -------------------- */
async function openJobDetail(jobId) {
  const r = await apiFetch(`${JOBS_ENDPOINT}${jobId}/`, { method: 'GET' });
  if (!r.ok) { showToast('Unable to load job', 'error'); return; }
  selectedJob = r.data; state.selectedJob = selectedJob; state.selectedJobId = selectedJob?.id || jobId;
  document.getElementById('noJob') && (document.getElementById('noJob').style.display = 'none');
  document.getElementById('jobDetails') && (document.getElementById('jobDetails').style.display = 'block');
  qs('#selectedJobTitle').textContent = selectedJob.title || '';
  qs('#jobMeta').textContent = `${selectedJob.company || ''} • Experience required: ${selectedJob.experience_required || 0}`;
  qsa('#showMatchesBtn, #showShortlistsBtn, #exportCsvBtn, #showApplicationsBtn, .generate-quiz-btn').forEach(b => { b.dataset.jobId = jobId; });
  qs('#matchesList') && (qs('#matchesList').innerHTML = '');
  qs('#applicationsList') && (qs('#applicationsList').innerHTML = '');
}

/* -------------------- Add / Edit job modal (short) -------------------- */
function openAddJobModal() {
  const modalEl = document.getElementById('addJobModal');
  const form = document.getElementById('addJobForm');
  if (form) { form.reset(); delete form.dataset.editing; form.querySelector('[type="submit"]').textContent = 'Create'; modalEl.querySelector('.modal-title').textContent = 'Create job'; }
  new bootstrap.Modal(modalEl, { backdrop: 'static' }).show();
}

async function submitAddJob(e) {
  if (e && e.preventDefault) e.preventDefault();
  const form = document.getElementById('addJobForm');
  if (!form) return showToast('Form missing', 'error');
  const title = (qs('#jobTitle')?.value || '').trim(); if (!title) return showToast('Title required', 'error');
  const payload = {
    title,
    company: qs('#jobCompany')?.value || '',
    skills_required: qs('#jobSkills')?.value || '',
    experience_required: Number(qs('#jobExperience')?.value || 0),
    vacancies: Number(qs('#jobVacancies')?.value || 1),
    description: qs('#jobDescription')?.value || ''
  };
  const editingId = form.dataset.editing || null;
  let res;
  if (editingId) {
    res = await apiFetch(`${JOBS_ENDPOINT}${editingId}/`, { method: 'PATCH', body: JSON.stringify(payload) });
    if (!res.ok) res = await apiFetch(`/api/recruiter/job/${editingId}/`, { method: 'PATCH', body: JSON.stringify(payload) });
  } else {
    res = await apiFetch(JOBS_ENDPOINT, { method: 'POST', body: JSON.stringify(payload) });
  }
  if (!res || !res.ok) { showToast('Save failed', 'error'); return; }
  showToast(editingId ? 'Job updated' : 'Job created', 'success');
  bootstrap.Modal.getInstance(document.getElementById('addJobModal'))?.hide();
  delete form.dataset.editing;
  await loadJobs();
  if (editingId && selectedJob && String(selectedJob.id) === String(editingId)) await openJobDetail(editingId);
}

async function openEditJob(jobId) {
  if (!jobId) return showToast('No job id', 'error');
  const r = await apiFetch(`${JOBS_ENDPOINT}${jobId}/`, { method: 'GET' });
  if (!r || !r.ok) return showToast('Failed to load job for edit', 'error');
  const job = r.data || {};
  document.getElementById('jobTitle').value = job.title || '';
  document.getElementById('jobCompany').value = job.company || '';
  document.getElementById('jobSkills').value = job.skills_required || job.skills || '';
  document.getElementById('jobExperience').value = job.experience_required ?? job.experience ?? 0;
  document.getElementById('jobVacancies').value = job.vacancies ?? job.openings ?? 1;
  document.getElementById('jobDescription').value = job.description || job.short_description || '';
  const form = document.getElementById('addJobForm');
  form.dataset.editing = String(jobId);
  qs('#addJobModal .modal-title').textContent = 'Edit job';
  form.querySelector('[type="submit"]').textContent = 'Update';
  new bootstrap.Modal(document.getElementById('addJobModal')).show();
}

/* -------------------- Delete job -------------------- */
async function confirmAndDeleteJob(jobId) {
  if (!jobId) return;
  if (!confirm('Delete job permanently?')) return;
  const endpoints = [`${JOBS_ENDPOINT}${jobId}/`, `/api/resumes/recruiter/job/${jobId}/delete/`];
  let lastErr = null;
  for (const url of endpoints) {
    try {
      const r = await fetch(url, { method: 'DELETE', headers: getTokenHeader() });
      if (r.ok) {
        showToast('Job deleted', 'success');
        const card = document.querySelector(`.job-card[data-job-id="${jobId}"]`); if (card) card.remove();
        if (selectedJob && String(selectedJob.id) === String(jobId)) {
          selectedJob = null;
          document.getElementById('jobDetails') && (document.getElementById('jobDetails').style.display = 'none');
          document.getElementById('noJob') && (document.getElementById('noJob').style.display = 'block');
        }
        await loadJobs();
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

/* -------------------- Matches -------------------- */
// ---------- Improved showMatches + invite delegation (paste into recruiter_dashboard.js) ----------
async function showMatchesForSelectedJob(eventOrJobId) {
  // allow calling with explicit job id (or event)
  let jobId = null;
  if (typeof eventOrJobId === 'number' || typeof eventOrJobId === 'string') jobId = eventOrJobId;
  if (!jobId && eventOrJobId && eventOrJobId.currentTarget) {
    jobId = eventOrJobId.currentTarget.dataset.jobId || eventOrJobId.currentTarget.getAttribute('data-job-id');
  }

  // fallback to global selectedJob
  if (!jobId) jobId = (typeof state !== 'undefined' && state.selectedJobId) ? state.selectedJobId : (window.selectedJob && window.selectedJob.id);

  if (!jobId) {
    showToast('Select a job first (click on a job or View)', 'error');
    return;
  }

  // fetch matches (robust url tries)
  const tries = [
    `${JOBS_ENDPOINT}${jobId}/match`,
    `/api/resumes/jobs/${jobId}/match`,
    `/api/resumes/jobs/${jobId}/matches`,
  ];
  let res = null;
  for (const u of tries) {
    try { res = await apiFetch(u); if (res && res.ok) break; } catch (e) { console.warn('match fetch try failed', u, e); }
  }
  const listEl = document.getElementById('matchesList');
  if (!listEl) return;
  if (!res || !res.ok) { listEl.innerHTML = `<div class="small-muted">Failed to load matches (${res ? res.status : 'no response'})</div>`; return; }

  const matches = res.data?.matched_resumes || res.data || [];
  listEl.innerHTML = '';
  if (!matches.length) { listEl.innerHTML = `<div class="small-muted">No matches found.</div>`; qs('#matchesSection').style.display = 'block'; return; }

  matches.forEach(m => {
    const scoreRaw = m.score ?? m.score_percent ?? 0;
    let score = parseFloat(scoreRaw) || 0; if (score > 0 && score <= 1) score = Math.round(score * 100);
    const badge = score >= 75 ? 'bg-success' : (score >= 50 ? 'bg-warning text-dark' : 'bg-danger');
    const card = document.createElement('div'); card.className = 'card mb-2 p-2';
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
            <button class="btn btn-sm btn-outline-secondary ms-1 shortlist-inline" data-job="${jobId}" data-resume="${m.resume_id || m.id || 0}">Shortlist</button>
          </div>
        </div>
      </div>`;
    listEl.appendChild(card);
  });

  qs('#matchesSection').style.display = 'block';

  // bind the newly created buttons
  qsa('.view-attempts-btn').forEach(b => { if (b._bound) return; b._bound = true; b.addEventListener('click', () => openAttemptHistoryModal(Number(b.dataset.jobId), Number(b.dataset.candidateId))); });
  qsa('.shortlist-inline').forEach(b => { if (b._bound) return; b._bound = true; b.addEventListener('click', () => shortlist(Number(b.dataset.job), Number(b.dataset.resume))); });
}

// delegated click for invite buttons (in case dynamic injection missed)
document.body.addEventListener('click', function(ev){
  const btn = ev.target.closest && ev.target.closest('.invite-app-btn, .invite-btn');
  if(!btn) return;
  ev.preventDefault();
  const candidateId = btn.dataset.candidateId || btn.getAttribute('data-candidate-id') || '';
  const candidateName = btn.dataset.candidateName || btn.getAttribute('data-candidate-name') || '';
  const jobId = btn.dataset.jobId || btn.getAttribute('data-job-id') || (state && state.selectedJobId) || '';
  // use compatibility shim or new modal
  if (typeof window.openInviteModalForCandidate === 'function') {
    return openInviteModalForCandidate(candidateId, candidateName, jobId);
  }
  if (typeof window.showInviteModal === 'function') {
    return window.showInviteModal(null, jobId, candidateId, candidateName);
  }
  // fallback show HTML modal
  const overlay = document.getElementById('inviteModal'); if (!overlay) return;
  document.getElementById('invite_candidate_id') && (document.getElementById('invite_candidate_id').value = candidateId);
  document.getElementById('invite_message') && (document.getElementById('invite_message').value = `Hi ${candidateName || ''}, you are invited for interview.`);
  overlay.classList.remove('d-none'); overlay.style.display='flex'; document.body.style.overflow='hidden';
});


/* -------------------- Applications -------------------- */
async function loadApplicationsForSelectedJob() {
  if (!selectedJob) return showToast('Select job first', 'error');
  const listEl = qs('#applicationsList'); if (!listEl) return;
  listEl.innerHTML = '<div class="small-muted">Loading applications...</div>';
  const urlsToTry = [
    `/api/resumes/applications/?job_id=${encodeURIComponent(selectedJob.id)}`,
    `/api/resumes/jobs/${encodeURIComponent(selectedJob.id)}/applications/`,
    `/api/applications/?job_id=${encodeURIComponent(selectedJob.id)}`,
    `/api/recruiter/job/${encodeURIComponent(selectedJob.id)}/applications/`
  ];
  let res = null;
  for (const u of urlsToTry) {
    try { res = await apiFetch(u); if (res && res.ok) break; } catch (e) { console.warn('fetch error', u, e); }
  }
  if (!res || !res.ok) { listEl.innerHTML = `<div class="small-muted">No applications (${res ? res.status : 'no response'})</div>`; return; }
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
    const card = document.createElement('div'); card.className = 'card mb-2 p-2';
    card.innerHTML = `
      <div class="d-flex justify-content-between align-items-start">
        <div style="min-width:0;">
          <strong>${escapeHtml(name || `Resume ${resume_id || ''}`)}</strong>
          <div class="small-muted">Applied: ${escapeHtml(applied)}</div>
          <div class="small-muted">Message: ${escapeHtml(a.message || '')}</div>
        </div>
        <div style="min-width:180px;text-align:right;">
          <div class="mb-1"><span class="badge ${status === 'shortlisted' ? 'bg-success' : status === 'rejected' ? 'bg-danger' : 'bg-secondary'}">${escapeHtml(status || '')}</span></div>
          <div>
            ${resume_file ? `<a class="btn btn-sm btn-outline-primary me-1" href="${escapeHtml(resume_file)}" target="_blank" rel="noopener">View</a>` : ''}
            <button class="btn btn-sm btn-primary shortlist-btn" data-job="${selectedJob.id}" data-resume="${resume_id}">Shortlist</button>
            <button class="btn btn-sm btn-outline-danger reject-btn" data-app-id="${id}">Reject</button>
            <button class="btn btn-sm btn-success invite-app-btn" data-candidate-id="${a.candidate_id || ''}" data-candidate-name="${escapeHtml(a.candidate_name || '')}">Invite</button>
          </div>
        </div>
      </div>`;
    listEl.appendChild(card);
  });

  // attach handlers
  listEl.querySelectorAll('.shortlist-btn').forEach(b => {
    if (b._bound) return; b._bound = true;
    b.addEventListener('click', () => { const jobId = b.dataset.job; const resumeId = b.dataset.resume; shortlist(Number(jobId), Number(resumeId)); });
  });
  listEl.querySelectorAll('.reject-btn').forEach(b => {
    if (b._bound) return; b._bound = true;
    b.addEventListener('click', () => { const appId = b.dataset.appId; changeApplicationStatus(Number(appId), 'rejected'); });
  });
  listEl.querySelectorAll('.invite-app-btn').forEach(btn=>{
    if (btn._boundInvite) return; btn._boundInvite = true;
    btn.addEventListener('click', (e) => {
      const candidateId = e.currentTarget.dataset.candidateId;
      const candidateName = e.currentTarget.dataset.candidateName;
      openInviteModalForCandidate(candidateId, candidateName);
    });
  });

  qs('#applicationsSection').style.display = 'block';
}

/* -------------------- Shortlist & application status -------------------- */
async function shortlist(job_id, resume_id) {
  if (!job_id || !resume_id) return showToast('Invalid shortlist', 'error');
  const res = await apiFetch('/api/resumes/shortlist/', { method: 'POST', body: JSON.stringify({ job_id, resume_id }) });
  if (res.ok) { showToast('Shortlisted', 'success'); loadApplicationsForSelectedJob(); showShortlistsForSelectedJob(); } else showToast('Shortlist failed', 'error');
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
  list.forEach(s => {
    const div = document.createElement('div'); div.className = 'card mb-2 p-2';
    div.innerHTML = `<div class="d-flex justify-content-between"><div><strong>Resume #${escapeHtml(s.resume)}</strong><div class="small-muted">${escapeHtml(s.shortlisted_by||'')}</div></div><div><button class="btn btn-sm btn-outline-primary" onclick="resend(${s.job},${s.resume})">Resend</button> <button class="btn btn-sm btn-outline-danger" onclick="removeShortlist(${s.id})">Remove</button></div></div>`;
    container.appendChild(div);
  });
  qs('#shortlistSection').style.display = 'block';
}
async function removeShortlist(id) { if (!id) return; if (!confirm('Remove shortlist?')) return; const res = await apiFetch('/api/resumes/shortlist/', { method: 'DELETE', body: JSON.stringify({ id }) }); if (res.ok) { showToast('Removed', 'success'); showShortlistsForSelectedJob(); } else showToast('Remove failed', 'error'); }
async function resend(job_id, resume_id) { const res = await apiFetch('/api/resumes/shortlist/', { method: 'POST', body: JSON.stringify({ job_id, resume_id, resend: true }) }); if (res.ok) showToast('Resend queued', 'success'); else showToast('Resend failed', 'error'); }

/* -------------------- Generate Quiz -------------------- */
async function generateQuizForJob(jobId, questionsCount = 5) {
  if (!jobId) return showToast('No job id', 'error');
  if (!confirm('Generate quiz for this job now?')) return;
  const token = savedToken();
  const headers = Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: `Bearer ${token}` } : {});
  try {
    const r = await fetch(QUIZ_GENERATE_URL(jobId), { method: 'POST', headers, body: JSON.stringify({ questions_count: questionsCount }) });
    const txt = await r.text().catch(()=>null);
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch(e){ data = null; }
    if (!r.ok) { showToast('Generate failed: ' + (data?.detail || r.status), 'error', 5000); return null; }
    showToast('Quiz generated', 'success');
    return data;
  } catch (e) { console.error('generateQuiz err', e); showToast('Network error', 'error'); return null; }
}

/* -------------------- Recruiter results & export -------------------- */
async function fetchRecruiterResults(jobId) {
  if (!jobId) return;
  const token = savedToken();
  const headers = Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: `Bearer ${token}` } : {});
  const r = await fetch(QUIZ_RESULTS_URL(jobId), { headers });
  if (!r.ok) { const txt = await r.text().catch(()=>null); showToast('Failed to fetch results', 'error'); console.warn('results fetch failed', r.status, txt); return; }
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
      </td>`;
    tbody.appendChild(tr);
  });

  qsa('.view-attempts').forEach(b => { if (b._bound) return; b._bound = true; b.addEventListener('click', () => openAttemptHistoryModal(Number(b.dataset.job), Number(b.dataset.cid))); });
  qsa('.reset-attempts').forEach(b => {
    if (b._bound) return; b._bound = true;
    b.addEventListener('click', async () => {
      if (!confirm('Reset attempts for this candidate?')) return;
      const job = b.dataset.job, cid = b.dataset.cid;
      const r = await apiFetch(`/api/quiz/${job}/reset_attempts/${cid}/`, { method: 'POST' });
      if (r.ok) { showToast('Reset OK', 'success'); fetchRecruiterResults(job); } else showToast('Reset failed', 'error');
    });
  });

  document.getElementById('job-title') && (document.getElementById('job-title').textContent = `Results — ${jobTitle || ''}`);
}

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

/* -------------------- Attempt history modal -------------------- */
(function () {
  if (!document.getElementById('attempts-modal')) {
    const modal = document.createElement('div');
    modal.id = 'attempts-modal';
    modal.style = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);z-index:99999;';
    modal.innerHTML = `
      <div style="background:#fff;padding:16px;border-radius:8px;max-width:900px;width:96%;max-height:84vh;overflow:auto;position:relative;">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h5 id="attempts-modal-title" style="margin:0">Attempt history</h5>
          <div><button id="attempts-modal-close" class="btn btn-sm btn-outline-secondary">Close</button></div>
        </div>
        <div id="attempts-loading" style="margin-top:12px">Loading attempts…</div>
        <div id="attempts-list" style="margin-top:12px;display:none"></div>
        <div style="margin-top:12px;text-align:right"><button id="attempts-modal-ok" class="btn btn-primary">OK</button></div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('attempts-modal-close').addEventListener('click', () => { modal.style.display = 'none'; document.body.style.overflow = ''; });
    document.getElementById('attempts-modal-ok').addEventListener('click', () => { modal.style.display = 'none'; document.body.style.overflow = ''; });
  }

  async function fetchAttempts(jobId, candidateId) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, authHeaders());
    const tries = [
      `/api/quiz/${jobId}/attempts/`,
      `/api/quiz/attempts/?job_id=${jobId}&candidate=${candidateId}`,
      `/api/quiz/attempts/?job=${jobId}`
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
      } catch (e) { console.warn('fetchAttempts try failed', e, u); }
    }
    return [];
  }

  function renderAttemptList(attempts) {
    const container = qs('#attempts-list');
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
    const modal = qs('#attempts-modal'); if (!modal) return;
    const loading = qs('#attempts-loading'); const list = qs('#attempts-list');
    qs('#attempts-modal-title').textContent = `Attempts — job ${jobId} candidate ${candidateId || 'all'}`;
    loading.style.display = 'block'; list.style.display = 'none'; list.innerHTML = '';
    modal.style.display = 'flex'; document.body.style.overflow = 'hidden';
    const data = await fetchAttempts(jobId, candidateId);
    loading.style.display = 'none';
    if (!data) { list.style.display = 'block'; list.innerHTML = '<div class="text-danger">Error fetching attempts</div>'; return; }
    renderAttemptList(data);
    list.style.display = 'block';
  };
})();

/* -------------------- Invite modal & logic (unified) -------------------- */
// We'll look for #inviteModal; if not present, warn. We still inject delegate invite button behavior.
(function(){
  const INVITE_BTN_CLASS = 'invite-app-btn';
  const APPLICATION_ROW_SELECTOR = '.application-row';
  const APPS_CONTAINER_IDS = ['appsList','applicationsArea','applicationsList'];

  const el = id => document.getElementById(id);
  const inviteModal = el('inviteModal');
  if(!inviteModal) console.warn('inviteModal not found - add modal HTML to template.');

  // ===== Compatibility shim for invite modal =====
// Add this near top of recruiter_dashboard.js so any call to
// openInviteModalForCandidate(...) doesn't throw.
window.openInviteModalForCandidate = window.openInviteModalForCandidate || function(candidateId, candidateName, jobId) {
  // If new module exposes showInviteModal (our unified handler), use it
  try {
    if (typeof window.showInviteModal === 'function') {
      // original signature used in some code was (interviewId, jobId, candidateId, candidateName)
      // we call with jobId as second param and candidateId/name
      return window.showInviteModal(null, jobId || null, candidateId || '', candidateName || '');
    }
    // If invite bridge exists (from HTML _invite_bridge), use that
    if (window._invite_bridge && typeof window._invite_bridge.show === 'function') {
      return window._invite_bridge.show({ jobId: jobId || null, candidateId: candidateId || '', candidateName: candidateName || '' });
    }
    // Fallback: try to open HTML modal directly if present
    const overlay = document.getElementById('inviteModal');
    if (!overlay) return console.warn('invite modal not found (openInviteModalForCandidate fallback)');
    const candInput = document.getElementById('invite_candidate_id');
    const msgInput = document.getElementById('invite_message');
    if (candInput) candInput.value = candidateId || '';
    if (msgInput) msgInput.value = `Hi ${candidateName || ''}, you are invited for interview.`;
    overlay.classList.remove('d-none'); overlay.style.display = 'flex'; document.body.style.overflow = 'hidden';
  } catch (e) {
    console.error('openInviteModalForCandidate shim failed', e);
  }
};


  window.showInviteModal = window.showInviteModal || function(interviewId, jobId, candidateId, candidateName){
    window.__invite = { interviewId: interviewId || null, jobId: jobId || null, candidateId, candidateName };
    if (el('invite_candidate_id')) el('invite_candidate_id').value = candidateId || '';
    if (el('invite_scheduled_at')) el('invite_scheduled_at').value = '';
    if (el('invite_message')) el('invite_message').value = `Hi ${candidateName || ''}, you are invited for interview.`;
    inviteModal && inviteModal.classList.remove('d-none');
  };
  function hideInviteModal(){ inviteModal && inviteModal.classList.add('d-none'); }
  const cancelBtn = el('inviteCancelBtn');
  if(cancelBtn) cancelBtn.addEventListener('click', hideInviteModal);

  document.body.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.' + INVITE_BTN_CLASS);
    if(!btn) return;
    const candidateId = btn.dataset.candidateId || btn.getAttribute('data-candidate-id') || (btn.closest(APPLICATION_ROW_SELECTOR) && btn.closest(APPLICATION_ROW_SELECTOR).dataset.candidateId);
    const jobId = btn.dataset.jobId || btn.getAttribute('data-job-id') || (btn.closest(APPLICATION_ROW_SELECTOR) && btn.closest(APPLICATION_ROW_SELECTOR).dataset.jobId);
    const interviewId = btn.dataset.interviewId || btn.getAttribute('data-interview-id');
    const candidateName = btn.dataset.candidateName || btn.getAttribute('data-candidate-name') || '';
    window.showInviteModal(interviewId || null, jobId || null, candidateId || '', candidateName);
  });

  const inviteSendBtn = el('inviteSendBtn');
  if(inviteSendBtn){
    inviteSendBtn.addEventListener('click', async () => {
      const info = window.__invite || {};
      const interviewId = info.interviewId || info.jobId || null;
      const candidate_id = (el('invite_candidate_id') && el('invite_candidate_id').value.trim()) || info.candidateId;
      const scheduled_at = el('invite_scheduled_at') && el('invite_scheduled_at').value;
      const message = el('invite_message') && el('invite_message').value;
      if(!candidate_id){ alert('Candidate id required'); return; }
      if(!interviewId){ const ok = confirm('No interview selected for this job. Do you want to open Interviews page to create/select an interview?'); if(ok) window.open('/interviews/recruiter/','_blank'); return; }
      try {
        inviteSendBtn.disabled = true;
        const res = await fetch(`${API_ROOT}/interviews/recruiter/${interviewId}/invite/`, {
          method: 'POST',
          headers: getTokenHeader(),
          body: JSON.stringify({ candidate_id, scheduled_at, message })
        });
        const json = await res.json().catch(()=>null);
        if(res.ok){
          hideInviteModal();
          alert('Invite sent');
          const row = document.querySelector(`${APPLICATION_ROW_SELECTOR}[data-candidate-id="${candidate_id}"]`);
          if(row){ const badge = row.querySelector('.invite-status') || row.querySelector('.invite-badge'); if(badge) badge.innerText = 'Pending'; }
        } else {
          console.error('invite failed', res.status, json);
          alert('Invite failed: ' + (json?.detail || JSON.stringify(json)));
        }
      } catch(err){ console.error(err); alert('Network error sending invite'); } finally { inviteSendBtn.disabled = false; }
    });
  }

  function injectInviteButton(appRow){
    if(!appRow) return;
    if(appRow.querySelector('.' + INVITE_BTN_CLASS)) return;
    const candidateId = appRow.dataset.candidateId || appRow.getAttribute('data-candidate-id') || (appRow.querySelector('.candidate-id') && appRow.querySelector('.candidate-id').innerText) || '';
    const jobId = appRow.dataset.jobId || appRow.getAttribute('data-job-id') || (appRow.closest('[data-job-id]') && appRow.closest('[data-job-id]').dataset.jobId) || '';
    const candidateName = appRow.dataset.candidateName || appRow.getAttribute('data-candidate-name') || (appRow.querySelector('.candidate-name') && appRow.querySelector('.candidate-name').innerText) || '';
    let actions = appRow.querySelector('.app-actions') || appRow.querySelector('.actions');
    if(!actions){ actions = document.createElement('div'); actions.className = 'app-actions'; actions.style.marginTop = '6px'; appRow.appendChild(actions); }
    const btn = document.createElement('button'); btn.className = `btn btn-sm btn-success ${INVITE_BTN_CLASS}`; btn.type = 'button'; btn.innerText = 'Invite';
    if(candidateId) btn.dataset.candidateId = candidateId; if(jobId) btn.dataset.jobId = jobId; if(candidateName) btn.dataset.candidateName = candidateName;
    actions.appendChild(btn);
  }
  function injectButtonsForAllRows(){ const rows = document.querySelectorAll(APPLICATION_ROW_SELECTOR); rows.forEach(r => injectInviteButton(r)); }
  injectButtonsForAllRows();
  const observeContainers = APPS_CONTAINER_IDS.map(id => document.getElementById(id)).filter(Boolean);
  const fallbackContainer = document.querySelector(APPLICATION_ROW_SELECTOR)?.parentElement;
  if(fallbackContainer && !observeContainers.length) observeContainers.push(fallbackContainer);
  observeContainers.forEach(container => {
    try {
      const mo = new MutationObserver(muts => {
        muts.forEach(m => {
          m.addedNodes && m.addedNodes.forEach(node => {
            if(node.nodeType === 1){
              if(node.matches && node.matches(APPLICATION_ROW_SELECTOR)) injectInviteButton(node);
              node.querySelectorAll && node.querySelectorAll(APPLICATION_ROW_SELECTOR).forEach(el => injectInviteButton(el));
            }
          });
        });
      });
      mo.observe(container, { childList: true, subtree: true });
    } catch(e){ console.warn('MutationObserver failed', e); }
  });
  setTimeout(injectButtonsForAllRows, 800);
  setTimeout(injectButtonsForAllRows, 2000);
})();

/* -------------------- Invite candidate by job util (used by invite modal) -------------------- */
async function inviteCandidateByJob(jobId, candidateId, scheduledAt = null, message = '') {
  const url = `${API_ROOT}/interviews/recruiter/job/${jobId}/invite/`;
  const body = { candidate_id: candidateId };
  if (scheduledAt) body.scheduled_at = scheduledAt;
  if (message) body.message = message;
  const r = await fetch(url, { method: 'POST', headers: getTokenHeader(), body: JSON.stringify(body) });
  const data = await r.json().catch(()=>null);
  if (r.ok || r.status === 201) return data;
  throw { status: r.status, data };
}
// ---------- Quick patch: auto-select job rows + robust invite delegation ----------
/* 1) Auto-select job when clicking job card or View button */
document.body.addEventListener('click', async (ev) => {
  const card = ev.target.closest && ev.target.closest('.job-card');
  const viewBtn = ev.target.closest && ev.target.closest('.view-job-btn');
  if (!card && !viewBtn) return;

  // if view button clicked prefer its data-job-id, else use card's dataset
  const jobId = (viewBtn && viewBtn.dataset.jobId) || (card && card.dataset.jobId);
  if (!jobId) return;

  // prevent double-handling
  try {
    // call existing select/open detail function if available
    if (typeof openJobDetail === 'function') {
      await openJobDetail(jobId);
      // also set global state.selectedJobId if using state object
      if (typeof state !== 'undefined') state.selectedJobId = Number(jobId);
      if (window.selectedJob && window.selectedJob.id !== Number(jobId)) {
        // no-op (openJobDetail already sets selectedJob)
      }
    } else {
      // fallback: set state and UI texts
      if (typeof state !== 'undefined') state.selectedJobId = Number(jobId);
      window.selectedJob = { id: Number(jobId) };
      const titleEl = document.getElementById('selectedJobTitle');
      if (titleEl) titleEl.textContent = `Job ${jobId}`;
    }
  } catch (e) {
    console.warn('auto-select job failed', e);
  }
});

/* 2) Delegated invite button handler (covers dynamic rows) */
document.body.addEventListener('click', function(ev){
  const btn = ev.target.closest && ev.target.closest('.invite-app-btn, .invite-btn');
  if(!btn) return;
  ev.preventDefault();
  const candidateId = btn.dataset.candidateId || btn.getAttribute('data-candidate-id') || '';
  const candidateName = btn.dataset.candidateName || btn.getAttribute('data-candidate-name') || '';
  const jobId = btn.dataset.jobId || btn.getAttribute('data-job-id') || (typeof state !== 'undefined' && state.selectedJobId) || (window.selectedJob && window.selectedJob.id) || '';

  // prefer new API
  if (typeof window.showInviteModal === 'function') {
    try { return window.showInviteModal(null, jobId || null, candidateId || '', candidateName || ''); } catch (e) { console.warn(e); }
  }
  // fallback shim
  if (typeof window.openInviteModalForCandidate === 'function') {
    try { return window.openInviteModalForCandidate(candidateId, candidateName, jobId); } catch (e) { console.warn(e); }
  }

  // final fallback: show HTML modal directly
  const overlay = document.getElementById('inviteModal'); if (!overlay) return;
  const candInput = document.getElementById('invite_candidate_id');
  const msgInput = document.getElementById('invite_message');
  if (candInput) candInput.value = candidateId || '';
  if (msgInput) msgInput.value = `Hi ${candidateName || ''}, you are invited for interview.`;
  overlay.classList.remove('d-none'); overlay.style.display = 'flex'; document.body.style.overflow = 'hidden';
});

/* -------------------- UI wiring & boot -------------------- */
function attachUI() {
  if (qs('#tokenInput') && savedToken()) qs('#tokenInput').value = savedToken();
  qs('#saveTokenBtn')?.addEventListener('click', () => {
    const v = (qs('#tokenInput')?.value || '').trim();
    if (!v) { showToast('Paste token first', 'error'); return; }
    setSavedToken(v); qs('#tokenStatus') && (qs('#tokenStatus').innerText = 'Token saved'); showToast('Token saved', 'success');
  });

  qs('#refreshJobs')?.addEventListener('click', loadJobs);
  qs('#addJobBtn')?.addEventListener('click', openAddJobModal);
  qs('#addJobForm')?.addEventListener('submit', submitAddJob);
  qs('#showMatchesBtn')?.addEventListener('click', showMatchesForSelectedJob);
  qs('#showShortlistsBtn')?.addEventListener('click', showShortlistsForSelectedJob);
  qs('#showApplicationsBtn')?.addEventListener('click', loadApplicationsForSelectedJob);
  qs('#exportCsvBtn')?.addEventListener('click', () => exportResultsCsv(selectedJob ? selectedJob.id : null));
  qs('#filter')?.addEventListener('change', () => { if (selectedJob) fetchRecruiterResults(selectedJob.id); });

  const jobIdFromTemplate = document.querySelector('.generate-quiz-btn')?.dataset.jobId || null;
  if (jobIdFromTemplate) fetchRecruiterResults(Number(jobIdFromTemplate));
  loadJobs();
}

document.addEventListener('DOMContentLoaded', () => {
  try { attachUI(); console.log('recruiter dashboard initialized'); } catch (e) { console.error('init error', e); }
});

/* expose useful functions for console/debug */
window.loadJobs = loadJobs;
window.openJobDetail = openJobDetail;
window.generateQuizForJob = generateQuizForJob;
window.openAttemptHistoryModal = window.openAttemptHistoryModal || function () { showToast('No modal available', 'error'); };
window.inviteCandidateByJob = inviteCandidateByJob;

