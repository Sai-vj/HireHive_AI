// candidate_dashboard.js - cleaned & consolidated (keeps original function names)
import { fetchWithAuth, apiFetchAsJson as apiFetch, saveTokens, getAccessToken, clearTokens } from './utils.js';

async function initCandidateDashboard() {
  console.log("Candidate dashboard initialized");
  try {
    const resp = await apiFetch('/api/resumes/jobs/', { method: 'GET' });
    if (!resp.ok) {
      console.warn('Jobs fetch (init) failed', resp);
    } else {
      const jobs = resp.data || [];
      console.log('init jobs count', jobs.length);
    }
  } catch (err) {
    console.error('initCandidateDashboard error', err);
  }
}

/* ---------- Config ---------- */
const APPLY_URL = '/api/resumes/apply/';
const JOBS_URL = '/api/jobs/';
const MY_RESUMES_URL = '/api/resumes/my-resumes/';
const UPLOAD_URL = '/api/resumes/upload/';
const SHORTLIST_URL = '/api/resumes/shortlist/';
const APPLICATIONS_URL = '/api/applications/';

/* ---------- Global state ---------- */
let resumesList = [];
let selectedJob = null;
window.__apply_job_id = null;

/* ---------- Helpers ---------- */
function getToken() {
  return localStorage.getItem('token') || (document.getElementById('tokenInput') && document.getElementById('tokenInput').value.trim());
}
function saveTokenVal(val) {
  if (!val) return;
  localStorage.setItem('token', val);
  showToast('Token saved', 'success');
  const st = document.getElementById('tokenStatus'); if (st) st.innerText = 'Token saved';
}

/* Toast */
function showToast(msg, type = 'info', timeout = 3500) {
  const colors = { info: 'secondary', success: 'success', error: 'danger' };
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.position = 'fixed';
    container.style.right = '20px';
    container.style.bottom = '20px';
    container.style.zIndex = 9999;
    document.body.appendChild(container);
  }
  const div = document.createElement('div');
  div.className = `toast align-items-center text-bg-${colors[type] || 'secondary'} border-0 mb-2`;
  div.style.minWidth = '220px';
  div.innerHTML = `<div class="d-flex"><div class="toast-body">${escapeHtml(msg)}</div><button class="btn-close btn-close-white me-2 m-auto" aria-label="Close"></button></div>`;
  container.appendChild(div);
  const btn = div.querySelector('button');
  if (btn) btn.onclick = () => div.remove();
  setTimeout(() => { try { div.remove(); } catch (e) {} }, timeout);
}

/* Spinner */
function showSpinner(on, text = '') {
  let el = document.getElementById('globalSpinner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'globalSpinner';
    el.style = 'position:fixed;left:0;right:0;top:0;bottom:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.65);z-index:2000;';
    el.innerHTML = `<div style="text-align:center;"><div class="spinner-border" role="status" style="width:3rem;height:3rem"></div><div id="globalSpinnerText" style="margin-top:8px;font-weight:600;"></div></div>`;
    document.body.appendChild(el);
  }
  el.style.display = on ? 'flex' : 'none';
  const textEl = document.getElementById('globalSpinnerText');
  if (textEl) textEl.innerText = text || '';
}

/* Toggle buttons loading state - only toggle buttons that exist */
function toggleButtons(disable) {
  const ids = ['refreshJobs', 'uploadBtn', 'saveTokenBtn', 'showMatchesBtn', 'showShortlistsBtn', 'refreshApplicationsBtn', 'refreshMyAppsBtn'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = !!disable;
    if (disable) el.classList.add('btn-loading'); else el.classList.remove('btn-loading');
  });
}

/* confirm helper */
function showConfirm(title, message, onConfirm) {
  const modalEl = document.getElementById('confirmModal');
  if (modalEl && window.bootstrap && window.bootstrap.Modal) {
    const titleEl = modalEl.querySelector('.modal-title');
    const bodyEl = modalEl.querySelector('.modal-body');
    const okBtn = modalEl.querySelector('#confirmOkBtn');

    titleEl.innerText = title || 'Confirm';
    bodyEl.innerText = message || 'Are you sure?';

    const freshOk = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(freshOk, okBtn);

    const handler = async function () {
      try {
        const bsInst = bootstrap.Modal.getInstance(modalEl);
        if (bsInst) bsInst.hide();
        await onConfirm();
      } catch (err) {
        console.error('confirm callback error', err);
      } finally {
        freshOk.removeEventListener('click', handler);
      }
    };
    freshOk.addEventListener('click', handler);
    const modal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: true });
    modal.show();
    return;
  }
  const ok = window.confirm(message || 'Are you sure?');
  if (ok) { try { onConfirm(); } catch (e) { console.error(e); } }
}

/* ---------- API wrapper usage notes ----------
 We intentionally **do not** redefine apiFetch here to avoid name clash with imported alias.
 Use apiFetch (imported) which returns normalized { ok, status, data } per utils.js contract.
 If a function needs raw Response, use fetchWithAuth (imported) which behaves like fetch.
--------------------------------------------*/

/* ---------- Upload helpers ---------- */
async function uploadWithFetch(file) {
  try {
    const fd = new FormData(); fd.append('file', file);
    showSpinner(true, 'Uploading...');
    const res = await fetchWithAuth(UPLOAD_URL, { method: 'POST', body: fd });
    const text = await res.text();
    let data = null; try { data = text ? JSON.parse(text) : null } catch (e) { data = text; }
    showSpinner(false);
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    showSpinner(false);
    return { ok: false, error: e };
  }
}
function uploadWithXHR(file) {
  return new Promise(resolve => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData(); fd.append('file', file);
    xhr.open('POST', UPLOAD_URL);
    const token = getToken(); if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);

    xhr.upload.onprogress = function (e) { if (e.lengthComputable) showSpinner(true, `Uploading ${Math.round(e.loaded / e.total * 100)}%`); };
    xhr.onload = function () {
      showSpinner(false);
      let resp = xhr.responseText;
      try { resp = resp ? JSON.parse(resp) : null } catch (e) { }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data: resp });
    };
    xhr.onerror = function (err) { showSpinner(false); resolve({ ok: false, error: err }); };
    try { xhr.send(fd); } catch (e) { showSpinner(false); resolve({ ok: false, error: e }); }
  });
}
async function handleUpload(file) {
  const maxMB = 20;
  if (file.size > maxMB * 1024 * 1024) return { ok: false, error: `File too large (max ${maxMB}MB)` };
  let res = await uploadWithFetch(file);
  if (!res.ok) {
    const fallback = await uploadWithXHR(file);
    return fallback;
  }
  return res;
}

/* ---------- Resume list ---------- */
async function refreshResumes() {
  const container = document.getElementById('resumeList');
  if (!container) return;
  container.innerHTML = '<div class="small-muted">Loading...</div>';
  let res = await apiFetch(MY_RESUMES_URL);
  if (!res.ok && res.status === 404) res = await apiFetch('/api/resumes/resumes/');
  if (!res.ok) {
    container.innerHTML = `<div class="small-muted">Failed to load resumes (${res.status})</div>`;
    resumesList = [];
    return;
  }
  const list = res.data || [];
  resumesList = list;
  if (!list.length) { container.innerHTML = `<div class="small-muted">No resumes uploaded yet.</div>`; return; }
  container.innerHTML = '';
  list.forEach(r => {
    const id = r.id || r.pk || r.resume_id || '';
    const fileUrl = r.file || '';
    const fileName = r.file_name || (fileUrl ? fileUrl.split('/').pop() : `Resume ${id}`);
    const uploaded = r.uploaded_at || r.created_at || '';
    const skills = (r.skills || '').slice(0, 200);
    const card = document.createElement('div');
    card.className = 'resume-card mb-2';
    card.innerHTML = `
      <div class="resume-meta">
        <strong>${escapeHtml(fileName)}</strong><br>
        <small class="small-muted">${escapeHtml(uploaded)}</small>
        <div class="small-muted" style="margin-top:8px;">${escapeHtml(skills)}</div>
      </div>
      <div class="btn-group-right">
        <a class="btn btn-sm btn-outline-primary" href="${escapeHtml(fileUrl) || '#'}" target="_blank" ${fileUrl ? '' : 'onclick="return false;"'}>View</a>
        <button class="btn btn-sm btn-outline-danger" onclick="deleteResume('${id}')">Delete</button>
      </div>`;
    container.appendChild(card);
  });
}

