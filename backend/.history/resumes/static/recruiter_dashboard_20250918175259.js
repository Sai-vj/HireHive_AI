// recruiter_dashboard.js (updated)
// Replaces/extends your provided file: adds robust invite-from-application flow
// Assumes your HTML already contains:
// - invite modal elements with ids: inviteModal, inviteModalTitle, invite_candidate_id, invite_scheduled_at, invite_message, inviteCancelBtn, inviteSendBtn
// - jobsList, applicationsList, matchesList, jobDetails (existing in your template)
// - uses TOKEN_KEY localStorage helper functions (kept from original code)

const API_ROOT = '/api';
const JOBS_ENDPOINT = `${API_ROOT}/resumes/jobs/`;
const TOKEN_KEY = 'recruiter_token_v1';

/* ---------------- small helpers (kept) ---------------- */
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
function authHeaders() { const t = savedToken(); return t ? { Authorization: `Bearer ${t}` } : {}; }

/* ---------------- apiFetch wrapper (kept) ---------------- */
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

/* ---------------- JOBS list & render (kept w/ small fix) ---------------- */
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

/* ---------------- open job detail (added interview fetch) ---------------- */
async function openJobDetail(jobId) {
  const r = await apiFetch(`${JOBS_ENDPOINT}${jobId}/`, { method: 'GET' });
  if (!r.ok) { showToast('Unable to load job', 'error'); return; }
  selectedJob = r.data;

  // Attempt to fetch interviews for this job (safe tries)
  selectedJob.interviews = selectedJob.interviews || [];
  try {
    // try common endpoints you might have
    const tries = [
      `/api/interviews/?job=${jobId}`,
      `/api/interviews/?job_id=${jobId}`,
      `/api/interviews/recruiter/?job_id=${jobId}`,
      `/api/interviews/recruiter/${jobId}/` // maybe returns single interview
    ];
    for (const u of tries) {
      try {
        const xi = await apiFetch(u);
        if (xi && xi.ok && xi.data) {
          // normalize: array or object
          if (Array.isArray(xi.data)) selectedJob.interviews = xi.data;
          else if (Array.isArray(xi.data.results)) selectedJob.interviews = xi.data.results;
          else if (Array.isArray(xi.data.interviews)) selectedJob.interviews = xi.data.interviews;
          else if (xi.data.id) selectedJob.interviews = [xi.data];
          if (selectedJob.interviews.length) break;
        }
      } catch(e){}
    }
  } catch(e){ console.warn('interview fetch for job failed', e); }

  document.getElementById('noJob') && (document.getElementById('noJob').style.display = 'none');
  document.getElementById('jobDetails') && (document.getElementById('jobDetails').style.display = 'block');
  qs('#selectedJobTitle').textContent = selectedJob.title || '';
  qs('#jobMeta').textContent = `${selectedJob.company || ''} • Experience required: ${selectedJob.experience_required || 0}`;

  // wire jobId into action buttons
  qsa('#showMatchesBtn, #showShortlistsBtn, #exportCsvBtn, #showApplicationsBtn, .generate-quiz-btn').forEach(b => {
    b.dataset.jobId = jobId;
  });

  // clear lists
  qs('#matchesList') && (qs('#matchesList').innerHTML = '');
  qs('#applicationsList') && (qs('#applicationsList').innerHTML = '');
}

