// candidate_dashboard.js - improved + hardened version
// candidate_dashboard.js
import { fetchWithAuth, apiFetchAsJson as apiFetch,saveTokens,getAccessToken,clearTokens} from './utils.js';

async function initCandidateDashboard() {
  console.log("Candidate dashboard initialized");

  // Example: auto-fetch jobs using the imported apiFetch alias
  try {
    const resp = await apiFetch('/api/resumes/jobs/', { method: 'GET' });
    if (!resp.ok) {
      console.warn('Jobs fetch (init) failed', resp);
    } else {
      const jobs = resp.data || [];
      // optionally do something with jobs (debug)
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
const APPLICATIONS_URL = '/api/applications/'; // used by recruiter + candidate fallbacks


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
function showToast(msg, type='info', timeout=3500) {
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
  div.innerHTML = `<div class="d-flex"><div class="toast-body">${msg}</div><button class="btn-close btn-close-white me-2 m-auto" aria-label="Close"></button></div>`;
  container.appendChild(div);
  const btn = div.querySelector('button');
  if (btn) btn.onclick = () => div.remove();
  setTimeout(()=> { try { div.remove(); } catch(e) {} }, timeout);
}

/* Spinner */
function showSpinner(on, text='') {
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
  const ids = ['refreshJobs','uploadBtn','saveTokenBtn','showMatchesBtn','showShortlistsBtn','refreshApplicationsBtn','refreshMyAppsBtn'];
  ids.forEach(id=>{
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = !!disable;
    if (disable) el.classList.add('btn-loading'); else el.classList.remove('btn-loading');
  });
}

/* confirm helper (unchanged) */
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
  if (ok) { try { onConfirm(); } catch(e){ console.error(e); } }
}

/* ---------- API wrapper ---------- 
async function apiFetch(path, opts={}) {
  showSpinner(true);
  toggleButtons(true);
  try {
    opts.headers = opts.headers || {};
    opts.headers['Accept'] = 'application/json';
    const token = getToken();
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;

    // stringify non-FormData bodies
    if (opts.body && !(opts.body instanceof FormData) && typeof opts.body === 'object') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }

    // debug log
    // console.log('API CALL', path, opts);

    const resp = await apiFetch(path, opts);
    const text = await resp.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch(e){ data = text; }
    if (resp.status === 401) {
      localStorage.removeItem('token');
      showToast('Token invalid/expired — paste again', 'error', 4000);
    }
    return { ok: resp.ok, status: resp.status, data };
  } catch(err) {
    console.error('apiFetch error', err);
    showToast('Network error', 'error', 3000);
    return { ok:false, status:0, data:null };
  } finally {
    toggleButtons(false);
    showSpinner(false);
  }
}  */

/* ---------- Upload helpers (unchanged) ---------- */
async function uploadWithFetch(file) {
  try {
    const fd = new FormData(); fd.append('file', file);
    const headers = { 'Accept': 'application/json' };
    const token = getToken(); if (token) headers['Authorization'] = 'Bearer ' + token;
    showSpinner(true, 'Uploading...');
    const res = await fetchWithAuth(UPLOAD_URL, { method: 'POST', body: fd });
    const text = await res.text();
    let data = null; try { data = text ? JSON.parse(text) : null } catch(e){ data = text; }
    showSpinner(false);
    return { ok: res.ok, status: res.status, data };
  } catch(e) {
    showSpinner(false);
    return { ok:false, error:e };
  }
}
function uploadWithXHR(file) {
  return new Promise(resolve => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData(); fd.append('file', file);
    xhr.open('POST', UPLOAD_URL);
    const token = getToken(); if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);

    xhr.upload.onprogress = function(e) { if (e.lengthComputable) showSpinner(true, `Uploading ${Math.round(e.loaded / e.total * 100)}%`); };
    xhr.onload = function() {
      showSpinner(false);
      let resp = xhr.responseText;
      try { resp = resp ? JSON.parse(resp) : null } catch(e) {}
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data: resp });
    };
    xhr.onerror = function(err) { showSpinner(false); resolve({ ok:false, error:err }); };
    try { xhr.send(fd); } catch(e) { showSpinner(false); resolve({ ok:false, error:e }); }
  });
}
async function handleUpload(file) {
  const maxMB = 20;
  if (file.size > maxMB * 1024 * 1024) return { ok:false, error: `File too large (max ${maxMB}MB)` };
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
    const fileName = r.file_name || (fileUrl? fileUrl.split('/').pop(): `Resume ${id}`);
    const uploaded = r.uploaded_at || r.created_at || '';
    const skills = (r.skills || '').slice(0,200);
    const card = document.createElement('div');
    card.className = 'resume-card mb-2';
    card.innerHTML = `
      <div class="resume-meta">
        <strong>${escapeHtml(fileName)}</strong><br>
        <small class="small-muted">${escapeHtml(uploaded)}</small>
        <div class="small-muted" style="margin-top:8px;">${escapeHtml(skills)}</div>
      </div>
      <div class="btn-group-right">
        <a class="btn btn-sm btn-outline-primary" href="${fileUrl || '#'}" target="_blank" ${fileUrl ? '' : 'onclick="return false;"'}>View</a>
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
/* ---------- Jobs ---------- */
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

  // render each job with quiz buttons and apply id/class patterns we use elsewhere
  container.innerHTML = '';
  jobs.forEach(j => {
    const card = document.createElement('div');
    card.className = 'list-group-item job-card d-flex justify-content-between align-items-start';
    // attach job object for later selection logic
    card._job = j;

    card.innerHTML = `
      <div style="min-width:0;">
        <strong>${escapeHtml(j.title || '')}</strong>
        <div class="small-muted">${escapeHtml(j.company || '')} • ${escapeHtml(j.skills_required || j.skills || '')}</div>
      </div>

      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
        <div>
          <button class="btn btn-sm btn-outline-primary me-1" type="button" onclick="viewJob(${j.id})">View</button>
          <!-- Quiz / Apply block (same ids/classes as rest of code expects) -->
          <button class="btn btn-sm btn-outline take-quiz-btn" data-job-id="${j.id}">Take Quiz</button>
          <button id="apply-btn-${j.id}" class="btn btn-sm btn-success apply-btn disabled" data-job-id="${j.id}" disabled>Apply</button>
          <button class="btn btn-sm btn-secondary retake-btn" data-job-id="${j.id}" style="display:none;">Retake</button>
        </div>
        <div style="width:100%;text-align:right;">
          <span id="quiz-status-${j.id}" class="small text-muted">Not attempted</span>
          <div id="attempt-history-${j.id}" class="attempt-history small mt-1"></div>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  // Attach quiz button listeners now that DOM nodes exist
  if (window && typeof window.attachQuizButtons === 'function') {
    try { window.attachQuizButtons(); } catch(e) { console.warn('attachQuizButtons call failed', e); }
  }
}
// ADD START: fetch & render attempt history
async function loadAttemptHistory(jobId) {
  try {
    const res = await fetchWithAuth(`/api/quiz/attempts/?job_id=${jobId}`);
    if (!res.ok) return;
    const arr = await res.json(); // expect list sorted desc
    updateAttemptHistoryRender(jobId, arr);
    // set status based on last attempt
    if (arr.length > 0) {
      const last = arr[0];
      const lbl = document.querySelector(`#quiz-status-${jobId}`);
      if (lbl) lbl.textContent = last.passed ? 'Passed' : 'Failed';
      if (last.passed) enableApplyButton(jobId); else disableApplyButton(jobId);
      const retake = document.querySelector(`#retake-btn-${jobId}`);
      if (retake) retake.style.display = last.passed ? 'none' : 'inline-block';
    }
  } catch (err) { console.error(err); }
}

