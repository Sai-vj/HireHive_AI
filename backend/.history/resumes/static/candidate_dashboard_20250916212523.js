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
/* candidate_dashboard.js - single-file quiz + attempts client
   Save this file and include with a normal <script src="..."></script> (no type="module")
*/
(function () {
  // avoid double-init
  if (window.__candidateDashboardLoaded) return;
  window.__candidateDashboardLoaded = true;

  /* ---------- small helpers ---------- */
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  if (typeof window.showToast !== 'function') {
    window.showToast = function (msg, type = 'info', timeout = 3000) {
      const container = document.getElementById('toastContainer') || document.body;
      const node = document.createElement('div');
      node.innerHTML = `<div style="padding:10px 14px;border-radius:8px;background:${type === 'error' ? '#f8d7da' : type === 'success' ? '#d1e7dd' : '#fff8d6'};border:1px solid #ddd;margin-bottom:8px">${escapeHtml(msg)}</div>`;
      container.appendChild(node);
      setTimeout(() => node.remove(), timeout);
    };
  }

  /* ---------- modal builder ---------- */
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

    modal.querySelector('#quiz-modal-close').addEventListener('click', () => {
      closeQuizModal();
    });

    modal.querySelector('#quiz-submit-btn').addEventListener('click', async () => {
      const m = document.querySelector('#quiz-modal');
      if (!m) return;
      const jobId = Number(m.dataset.jobId || 0);
      if (!jobId) { showToast('Missing job id', 'error'); return; }
      const answers = {};
      m.querySelectorAll('.quiz-question').forEach(qEl => {
        const qid = qEl.dataset.qid;
        const sel = qEl.querySelector('input[type="radio"]:checked');
        answers[qid] = sel ? sel.value : null;
      });
      m.querySelector('#quiz-submit-btn').disabled = true;
      try {
        await onQuizSubmit(jobId, answers);
      } finally {
        const b = document.querySelector('#quiz-submit-btn');
        if (b) b.disabled = false;
      }
    });
  }

  /* ---------- timer helpers ---------- */
  if (!window.__quizTimerHelpersRegistered) {
    window.__quizTimerHelpersRegistered = true;
    window.__quizTimerHandle = null;
    window.__quizTimerRemaining = 0;

    window.startQuizTimer = function (modalEl, seconds, onExpire) {
      try {
        if (window.__quizTimerHandle) { clearInterval(window.__quizTimerHandle); window.__quizTimerHandle = null; }
        window.__quizTimerRemaining = Math.max(0, Math.floor(Number(seconds) || 0));
        if (!modalEl) modalEl = document.querySelector('#quiz-modal');
        if (!modalEl) return null;
        const header = modalEl.querySelector('h4#quiz-modal-title') || modalEl.querySelector('h4');
        if (!header) return null;
        let pill = modalEl.querySelector('#quiz-timer');
        if (!pill) {
          pill = document.createElement('span');
          pill.id = 'quiz-timer';
          pill.style = 'margin-left:12px;font-weight:600;color:#333;padding:4px 8px;border-radius:8px;background:#fff;border:1px solid #eee';
          header.appendChild(pill);
        }

        function tick() {
          const mins = Math.floor(window.__quizTimerRemaining / 60);
          const secs = window.__quizTimerRemaining % 60;
          pill.textContent = `⏳ ${mins}:${String(secs).padStart(2, '0')}`;
          if (window.__quizTimerRemaining <= 30) pill.classList.add('warning'); else pill.classList.remove('warning');

          if (window.__quizTimerRemaining <= 0) {
            clearInterval(window.__quizTimerHandle);
            window.__quizTimerHandle = null;
            pill.textContent = '⏳ 0:00';
            if (typeof onExpire === 'function') onExpire();
          }
          window.__quizTimerRemaining--;
        }

        tick();
        window.__quizTimerHandle = setInterval(tick, 1000);

        return {
          stop() { if (window.__quizTimerHandle) { clearInterval(window.__quizTimerHandle); window.__quizTimerHandle = null; } },
          set(sec) { window.__quizTimerRemaining = Number(sec) || 0; }
        };
      } catch (e) { console.warn('startQuizTimer error', e); return null; }
    };

    window.stopQuizTimer = function () {
      try {
        if (window.__quizTimerHandle) { clearInterval(window.__quizTimerHandle); window.__quizTimerHandle = null; }
        const pill = document.querySelector('#quiz-timer');
        if (pill) pill.remove();
      } catch (e) { /* ignore */ }
    };
  }

  /* ---------- openQuizModal (main) ---------- */
  async function openQuizModal(jobId, questionPayload) {
    createQuizModal();
    const modal = document.querySelector('#quiz-modal');
    if (!modal) { console.error('Quiz modal missing'); return; }
    modal.style.display = 'flex';
    modal.dataset.jobId = jobId;
    const wrap = modal.querySelector('#quiz-questions-wrap');
    wrap.innerHTML = 'Loading questions…';

    // if questions provided directly
    if (questionPayload && Array.isArray(questionPayload)) {
      renderQuestionsInModal(questionPayload);
      return;
    }

    const token = localStorage.getItem('token') || (document.getElementById('tokenInput') && document.getElementById('tokenInput').value.trim());
    if (!token) {
      wrap.innerHTML = '<div class="text-danger">Authentication required. Paste token above and Save.</div>';
      return;
    }

    try {
      // GET quiz
      let headers = {};
      if (token) headers['Authorization'] = 'Bearer ' + token;
      let resp = await fetch(`/api/quiz/${jobId}/`, { method: 'GET', headers });

      // fallback generate POST
      if (!resp || !resp.ok) {
        try {
          headers = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = 'Bearer ' + token;
          const r2 = await fetch(`/api/quiz/generate/${jobId}/`, { method: 'POST', headers, body: JSON.stringify({ job_id: jobId }) });
          if (r2 && r2.ok) resp = r2;
        } catch (e) { /* ignore */ }
      }

      if (!resp || !resp.ok) {
        const txt = resp ? await resp.text().catch(() => null) : null;
        let parsed = null;
        try { parsed = txt ? JSON.parse(txt) : null; } catch (e) { parsed = null; }
        const msg = parsed?.detail || parsed?.message || txt || `${resp ? (resp.status + ' ' + resp.statusText) : 'No response'}`;
        wrap.innerHTML = `<div class="text-danger">Error loading questions: ${escapeHtml(msg)}</div>`;
        console.warn('quiz GET error', resp && resp.status, parsed || txt);
        return;
      }

      const body = await resp.json().catch(() => null);
      const questions = Array.isArray(body) ? body : (Array.isArray(body?.questions) ? body.questions : (Array.isArray(body?.questions_json) ? body.questions_json : null));
      if (!questions || !Array.isArray(questions) || questions.length === 0) {
        wrap.innerHTML = '<div class="text-danger">No questions available for this job.</div>';
        console.info('quiz response body', body);
        return;
      }

      // attempts check
      const QUIZ_MAX_ATTEMPTS = 3;
      const attemptsResult = await fetchAttemptCount(jobId);
      if (typeof attemptsResult === 'object' && attemptsResult.error) {
        if (attemptsResult.status === 401) {
          wrap.innerHTML = '<div class="text-danger">Authentication required — please login again.</div>';
          return;
        }
        if (attemptsResult.status === 403) {
          wrap.innerHTML = `<div class="text-danger">${escapeHtml(attemptsResult.detail || 'Forbidden')}</div>`;
          const submitBtn = modal.querySelector('#quiz-submit-btn');
          if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Max attempts reached'; }
          return;
        }
      }

      const attemptsCount = Number(attemptsResult) || 0;
      let summ = modal.querySelector('#attempt-summary');
      if (!summ) {
        summ = document.createElement('div');
        summ.id = 'attempt-summary';
        summ.style = 'margin-top:10px;color:#666;font-size:.9rem';
        wrap.after(summ);
      }
      summ.textContent = `Attempts: ${attemptsCount} / ${QUIZ_MAX_ATTEMPTS}`;

      if (attemptsCount >= QUIZ_MAX_ATTEMPTS) {
        wrap.innerHTML = '<div class="text-danger">Maximum attempts reached — you cannot retake this quiz.</div>';
        const submitBtn = modal.querySelector('#quiz-submit-btn');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Max attempts reached'; }
        return;
      }

      // render questions
      renderQuestionsInModal(questions.slice(0, Math.min(questions.length, 10)));

      // timer
      const timeLimit = body?.time_limit_seconds || body?.time_limit || 120;
      if (timeLimit && Number(timeLimit) > 0) {
        startQuizTimer(modal, Number(timeLimit), async () => {
          showToast('Time up — submitting quiz automatically', 'info', 3000);
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
  }

  /* ---------- renderQuestionsInModal ---------- */
  function renderQuestionsInModal(questions) {
    const wrap = document.querySelector('#quiz-questions-wrap');
    if (!wrap) return;
    if (!questions || questions.length === 0) { wrap.innerHTML = '<div class="small-muted">No questions to show.</div>'; return; }

    wrap.innerHTML = questions.map(q => {
      const opts = Object.entries(q.choices || {}).map(([key, val]) => {
        return `<div style="margin-bottom:6px"><label style="cursor:pointer"><input type="radio" name="q-${q.id}" value="${escapeHtml(key)}" style="margin-right:8px">${escapeHtml(val)}</label></div>`;
      }).join('');
      return `<div class="quiz-question" data-qid="${q.id}" style="margin-bottom:12px;"><div style="font-weight:600;margin-bottom:6px">${escapeHtml(q.question)}</div><div style="margin-left:6px;">${opts}</div></div>`;
    }).join('');
  }

  /* ---------- fetch attempts for job ---------- */
  async function fetchAttemptsForJob(jobId) {
    try {
      const token = localStorage.getItem('token') || '';
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;
      const r = await fetch(`/api/quiz/${jobId}/attempts/`, { method: 'GET', headers });
      if (!r.ok) {
        const txt = await r.text().catch(() => null);
        return { error: true, status: r.status, body: txt };
      }
      const data = await r.json().catch(() => null);
      return data;
    } catch (e) {
      console.warn('fetchAttemptsForJob error', e);
      return { error: true, exception: String(e) };
    }
  }

  async function loadAttemptHistoryAndRender(jobId, fallbackButton) {
    try {
      const resp = await fetchAttemptsForJob(jobId);
      if (!resp) return null;
      if (resp.error) {
        const jobCard = findJobCardElement(jobId, fallbackButton);
        const wr = ensureAttemptContainer(jobCard);
        if (wr) {
          const note = resp.status === 403 ? 'Max attempts reached' : (resp.body || 'Error loading attempts');
          wr.innerText = note;
        }
        return null;
      }
      const arr = Array.isArray(resp) ? resp : (resp.results || resp.attempts || []);
      const jobCard = findJobCardElement(jobId, fallbackButton);
      if (!jobCard) return arr;
      if (!arr || arr.length === 0) {
        const wr = ensureAttemptContainer(jobCard);
        if (wr) wr.innerText = 'Not attempted';
        return [];
      }
      const sorted = arr.slice().sort((a, b) => {
        const ta = new Date(a.finished_at || a.started_at || 0).getTime();
        const tb = new Date(b.finished_at || b.started_at || 0).getTime();
        return tb - ta;
      });
      renderJobAttemptSummaryFromAttempt(jobCard, sorted[0]);
      return arr;
    } catch (e) {
      console.error('loadAttemptHistoryAndRender error', e);
      return null;
    }
  }

  function findJobCardElement(jobId, fallbackButton) {
    let el = document.querySelector(`.job-card[data-job-id="${jobId}"]`);
    if (el) return el;
    el = document.querySelector(`[data-job-id="${jobId}"]`);
    if (el) return el;
    if (fallbackButton && fallbackButton.closest) {
      const p = fallbackButton.closest('.job-card');
      if (p) return p;
    }
    return null;
  }

  function ensureAttemptContainer(jobCardEl) {
    if (!jobCardEl) return null;
    let wrap = jobCardEl.querySelector('.attempt-info');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'attempt-info';
      wrap.style = 'margin-top:8px;font-size:.9rem;color:#444';
      jobCardEl.appendChild(wrap);
    }
    return wrap;
  }

  function renderJobAttemptSummaryFromAttempt(jobCardEl, attempt) {
    const wrap = ensureAttemptContainer(jobCardEl);
    if (!wrap) return;
    const score = attempt.score ?? 0;
    const total = attempt.total ?? attempt.total_questions ?? 0;
    const passed = !!attempt.passed;
    const when = attempt.finished_at || attempt.started_at || null;
    const whenText = when ? new Date(when).toLocaleString() : '';
    const attemptId = attempt.attempt_id || attempt.id || '';
    wrap.innerHTML = `Attempt ${attemptId}: ${score}/${total} — <strong style="color:${passed ? 'green' : 'crimson'}">${passed ? 'Passed' : 'Failed'}</strong> <small style="color:#666">(${whenText})</small>`;
  }

  /* ---------- fetchAttemptCount (robust) ---------- */
  async function fetchAttemptCount(jobId) {
    const tries = [
      `/api/quiz/${jobId}/attempts/`,
      `/api/quiz/attempts/?job_id=${jobId}`,
      `/api/quiz/attempts/?job=${jobId}`,
      `/api/quiz/attempts/`
    ];
    for (const u of tries) {
      try {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('token');
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const r = await fetch(u, { method: 'GET', headers });
        if (!r) continue;
        const text = await r.text().catch(() => null);
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
        if (r.status === 401) return { error: 'unauthorized', status: 401, raw: data };
        if (r.status === 403) {
          const detail = data && data.detail ? data.detail : (typeof data === 'string' ? data : 'Forbidden');
          return { error: 'forbidden', status: 403, detail };
        }
        if (r.ok) {
          if (Array.isArray(data)) return data.length;
          if (data && Array.isArray(data.results)) return data.results.length;
          if (data && Array.isArray(data.attempts)) return data.attempts.length;
          if (data && Array.isArray(data.data)) return data.data.length;
          return 0;
        }
        if (r.status === 404 || r.status === 405) continue;
      } catch (e) {
        console.warn('fetchAttemptCount try error', e, u);
        continue;
      }
    }
    return 0;
  }

  /* ---------- autoSubmitQuiz ---------- */
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
    } catch (e) {
      console.error('autoSubmitQuiz error', e);
    }
  }

  /* ---------- onQuizSubmit ---------- */
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

      const text = await r.text().catch(() => null);
      if (r.status === 403) {
        let msg = 'Maximum attempts reached';
        try { const parsed = text ? JSON.parse(text) : null; if (parsed && parsed.detail) msg = parsed.detail; } catch (e) { }
        const wrap = document.querySelector('#quiz-questions-wrap');
        if (wrap) wrap.innerHTML = `<div class="text-danger">${escapeHtml(msg)}</div>`;
        const submitBtn = document.querySelector('#quiz-submit-btn');
        if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Max attempts reached'; }
        showToast(msg, 'error', 4000);
        return;
      }

      if (!r.ok) {
        let parsed = null;
        try { parsed = text ? JSON.parse(text) : null; } catch (e) { parsed = null; }
        showToast(parsed && parsed.detail ? parsed.detail : `Quiz submit failed (${r.status})`, 'error', 4000);
        return;
      }

      let data = null;
      try { data = text ? JSON.parse(text) : {}; } catch (e) { data = {}; }

      // update job card attempts UI
      await loadAttemptHistoryAndRender(jobId);

      if (typeof handleQuizSubmitResponse === 'function') handleQuizSubmitResponse(jobId, data);

      // update modal attempt summary
      const summEl = document.querySelector('#attempt-summary');
      if (summEl) {
        const c = await fetchAttemptCount(jobId);
        if (typeof c === 'number') summEl.textContent = `Attempts: ${c} / 3`;
      }

      // stop timer and close modal
      stopQuizTimer();
      closeQuizModal();
      showToast('Quiz submitted', 'success', 2500);

    } catch (e) {
      console.error('onQuizSubmit error', e);
      showToast('Network error — try again', 'error');
    }
  }

  /* ---------- closeQuizModal ---------- */
  function closeQuizModal() {
    const modal = document.querySelector('#quiz-modal');
    if (modal) modal.style.display = 'none';
    try { if (window.__quizTimerHandle) { clearInterval(window.__quizTimerHandle); window.__quizTimerHandle = null; } } catch (e) { }
    const pill = document.querySelector('#quiz-timer'); if (pill) pill.remove();
  }

  /* ---------- attach handlers to buttons ---------- */
  function attachQuizButtons() {
    createQuizModal(); // ensure modal exists

    // load attempt history for each job-card present
    document.querySelectorAll('.job-card').forEach(card => {
      const jid = Number(card.dataset.jobId || card.getAttribute('data-job-id') || 0);
      if (jid) loadAttemptHistoryAndRender(jid);
    });

    // attach click listeners to take-quiz buttons
    document.querySelectorAll('.take-quiz-btn').forEach(btn => {
      if (btn.__quizAttached) return;
      btn.__quizAttached = true;
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const jid = Number(btn.dataset.jobId || btn.getAttribute('data-job-id') || 0);
        if (!jid) {
          console.warn('take-quiz-btn missing job id', btn);
          showToast('Job id missing on button', 'error');
          return;
        }
        if (typeof openQuizModal === 'function') openQuizModal(jid);
        else console.warn('openQuizModal not ready');
      });
    });
  }

  // run attach on DOM ready and also after a slight delay (robust)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachQuizButtons);
  } else {
    attachQuizButtons();
  }
  setTimeout(attachQuizButtons, 1000);
  
  
  // call this once after DOM ready
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.job-card').forEach(card => {
    const jid = Number(card.dataset.jobId || card.getAttribute('data-job-id'));
    if (jid) {
      loadAttemptHistoryAndRender(jid);
    }
  });
});

  /* ---------- optional: handleQuizSubmitResponse (update job card after submit) ---------- */
  function handleQuizSubmitResponse(jobId, data) {
    try {
      let jobCard = document.querySelector(`.job-card[data-job-id="${jobId}"]`);
      if (!jobCard) jobCard = document.querySelector(`[data-job-id="${jobId}"]`);
      if (!jobCard) return;
      const statusEl = jobCard.querySelector(`#quiz-status-${jobId}`);
      if (statusEl) {
        statusEl.textContent = data.passed ? 'Passed' : 'Failed';
        statusEl.style.color = data.passed ? 'green' : 'crimson';
      }
      // update attempt summary
      const attemptWrap = jobCard.querySelector('.attempt-info') || (function () {
        const w = document.createElement('div'); w.className = 'attempt-info'; w.style = 'margin-top:8px;font-size:.9rem;color:#444'; jobCard.appendChild(w); return w;
      })();
      const attemptText = `Attempt ${data.attempt_id || ''}: ${data.correct || 0}/${data.total || 0} — ${data.passed ? '<strong style="color:green">Passed</strong>' : '<strong style="color:crimson">Failed</strong>'} <small style="color:#666">(${new Date().toLocaleString()})</small>`;
      attemptWrap.innerHTML = attemptText;
      // disable take-quiz if passed or attempts_remaining <= 0
      const takeBtn = jobCard.querySelector('.take-quiz-btn');
      if (takeBtn) {
        if (data.passed) { takeBtn.disabled = true; takeBtn.classList.add('disabled'); }
        if (typeof data.attempts_remaining !== 'undefined' && data.attempts_remaining <= 0) {
          takeBtn.disabled = true; takeBtn.textContent = 'No attempts left';
        }
      }
    } catch (e) {
      console.error('handleQuizSubmitResponse error', e);
    }
  }
  function handleQuizSubmitResponse(jobId, data) {
  // update job card attempts area immediately
  loadAttemptHistoryAndRender(jobId);
  // optionally also show a small status badge
  const jobCard = document.querySelector(`.job-card[data-job-id="${jobId}"]`);
  if (jobCard) {
    const statusEl = jobCard.querySelector(`#quiz-status-${jobId}`);
    if (statusEl) {
      statusEl.textContent = data.passed ? 'Passed' : 'Failed';
      statusEl.style.color = data.passed ? 'green' : 'crimson';
    }
  }
}
window.handleQuizSubmitResponse = handleQuizSubmitResponse;

  // export to window
  window.createQuizModal = createQuizModal;
  window.openQuizModal = openQuizModal;
  window.closeQuizModal = closeQuizModal;
  window.onQuizSubmit = onQuizSubmit;
  window.loadAttemptHistoryAndRender = loadAttemptHistoryAndRender;
  window.fetchAttemptCount = fetchAttemptCount;
  window.handleQuizSubmitResponse = handleQuizSubmitResponse;

  // Debug quick helper for you if you paste in console: show status
  console.log('candidate_dashboard.js loaded - attachQuizButtons registered.');
})();