/* delete resume */
async function deleteResume(id) {
  if (!id) { showToast('Invalid resume id', 'error'); return; }
  showConfirm(
    'Delete resume?',
    'This will permanently remove the resume file and its parsed data. This action cannot be undone.',
    async () => {
      try {
        const res = await apiFetch(`${MY_RESUMES_URL}${id}/`, { method: 'DELETE' });
        if (res.ok) { showToast('Resume deleted', 'success'); await refreshResumes(); }
        else { const msg = res.data?.detail || `Status ${res.status}`; showToast('Delete failed: ' + msg, 'error', 5000); }
      } catch (err) { console.error('deleteResume error', err); showToast('Delete failed', 'error'); }
    }
  );
}

/* ---------- Jobs & matches ---------- */
async function loadJobs() {
  const container = document.getElementById('jobsList');
  if (!container) return;
  container.innerHTML = '<div class="small-muted">Loading jobs...</div>';
  const res = await apiFetch('/api/resumes/jobs/');
  if (!res.ok) {
    container.innerHTML = `<div class="small-muted">Failed to load jobs (${res.status})</div>`;
    return;
  }
  const jobs = res.data || [];
  if (!jobs.length) { container.innerHTML = `<div class="small-muted">No jobs available</div>`; return; }

  container.innerHTML = '';
  jobs.forEach(j => {
    const card = document.createElement('div');
    card.className = 'list-group-item job-card d-flex justify-content-between align-items-start';
    card._job = j;

    // ensure consistent ids for apply/retake
    const applyId = `apply-btn-${j.id}`;
    const retakeId = `retake-btn-${j.id}`;

    card.innerHTML = `
      <div style="min-width:0;">
        <strong>${escapeHtml(j.title || '')}</strong>
        <div class="small-muted">${escapeHtml(j.company || '')} • ${escapeHtml(j.skills_required || j.skills || '')}</div>
      </div>

      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
        <div>
          <button class="btn btn-sm btn-outline-primary me-1" type="button" onclick="viewJob(${j.id})">View</button>
          <button class="btn btn-sm btn-outline take-quiz-btn" data-job-id="${j.id}">Take Quiz</button>
          <button id="${applyId}" class="btn btn-sm btn-success apply-btn disabled" data-job-id="${j.id}" disabled>Apply</button>
          <button id="${retakeId}" class="btn btn-sm btn-secondary retake-btn" data-job-id="${j.id}" style="display:none;">Retake</button>
        </div>
        <div style="width:100%;text-align:right;">
          <span id="quiz-status-${j.id}" class="small text-muted">Not attempted</span>
          <div id="attempt-history-${j.id}" class="attempt-history small mt-1"></div>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  if (window && typeof window.attachQuizButtons === 'function') {
    try { window.attachQuizButtons(); } catch (e) { console.warn('attachQuizButtons call failed', e); }
  }
}

/* Fetch & render attempt history */
async function loadAttemptHistory(jobId) {
  try {
    const res = await fetchWithAuth(`/api/quiz/attempts/?job_id=${jobId}`);
    if (!res.ok) return;
    const arr = await res.json();
    updateAttemptHistoryRender(jobId, arr);
    if (arr.length > 0) {
      const last = arr[0];
      const lbl = document.querySelector(`#quiz-status-${jobId}`);
      if (lbl) lbl.textContent = last.passed ? 'Passed' : 'Failed';
      if (last.passed) enableApplyButton(jobId); else disableApplyButton(jobId);
      const retake = document.getElementById(`retake-btn-${jobId}`);
      if (retake) retake.style.display = last.passed ? 'none' : 'inline-block';
    }
  } catch (err) { console.error(err); }
}

function updateAttemptHistoryRender(jobId, attempts) {
  const wrap = document.querySelector(`#attempt-history-${jobId}`);
  if (!wrap) return;
  wrap.innerHTML = attempts.slice(0, 5).map(a => {
    return `<div>Attempt ${a.id || a.attempt_id}: ${a.score}/${a.total} — ${a.passed ? 'Passed' : 'Failed'} <small>(${new Date(a.created_at || a.created || Date.now()).toLocaleString()})</small></div>`;
  }).join('');
}

function updateAttemptHistoryUI(jobId, attempt) {
  const wrap = document.querySelector(`#attempt-history-${jobId}`);
  if (!wrap) return;
  const node = document.createElement('div');
  node.innerHTML = `Attempt ${attempt.attempt_id || attempt.id}: ${attempt.score}/${attempt.total} — ${attempt.passed ? 'Passed' : 'Failed'} <small>(${new Date().toLocaleString()})</small>`;
  wrap.prepend(node);
}

/* Fetch job detail and render in modal */
async function viewJob(jobId) {
  if (!jobId) return showToast('Invalid job id', 'error');
  try {
    showSpinner(true, 'Loading job...');
    const res = await apiFetch(`/api/resumes/jobs/${jobId}/`);
    if (!res.ok) {
      showToast(`Failed to load job (${res.status})`, 'error', 4000);
      return;
    }
    const job = res.data || {};
    renderJobModal(job);
  } catch (err) {
    console.error('viewJob error', err);
    showToast('Error fetching job', 'error');
  } finally {
    showSpinner(false);
  }
}