function updateAttemptHistoryRender(jobId, attempts) {
  const wrap = document.querySelector(`#attempt-history-${jobId}`);
  if (!wrap) return;
  wrap.innerHTML = attempts.slice(0,5).map(a => {
    return `<div>Attempt ${a.id}: ${a.score}/${a.total} — ${a.passed ? 'Passed' : 'Failed'} <small>(${new Date(a.created_at).toLocaleString()})</small></div>`;
  }).join('');
}

function updateAttemptHistoryUI(jobId, attempt) {
  // prepend to existing
  const wrap = document.querySelector(`#attempt-history-${jobId}`);
  if (!wrap) return;
  const node = document.createElement('div');
  node.innerHTML = `Attempt ${attempt.attempt_id}: ${attempt.score}/${attempt.total} — ${attempt.passed ? 'Passed' : 'Failed'} <small>(${new Date().toLocaleString()})</small>`;
  wrap.prepend(node);
}
// ADD END

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
  // create / update modal markup (id = jobDetailModal)
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

  // fill in content
  const titleEl = modalEl.querySelector('#jobDetailModalTitle');
  const bodyEl = modalEl.querySelector('#jobDetailModalBody');
  const applyBtn = modalEl.querySelector('#jobDetailApplyBtn');

  titleEl.innerText = job.title || `Job ${job.id || ''}`;
  // build HTML snippet for body - adjust fields you want to show
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

  // wire apply button: open apply modal selecting this job
  applyBtn.onclick = function() {
    // hide job detail modal then open apply modal
    try {
      const bs = bootstrap.Modal.getInstance(modalEl);
      if (bs) bs.hide();
    } catch (e) {}
    // set selected job id in apply flow and open
    window.__apply_job_id = job.id || job.pk;
    // if apply modal exists, populate and show it - use existing openApplyModal if present
    if (typeof openApplyModal === 'function') {
      openApplyModal(job.id || job.pk);
    } else {
      showToast('Apply modal not available', 'error');
    }
  };

  // show modal via bootstrap
  const modalInstance = new bootstrap.Modal(modalEl, { backdrop: 'static' });
  modalInstance.show();
}

