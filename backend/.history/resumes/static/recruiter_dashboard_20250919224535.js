// static/recruiter_dashboard.js
// Consolidated recruiter dashboard script
// - Jobs list (view/edit/delete)
// - Matches, Applications, Shortlist
// - Quiz generation + recruiter results + export
// - Attempt history modal
// - Invite modal + create interview + inject invite buttons
//
// Assumes HTML IDs/classes from your provided template.
// Token stored under 'recruiter_token_v1'.

const API_ROOT = '/api';
const JOBS_ENDPOINT = `${API_ROOT}/resumes/jobs/`;
const TOKEN_KEY = 'recruiter_token_v1';

/* ---------------- small helpers ---------------- */
function showToast(msg, type = 'info', ms = 3000) {
  const container = document.getElementById('toastContainer') || document.body;
  const el = document.createElement('div');
  el.innerHTML = `<div style="padding:10px 14px;border-radius:8px;background:${
    type === 'error' ? '#f8d7da' : type === 'success' ? '#d1e7dd' : '#fff8d6'
  };border:1px solid #ddd;margin-bottom:8px">${msg}</div>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
function qs(sel, root = document) { return root.querySelector(sel); }
function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
function escapeHtml(s = '') {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"'`]/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#x60;' }[m])
  );
}
function savedToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
function setSavedToken(t) { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }
function authHeaders() {
  const t = savedToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/* ---------------- apiFetch wrapper ---------------- */
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
    return { ok: r.ok, status: r.status, data: json, text: txt };
  } catch (e) {
    console.error('apiFetch error', e);
    return { ok: false, status: 0, error: true, exception: String(e) };

  }



}

  // --- add this after apiFetch ------------------------------------------------
/**
 * Lightweight wrapper used by some smaller functions.
 * Uses same authHeaders() as existing code.
 */
async function apiFetchSimple(path, opts = {}) {
  // ensure JSON content-type unless explicitly provided
  opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}, authHeaders());
  // inside apiFetchSimple, before fetch:
console.log('API fetch', path, opts.method || 'GET', opts.headers);
  try {
    const r = await fetch(path, opts);
    // handle auth failure consistently
    if (r.status === 401 || r.status === 403) {
      localStorage.removeItem(TOKEN_KEY);
      showToast('Not authorized — paste a valid token and retry', 'error', 4000);
      return { ok: false, status: r.status, data: null, text: null };
    }
    const txt = await r.text().catch(()=>null);
    let json = null;
    try { json = txt ? JSON.parse(txt) : null; } catch(e){ json = txt; }
    return { ok: r.ok, status: r.status, data: json, text: txt };
  } catch (e) {
    console.error('apiFetchSimple error', e);
    return { ok: false, status: 0, error: true, exception: String(e) };
  }
}


// ----------------------------------------------------------------------------


/* ---------------- JOBS list & render ---------------- */
let selectedJob = null;

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
  if (!jobs.length) {
    container.innerHTML = `<div class="small-muted">No jobs available</div>`;
    return;
  }

  container.innerHTML = '';
  jobs.forEach(j => {
    const row = document.createElement('div');
    row.className = 'list-group-item job-card d-flex align-items-start justify-content-between';
    row.dataset.jobId = j.id;

    const left = document.createElement('div');
    left.style.minWidth = '0';
    left.style.flex = '1';
    left.innerHTML = `
      <h4 style="margin:0 0 4px 0; font-size:1rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(j.title || '')}</h4>
      <div class="small-muted" style="font-size:.9rem; color:#666;">
        ${escapeHtml(j.company || '')} • ${escapeHtml(j.skills_required || j.skills || '')}
      </div>
    `;

    const right = document.createElement('div');
    right.style.minWidth = '180px';
    right.className = 'text-end';
    right.innerHTML = `
      <div class="btn-group" role="group">
        <button class="btn btn-sm btn-outline-primary view-job-btn" data-job-id="${j.id}">View</button>
        <button class="btn btn-sm btn-warning edit-job-btn" data-job-id="${j.id}">Edit</button>
        <button class="btn btn-sm btn-danger delete-job-btn" data-job-id="${j.id}">Delete</button>
      </div>
      <div style="margin-top:6px;">
        <button class="btn btn-sm btn-secondary generate-quiz-btn" data-job-id="${j.id}">Generate Quiz</button>
      </div>
    `;

    row.appendChild(left);
    row.appendChild(right);
    left.addEventListener('click', () => openJobDetail(j.id));
    container.appendChild(row);
  });

  attachJobCardEvents();
}