/* Render job object into modal and show it */
function renderJobModal(job) {
  let modalEl = document.getElementById('jobDetailModal');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.className = 'modal fade';
    modalEl.id = 'jobDetailModal';
    modalEl.tabIndex = -1;
    modalEl.innerHTML = `
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="jobDetailModalTitle"></h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="jobDetailModalBody"></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>
            <button id="jobDetailApplyBtn" type="button" class="btn btn-primary">Apply</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);
  }

  const titleEl = modalEl.querySelector('#jobDetailModalTitle');
  const bodyEl = modalEl.querySelector('#jobDetailModalBody');
  const applyBtn = modalEl.querySelector('#jobDetailApplyBtn');

  titleEl.innerText = job.title || `Job ${job.id || ''}`;
  const company = escapeHtml(job.company || '');
  const desc = escapeHtml(job.description || '');
  const skills = escapeHtml(job.skills_required || '');
  const exp = escapeHtml(job.experience_required || '0');
  const vacancies = escapeHtml(String(job.vacancies ?? ''));
  const posted = escapeHtml(job.created_at || job.posted_at || '');

  bodyEl.innerHTML = `
    <div class="mb-2"><strong>Company:</strong> ${company}</div>
    <div class="mb-2"><strong>Experience required:</strong> ${exp} yrs</div>
    <div class="mb-2"><strong>Vacancies:</strong> ${vacancies}</div>
    <div class="mb-2"><strong>Skills:</strong> ${skills}</div>
    <hr>
    <div><strong>Description</strong></div>
    <div style="white-space:pre-wrap;margin-top:8px;color:#444">${desc || '<em>No description</em>'}</div>
    <div class="small-muted mt-2">Posted: ${posted}</div>
  `;

  applyBtn.onclick = function () {
    try {
      const bs = bootstrap.Modal.getInstance(modalEl);
      if (bs) bs.hide();
    } catch (e) { }
    window.__apply_job_id = job.id || job.pk;
    if (typeof openApplyModal === 'function') {
      openApplyModal(job.id || job.pk);
    } else {
      showToast('Apply modal not available', 'error');
    }
  };

  const modalInstance = new bootstrap.Modal(modalEl, { backdrop: 'static' });
  modalInstance.show();
}
window.viewJob = viewJob;

/* select job by id helper */
function selectJobById(jobId) {
  const items = document.querySelectorAll('#jobsList .job-card');
  let jobObj = null;
  items.forEach(it => {
    if (it._job && Number(it._job.id) === Number(jobId)) jobObj = it._job;
  });
  if (jobObj) selectJob(jobObj);
  else console.warn('selectJobById: no job found for', jobId);
}

function selectJob(j) {
  if (!j) return;
  selectedJob = j;
  const items = document.querySelectorAll('#jobsList .job-card');
  items.forEach(it => {
    if (it._job && Number(it._job.id) === Number(j.id)) it.classList.add('active'); else it.classList.remove('active');
  });

  document.getElementById('noJob') && (document.getElementById('noJob').style.display = 'none');
  const jd = document.getElementById('jobDetails'); if (jd) jd.style.display = 'block';
  const title = document.getElementById('selectedJobTitle'); if (title) title.innerText = j.title || 'Job Matches';
  const meta = document.getElementById('jobMeta'); if (meta) meta.innerText = `${j.company || ''} • Experience required: ${j.experience_required || 0}`;

  document.getElementById('matchesSection') && (document.getElementById('matchesSection').style.display = 'none');
  document.getElementById('shortlistSection') && (document.getElementById('shortlistSection').style.display = 'none');
  document.getElementById('matchesList') && (document.getElementById('matchesList').innerHTML = '');
  document.getElementById('shortlistList') && (document.getElementById('shortlistList').innerHTML = '');
  document.getElementById('applicationsSection') && (document.getElementById('applicationsSection').style.display = 'none');
}

/* Quiz submit handler & UI updates */
async function handleQuizSubmitResponse(jobId, responseData) {
  // unified handler (single source)
  updateAttemptHistoryUI(jobId, responseData);

  if (responseData.passed) {
    enableApplyButton(jobId);
    showToast(`Passed ✅ Score: ${responseData.score}/${responseData.total}`, 'success');
    const lbl = document.querySelector(`#quiz-status-${jobId}`);
    if (lbl) lbl.textContent = 'Passed';
    const retake = document.getElementById(`retake-btn-${jobId}`);
    if (retake) retake.style.display = 'none';
  } else {
    disableApplyButton(jobId);
    showToast(`Failed ❌ Score: ${responseData.score}/${responseData.total}`, 'info');
    const retake = document.getElementById(`retake-btn-${jobId}`);
    if (retake) retake.style.display = 'inline-block';
    const lbl = document.querySelector(`#quiz-status-${jobId}`);
    if (lbl) lbl.textContent = 'Failed';
  }
}

function enableApplyButton(jobId) {
  const btn = document.querySelector(`#apply-btn-${jobId}`);
  if (btn) { btn.disabled = false; btn.classList.remove('disabled'); }
}
function disableApplyButton(jobId) {
  const btn = document.querySelector(`#apply-btn-${jobId}`);
  if (btn) { btn.disabled = true; btn.classList.add('disabled'); }
}

// Hook used when quiz modal submits answers
async function onQuizSubmit(jobId, answers) {
  try {
    const res = await fetchWithAuth('/api/quiz/attempt/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, answers })
    });
    const data = await res.json();
    await handleQuizSubmitResponse(jobId, data);
  } catch (err) {
    console.error('Quiz submit failed', err);
    showToast('Network error — try again', 'error');
  }
}

/* parse score helper */
function parseScoreValue(rawValue) {
  try {
    if (rawValue === null || rawValue === undefined) return 0;
    if (Array.isArray(rawValue)) {
      if (rawValue.length === 0) return 0;
      return parseScoreValue(rawValue[0]);
    }
    if (typeof rawValue === 'object') {
      const tryFields = ['score', 'score_percent', 'embedding_score', 'score_resume_for_job', 'value', 'percent', 'score_value', 'scores'];
      for (const f of tryFields) {
        if (rawValue[f] !== undefined) return parseScoreValue(rawValue[f]);
      }
      if (rawValue.length !== undefined && rawValue[0] !== undefined) return parseScoreValue(rawValue[0]);
      return 0;
    }
    if (typeof rawValue === 'string') {
      let s = rawValue.trim();
      s = s.replace(/,/g, '');
      const hasPct = s.endsWith('%');
      if (hasPct) s = s.slice(0, -1).trim();
      const num = Number(s);
      if (Number.isFinite(num)) return hasPct ? num : num;
      return 0;
    }
    if (typeof rawValue === 'number') return rawValue;
    return 0;
  } catch (e) { console.error("parseScoreValue error:", e, rawValue); return 0; }
}

/* Matches */
async function showMatchesForSelectedJob() {
  if (!selectedJob) return showToast('Select job first', 'error');
  const listEl = document.getElementById('matchesList');
  if (!listEl) return;
  listEl.innerHTML = '<div class="small-muted">Loading matches...</div>';
  const res = await apiFetch(`${JOBS_URL}${selectedJob.id}/match`);
  if (!res.ok) { listEl.innerHTML = `<div class="small-muted">Failed to load matches (${res.status})</div>`; return; }
  const matches = res.data?.matched_resumes || res.data || [];
  listEl.innerHTML = '';
  if (!Array.isArray(matches) || matches.length === 0) {
    listEl.innerHTML = `<div class="small-muted">No matches found.</div>`;
    document.getElementById('matchesSection') && (document.getElementById('matchesSection').style.display = 'block');
    return;
  }

  matches.forEach(m => {
    if (!m || typeof m !== 'object') { console.warn('Skipping invalid match entry', m); return; }
    const candidateRaw =
      m.score ??
      m.score_percent ??
      m.score_resume_for_job ??
      m.embedding_score ??
      (Array.isArray(m.scores) ? m.scores[0] : undefined) ??
      (Array.isArray(m) ? m[0] : undefined) ??
      0;
    let score = parseScoreValue(candidateRaw);
    if (score > 0 && score <= 1) score = Math.round(score * 100);
    if (Number.isFinite(score)) score = Math.round(score); else score = 0;
    const badge = score >= 75 ? 'bg-success' : (score >= 50 ? 'bg-warning text-dark' : 'bg-danger');
    const username = escapeHtml(m.user || m.username || 'candidate');
    const experience = escapeHtml(m.experience ?? 0);
    const skills = escapeHtml(m.skills || '');
    const missing = Array.isArray(m.missing_skills) ? m.missing_skills.join(', ') : (m.missing_skills || '');

    const card = document.createElement('div');
    card.className = 'card mb-2 p-2';
    card.innerHTML = `
      <div class="d-flex justify-content-between">
        <div>
          <strong>${username}</strong> — ${experience} yrs
          <div class="small-muted">skills: ${skills}</div>
          <div class="small-muted">missing: ${escapeHtml(missing)}</div>
        </div>
        <div style="text-align:right;">
          <span class="badge ${badge}" style="font-size:1rem;padding:.6rem .8rem">${score}%</span>
          <div style="margin-top:.6rem;">
            <button class="btn btn-sm btn-primary" type="button" onclick="shortlist(${selectedJob.id}, ${m.resume_id || m.id || 0})">Shortlist</button>
          </div>
        </div>
      </div>`;
    listEl.appendChild(card);
  });

  document.getElementById('matchesSection') && (document.getElementById('matchesSection').style.display = 'block');
}