// expose view function for inline use (used by onclick in loadJobs)
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

  // highlight selected job element
  const items = document.querySelectorAll('#jobsList .job-card');
  items.forEach(it => {
    if (it._job && Number(it._job.id) === Number(j.id)) it.classList.add('active'); else it.classList.remove('active');
  });

  // show job details pane
  document.getElementById('noJob') && (document.getElementById('noJob').style.display = 'none');
  const jd = document.getElementById('jobDetails'); if (jd) jd.style.display = 'block';
  const title = document.getElementById('selectedJobTitle'); if (title) title.innerText = j.title || 'Job Matches';
  const meta = document.getElementById('jobMeta'); if (meta) meta.innerText = `${j.company || ''} • Experience required: ${j.experience_required || 0}`;

  document.getElementById('matchesSection') && (document.getElementById('matchesSection').style.display = 'none');
  document.getElementById('shortlistSection') && (document.getElementById('shortlistSection').style.display = 'none');
  document.getElementById('matchesList') && (document.getElementById('matchesList').innerHTML = '');
  document.getElementById('shortlistList') && (document.getElementById('shortlistList').innerHTML = '');
  // keep applicationsSection hidden until user clicks "Show Applications"
  document.getElementById('applicationsSection') && (document.getElementById('applicationsSection').style.display = 'none');
}
// ADD START: Quiz submit handler & UI updates
// File: static/js/candidate_dashboard.js
// Insert after: renderJobs() OR at end of file

// Assumes utils.js exposes: fetchWithAuth, authToken, showToast
// Also assumes job apply button markup IDs: apply-btn-{jobId}, take-quiz-{jobId}, retake-btn-{jobId}
// and a modal open function openQuizModal(jobId, onSubmitCallback)

async function handleQuizSubmitResponse(jobId, responseData) {
  // responseData example:
  // { attempt_id: 123, score: 70, total: 100, passed: true, message: "..." }

  // update attempt history UI
  updateAttemptHistoryUI(jobId, responseData);

  if (responseData.passed) {
    enableApplyButton(jobId);
    showToast(`Passed ✅ Score: ${responseData.score}/${responseData.total}`);
    // optional: show success badge
    const lbl = document.querySelector(`#quiz-status-${jobId}`);
    if (lbl) lbl.textContent = 'Passed';
  } else {
    disableApplyButton(jobId);
    showToast(`Failed ❌ Score: ${responseData.score}/${responseData.total}`);
    // show retake button
    const retake = document.querySelector(`#retake-btn-${jobId}`);
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
    showToast('Network error — try again');
  }
}

// ADD END

/* parse score helper (unchanged) */
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
      s = s.replace(/,/g,'');
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

/* Matches (unchanged but robust) */
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