function attachJobCardEvents() {
  document.querySelectorAll('.view-job-btn').forEach(btn => {
    if (btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      await openJobDetail(btn.dataset.jobId);
    });
  });

  document.querySelectorAll('.edit-job-btn').forEach(btn => {
    if (btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openEditJob(btn.dataset.jobId);
    });
  });

  document.querySelectorAll('.delete-job-btn').forEach(btn => {
    if (btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      confirmAndDeleteJob(btn.dataset.jobId);
    });
  });

  document.querySelectorAll('.generate-quiz-btn').forEach(btn => {
    if (btn._boundQuiz) return;
    btn._boundQuiz = true;
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (!confirm('Generate quiz questions for this job?')) return;
      await generateQuizForJob(btn.dataset.jobId, 5);
    });
  });
}

/* ---------------- open job detail ---------------- */
async function openJobDetail(jobId) {
  const r = await apiFetch(`${JOBS_ENDPOINT}${jobId}/`, { method: 'GET' });
  if (!r.ok) { showToast('Unable to load job', 'error'); return; }
  selectedJob = r.data;
  document.getElementById('noJob') && (document.getElementById('noJob').style.display = 'none');
  document.getElementById('jobDetails') && (document.getElementById('jobDetails').style.display = 'block');
  qs('#selectedJobTitle').textContent = selectedJob.title || '';
  qs('#jobMeta').textContent = `${selectedJob.company || ''} • Experience required: ${selectedJob.experience_required || 0}`;

  // enable right-side buttons with data-job
  qsa('#showMatchesBtn, #showShortlistsBtn, #exportCsvBtn, #showApplicationsBtn, .generate-quiz-btn').forEach(b => {
    b.dataset.jobId = jobId;
  });

  // clear lists
  qs('#matchesList') && (qs('#matchesList').innerHTML = '');
  qs('#applicationsList') && (qs('#applicationsList').innerHTML = '');
}

/* ---------------- Create/Edit job (full form modal) ---------------- */
function openAddJobModal() {
  const modalEl = document.getElementById('addJobModal');
  const form = document.getElementById('addJobForm');
  if (form) {
    form.reset();
    delete form.dataset.editing;
    const submitBtn = form.querySelector('[type="submit"]'); if (submitBtn) submitBtn.textContent = 'Create';
    const modalTitle = modalEl.querySelector('.modal-title'); if (modalTitle) modalTitle.textContent = 'Create job';
  }
  const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
  modal.show();
}

async function submitAddJob(e) {
  if (e && e.preventDefault) e.preventDefault();
  const form = document.getElementById('addJobForm');
  if (!form) return showToast('Form missing', 'error');
  const title = (qs('#jobTitle')?.value || '').trim();
  if (!title) return showToast('Title required', 'error');

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
    if (!res.ok) {
      res = await apiFetch(`/api/recruiter/job/${editingId}/`, { method: 'PATCH', body: JSON.stringify(payload) });
    }
  } else {
    res = await apiFetch(JOBS_ENDPOINT, { method: 'POST', body: JSON.stringify(payload) });
  }

  if (!res || !res.ok) { showToast('Save failed', 'error'); return; }

  showToast(editingId ? 'Job updated' : 'Job created', 'success');
  bootstrap.Modal.getInstance(document.getElementById('addJobModal'))?.hide();
  delete form.dataset.editing;
  await loadJobs();
  if (editingId && selectedJob && String(selectedJob.id) === String(editingId)) {
    await openJobDetail(editingId);
  }
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

  const modalTitle = qs('#addJobModal .modal-title'); if (modalTitle) modalTitle.textContent = 'Edit job';
  const submitBtn = form.querySelector('[type="submit"]'); if (submitBtn) submitBtn.textContent = 'Update';

  const modal = new bootstrap.Modal(document.getElementById('addJobModal'));
  modal.show();
}