/* Shortlist helpers */
async function shortlist(job_id, resume_id, btn) {
  if (!job_id || !resume_id) return showToast('Invalid shortlist', 'error');
  if (btn) btn.disabled = true;
  try {
    const res = await apiFetch(SHORTLIST_URL, { method: 'POST', body: { job_id, resume_id } });
    if (res.ok) { showToast('Shortlisted', 'success'); showShortlistsForSelectedJob(); }
    else if (res.status === 409) showToast('Already shortlisted. Email resend queued if allowed.', 'info');
    else showToast('Shortlist failed', 'error');
  } finally { if (btn) btn.disabled = false; }
}

async function showShortlistsForSelectedJob() {
  if (!selectedJob) return showToast('Select job first', 'error');
  const res = await apiFetch(`${SHORTLIST_URL}?job_id=${selectedJob.id}`);
  const container = document.getElementById('shortlistList');
  if (!container) return;
  if (!res.ok) { container.innerHTML = `<div class="small-muted">Failed to load shortlist (${res.status})</div>`; return; }
  const list = res.data || [];
  container.innerHTML = '';
  if (!list.length) { container.innerHTML = `<div class="small-muted">No shortlists.</div>`; return; }
  list.forEach(s => {
    const div = document.createElement('div');
    div.className = 'card mb-2 p-2';
    div.innerHTML = `<div class="d-flex justify-content-between align-items-start">
      <div><strong>Resume #${escapeHtml(s.resume)}</strong> — by ${escapeHtml(s.shortlisted_by)}<div class="small-muted">created: ${escapeHtml(s.created_at || '')}</div></div>
      <div><button class="btn btn-sm btn-outline-primary" type="button" onclick="resend(${s.job}, ${s.resume})">Resend</button> <button class="btn btn-sm btn-outline-danger" type="button" onclick="removeShortlist(${s.id})">Remove</button></div>
    </div>`;
    container.appendChild(div);
  });
  document.getElementById('shortlistSection').style.display = 'block';
}

async function resend(job_id, resume_id) {
  const res = await apiFetch(SHORTLIST_URL, { method: 'POST', body: { job_id, resume_id, resend: true } });
  if (res.ok) showToast('Email resent (queued)', 'success'); else showToast('Resend failed', 'error');
}
async function removeShortlist(id) {
  if (!id) { showToast('Invalid shortlist id', 'error'); return; }
  showConfirm(
    'Remove shortlist?',
    'This will remove the shortlist entry for the candidate. The candidate will no longer be shortlisted for this job.',
    async () => {
      try {
        const res = await apiFetch(SHORTLIST_URL, { method: 'DELETE', body: { id } });
        if (res.ok) { showToast('Shortlist removed', 'success'); document.getElementById('showShortlistsBtn')?.click(); }
        else { const msg = res.data?.detail || `Status ${res.status}`; showToast('Remove failed: ' + msg, 'error', 5000); }
      } catch (err) { console.error('removeShortlist error', err); showToast('Remove failed', 'error'); }
    }
  );
}