/* ---------------- Applications loader (added Invite button) ---------------- */
async function loadApplicationsForSelectedJob() {
  if (!selectedJob) return showToast('Select job first', 'error');
  const listEl = qs('#applicationsList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="small-muted">Loading applications...</div>';

  const urlsToTry = [
    `/api/resumes/applications/?job_id=${encodeURIComponent(selectedJob.id)}`,
    `/api/resumes/jobs/${encodeURIComponent(selectedJob.id)}/applications/`,
    `/api/applications/?job_id=${encodeURIComponent(selectedJob.id)}`,
    `/api/recruiter/job/${encodeURIComponent(selectedJob.id)}/applications/`
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
  apps.forEach(a => {
    const id = a.id || a.application_id || a.pk || '';
    const resume_id = a.resume_id || (a.resume && (a.resume.id || a.resume)) || '';
    const resume_file = a.resume_file || (a.resume && a.resume.file) || a.file || '';
    const name = a.candidate_name || a.user || a.username || a.applicant || '';
    const status = a.status || '';
    const applied = a.applied_at || a.created_at || a.created || '';

    // Invite button will be added here. If we have interview for job, prefill interview id
    const prefillInterviewId = (selectedJob && Array.isArray(selectedJob.interviews) && selectedJob.interviews.length) ? selectedJob.interviews[0].id : '';

    const card = document.createElement('div');
    card.className = 'card mb-2 p-2';
    card.innerHTML = `
      <div class="d-flex justify-content-between align-items-start">
        <div style="min-width:0;">
          <strong>${escapeHtml(name || `Resume ${resume_id || ''}`)}</strong>
          <div class="small-muted">Applied: ${escapeHtml(applied)}</div>
          <div class="small-muted">Message: ${escapeHtml(a.message || '')}</div>
        </div>
        <div style="min-width:260px;text-align:right;">
          <div class="mb-1"><span class="badge ${status === 'shortlisted' ? 'bg-success' : status === 'rejected' ? 'bg-danger' : 'bg-secondary'}">${escapeHtml(status || '')}</span></div>
          <div>
            ${resume_file ? `<a class="btn btn-sm btn-outline-primary me-1" href="${escapeHtml(resume_file)}" target="_blank" rel="noopener">View</a>` : ''}
            <button class="btn btn-sm btn-primary shortlist-btn" data-job="${selectedJob.id}" data-resume="${resume_id}">Shortlist</button>
            <button class="btn btn-sm btn-outline-danger reject-btn" data-app-id="${id}">Reject</button>
            <button class="btn btn-sm btn-outline-success invite-applicant-btn ms-2" data-application-id="${id}" data-resume="${resume_id}" data-candidate="${a.candidate_id || a.user_id || ''}" data-interview="${prefillInterviewId}">Invite Candidate</button>
          </div>
        </div>
      </div>
    `;
    listEl.appendChild(card);
  });

  // attach handlers
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

  // invite-from-application buttons
  listEl.querySelectorAll('.invite-applicant-btn').forEach(b => {
    if (b._bound) return; b._bound = true;
    b.addEventListener('click', (ev) => {
      const resumeId = b.dataset.resume || '';
      const candidateId = b.dataset.candidate || '';
      let interviewId = b.dataset.interview || '';
      openInviteModalForApplication({ interviewId, resumeId, candidateId });
    });
  });

  qs('#applicationsSection').style.display = 'block';
}

/* ---------------- Invite modal wiring & send ---------------- */
function ensureInviteModalElements() {
  const required = ['inviteModal','inviteModalTitle','invite_candidate_id','invite_scheduled_at','invite_message','inviteCancelBtn','inviteSendBtn'];
  const missing = required.filter(id => !document.getElementById(id));
  return { ok: missing.length === 0, missing };
}

function openInviteModalForApplication({ interviewId = '', resumeId = '', candidateId = '' } = {}) {
  const elCheck = ensureInviteModalElements();
  if (!elCheck.ok) {
    showToast('Invite modal missing HTML elements: ' + elCheck.missing.join(','), 'error', 5000);
    return;
  }
  window.__inviteInterviewId = interviewId || '';
  // prefill fields
  document.getElementById('invite_candidate_id').value = candidateId || '';
  document.getElementById('invite_scheduled_at').value = ''; // recruiter can set
  document.getElementById('invite_message').value = '';
  document.getElementById('inviteModalTitle').innerText = interviewId ? `Invite (interview ${interviewId})` : 'Invite candidate (enter Interview ID below)';
  // if no interviewId, ensure user can input it (we will use a prompt fallback)
  document.getElementById('inviteModal').classList.remove('d-none');
}

function hideInviteModal() { const m = document.getElementById('inviteModal'); if (m) m.classList.add('d-none'); }

// attach invite modal button handlers (safe)
function attachInviteModalHandlers() {
  const elems = ensureInviteModalElements();
  if (!elems.ok) return;
  const cancelBtn = document.getElementById('inviteCancelBtn');
  cancelBtn.removeEventListener('click', hideInviteModal);
  cancelBtn.addEventListener('click', hideInviteModal);

  const sendBtn = document.getElementById('inviteSendBtn');
  // remove previous handlers to avoid duplicates
  sendBtn._boundSend && sendBtn.removeEventListener('click', sendInviteFromModal);
  sendBtn._boundSend = true;
  sendBtn.addEventListener('click', sendInviteFromModal);
}

async function sendInviteFromModal() {
  const interviewIdExisting = window.__inviteInterviewId || '';
  let interviewId = interviewIdExisting;
  const candidate_id = (document.getElementById('invite_candidate_id')?.value || '').trim();
  const scheduled_at = document.getElementById('invite_scheduled_at')?.value || '';
  const message = document.getElementById('invite_message')?.value || '';

  if (!candidate_id) {
    return showToast('Please fill candidate id before sending', 'error');
  }

  if (!interviewId) {
    // ask recruiter for interview id (fallback)
    interviewId = prompt('No interview preselected. Enter interview id to invite candidate to:');
    if (!interviewId) return showToast('Interview id required', 'error');
  }

  const url = `/api/interviews/recruiter/${interviewId}/invite/`;
  try {
    const r = await apiFetch(url, {
      method: 'POST',
      body: JSON.stringify({ candidate_id, resume_id: null, scheduled_at, message })
    });
    if (r && r.ok) {
      showToast('Invite sent', 'success');
      hideInviteModal();
      // refresh UI: maybe mark application as invited
      loadApplicationsForSelectedJob().catch(()=>{});
    } else {
      const detail = r && r.data && (r.data.detail || JSON.stringify(r.data)) || `status ${r ? r.status : 'error'}`;
      showToast('Invite failed: ' + detail, 'error', 7000);
    }
  } catch (e) {
    console.error('sendInvite error', e);
    showToast('Network error while sending invite', 'error');
  }
}

/* ---------------- Shortlist & status (kept) ---------------- */
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
  if (!Array.isArray(list) || !list.length) { container.innerHTML = `<div class="small-muted">No shortlists found.</div>`; return; }
  list.forEach(s => {
    const div = document.createElement('div'); div.className = 'card mb-2 p-2';
    div.innerHTML = `<div class="d-flex justify-content-between"><div><strong>Resume #${escapeHtml(s.resume)}</strong><div class="small-muted">${escapeHtml(s.shortlisted_by||'')}</div></div><div><button class="btn btn-sm btn-outline-primary" onclick="resend(${s.job},${s.resume})">Resend</button> <button class="btn btn-sm btn-outline-danger" onclick="removeShortlist(${s.id})">Remove</button></div></div>`;
    container.appendChild(div);
  });
  qs('#shortlistSection').style.display = 'block';
}
async function removeShortlist(id) { if (!id) return; if (!confirm('Remove shortlist?')) return; const res = await apiFetch('/api/resumes/shortlist/', { method: 'DELETE', body: JSON.stringify({ id }) }); if (res.ok) { showToast('Removed', 'success'); showShortlistsForSelectedJob(); } else showToast('Remove failed', 'error'); }
async function resend(job_id, resume_id) { const res = await apiFetch('/api/resumes/shortlist/', { method: 'POST', body: JSON.stringify({ job_id, resume_id, resend: true }) }); if (res.ok) showToast('Resend queued', 'success'); else showToast('Resend failed', 'error'); }

/* ---------------- Generate Quiz & Results (kept) ---------------- */
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

/* ---------------- Attempt history modal kept (unchanged) ---------------- */
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

/* ---------------- CSV helpers kept ---------------- */
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

/* ---------------- UI wiring & boot (attach invite handlers) ---------------- */
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
  qs('#showApplicationsBtn')?.addEventListener('click', loadApplicationsForSelectedJob);
  qs('#exportCsvBtn')?.addEventListener('click', () => exportResultsCsv(selectedJob ? selectedJob.id : null));
  qs('#filter')?.addEventListener('change', () => { if (selectedJob) fetchRecruiterResults(selectedJob.id); });

  // initial calls
  loadJobs();

  // invite modal handlers
  attachInviteModalHandlers();

  console.log('recruiter dashboard initialized');
}

// DOM ready
document.addEventListener('DOMContentLoaded', () => {
  try { attachUI(); } catch (e) { console.error('init error', e); }
});

/* expose a couple functions for debugging */
window.loadJobs = loadJobs;
window.openJobDetail = openJobDetail;
window.loadApplicationsForSelectedJob = loadApplicationsForSelectedJob;