/* ---------------- Delete job ---------------- */
async function confirmAndDeleteJob(jobId) {
  if (!jobId) return;
  if (!confirm('Delete job permanently?')) return;

  const endpoints = [
    `${JOBS_ENDPOINT}${jobId}/`,
    `/api/resumes/recruiter/job/${jobId}/delete/`,
  ];

  let lastErr = null;
  for (const url of endpoints) {
    try {
      const r = await fetch(url, {
        method: 'DELETE',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders())
      });
      if (r.ok) {
        showToast('Job deleted', 'success');
        const card = document.querySelector(`.job-card[data-job-id="${jobId}"]`);
        if (card) card.remove();
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
    } catch (e) {
      lastErr = String(e);
      continue;
    }
  }
  showToast('Delete failed: ' + (lastErr || 'unknown'), 'error');
}

/* ---------------- Matches (for job) ---------------- */
// Replace existing showMatchesForSelectedJob with this
async function showMatchesForSelectedJob(evt) {
  // evt optional if called from click event
  const callerJobId = (evt && evt.currentTarget && evt.currentTarget.dataset && evt.currentTarget.dataset.jobId) ? evt.currentTarget.dataset.jobId : null;
  const jobId = (selectedJob && selectedJob.id) ? selectedJob.id : (callerJobId || null);
  if (!jobId) {
    showToast('Select a job first (or open a job)', 'error');
    console.warn('showMatchesForSelectedJob: no jobId (selectedJob=', selectedJob, ', callerJobId=', callerJobId, ')');
    return;
  }

  const listEl = document.getElementById('matchesList');
  if (!listEl) {
    showToast('Matches container (#matchesList) not found in DOM', 'error');
    console.error('showMatchesForSelectedJob: #matchesList missing');
    return;
  }

  listEl.innerHTML = '<div class="small-muted">Loading matches...</div>';
  let res;
  try {
    res = await apiFetch(`/api/resumes/jobs/${encodeURIComponent(jobId)}/match`);
  } catch (e) {
    console.error('showMatchesForSelectedJob fetch error', e);
    listEl.innerHTML = `<div class="small-muted">Network error loading matches</div>`;
    return;
  }

  if (!res || !res.ok) {
    console.warn('showMatchesForSelectedJob: api returned not ok', res);
    const status = res ? res.status : 'network';
    listEl.innerHTML = `<div class="small-muted">Failed to load matches (${status})</div>`;
    return;
  }

  const matches = res.data?.matched_resumes || res.data || [];
  listEl.innerHTML = '';
  if (!Array.isArray(matches) || matches.length === 0) {
    listEl.innerHTML = `<div class="small-muted">No matches found.</div>`;
    const sec = qs('#matchesSection'); if (sec) sec.style.display = 'block';
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

  // wire newly added buttons
  qsa('.view-attempts-btn').forEach(b => {
    if (b._bound) return; b._bound = true;
    b.addEventListener('click', () => openAttemptHistoryModal(Number(b.dataset.jobId), Number(b.dataset.candidateId)));
  });
  qsa('.shortlist-manual-btn').forEach(b => {
    if (b._bound) return; b._bound = true;
    b.addEventListener('click', () => shortlist(Number(b.dataset.jobId), Number(b.dataset.resumeId)));
  });

  const sec = qs('#matchesSection'); if (sec) sec.style.display = 'block';
}

/* ---------------- Applications loader ---------------- */
async function loadApplicationsForSelectedJob(jobIdParam) {
  // allow optional param to refresh for particular job
  const jobToUse = jobIdParam || (selectedJob && selectedJob.id);
  if (!jobToUse) return showToast('Select job first', 'error');
  if (!selectedJob || String(jobToUse) !== String(selectedJob.id)) {
    // try to fetch job detail if not selected
    try { await openJobDetail(jobToUse); } catch(e) {}
  }

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
      console.warn('fetch error', u, e);
    }
  }

  if (!res || !res.ok) {
    listEl.innerHTML = `<div class="small-muted">No applications (${res ? res.status : 'no response'})</div>`;
    return;
  }

  // normalize
  let apps = [];
  if (Array.isArray(res.data)) apps = res.data;
  else if (res.data && Array.isArray(res.data.results)) apps = res.data.results;
  else if (res.data && Array.isArray(res.data.applications)) apps = res.data.applications;
  else if (res.data && Array.isArray(res.data.data)) apps = res.data.data;

  if (!apps || apps.length === 0) {
    listEl.innerHTML = '<div class="small-muted">No applications yet.</div>';
    return;
  }

  listEl.innerHTML = '';
  // Render each application and include .application-row + data attributes for injector
  apps.forEach(a => {
    const id = a.id || a.application_id || a.pk || '';
    const resume_id = a.resume_id || (a.resume && (a.resume.id || a.resume)) || '';
    const resume_file = a.resume_file || (a.resume && a.resume.file) || a.file || '';
    const name = a.candidate_name || a.user || a.username || a.applicant || '';
    const status = a.status || '';
    const applied = a.applied_at || a.created_at || a.created || '';

    const card = document.createElement('div');
    card.className = 'card mb-2 p-2 application-row';
    // add dataset attributes so injector can read them
    if (resume_id) card.dataset.candidateId = String(resume_id);
    if (name) card.dataset.candidateName = String(name);
    if (selectedJob && selectedJob.id) card.dataset.jobId = String(selectedJob.id);

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
          </div>
        </div>
      </div>
      <div>
  <button class="btn btn-sm btn-success invite-btn" 
          data-job-id="${selectedJob.id}" 
          data-candidate-id="${resume_id}" 
          data-candidate-name="${escapeHtml(name)}">
    Invite
  </button>
</div>

    `;
    listEl.appendChild(card);
  });

  // after rendering all apps, inject Invite buttons into rows
  if (typeof injectInviteButtonsIntoAppRows === 'function') {
    setTimeout(() => injectInviteButtonsIntoAppRows('.application-row'), 50);
  }

  // attach delegated handlers to avoid inline onclick issues
  listEl.querySelectorAll('.shortlist-btn').forEach(b => {
    if (b._bound) return; b._bound = true;
    b.addEventListener('click', () => {
      const jobId = b.dataset.job;
      const resumeId = b.dataset.resume;
      shortlist(Number(jobId), Number(resumeId));
    });
  });
  listEl.querySelectorAll('.reject-btn').forEach(b => {
    if (b._bound) return; b._bound = true;
    b.addEventListener('click', () => {
      const appId = b.dataset.appId;
      changeApplicationStatus(Number(appId), 'rejected');
    });
  });

  qs('#applicationsSection').style.display = 'block';
}

/* ---------------- Invite modal + create interview module ---------------- */
// Minimal invite/create interview module that uses same TOKEN_KEY
const API_BASE = '/api';
const CREATE_INTERVIEW_URL = (jobId) => `${API_BASE}/interviews/recruiter/job/${jobId}/create/`;
const JOB_INVITE_URL = (jobId) => `${API_BASE}/interviews/recruiter/job/${jobId}/invite/`;

/* DOM refs (safe queries) */
const elById = id => document.getElementById(id);
const inviteModal = elById('inviteModal');
const inviteCandidateIdInput = elById('invite_candidate_id');
const inviteCandidateNameInput = elById('invite_candidate_name');
const inviteJobIdInput = elById('invite_job_id');
const inviteInterviewIdInput = elById('invite_interview_id');
const inviteScheduledAtInput = elById('invite_scheduled_at');
const inviteMessageInput = elById('invite_message');
const inviteSendBtn = elById('inviteSendBtn');
const inviteCancelBtn = elById('inviteCancelBtn');
const inviteCreateThenSendBtn = elById('inviteCreateThenSendBtn'); // optional in HTML

/* state */
let inviteContext = { jobId: null, interviewId: null, candidateId: null, candidateName: null };

function showInviteModal({ jobId=null, interviewId=null, candidateId='', candidateName='' } = {}) {
  inviteContext = { jobId, interviewId, candidateId, candidateName };
  if (inviteJobIdInput) inviteJobIdInput.value = jobId || '';
  if (inviteInterviewIdInput) inviteInterviewIdInput.value = interviewId || '';
  if (inviteCandidateIdInput) inviteCandidateIdInput.value = candidateId || '';
  if (inviteCandidateNameInput) inviteCandidateNameInput.value = candidateName || '';
  if (inviteScheduledAtInput) inviteScheduledAtInput.value = '';
  if (inviteMessageInput) inviteMessageInput.value = `Hi ${candidateName || ''}, you are invited for interview.`;
  if (!inviteModal) { alert('Invite modal missing in HTML'); return; }
  inviteModal.classList.remove('d-none');
  inviteModal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
function hideInviteModal(){ if (!inviteModal) return; inviteModal.classList.add('d-none'); inviteModal.style.display = 'none'; document.body.style.overflow = ''; inviteContext = { jobId:null, interviewId:null, candidateId:null, candidateName:null }; }

async function createInterview(jobId, payload){
  if (!jobId) throw new Error('jobId required');
  const r = await apiFetch(CREATE_INTERVIEW_URL(jobId), { method:'POST', body: JSON.stringify(payload) });
  if (!r.ok) throw r;
  return r.data;
}

async function sendInvite({ interviewId=null, jobId=null, candidateId, scheduled_at=null, message='' }){
  if (!jobId) throw new Error('jobId required to send invite');
  const body = { candidate_id: candidateId };
  if (scheduled_at) body.scheduled_at = scheduled_at;
  if (message) body.message = message;
  const r = await apiFetch(JOB_INVITE_URL(jobId), { method:'POST', body: JSON.stringify(body) });
  return r;
}
document.body.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.invite-btn');
  if(!btn) return;
  const jobId = btn.dataset.jobId;
  const candidateId = btn.dataset.candidateId;
  const candidateName = btn.dataset.candidateName || '';
  showInviteModal({ jobId, candidateId, candidateName });
});


/* bindings */
if (inviteCancelBtn) inviteCancelBtn.addEventListener('click', (e) => { e.preventDefault(); hideInviteModal(); });
if (inviteModal) inviteModal.addEventListener('click', (e) => { if (e.target === inviteModal) hideInviteModal(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideInviteModal(); });

if (inviteSendBtn) inviteSendBtn.addEventListener('click', async (e) => {
  e.preventDefault();
  const jobId = (inviteJobIdInput && inviteJobIdInput.value) || (inviteContext && inviteContext.jobId);
  const candidateId = (inviteCandidateIdInput && (inviteCandidateIdInput.value || '').trim()) || (inviteContext && inviteContext.candidateId);
  const scheduled = (inviteScheduledAtInput && inviteScheduledAtInput.value) || null;
  const message = (inviteMessageInput && inviteMessageInput.value) || '';
  if (!candidateId) { alert('Enter candidate id'); return; }
  if (!jobId) {
    const ok = confirm('No job selected for invite. Create/select interview first?');
    if (ok) window.open('/interviews/recruiter/', '_blank');
    return;
  }

  inviteSendBtn.disabled = true;
  try {
    const res = await apiFetchSimple(`/api/interviews/recruiter/${jobId}/invite/`, { method:'POST', body: JSON.stringify({ candidate_id: candidateId, scheduled_at: scheduled, message }) });
    if (res.ok) {
      alert('Invite sent');
      hideInviteModal();
      if (typeof loadApplicationsForSelectedJob === 'function' && jobId) loadApplicationsForSelectedJob(jobId).catch(()=>{});
    } else {
      console.error('invite failed', res);
      alert('Invite failed: ' + (res.data?.detail || JSON.stringify(res.data) || res.status));
    }
  } catch(err) {
    console.error('sendInvite error', err);
    alert('Error sending invite');
  } finally {
    inviteSendBtn.disabled = false;
  }
});


if (inviteCreateThenSendBtn) inviteCreateThenSendBtn.addEventListener('click', async (e) => {
  e.preventDefault();
  const jobId = (inviteJobIdInput && inviteJobIdInput.value) || (inviteContext && inviteContext.jobId);
  const candidateId = (inviteCandidateIdInput && inviteCandidateIdInput.value.trim()) || (inviteContext && inviteContext.candidateId);
  const scheduled = (inviteScheduledAtInput && inviteScheduledAtInput.value) || null;
  const message = (inviteMessageInput && inviteMessageInput.value) || '';
  if (!candidateId) { alert('Enter candidate id'); return; }
  if (!jobId) { alert('No job selected. Open the job first then create interview.'); return; }

  inviteCreateThenSendBtn.disabled = true;
  try {
    const payload = {
      title: `Interview for job ${jobId}`,
      description: `Auto-created interview for job ${jobId}`,
      scheduled_at: scheduled || null,
      duration_minutes: 45,
      mode: 'online',
      is_active: true
    };
    const created = await createInterview(jobId, payload).catch(err => { throw err; });
    const interviewId = (created && (created.id || created.pk)) || null;
    const res = await sendInvite({ interviewId, jobId, candidateId, scheduled_at: scheduled, message });
    if (res.ok) {
      alert('Interview created and invite sent');
      hideInviteModal();
      if (typeof loadApplicationsForSelectedJob === 'function') loadApplicationsForSelectedJob(jobId).catch(()=>{});
    } else {
      alert('Invite failed after creating interview: ' + (res.data?.detail || JSON.stringify(res.data) || res.status));
    }
  } catch(err) {
    console.error('create+invite error', err);
    alert('Failed to create interview or send invite');
  } finally {
    inviteCreateThenSendBtn.disabled = false;
  }
});

/* ---------- utility: wire invite buttons in application rows ---------- */
function injectInviteButtonsIntoAppRows(selector = '.application-row') {
  const rows = document.querySelectorAll(selector);
  rows.forEach(row => {
    if (row._inviteInjected) return;
    row._inviteInjected = true;
    const candidateId = row.dataset.candidateId || row.getAttribute('data-candidate-id') || '';
    const candidateName = row.dataset.candidateName || row.getAttribute('data-candidate-name') || '';
    const jobAncestor = row.closest('[data-job-id]');
    const jobId = row.dataset.jobId || (jobAncestor && jobAncestor.dataset.jobId) || '';

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

/* observe for dynamic rows */
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => injectInviteButtonsIntoAppRows(), 600);
  setTimeout(() => injectInviteButtonsIntoAppRows(), 2000);
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
});

/* ---------------- Shortlist & status ---------------- */
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

/* ---------------- Generate Quiz (recruiter) ---------------- */
async function generateQuizForJob(jobId, questionsCount = 5) {
  if (!jobId) return showToast('No job id', 'error');
  if (!confirm('Generate quiz for this job now?')) return;
  const token = savedToken();
  const headers = Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: `Bearer ${token}` } : {});
  try {
    const r = await fetch(`/api/quiz/generate/${jobId}/`, { method: 'POST', headers, body: JSON.stringify({ questions_count: questionsCount }) });
    const txt = await r.text().catch(()=>null);
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch(e){ data = null; }
    if (!r.ok) { showToast('Generate failed: ' + (data?.detail || r.status), 'error', 5000); return null; }
    showToast('Quiz generated', 'success');
    return data;
  } catch (e) { console.error('generateQuiz err', e); showToast('Network error', 'error'); return null; }
}

/* ---------------- Recruiter Results panel ---------------- */
async function fetchRecruiterResults(jobId) {
  if (!jobId) return;
  const token = savedToken();
  const headers = Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: `Bearer ${token}` } : {});
  const r = await fetch(`/api/quiz/${jobId}/recruiter/results/`, { headers });
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
      </td>
    `;
    tbody.appendChild(tr);
  });

  qsa('.view-attempts').forEach(b => {
    if (b._bound) return; b._bound = true;
    b.addEventListener('click', () => openAttemptHistoryModal(Number(b.dataset.job), Number(b.dataset.cid)));
  });
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