/* ---------- Recruiter: load applications for job ---------- */
async function loadApplicationsForJob(jobId) {
  const container = document.getElementById('applicationsList');
  if (!container) return;
  container.innerHTML = '<div class="small-muted">Loading applications...</div>';
  const res = await apiFetch(`${APPLICATIONS_URL}?job_id=${encodeURIComponent(jobId)}`);
  if (!res.ok) { container.innerHTML = `<div class="small-muted">Failed to load (${res.status})</div>`; return; }
  const list = Array.isArray(res.data) ? res.data : (res.data?.applications || res.data?.results || []);
  if (!Array.isArray(list) || list.length === 0) { container.innerHTML = '<div class="small-muted">No applications yet.</div>'; return; }
  container.innerHTML = '';
  list.forEach(app => {
    const card = document.createElement('div');
    card.className = 'card p-2 mb-2';
    const candidate = app.candidate_username || (app.candidate && app.candidate.username) || (app.user && app.user.username) || `ID ${app.candidate || ''}`;
    const jobTitle = app.job_title || (app.job && (app.job.title || app.job)) || '';
    const resumeLink = (app.resume_file) ? `<a href="${escapeHtml(app.resume_file)}" target="_blank">Resume</a>` : (app.resume ? `Resume #${app.resume}` : '');
    const appliedAt = app.applied_at || app.created_at || '';
    const status = app.status || '';
    card.innerHTML = `
      <div class="d-flex justify-content-between">
        <div>
          <strong>${escapeHtml(candidate)}</strong> applied for <em>${escapeHtml(jobTitle)}</em><br>
          ${resumeLink} • ${escapeHtml(app.message || app.notes || '')}
          <div class="small-muted">Applied: ${escapeHtml(appliedAt)}</div>
        </div>
        <div>
          <span class="badge ${status === 'shortlisted' ? 'bg-success' : 'bg-secondary'}">${escapeHtml(status)}</span>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

/* ---------- Apply flow: open modal & submit ---------- */
function openApplyModal(jobIdOrObj) {
  const jobId = (typeof jobIdOrObj === 'object' && jobIdOrObj !== null) ? jobIdOrObj.id : jobIdOrObj;
  if (!jobId) { showToast('Invalid job to apply', 'error'); return; }
  window.__apply_job_id = jobId;

  const select = document.getElementById('applyResumeSelect');
  if (!select) { showToast('Apply modal missing in HTML. Add apply modal markup.', 'error', 6000); return; }
  select.innerHTML = '<option value="">-- choose resume --</option>';
  if (Array.isArray(resumesList) && resumesList.length) {
    resumesList.forEach(r => {
      const id = r.id || r.pk || r.resume_id || '';
      const name = r.file_name || (r.file ? r.file.split('/').pop() : `Resume ${id}`);
      const opt = document.createElement('option');
      opt.value = id;
      opt.text = name;
      select.appendChild(opt);
    });
  } else {
    const opt = document.createElement('option');
    opt.value = '';
    opt.text = 'No resumes uploaded';
    select.appendChild(opt);
  }

  const msgEl = document.getElementById('applyMessage'); if (msgEl) msgEl.value = '';

  const modalEl = document.getElementById('applyModal');
  if (!modalEl) { showToast('Apply modal markup missing', 'error'); return; }
  try {
    if (window.bootstrap && window.bootstrap.Modal) {
      const bsInst = new bootstrap.Modal(modalEl, { backdrop: 'static' });
      bsInst.show();
    } else {
      modalEl.style.display = 'block';
    }
  } catch (e) {
    console.warn('openApplyModal fallback show', e);
    modalEl.style.display = 'block';
  }
}

// improved apply submit handler (attached globally)
document.addEventListener('submit', async function (e) {
  if (!e.target || e.target.id !== 'applyForm') return;
  e.preventDefault();

  const submitBtn = document.getElementById('applySubmitBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.dataset.origText = submitBtn.innerText || 'Apply';
    submitBtn.innerText = 'Applying...';
  }

  const jobId = window.__apply_job_id;
  const resumeId = document.getElementById('applyResumeSelect')?.value || '';
  const message = (document.getElementById('applyMessage')?.value || '').trim();

  if (!jobId) {
    showToast('No job selected for apply', 'error');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = submitBtn.dataset.origText || 'Apply'; }
    return;
  }
  if (!resumeId) {
    showToast('Select a resume to apply', 'error');
    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = submitBtn.dataset.origText || 'Apply'; }
    return;
  }

  try {
    showSpinner(true, 'Applying...');

    const payload = { job_id: jobId, resume_id: resumeId, message };

    // 1) Try JSON first (common case)
    let res = await apiFetch(APPLY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    console.log('Apply: JSON response ->', res);

    // 2) If JSON failed with client errors, try FormData fallback
    if (!res.ok && (res.status === 400 || res.status === 415 || res.status === 422)) {
      console.log('Apply: retrying with FormData fallback');
      const fd = new FormData();
      fd.append('job_id', jobId);
      fd.append('resume_id', resumeId);
      fd.append('message', message || '');

      const r2 = await fetchWithAuth(APPLY_URL, { method: 'POST', body: fd });
      const text = await r2.text().catch(() => null);
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
      res = { ok: r2.ok, status: r2.status, data };
      console.log('Apply: FormData response ->', res);
    }

    // Final handling
    if (res.ok) {
      showToast('Applied successfully', 'success', 3000);

      try {
        const modalEl = document.getElementById('applyModal');
        if (modalEl) {
          const inst = (window.bootstrap && window.bootstrap.Modal) ? bootstrap.Modal.getInstance(modalEl) : null;
          if (inst) inst.hide();
        }
      } catch (e) { console.warn('hide modal failed', e); }

      try { refreshResumes(); } catch (e) { }
      try { if (selectedJob && Number(selectedJob.id) === Number(jobId)) loadApplicationsForJob(jobId); } catch (e) { }

    } else {
      if (res.status === 409) {
        const body = res.data || {};
        let msg = body.detail || body.message || body.error || null;

        let appInfo = null;
        if (!msg && typeof body === 'object') {
          if (body.application) appInfo = body.application;
          else if (body.existing_application) appInfo = body.existing_application;
          else if (body.data && body.data.application) appInfo = body.data.application;
        }

        if (appInfo) {
          const id = appInfo.id || appInfo.pk || appInfo.application_id || '';
          const status = appInfo.status || appInfo.application_status || '';
          const at = appInfo.applied_at || appInfo.created_at || appInfo.created || '';
          msg = msg || `Already applied (id:${id}) status:${status} applied:${at}`;
          console.log('Existing application object:', appInfo);
        }

        if (!msg) msg = (typeof body === 'string') ? body : JSON.stringify(body);

        showToast('Already applied: ' + msg, 'info', 8000);
        console.warn('Apply conflict (409):', res);

        try { if (selectedJob && Number(selectedJob.id) === Number(jobId)) loadApplicationsForJob(jobId); } catch (e) { }

        return;
      }

      if (res.status === 401 || res.status === 403) {
        showToast('Authentication required. Paste token and save.', 'error', 6000);
        console.warn('Apply auth error:', res);
        return;
      }

      let detail = 'Apply failed';
      if (res.data) {
        if (typeof res.data === 'string') detail = res.data;
        else if (res.data.detail) detail = res.data.detail;
        else detail = JSON.stringify(res.data);
      } else {
        detail = `Status ${res.status}`;
      }
      showToast(detail, 'error', 7000);
      console.warn('Apply error detail:', res);
    }

  } catch (err) {
    console.error('Apply failed (exception)', err);
    showToast('Network error while applying', 'error');
  } finally {
    showSpinner(false);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = submitBtn.dataset.origText || 'Apply';
    }
  }
});

/* ---------- Candidate: My Applications ---------- */
async function loadMyApplications() {
  const el = document.getElementById('myApplicationsList');
  if (!el) return;
  el.innerHTML = '<div class="small-muted">Loading your applications...</div>';

  function decodeJwtPayload(token) {
    try {
      const t = (token || '').replace(/^Bearer\s+/i, '');
      const part = t.split('.')[1];
      if (!part) return null;
      const payload = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(decodeURIComponent(Array.from(payload).map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
    } catch (e) { return null; }
  }

  const token = (localStorage.getItem('token') || '').trim();
  const payload = decodeJwtPayload(token);
  const currentUserId = payload?.user_id || payload?.id || payload?.sub || null;
  const currentUsername = (payload?.username || payload?.email || payload?.user_name || null);

  const tries = [
    '/api/resumes/applications/?mine=true',
    '/api/resumes/applications/?candidate=true',
    '/api/resumes/applications/?user=me',
    '/api/resumes/applications/'
  ];

  let res = null;
  for (const url of tries) {
    try {
      res = await apiFetch(url);
      if (res && (res.status === 401 || res.status === 403)) {
        el.innerHTML = `<div class="small-muted">Authentication required to view applications. Paste token above and Save.</div>`;
        return;
      }
      if (res && (res.ok || Array.isArray(res.data) || res.data?.applications || res.data?.results)) break;
    } catch (e) {
      console.warn('try applications url failed', url, e);
    }
  }

  if (!res) { el.innerHTML = `<div class="small-muted">Failed to fetch (no response)</div>`; return; }
  let apps = Array.isArray(res.data) ? res.data : (res.data?.applications || res.data?.results || []);
  if (!Array.isArray(apps)) apps = [];

  if (apps.length > 0 && (currentUserId || currentUsername)) {
    const filtered = apps.filter(a => {
      const candId = a.candidate || a.candidate_id || a.user_id || (a.candidate && a.candidate.id) || null;
      const candUsername = a.candidate_username || a.candidate_name || a.user || (a.candidate && a.candidate.username) || null;

      if (currentUserId && candId && String(candId) === String(currentUserId)) return true;
      if (currentUsername && candUsername && String(candUsername).toLowerCase() === String(currentUsername).toLowerCase()) return true;

      if (a.resume && (a.resume.user || a.resume.user_id)) {
        if (currentUserId && String(a.resume.user || a.resume.user_id) === String(currentUserId)) return true;
      }
      return false;
    });
    if (filtered.length) apps = filtered;
  }

  if (!apps.length) {
    el.innerHTML = `<div class="small-muted">You have not applied to any jobs yet.</div>`;
    return;
  }

  el.innerHTML = '';
  apps.forEach(a => {
    const appId = a.id || a.application_id || a.pk || '';
    const jobTitle = (a.job && (a.job.title || a.job)) || a.job_title || a.title || (a.job_id ? `Job ${a.job_id}` : 'Job');
    const status = a.status || a.application_status || 'pending';
    const appliedAt = a.applied_at || a.created_at || a.created || '';
    const message = a.message || a.notes || '';
    const resumeUrl = a.resume_file || (a.resume && a.resume.file) || '';
    const resumeLabel = a.resume_label || (a.resume && (a.resume.file ? a.resume.file.split('/').pop() : 'Resume')) || `Resume ${a.resume_id || a.resume || ''}`;
    const score = a.score || a.score_snapshot || a.score_percent || '';

    const card = document.createElement('div');
    card.className = 'card mb-2 p-2';
    card.innerHTML = `
      <div class="d-flex justify-content-between align-items-start">
        <div style="min-width:0;">
          <strong>${escapeHtml(jobTitle)}</strong>
          <div class="small-muted">Applied: ${escapeHtml(appliedAt)} • Status: <span class="badge ${status==='shortlisted' ? 'bg-success' : (status==='rejected' ? 'bg-danger' : 'bg-secondary')}">${escapeHtml(status)}</span></div>
          <div class="small-muted">Resume: ${resumeUrl ? `<a href="${escapeHtml(resumeUrl)}" target="_blank">${escapeHtml(resumeLabel)}</a>` : escapeHtml(resumeLabel)}</div>
          ${message ? `<div class="small-muted">Message: ${escapeHtml(message)}</div>` : ''}
          ${score ? `<div class="small-muted">Score: ${escapeHtml(String(score))}</div>` : ''}
        </div>
        <div style="min-width:120px;text-align:right;">
          ${a.job ? `<a class="btn btn-sm btn-outline-primary me-1" href="/api/resumes/jobs/${a.job.id || a.job}/" target="_blank">View Job</a>` : ''}
          ${resumeUrl ? `<a class="btn btn-sm btn-outline-secondary" href="${escapeHtml(resumeUrl)}" target="_blank" download>Download</a>` : ''}
        </div>
      </div>
    `;
    el.appendChild(card);
  });
}

async function exportMyApplicationsCSV() {
  const res = await apiFetch('/api/resumes/applications/my/');
  if (!res.ok && !(Array.isArray(res.data))) {
    showToast('Export not available', 'error');
    return;
  }
  const apps = Array.isArray(res.data) ? res.data : (res.data?.applications || []);
  if (!apps.length) { showToast('No applications', 'info'); return; }

  const headers = ['application_id', 'job_title', 'resume_id', 'message', 'status', 'applied_at'];
  const rows = apps.map(a => [
    a.id || '',
    a.job && (a.job.title || '') || a.job_title || '',
    a.resume_id || (a.resume && a.resume.id) || '',
    (a.message || '').replace(/\r?\n/g, ' ').replace(/"/g, '""'),
    a.status || '',
    a.applied_at || a.created_at || ''
  ]);
  const csv = headers.join(',') + '\n' + rows.map(r => r.map(c => `"${(c || '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `my_applications.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  showToast('CSV downloaded', 'success');
}

/* ---------- Wiring & init ---------- */
function initDashboard() {
  console.log('candidate dashboard init');

  const saveBtn = document.getElementById('saveTokenBtn');
  if (saveBtn) saveBtn.addEventListener('click', () => {
    const v = (document.getElementById('tokenInput') && document.getElementById('tokenInput').value.trim()) || '';
    if (!v) { showToast('Paste token first', 'error'); return; }
    saveTokenVal(v);
  });

  const uploadBtn = document.getElementById('uploadBtn');
  if (uploadBtn) uploadBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const fi = document.getElementById('resumeFile');
    if (!fi || !fi.files || fi.files.length === 0) { showToast('Choose a file first', 'error'); return; }
    const f = fi.files[0];
    showToast(`Uploading: ${f.name}`, 'info', 2000);
    const res = await handleUpload(f);
    if (res && res.ok) { showToast('Upload successful', 'success'); fi.value = ''; refreshResumes(); }
    else {
      console.warn('Upload failed', res);
      let msg = 'Upload failed';
      if (res) { if (res.data && typeof res.data === 'object') { msg = res.data.detail || JSON.stringify(res.data); } else if (res.status) msg = `Status ${res.status}`; else if (res.error) msg = String(res.error); }
      showToast(msg, 'error', 7000);
    }
  });

  document.getElementById('refreshJobs')?.addEventListener('click', loadJobs);
  document.getElementById('showMatchesBtn')?.addEventListener('click', showMatchesForSelectedJob);
  document.getElementById('showShortlistsBtn')?.addEventListener('click', showShortlistsForSelectedJob);
  document.getElementById('refreshApplicationsBtn')?.addEventListener('click', () => {
    if (!selectedJob || !selectedJob.id) return showToast('Select a job first', 'error');
    loadApplicationsForJob(selectedJob.id);
  });

  document.getElementById('refreshMyAppsBtn')?.addEventListener('click', loadMyApplications);
  document.getElementById('exportMyAppsBtn')?.addEventListener('click', exportMyApplicationsCSV);

  const saved = localStorage.getItem('token');
  if (saved && document.getElementById('tokenInput')) document.getElementById('tokenInput').value = saved;

  refreshResumes();
  loadJobs();

  setTimeout(() => { try { loadMyApplications(); } catch (e) { } }, 300);
}