/* Shortlist helpers (unchanged) */
async function shortlist(job_id, resume_id, btn) {
  if (!job_id || !resume_id) return showToast('Invalid shortlist', 'error');
  if (btn) btn.disabled = true;
  try {
    const res = await apiFetch(SHORTLIST_URL, { method:'POST', body: { job_id, resume_id } });
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
      <div><strong>Resume #${escapeHtml(s.resume)}</strong> — by ${escapeHtml(s.shortlisted_by)}<div class="small-muted">created: ${escapeHtml(s.created_at||'')}</div></div>
      <div><button class="btn btn-sm btn-outline-primary" type="button" onclick="resend(${s.job}, ${s.resume})">Resend</button> <button class="btn btn-sm btn-outline-danger" type="button" onclick="removeShortlist(${s.id})">Remove</button></div>
    </div>`;
    container.appendChild(div);
  });
  document.getElementById('shortlistSection').style.display = 'block';
}

async function resend(job_id, resume_id) {
  const res = await apiFetch(SHORTLIST_URL, { method:'POST', body:{ job_id, resume_id, resend:true } });
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
  // normalize
  const list = Array.isArray(res.data) ? res.data : (res.data?.applications || res.data?.results || []);
  if (!Array.isArray(list) || list.length === 0) { container.innerHTML = '<div class="small-muted">No applications yet.</div>'; return; }
  container.innerHTML = '';
  list.forEach(app => {
    const card = document.createElement('div');
    card.className = 'card p-2 mb-2';
    const candidate = app.candidate_username || (app.candidate && app.candidate.username) || (app.user && app.user.username) || `ID ${app.candidate || ''}`;
    const jobTitle = app.job_title || (app.job && (app.job.title || app.job)) || '';
    const resumeLink = (app.resume_file) ? `<a href="${app.resume_file}" target="_blank">Resume</a>` : (app.resume ? `Resume #${app.resume}` : '');
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

  // populate resume select
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

  // clear message
  const msgEl = document.getElementById('applyMessage'); if (msgEl) msgEl.value = '';

  // show modal
  const modalEl = document.getElementById('applyModal');
  if (!modalEl) { showToast('Apply modal markup missing', 'error'); return; }
  // create a bootstrap modal if available
  let bsInst = null;
  try {
    if (window.bootstrap && window.bootstrap.Modal) {
      bsInst = new bootstrap.Modal(modalEl, { backdrop: 'static' });
      bsInst.show();
    } else {
      // fallback: show element
      modalEl.style.display = 'block';
    }
  } catch(e) {
    console.warn('openApplyModal fallback show', e);
    modalEl.style.display = 'block';
  }
}

// improved apply submit handler (your existing handler replaced by this robust one)
// Replace your existing apply-form submit handler with this block
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

      // fetchWithAuth should add Authorization header and not stringify FormData
      const r2 = await fetchWithAuth(APPLY_URL, { method: 'POST', body: fd });
      const text = await r2.text().catch(()=>null);
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch(e) { data = text; }
      res = { ok: r2.ok, status: r2.status, data };
      console.log('Apply: FormData response ->', res);
    }

    // Final handling
    if (res.ok) {
      showToast('Applied successfully', 'success', 3000);

      // hide modal if present
      try {
        const modalEl = document.getElementById('applyModal');
        if (modalEl) {
          const inst = (window.bootstrap && window.bootstrap.Modal) ? bootstrap.Modal.getInstance(modalEl) : null;
          if (inst) inst.hide();
        }
      } catch(e){ console.warn('hide modal failed', e); }

      // refresh UI
      try { refreshResumes(); } catch(e) { /* ignore */ }
      try { if (selectedJob && Number(selectedJob.id) === Number(jobId)) loadApplicationsForJob(jobId); } catch(e) { /* ignore */ }

    } else {
      // ------ Improved 409 (Already applied) handling ------
      if (res.status === 409) {
        const body = res.data || {};
        // attempt to extract message/detail
        let msg = body.detail || body.message || body.error || null;

        // check for nested application object for richer info
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

        // Optionally refresh applications list so user sees the existing application
        try { if (selectedJob && Number(selectedJob.id) === Number(jobId)) loadApplicationsForJob(jobId); } catch(e) { /* ignore */ }

        return; // early return — don't continue to generic error handling
      }

      // Authentication errors
      if (res.status === 401 || res.status === 403) {
        showToast('Authentication required. Paste token and save.', 'error', 6000);
        console.warn('Apply auth error:', res);
        return;
      }

      // Generic error handling — show whatever the server returned
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
    showToast('Network error while applying', 'error', 5000);
  } finally {
    showSpinner(false);
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = submitBtn.dataset.origText || 'Apply';
    }
  }
});