/* ---------------- Attempt history modal ---------------- */
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
      </div>
    `;
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

/* ---------------- UI wiring & boot ---------------- */
function attachUI() {
  // token save UI
  if (qs('#tokenInput') && savedToken()) qs('#tokenInput').value = savedToken();
  qs('#saveTokenBtn')?.addEventListener('click', () => {
    const v = (qs('#tokenInput')?.value || '').trim();
    if (!v) { showToast('Paste token first', 'error'); return; }
    setSavedToken(v); qs('#tokenStatus') && (qs('#tokenStatus').innerText = 'Token saved'); showToast('Token saved', 'success');
  });

  // main actions
  qs('#refreshJobs')?.addEventListener('click', loadJobs);
  qs('#addJobBtn')?.addEventListener('click', openAddJobModal);
  qs('#addJobForm')?.addEventListener('submit', submitAddJob);
  qs('#showMatchesBtn')?.addEventListener('click', showMatchesForSelectedJob);
  qs('#showShortlistsBtn')?.addEventListener('click', showShortlistsForSelectedJob);
  qs('#showApplicationsBtn')?.addEventListener('click', () => loadApplicationsForSelectedJob());
  qs('#exportCsvBtn')?.addEventListener('click', () => exportResultsCsv(selectedJob ? selectedJob.id : null));
  qs('#filter')?.addEventListener('change', () => { if (selectedJob) fetchRecruiterResults(selectedJob.id); });


  // in attachUI() or where you bind showMatchesBtn:
const showMatchesBtn = qs('#showMatchesBtn');
if (showMatchesBtn) {
  showMatchesBtn.addEventListener('click', (ev) => {
    // if data-job-id present on button use it else use selectedJob
    showMatchesForSelectedJob(ev);
  });
}


  // if template prepopulates job id on a generate button, load results for it
  const jobIdFromTemplate = document.querySelector('.generate-quiz-btn')?.dataset.jobId || null;
  if (jobIdFromTemplate) fetchRecruiterResults(Number(jobIdFromTemplate));

  // initial jobs load
  loadJobs();
}

document.addEventListener('DOMContentLoaded', () => {
  try { attachUI(); console.log('recruiter dashboard initialized'); } catch (e) { console.error('init error', e); }
});

/* ---------------- exports for console/debug ---------------- */
window.loadJobs = loadJobs;
window.openJobDetail = openJobDetail;
window.generateQuizForJob = generateQuizForJob;
window.openAttemptHistoryModal = window.openAttemptHistoryModal || function () { showToast('No modal available', 'error'); };
window.showInviteModal = window.showInviteModal || showInviteModal;

/* EOF */

async function createInterviewForJob(jobPk, payload){
  // payload example: { title, description, scheduled_at, duration_minutes, mode, is_active }
  const res = await apiFetchSimple(`/api/interviews/recruiter/job/${jobPk}/create/`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  return res;
}
// usage:
createInterviewForJob(42, { title:'Interview', scheduled_at:'2025-09-25T10:00:00Z', duration_minutes:45 })
  .then(r=> console.log(r));


async function inviteCandidateByJob(jobPk, candidateId, scheduled_at=null, message='') {
  const body = { candidate_id: candidateId };
  if (scheduled_at) body.scheduled_at = scheduled_at;
  if (message) body.message = message;
  return await apiFetchSimple(`/api/interviews/recruiter/${jobPk}/invite/`, { method:'POST', body: JSON.stringify(body) });
}
// usage:
inviteCandidateByJob(42, 123, '2025-09-25T10:00:00Z', 'Please join interview').then(r=>console.log(r));

async function listRecruiterInterviews(){
  return await apiFetchSimple('/api/interviews/recruiter/', { method: 'GET' });
}
async function createRecruiterInterview(payload){
  return await apiFetchSimple('/api/interviews/recruiter/', { method: 'POST', body: JSON.stringify(payload) });
}

async function getInterview(pk){ return await apiFetchSimple(`/api/interviews/recruiter/${pk}/`, { method:'GET' }); }
async function patchInterview(pk, payload){ return await apiFetchSimple(`/api/interviews/recruiter/${pk}/`, { method:'PATCH', body: JSON.stringify(payload) }); }
async function deleteInterview(pk){ return await apiFetchSimple(`/api/interviews/recruiter/${pk}/`, { method:'DELETE' }); }


async function addQuestions(interviewPk, questionsPayload) {
  return await apiFetchSimple(`/api/interviews/recruiter/${interviewPk}/questions/`, { method:'POST', body: JSON.stringify(questionsPayload) });
}


async function recruiterListAttempts(interviewPk){
  return await apiFetchSimple(`/api/interviews/recruiter/${interviewPk}/attempts/`, { method:'GET' });
}

async function startCandidateAttempt(interviewPk){ return await apiFetchSimple(`/api/interviews/candidate/${interviewPk}/start/`, { method:'POST' }); }
// On submit (attempt_id from start response)
async function submitCandidateAttempt(attemptId, payloadAnswers) {
  // payload example: { answers: {...}, finished_at: "ISO" }
  return await apiFetchSimple(`/api/interviews/candidate/attempts${attemptId}/submit/`, { method:'POST', body: JSON.stringify(payloadAnswers) });
}

async function generateQuestions(interviewPk, opts={count:5}) {
  return await apiFetchSimple(`/api/interviews/recruiter/${interviewPk}/generate_questions/`, { method:'POST', body: JSON.stringify(opts) });
}


/* ---------------- Generate AI Questions button binding ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  const genBtn = document.getElementById('generateQuestionsBtn');
  if (genBtn) {
    genBtn.addEventListener('click', async () => {
      if (!selectedJob || !selectedJob.id) {
        showToast('Select a job first', 'error');
        return;
      }
      const interviewId = prompt('Enter Interview ID for this Job:');
      if (!interviewId) return;

      showToast('Generating AI Questions...', 'info', 4000);
      const res = await generateQuestions(interviewId, { count: 25 });
      if (res && res.ok) {
        showToast('Questions generation started!', 'success', 4000);
        console.log('Generated task info:', res);
      } else {
        console.error('generateQuestions failed', res);
        showToast('Failed to start question generation', 'error', 5000);
      }
    });
  }
});