if (document.readyState === 'loading') { window.addEventListener('DOMContentLoaded', initDashboard); } else { initDashboard(); }

/* ---------- expose some methods for inline usage ---------- */
window.openApplyModal = openApplyModal;
window.loadApplicationsForJob = loadApplicationsForJob;
window.selectJob = selectJob;
window.selectJobById = selectJobById;
window.refreshResumes = refreshResumes;
window.deleteResume = deleteResume;
window.shortlist = shortlist;
window.showMatchesForSelectedJob = showMatchesForSelectedJob;

/* ---------- utility ---------- */
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"'`]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#x60;' })[m]);
}

/* ---------- Quiz modal, timer, renderer & attachers (single canonical block) ---------- */
(function () {
  if (window.__candidateQuizInit) return;
  window.__candidateQuizInit = true;

  // small helpers
  function safeParseJSON(resp) {
    return resp.json().catch(() => null);
  }

  function createQuizModal() {
    if (document.querySelector('#quiz-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'quiz-modal';
    modal.style = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);z-index:9999;';
    modal.innerHTML = `
      <div style="background:#fff;padding:18px;border-radius:8px;max-width:900px;width:96%;max-height:82vh;overflow:auto;position:relative;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h4 id="quiz-modal-title" style="margin:0;">Quiz</h4>
          <button id="quiz-modal-close" class="btn btn-sm btn-outline-secondary">Close</button>
        </div>
        <div id="quiz-questions-wrap" style="margin-top:12px;">Loading…</div>
        <div style="margin-top:12px;text-align:right;">
          <button id="quiz-submit-btn" class="btn btn-primary">Submit</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.querySelector('#quiz-modal-close').addEventListener('click', closeQuizModal);
    document.querySelector('#quiz-submit-btn').addEventListener('click', async () => {
      const modalEl = document.querySelector('#quiz-modal');
      const jobId = parseInt(modalEl.dataset.jobId, 10);
      if (!jobId) { showToast('Missing job id', 'error'); return; }
      const answers = [];
      modalEl.querySelectorAll('.quiz-question').forEach(qEl => {
        const qid = qEl.dataset.qid;
        const sel = qEl.querySelector('input[type="radio"]:checked');
        answers.push({ question_id: parseInt(qid, 10), choice: sel ? sel.value : null });
      });
      document.querySelector('#quiz-submit-btn').disabled = true;
      await onQuizSubmit(jobId, answers);
      document.querySelector('#quiz-submit-btn').disabled = false;
    });
  }

  // timer
  let __quizTimerHandle = null;
  let __quizTimerRemaining = 0;
  function startQuizTimer(modal, seconds, onTick, onExpire) {
    if (!modal) return null;
    if (__quizTimerHandle) { clearInterval(__quizTimerHandle); __quizTimerHandle = null; }
    __quizTimerRemaining = Math.max(0, Math.floor(Number(seconds) || 0));

    let pill = modal.querySelector('#quiz-timer');
    if (!pill) {
      pill = document.createElement('div');
      pill.id = 'quiz-timer';
      pill.style = 'position:absolute;right:18px;top:14px;font-weight:600;color:#444';
      modal.querySelector('div[style*="background:#fff"]')?.prepend(pill);
    }

    function tick() {
      const mins = Math.floor(__quizTimerRemaining / 60);
      const secs = __quizTimerRemaining % 60;
      pill.textContent = `⏳ ${mins}:${String(secs).padStart(2, '0')}`;
      if (__quizTimerRemaining <= 0) {
        clearInterval(__quizTimerHandle);
        __quizTimerHandle = null;
        pill.textContent = '⏳ 0:00';
        if (typeof onExpire === 'function') onExpire();
      } else {
        if (typeof onTick === 'function') onTick(__quizTimerRemaining);
      }
      __quizTimerRemaining--;
    }

    tick();
    __quizTimerHandle = setInterval(tick, 1000);

    return {
      stop() { if (__quizTimerHandle) { clearInterval(__quizTimerHandle); __quizTimerHandle = null; } },
      set(sec) { __quizTimerRemaining = Number(sec) || 0; }
    };
  }

  function stopQuizTimer() {
    if (__quizTimerHandle) { clearInterval(__quizTimerHandle); __quizTimerHandle = null; }
    const pill = document.querySelector('#quiz-timer');
    if (pill) pill.remove();
  }

  function openQuizModal(jobId, questionPayload) {
    createQuizModal();
    const modal = document.querySelector('#quiz-modal');
    modal.style.display = 'flex';
    modal.dataset.jobId = jobId;
    const wrap = modal.querySelector('#quiz-questions-wrap');
    wrap.innerHTML = 'Loading questions…';

    // If caller passed questions directly (rare), render immediately
    if (questionPayload && Array.isArray(questionPayload)) {
      renderQuestionsInModal(questionPayload);
      return;
    }

    const token = localStorage.getItem('token') || (document.getElementById('tokenInput') && document.getElementById('tokenInput').value.trim());
    if (!token) {
      wrap.innerHTML = '<div class="text-danger">Authentication required. Paste token above and Save.</div>';
      return;
    }

    // fetch quiz questions (prefer fetchWithAuth)
    (async () => {
      try {
        let resp = null;
        if (typeof fetchWithAuth === 'function') {
          resp = await fetchWithAuth(`/api/quiz/${jobId}/`, { method: 'GET' });
        } else {
          const headers = {}; if (token) headers['Authorization'] = 'Bearer ' + token;
          resp = await fetch(`/api/quiz/${jobId}/`, { method: 'GET', headers });
        }

        if (!resp.ok) {
          // try generate fallback
          try {
            let r2 = null;
            if (typeof fetchWithAuth === 'function') r2 = await fetchWithAuth(`/api/quiz/generate/${jobId}/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_id: jobId }) });
            else r2 = await fetch(`/api/quiz/generate/${jobId}/`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': token ? 'Bearer ' + token : '' }, body: JSON.stringify({ job_id: jobId }) });
            if (r2 && r2.ok) resp = r2;
          } catch (e) { /* ignore */ }
        }

        if (!resp.ok) {
          let err = null;
          try { err = await resp.json(); } catch (e) { err = null; }
          const msg = err?.detail || err?.message || `${resp.status} ${resp.statusText}`;
          wrap.innerHTML = `<div class="text-danger">Error loading questions: ${escapeHtml(msg)}</div>`;
          console.warn('quiz GET error', resp.status, err);
          return;
        }

        const body = await resp.json().catch(() => null);
        const questions = Array.isArray(body) ? body :
          (Array.isArray(body?.questions) ? body.questions :
            (Array.isArray(body?.questions_json) ? body.questions_json : null));

        if (!questions || !Array.isArray(questions) || questions.length === 0) {
          wrap.innerHTML = '<div class="text-danger">No questions available for this job.</div>';
          console.info('quiz response body', body);
          return;
        }

        // fetch attempt count and enforce max attempts
        const attempts = await fetchAttemptCount(jobId);
        const QUIZ_MAX_ATTEMPTS = 3;
        const attemptSummaryEl = document.createElement('div');
        attemptSummaryEl.id = 'attempt-summary';
        attemptSummaryEl.style = 'margin-top:10px;color:#666;font-size:.9rem';
        attemptSummaryEl.innerText = `Attempts: ${attempts} / ${QUIZ_MAX_ATTEMPTS}`;
        wrap.after(attemptSummaryEl);

        if (attempts >= QUIZ_MAX_ATTEMPTS) {
          renderQuestionsInModal(questions.slice(0, 0)); // show none
          const submitBtn = modal.querySelector('#quiz-submit-btn');
          if (submitBtn) { submitBtn.disabled = true; submitBtn.innerText = 'Max attempts reached'; }
          showToast('Maximum attempts reached — retake not allowed', 'error', 7000);
          return;
        }

        renderQuestionsInModal(questions.slice(0, Math.min(questions.length, 10)));

        // start timer if provided by backend
        const timeLimit = body?.time_limit_seconds || body?.time_limit || 120;
        if (timeLimit && Number(timeLimit) > 0) {
          startQuizTimer(modal, Number(timeLimit), null, async () => {
            showToast('Time up — submitting quiz automatically', 'info', 3500);
            await autoSubmitQuiz(modal);
          });
        } else {
          if (!modal.querySelector('#quiz-timer')) {
            const tEl = document.createElement('div');
            tEl.id = 'quiz-timer';
            tEl.style = 'position:absolute;right:18px;top:14px;font-weight:600;color:#444';
            tEl.textContent = 'No time limit';
            modal.querySelector('div[style*="background:#fff"]')?.prepend(tEl);
          }
        }

      } catch (err) {
        console.error('quiz fetch exception', err);
        wrap.innerHTML = `<div class="text-danger">Network error while loading questions</div>`;
      }
    })();
  }

  function closeQuizModal() {
    const modal = document.querySelector('#quiz-modal');
    if (modal) modal.style.display = 'none';
    stopQuizTimer();
  }

  function renderQuestionsInModal(questions) {
    const wrap = document.querySelector('#quiz-questions-wrap');
    if (!wrap) return;

    wrap.innerHTML = questions.map(q => {
      const opts = Object.entries(q.choices || {}).map(([key, val]) => {
        return `
        <div>
          <label>
            <input type="radio" name="q-${q.id}" value="${escapeHtml(key)}">
            ${escapeHtml(val)}
          </label>
        </div>
      `;
      }).join('');

      return `
      <div class="quiz-question" data-qid="${q.id}" style="margin-bottom:12px;">
        <div><strong>${escapeHtml(q.question)}</strong></div>
        <div style="margin-left:8px;">${opts}</div>
      </div>
    `;
    }).join('');
  }