/* ---------- Candidate: My Applications ---------- */
// REPLACE your existing loadMyApplications() with this robust version
async function loadMyApplications() {
  const el = document.getElementById('myApplicationsList');
  if (!el) return;
  el.innerHTML = '<div class="small-muted">Loading your applications...</div>';

  // small jwt decode helper (non-throwing)
  function decodeJwtPayload(token) {
    try {
      const t = (token || '').replace(/^Bearer\s+/i,'');
      const part = t.split('.')[1];
      if (!part) return null;
      const payload = atob(part.replace(/-/g,'+').replace(/_/g,'/'));
      return JSON.parse(decodeURIComponent(Array.from(payload).map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')));
    } catch (e) { return null; }
  }

  // get token & try decode
  const token = (localStorage.getItem('token') || '').trim();
  const payload = decodeJwtPayload(token);
  const currentUserId = payload?.user_id || payload?.id || payload?.sub || null;
  const currentUsername = (payload?.username || payload?.email || payload?.user_name || null);

  // endpoints to try (in order)
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
      // if auth problem - show helpful message and exit
      if (res && (res.status === 401 || res.status === 403)) {
        el.innerHTML = `<div class="small-muted">Authentication required to view applications. Paste token above and Save.</div>`;
        return;
      }
      // if we got JSON or array, stop trying further
      if (res && (res.ok || Array.isArray(res.data) || res.data?.applications || res.data?.results)) break;
    } catch (e) {
      // ignore & continue
      console.warn('try applications url failed', url, e);
    }
  }

  if (!res) { el.innerHTML = `<div class="small-muted">Failed to fetch (no response)</div>`; return; }
  // normalize apps array from common shapes
  let apps = Array.isArray(res.data) ? res.data : (res.data?.applications || res.data?.results || []);
  if (!Array.isArray(apps)) apps = [];

  // If server returned many apps and we have user info, try to filter; otherwise show everything.
  if (apps.length > 0 && (currentUserId || currentUsername)) {
    const filtered = apps.filter(a => {
      // candidate id fields
      const candId = a.candidate || a.candidate_id || a.user_id || (a.candidate && a.candidate.id) || null;
      const candUsername = a.candidate_username || a.candidate_name || a.user || (a.candidate && a.candidate.username) || null;

      if (currentUserId && candId && String(candId) === String(currentUserId)) return true;
      if (currentUsername && candUsername && String(candUsername).toLowerCase() === String(currentUsername).toLowerCase()) return true;

      // if application includes resume object with owner info
      if (a.resume && (a.resume.user || a.resume.user_id)) {
        if (currentUserId && String(a.resume.user || a.resume.user_id) === String(currentUserId)) return true;
      }
      return false;
    });
    // if filtering produced results, use them; otherwise fall back to server response (show everything)
    if (filtered.length) apps = filtered;
  }

  if (!apps.length) {
    el.innerHTML = `<div class="small-muted">You have not applied to any jobs yet.</div>`;
    return;
  }

  // render apps
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
          <div class="small-muted">Resume: ${resumeUrl ? `<a href="${resumeUrl}" target="_blank">${escapeHtml(resumeLabel)}</a>` : escapeHtml(resumeLabel)}</div>
          ${message ? `<div class="small-muted">Message: ${escapeHtml(message)}</div>` : ''}
          ${score ? `<div class="small-muted">Score: ${escapeHtml(String(score))}</div>` : ''}
        </div>
        <div style="min-width:120px;text-align:right;">
          ${a.job ? `<a class="btn btn-sm btn-outline-primary me-1" href="/api/resumes/jobs/${a.job.id || a.job}/" target="_blank">View Job</a>` : ''}
          ${resumeUrl ? `<a class="btn btn-sm btn-outline-secondary" href="${resumeUrl}" target="_blank" download>Download</a>` : ''}
        </div>
      </div>
    `;
    el.appendChild(card);
  });
}

async function exportMyApplicationsCSV() {
  // fallback: fetch JSON then CSV client-side
  const res = await apiFetch('/api/resumes/applications/my/');
  if (!res.ok && !(Array.isArray(res.data))) {
    showToast('Export not available', 'error');
    return;
  }
  const apps = Array.isArray(res.data) ? res.data : (res.data?.applications || []);
  if (!apps.length) { showToast('No applications', 'info'); return; }

  const headers = ['application_id','job_title','resume_id','message','status','applied_at'];
  const rows = apps.map(a => [
    a.id || '',
    a.job && (a.job.title || '') || a.job_title || '',
    a.resume_id || (a.resume && a.resume.id) || '',
    (a.message || '').replace(/\r?\n/g,' ').replace(/"/g,'""'),
    a.status || '',
    a.applied_at || a.created_at || ''
  ]);
  const csv = headers.join(',') + '\n' + rows.map(r => r.map(c => `"${(c||'').toString().replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv' });
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
  if (saveBtn) saveBtn.addEventListener('click', ()=> {
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

  // recruiter: refresh applications button if present
  document.getElementById('refreshApplicationsBtn')?.addEventListener('click', () => {
    if (!selectedJob || !selectedJob.id) return showToast('Select a job first', 'error');
    loadApplicationsForJob(selectedJob.id);
  });

  // candidate: wire my apps buttons (safe)
  document.getElementById('refreshMyAppsBtn')?.addEventListener('click', loadMyApplications);
  document.getElementById('exportMyAppsBtn')?.addEventListener('click', exportMyApplicationsCSV);

  // populate token input from storage
  const saved = localStorage.getItem('token');
  if (saved && document.getElementById('tokenInput')) document.getElementById('tokenInput').value = saved;

  // initial loads
  refreshResumes();
  loadJobs();

  // also load my applications if there's a candidate area
  setTimeout(()=> { try { loadMyApplications(); } catch(e){} }, 300);
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
  return String(s).replace(/[&<>"'`]/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#x60;' })[m]);
}
// ADD START: Quiz modal, event listeners & submit handler
// File: static/js/candidate_dashboard.js
// Insert: at END of file

(function(){
  if (window.__candidateQuizInit) return;
  window.__candidateQuizInit = true;

  // --- Helpers (expects utils.js to expose fetchWithAuth and showToast) ---
  function safeParseJSON(resp){
    return resp.json().catch(()=>null);
  }

  // --- Modal creation ---
  function createQuizModal() {
    if (document.querySelector('#quiz-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'quiz-modal';
    modal.style = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);z-index:9999;';
    modal.innerHTML = `
      <div style="background:#fff;padding:18px;border-radius:8px;max-width:900px;width:96%;max-height:82vh;overflow:auto;">
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
      const jobId = parseInt(modalEl.dataset.jobId,10);
      if (!jobId) { showToast('Missing job id'); return; }
      const answers = [];
      modalEl.querySelectorAll('.quiz-question').forEach(qEl => {
        const qid = qEl.dataset.qid;
        const sel = qEl.querySelector('input[type="radio"]:checked');
        answers.push({ question_id: parseInt(qid,10), choice: sel ? sel.value : null });
      });
      // disable submit to prevent double-click
      document.querySelector('#quiz-submit-btn').disabled = true;
      await onQuizSubmit(jobId, answers);
      document.querySelector('#quiz-submit-btn').disabled = false;
    });
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

  // Ensure token exists - show helpful message if missing
  const token = localStorage.getItem('token') || (document.getElementById('tokenInput') && document.getElementById('tokenInput').value.trim());
  if (!token) {
    wrap.innerHTML = '<div class="text-danger">Authentication required. Paste token above and Save.</div>';
    return;
  }

  // Use fetchWithAuth if available (it should add Authorization header)
  const fetcher = (typeof fetchWithAuth === 'function') ? fetchWithAuth : async (url, opts) => fetch(url, opts);

  fetcher(`/api/quiz/${jobId}/`, { method: 'GET' })
    .then(async (res) => {
      if (!res.ok) {
        // try to parse JSON error body if any
        let err = null;
        try { err = await res.json(); } catch(e) { err = null; }
        const msg = err?.detail || err?.message || `${res.status} ${res.statusText}`;
        wrap.innerHTML = `<div class="text-danger">Error loading questions: ${escapeHtml(msg)}</div>`;
        console.warn('quiz GET error', res.status, err);
        return;
      }
      // success - parse body
      let body = null;
      try { body = await res.json(); } catch (e) { body = null; }
      // backend may return { ... , questions: [...] } OR an array directly OR { questions_json: [...] }
      const questions = Array.isArray(body) ? body :
                        (Array.isArray(body?.questions) ? body.questions :
                        (Array.isArray(body?.questions_json) ? body.questions_json : null));

      if (!questions || !Array.isArray(questions) || questions.length === 0) {
        wrap.innerHTML = '<div class="text-danger">No questions available for this job.</div>';
        console.info('quiz response body', body);
        return;
      }

      // render (limit to 10 optionally)
      const maxQ = Math.min(questions.length, 10);
      renderQuestionsInModal(questions.slice(0, maxQ));
    })
    .catch(err => {
      console.error('quiz fetch exception', err);
      wrap.innerHTML = `<div class="text-danger">Network error while loading questions</div>`;
    });
}

  function closeQuizModal(){
    const modal = document.querySelector('#quiz-modal');
    if (modal) modal.style.display = 'none';
  }

  function renderQuestionsInModal(questions) {
  const wrap = document.querySelector('#quiz-questions-wrap');
  if (!wrap) return;

  wrap.innerHTML = questions.map(q => {
    // choices is {A:"..", B:"..", C:"..", D:".."}
    const opts = Object.entries(q.choices || {}).map(([key, val]) => {
      return `
        <div>
          <label>
            <input type="radio" name="q-${q.id}" value="${key}">
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


  // small helper to avoid XSS when rendering server strings
  function escapeHtml(s){
    if (!s && s !== 0) return '';
    return String(s).replace(/[&<>"']/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; });
  }
  function escapeHtml(s){
  if (!s && s !== 0) return '';
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}


  // --- Submit handler: calls backend and updates UI ---
// REPLACE the existing onQuizSubmit function with this robust version
async function onQuizSubmit(jobId, answers) {
  const token = localStorage.getItem('token') || document.getElementById('tokenInput')?.value;
  if (!token) {
    showToast('No token found — login or paste token above.', 'error');
    return;
  }

  // normalize answers → { qid: choice }
  const payload = {};
  answers.forEach(a => {
    if (a && a.question_id && a.choice) {
      payload[a.question_id] = a.choice;
    }
  });

  try {
    const res = await fetch(`/api/quiz/${jobId}/attempt/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token   // 👈 important
      },
      body: JSON.stringify({ answers: payload })
    });

    if (!res.ok) {
      const err = await res.json().catch(()=>null);
      showToast(err?.detail || `Error ${res.status}`, 'error');
      console.warn('quiz attempt error', res.status, err);
      return;
    }

    const data = await res.json();
    // backend returns: { attempt_id, score, passed, correct, total }
    handleQuizSubmitResponse(jobId, data);
    closeQuizModal();
    showToast(`Quiz submitted — Score: ${data.score}/${data.total}`, 'success');
  } catch (e) {
    console.error('quiz submit exception', e);
    showToast('Network error submitting quiz', 'error');
  }
}



  function handleQuizSubmitResponse(jobId, responseData) {
    // expected: { attempt_id, score, total, passed, message }
    updateAttemptHistoryUI(jobId, responseData);
    const statusEl = document.querySelector(`#quiz-status-${jobId}`);
    const retakeBtn = document.querySelector(`.retake-btn[data-job-id="${jobId}"]`);
    const applyBtn = document.querySelector(`.apply-btn[data-job-id="${jobId}"]`);
    if (responseData && responseData.passed) {
      if (statusEl) statusEl.textContent = 'Passed';
      if (applyBtn) { applyBtn.disabled = false; applyBtn.classList.remove('disabled'); }
      if (retakeBtn) retakeBtn.style.display = 'none';
      showToast(`Passed ✅ ${responseData.score}/${responseData.total}`);
    } else {
      if (statusEl) statusEl.textContent = 'Failed';
      if (applyBtn) { applyBtn.disabled = true; applyBtn.classList.add('disabled'); }
      if (retakeBtn) retakeBtn.style.display = 'inline-block';
      showToast(`Failed ❌ ${responseData ? (responseData.score + '/' + responseData.total) : ''}`, 'info');
    }
  }

  function updateAttemptHistoryUI(jobId, attempt) {
    const wrap = document.querySelector(`#attempt-history-${jobId}`);
    if (!wrap) return;
    const node = document.createElement('div');
    node.innerHTML = `Attempt ${attempt.attempt_id || attempt.id}: ${attempt.score}/${attempt.total} — ${attempt.passed ? 'Passed' : 'Failed'} <small>(${new Date().toLocaleString()})</small>`;
    wrap.prepend(node);
  }

  // --- Load attempt history for a job (optional call on render) ---
  async function loadAttemptHistory(jobId) {
    try {
      const res = await fetchWithAuth(`/api/quiz/attempts/?job_id=${jobId}`);
      if (!res.ok) return;
      const arr = await res.json();
      if (!Array.isArray(arr) || arr.length === 0) return;
      arr.slice(0,5).forEach(a => updateAttemptHistoryUI(jobId, a));
      const last = arr[0];
      const statusEl = document.querySelector(`#quiz-status-${jobId}`);
      const applyBtn = document.querySelector(`.apply-btn[data-job-id="${jobId}"]`);
      const retakeBtn = document.querySelector(`.retake-btn[data-job-id="${jobId}"]`);
      if (last && last.passed) {
        if (statusEl) statusEl.textContent = 'Passed';
        if (applyBtn) { applyBtn.disabled = false; applyBtn.classList.remove('disabled'); }
        if (retakeBtn) retakeBtn.style.display = 'none';
      } else {
        if (last) {
          if (statusEl) statusEl.textContent = last.passed ? 'Passed' : 'Failed';
          if (retakeBtn) retakeBtn.style.display = last.passed ? 'none' : 'inline-block';
        }
      }
    } catch (e) { console.error('loadAttemptHistory', e); }
  }

  // --- Attach event listeners to buttons rendered in DOM ---
  function attachQuizButtons() {
    document.querySelectorAll('.take-quiz-btn').forEach(btn => {
      if (btn.__quizAttached) return;
      btn.__quizAttached = true;
      btn.addEventListener('click', () => {
        const jid = parseInt(btn.dataset.jobId,10);
        openQuizModal(jid);
      });
      // optional: load attempt history for this job on first attach
      const jid = parseInt(btn.dataset.jobId,10);
      if (jid) loadAttemptHistory(jid);
    });

    document.querySelectorAll('.retake-btn').forEach(btn => {
      if (btn.__quizAttached) return;
      btn.__quizAttached = true;
      btn.addEventListener('click', () => {
        const jid = parseInt(btn.dataset.jobId,10);
        openQuizModal(jid);
      });
    });

    document.querySelectorAll('.apply-btn').forEach(btn => {
      if (btn.__quizAttached) return;
      btn.__quizAttached = true;
      btn.addEventListener('click', (e) => {
        const jid = parseInt(btn.dataset.jobId,10);
        // default behaviour: open apply modal if exists
        const applyModalEl = document.getElementById('applyModal');
        if (applyModalEl) {
          // fill hidden job id somewhere if needed, or open modal
          // Example: store job id on form dataset for later submission
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

  // initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachQuizButtons);
  } else {
    attachQuizButtons();
  }

  // expose for debug
  window.openQuizModal = openQuizModal;
  window.closeQuizModal = closeQuizModal;
  window.loadAttemptHistory = loadAttemptHistory;
  // Expose attachQuizButtons so loadJobs (global) can call it after rendering
  window.attachQuizButtons = attachQuizButtons;

})(); 
// ---------- Robust quiz loader (replace previous openQuizModal / tryGenerateQuestions usage) ----------
async function fetchGenerateQuestionsWithTimeout(jobId, timeoutMs = 8000) {
  const token = localStorage.getItem('token') || document.getElementById('tokenInput')?.value || '';
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const postUrl = `/api/quiz/generate/${jobId}/`;
  const altPostUrl = `/api/quiz/generate/`;
  const candidateGetUrl = `/api/quiz/${jobId}/`;
  const altGetUrl = `/api/quiz/generate/${jobId}/`;

  // helper to fetch with timeout
  const fetchWithTimeout = (url, opts={}) => {
    return Promise.race([
      fetch(url, opts),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeoutMs))
    ]);
  };

  // Try sequences: POST job-specific, POST generic, GET candidate-style, GET generate
  const tries = [
    { url: postUrl, opts: { method:'POST', headers, body: JSON.stringify({ job_id: jobId }) } },
    { url: altPostUrl, opts: { method:'POST', headers, body: JSON.stringify({ job_id: jobId }) } },
    { url: candidateGetUrl, opts: { method:'GET', headers } },
    { url: altGetUrl, opts: { method:'GET', headers } }
  ];

  for (const t of tries) {
    try {
      console.log('quiz try', t.url, t.opts.method);
      const r = await fetchWithTimeout(t.url, t.opts);
      const txt = await r.text().catch(()=>null);
      let json = null;
      try { json = txt ? JSON.parse(txt) : null; } catch(e){ json = txt; }

      // successful JSON with questions
      if (r.ok && json && (json.questions || Array.isArray(json))) {
        return { ok:true, data: json, url: t.url, method: t.opts.method, raw: json };
      }

      // handle expected 4xx/5xx gracefully: return error to UI with message
      if (!r.ok) {
        // return object but continue trying only for specific statuses (404/405) else break
        if (r.status === 404 || r.status === 405) {
          console.warn('quiz endpoint responded', r.status, t.url);
          // continue to next try
          continue;
        }
        // other status: return error so UI can show
        return { ok:false, status:r.status, text: txt || (r.statusText || ''), url: t.url };
      }
      // if r.ok but no questions -> continue next try
      console.warn('quiz response OK but no questions shape', t.url, json);
      continue;
    } catch (err) {
      console.warn('fetch attempt error', t.url, err);
      // if timeout or network, try next; but if last try, return error
      if (err && err.message === 'timeout') {
        // try next attempt; if last, return timeout
        continue;
      }
      // network or CORS error: return now with message
      return { ok:false, error: String(err), url: t.url };
    }
  }

  return { ok:false, error:'no-endpoint-found (tried multiple endpoints)' };
}

// Replace the modal loader call with this usage:
// --- Replace the "Fetch generated questions" block with this ---
// It will call GET /api/quiz/<jobId>/ and fall back gracefully.

async function fetchQuizQuestionsForJob(jobId) {
  // if fetchWithAuth is available prefer it (it attaches the token)
  const url = `/api/quiz/${jobId}/`;
  try {
    // prefer fetchWithAuth (already in utils)
    let resp;
    if (typeof fetchWithAuth === 'function') {
      resp = await fetchWithAuth(url, { method: 'GET' });
    } else {
      // fallback: manual fetch with Authorization header from localStorage
      const token = localStorage.getItem('token') || document.getElementById('tokenInput')?.value || '';
      const headers = {};
      if (token) headers['Authorization'] = 'Bearer ' + token;
      resp = await fetch(url, { method: 'GET', headers });
    }

    // if 401/403/4xx/5xx -> return object with error info
    if (!resp.ok) {
      const text = await resp.text().catch(()=>null);
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch(e){ data = text; }
      return { ok:false, status: resp.status, data };
    }

    // success: try parse JSON
    const data = await resp.json().catch(()=>null);
    if (!data) return { ok:false, status: 204, data:null };
    return { ok:true, data };
  } catch (err) {
    return { ok:false, error: String(err) };
  }
}

// call it from openQuizModal
fetchQuizQuestionsForJob(jobId).then(result => {
  const wrap = document.querySelector('#quiz-questions-wrap');
  if (!wrap) return;
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      wrap.innerHTML = `<div class="text-danger">Error loading questions: Authentication required (status ${result.status}). Paste valid access token and Save.</div>`;
      console.warn('quiz generate auth error', result);
      return;
    }
    // generic error
    const msg = result.data?.detail || result.data || result.error || `Status ${result.status || '??'}`;
    wrap.innerHTML = `<div class="text-danger">Error loading questions: ${escapeHtml(String(msg))}</div>`;
    console.warn('quiz generate try result', result);
    return;
  }

  // success -> expect questions array in result.data (adjust if backend returns different shape)
  const data = result.data;
  if (data && data.questions) {
    renderQuestionsInModal(data.questions);
  } else if (Array.isArray(data)) {
    // sometimes view returns array directly
    renderQuestionsInModal(data);
  } else if (data && data.quiz && data.quiz.questions) {
    renderQuestionsInModal(data.quiz.questions);
  } else {
    wrap.innerHTML = '<div class="text-danger">No questions returned</div>';
    console.warn('unexpected quiz payload', data);
  }
}).catch(e => {
  const wrap = document.querySelector('#quiz-questions-wrap');
  if (wrap) wrap.innerHTML = '<div class="text-danger">Network error</div>';
  console.error(e);
});


// ADD END