// replace existing fetchAttemptCount or the place where you call /api/quiz/attempts/...
async function fetchAttemptCount(jobId) {
  // prefer candidate-specific attempts list endpoint first
  const tries = [
    `/api/quiz/${jobId}/attempts/`,             // preferred (create on backend if missing)
    `/api/quiz/attempts/?job_id=${jobId}`,      // fallback older shapes
    `/api/quiz/attempts/?job=${jobId}`,
    `/api/quiz/attempts/`                       // last fallback
  ];

  for (const u of tries) {
    try {
      const headers = {};
      const token = localStorage.getItem('token');
      if (token) headers['Authorization'] = 'Bearer ' + token;

      console.debug('fetchAttemptCount trying', u);
      const r = await fetch(u, { method: 'GET', headers });

      // if endpoint not reachable, try next
      if (!r) continue;

      const status = r.status;
      const text = await r.text().catch(()=>null);
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch(e) { data = text; }

      console.debug('fetchAttemptCount', u, 'status', status, 'body', data);

      // success and direct array
      if (r.ok && Array.isArray(data)) return data.length;

      // common paginated shapes -> { results: [...] }
      if (r.ok && data && Array.isArray(data.results)) return data.results.length;

      // sometimes backend returns attempts key
      if (r.ok && data && Array.isArray(data.attempts)) return data.attempts.length;

      // some APIs return object list under data.data etc
      if (r.ok && data && Array.isArray(data.data)) return data.data.length;

      // if 401/403 -> auth problem (token expired). Break and return 0 (or you can surface)
      if(r.status==403){
        showToast("Max ateempts reached - You cannot retake Quiz","Error")
        closeQuizModal();
        return 0;
      }

      // if 404/405 -> try next
      if (status === 404 || status === 405) {
        continue;
      }

      // if ok but unexpected shape -> try to infer or return 0
      if (r.ok) {
        console.warn('fetchAttemptCount: unexpected response shape from', u, data);
        // try count keys for defensive measure
        const possibleArrays = ['results','attempts','data'];
        for (const k of possibleArrays) {
          if (Array.isArray(data?.[k])) return data[k].length;
        }
        return 0;
      }

    } catch (e) {
      console.warn('fetchAttemptCount try error', e, u);
      continue;
    }
  }

  // nothing worked
  return 0;
}


  async function autoSubmitQuiz(modal) {
    try {
      const jobId = parseInt(modal.dataset.jobId, 10);
      const answers = {};
      modal.querySelectorAll('.quiz-question').forEach(qEl => {
        const qid = qEl.dataset.qid;
        const sel = qEl.querySelector('input[type="radio"]:checked');
        answers[qid] = sel ? sel.value : null;
      });
      if (typeof onQuizSubmit === 'function') {
        await onQuizSubmit(jobId, answers);
        return;
      }
      const token = localStorage.getItem('token') || '';
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;
      const r = await fetch(`/api/quiz/${jobId}/attempt/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ answers })
      });
      if (r.ok) {
        const d = await r.json();
        handleQuizSubmitResponse(jobId, d);
      } else {
        showToast('Auto-submit failed', 'error');
        console.warn('autoSubmit failed', r.status);
      }
    } catch (e) { console.error('autoSubmit error', e); showToast('Auto-submit error', 'error'); }
  }
  
  
async function onQuizSubmit(jobId, answers) {
  try {
    const token = localStorage.getItem('token') || '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const r = await fetch(`/api/quiz/${jobId}/attempt/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ answers })
    });

    console.log('quiz submit status', r.status, r.statusText);

    const text = await r.text().catch(() => null);

    

    // 🚨 handle max attempts
    if (r.status === 403) {
      let msg = "Max attempts reached — you cannot take this quiz again.";
      try {
        const parsed = JSON.parse(text);
        if (parsed.detail) msg = parsed.detail;
      } catch (e) {}
      showToast(msg, "error", 5000);
      closeQuizModal(); // modal close pannidum
      return;
    }

    if (!r.ok) {
      console.warn('Quiz submit failed response body (text):', text);
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch(e){ parsed = null; }
      showToast(parsed && parsed.detail ? parsed.detail : `Quiz submit failed (${r.status})`);
      return;
    }

    // If ok, parse JSON
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) {
      console.error('Failed to parse quiz submit JSON, response text:', text);
      showToast('Quiz submit: invalid server response');
      return;
    }

    // success: update UI
    if (typeof handleQuizSubmitResponse === 'function') handleQuizSubmitResponse(jobId, data);

    // stop timer
    if (window.__quizTimer) window.__quizTimer.stop();

    // update attempts count immediately
const attemptsSummaryEl = document.querySelector('#attempt-summary');
if (attemptsSummaryEl) {
  try {
    const count = await fetchAttemptCount(jobId); // backend la irunthu latest count
    attemptsSummaryEl.textContentext = 'Attempts:'+ count+ '/ 3';
  } catch (e) {
    console.warn("Couldn't refresh attempts", e);
  }
}

    // 🚨 close modal after successful submit
    closeQuizModal();

  } catch (e) {
    console.error('onQuizSubmit error', e);
    showToast('Network error — try again');
  }
}
// ------------------ paste this in candidate_dashboard.js ------------------
// Update job card UI after quiz submit
function handleQuizSubmitResponse(jobId, data) {
  try {
    console.log('handleQuizSubmitResponse', jobId, data);

    // Find the job card container - adjust selector to match your HTML structure
    // Prefer a container that has data-job-id attribute on the job card wrapper
    let jobCard = document.querySelector(`.job-card[data-job-id="${jobId}"]`);
    if (!jobCard) {
      // try alternate selector if your card uses different class names
      jobCard = document.querySelector(`[data-job-id="${jobId}"]`);
    }
    if (!jobCard) {
      console.warn('Job card not found for jobId', jobId);
      return;
    }

    // Update status badge (Passed/Failed) if you have one with id like #quiz-status-<jobId>
    const statusEl = jobCard.querySelector(`#quiz-status-${jobId}`);
    if (statusEl) {
      statusEl.textContent = data.passed ? 'Passed' : 'Failed';
      statusEl.style.color = data.passed ? 'green' : 'crimson';
    }

    // Update attempt summary area (create if missing)
    let attemptWrap = jobCard.querySelector('.attempt-info');
    if (!attemptWrap) {
      attemptWrap = document.createElement('div');
      attemptWrap.className = 'attempt-info';
      attemptWrap.style = 'margin-top:8px;font-size:.9rem;color:#444';
      // append to the card footer area (adjust as needed)
      jobCard.appendChild(attemptWrap);
    }

    const attemptText = `Attempt ${data.attempt_id || ''}: ${data.correct || 0}/${data.total || 0} — ` +
                        `${data.passed ? '<strong style="color:green">Passed</strong>' : '<strong style="color:crimson">Failed</strong>'}` +
                        ` <small style="color:#666">(${new Date().toLocaleString()})</small>`;

    attemptWrap.innerHTML = attemptText;

    // Optionally show retake / disable logic
    const takeBtn = jobCard.querySelector('.take-quiz-btn') || jobCard.querySelector('.take-quiz');
    if (takeBtn) {
      // if backend returns attempts_remaining, use it; otherwise disable if passed
      if (data.passed) {
        takeBtn.disabled = true;
        takeBtn.classList.add('disabled');
      }
      if (typeof data.attempts_remaining !== 'undefined' && data.attempts_remaining <= 0) {
        takeBtn.disabled = true;
        takeBtn.textContent = 'No attempts left';
      }
    }

    // update apply button enable/disable if needed
    const applyBtn = jobCard.querySelector('.apply-btn');
    if (applyBtn) {
      if (data.passed) {
        applyBtn.disabled = false;
        applyBtn.classList.remove('disabled');
      } else {
        // leave as-is or disable until passed
      }
    }

  } catch (e) {
    console.error('handleQuizSubmitResponse error', e);
  }
}

// Expose globally so other modules can call it
window.handleQuizSubmitResponse = handleQuizSubmitResponse;
// ------------------------------------------------------------------------

// override window functions for global usage
window.openQuizModal = openQuizModal;
window.closeQuizModal = closeQuizModal;
window



  // attach buttons rendered in DOM
  function attachQuizButtons() {
    document.querySelectorAll('.take-quiz-btn').forEach(btn => {
      if (btn.__quizAttached) return;
      btn.__quizAttached = true;
      btn.addEventListener('click', () => {
        const jid = parseInt(btn.dataset.jobId, 10);
        openQuizModal(jid);
      });
      const jid = parseInt(btn.dataset.jobId, 10);
      if (jid) loadAttemptHistory(jid);
    });

    document.querySelectorAll('.retake-btn').forEach(btn => {
      if (btn.__quizAttached) return;
      btn.__quizAttached = true;
      btn.addEventListener('click', () => {
        const jid = parseInt(btn.dataset.jobId, 10);
        openQuizModal(jid);
      });
    });

    document.querySelectorAll('.apply-btn').forEach(btn => {
      if (btn.__quizAttached) return;
      btn.__quizAttached = true;
      btn.addEventListener('click', (e) => {
        const jid = parseInt(btn.dataset.jobId, 10);
        const applyModalEl = document.getElementById('applyModal');
        if (applyModalEl) {
          const applyForm = document.getElementById('applyForm');
          if (applyForm) applyForm.dataset.jobId = jid;
          const bsModal = new bootstrap.Modal(applyModalEl);
          bsModal.show();
        } else {
          showToast('Apply clicked for job ' + jid);
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachQuizButtons);
  } else {
    attachQuizButtons();
  }

  window.attachQuizButtons = attachQuizButtons;
})(); // end quiz module
