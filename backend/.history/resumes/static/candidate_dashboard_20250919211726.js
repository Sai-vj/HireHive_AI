// candidate_dashboard.js - merged + robust fixes
// ---- utils globals shim (replaced import) ----
// utils.js now attaches functions to window: fetchWithAuth, apiFetchAsJson (and helpers)
// We alias them locally for convenience. If they are missing, we log a clear error.
const fetchWithAuth = window.fetchWithAuth || (function(){ console.error('fetchWithAuth not available. Ensure utils.js is loaded before this script'); return async ()=>{ throw new Error('fetchWithAuth missing'); }; })();
const apiFetch = window.apiFetchAsJson || window.apiFetch || (function(){ console.error('apiFetchAsJson not available. Ensure utils.js is loaded before this script'); return async ()=>({ ok:false, status:0, data:null }); })();
// ------------------------------------------------
// utils is a global (utils.js attaches functions to window).
const clearTokens = window.clearTokens || function(){ console.error('clearTokens missing. Ensure utils.js loaded before this script.'); };


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

/* small html escape */
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"'`]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#x60;' })[m]);
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
    card.setAttribute('data-job-id', j.id || j.pk || '');

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

/* Fetch & render attempt history (deprecated but kept for compatibility) */
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

/* ---------- Quiz submit handler & UI updates ---------- */
async function handleQuizSubmitResponse(jobId, responseData) {
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

/* Hook used when quiz modal submits answers */
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

/* ---------- parseScoreValue (utility) ---------- */
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

/* ---------- Matches ---------- */
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

/* ---------- Shortlist helpers ---------- */
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
  loadInvites();
  try { loadInvites(); } catch(e) { console.warn('loadInvites failed', e); }

  setTimeout(() => { try { loadMyApplications(); } catch (e) { } }, 300);

  // kickoff invites loader (candidate invites area)
  setTimeout(() => { try { loadInvites(); } catch (e) { console.warn('loadInvites failed', e); } }, 500);
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

/* ---------- Quiz modal, timer, renderer & attachers (single canonical block) ---------- */
// (unchanged major behavior but uses robust attempt fetchers below)

(function () {
  if (window.__candidateDashboardLoaded) return;
  window.__candidateDashboardLoaded = true;

  function escapeHtmlLocal(s) {
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
      node.innerHTML = `<div style="padding:10px 14px;border-radius:8px;background:${type === 'error' ? '#f8d7da' : type === 'success' ? '#d1e7dd' : '#fff8d6'};border:1px solid #ddd;margin-bottom:8px">${escapeHtmlLocal(msg)}</div>`;
      container.appendChild(node);
      setTimeout(() => node.remove(), timeout);
    };
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
        wrap.innerHTML = `<div class="text-danger">Error loading questions: ${escapeHtmlLocal(msg)}</div>`;
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
          wrap.innerHTML = `<div class="text-danger">${escapeHtmlLocal(attemptsResult.detail || 'Forbidden')}</div>`;
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

  function renderQuestionsInModal(questions) {
    const wrap = document.querySelector('#quiz-questions-wrap');
    if (!wrap) return;
    if (!questions || questions.length === 0) { wrap.innerHTML = '<div class="small-muted">No questions to show.</div>'; return; }

    wrap.innerHTML = questions.map(q => {
      const opts = Object.entries(q.choices || {}).map(([key, val]) => {
        return `<div style="margin-bottom:6px"><label style="cursor:pointer"><input type="radio" name="q-${q.id}" value="${escapeHtmlLocal(key)}" style="margin-right:8px">${escapeHtmlLocal(val)}</label></div>`;
      }).join('');
      return `<div class="quiz-question" data-qid="${q.id}" style="margin-bottom:12px;"><div style="font-weight:600;margin-bottom:6px">${escapeHtmlLocal(q.question)}</div><div style="margin-left:6px;">${opts}</div></div>`;
    }).join('');
  }

  // we will wire attempt-fetch helpers to probe multiple endpoints (robust)
  async function _fetchUrlWithAuth(url) {
    const token = localStorage.getItem('token') || (document.getElementById('tokenInput') && document.getElementById('tokenInput').value.trim());
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    try {
      const r = await fetch(url, { method: 'GET', headers });
      const text = await r.text().catch(()=>null);
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch(e) { data = text; }
      return { ok: r.ok, status: r.status, url: url, data, raw: r };
    } catch (e) {
      return { ok: false, error: String(e), url };
    }
  }

  async function fetchAttemptsForJob(jobId) {
    const tries = [
      `/api/quiz/${jobId}/attempts/`,
      `/api/quiz/${jobId}/attempts`,
      `/api/quiz/attempts/?job_id=${jobId}`,
      `/api/quiz/attempts/?job=${jobId}`,
      `/api/quiz/attempts/`
    ];
    for (const u of tries) {
      console.debug('Trying attempts URL:', u);
      const resp = await _fetchUrlWithAuth(u);
      if (!resp) continue;
      if (resp.ok) {
        const d = resp.data;
        if (Array.isArray(d)) return d;
        if (d && Array.isArray(d.results)) return d.results;
        if (d && Array.isArray(d.attempts)) return d.attempts;
        // if the response is an object with detail (error) return it to caller
        return d;
      }
      if (resp.status === 401 || resp.status === 403) return { error: true, status: resp.status, url: resp.url, data: resp.data };
      // continue trying
    }
    return { error: true, status: 404, detail: 'No matching attempts endpoint found (tried multiple patterns).' };
  }

  async function loadAttemptHistoryAndRender(jobId, fallbackButton) {
    try {
      const resp = await fetchAttemptsForJob(jobId);
      if (!resp) return null;
      if (resp.error) {
        const jobCard = findJobCardElement(jobId, fallbackButton);
        const wr = ensureAttemptContainer(jobCard);
        if (wr) {
          const note = resp.status === 403 ? 'Max attempts reached' : (resp.data?.detail || resp.detail || 'Error loading attempts');
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

  async function fetchAttemptCount(jobId) {
    const tries = [
      `/api/quiz/${jobId}/attempts/`,
      `/api/quiz/attempts/?job_id=${jobId}`,
      `/api/quiz/attempts/?job=${jobId}`,
      `/api/quiz/attempts/`
    ];
    for (const u of tries) {
      console.debug('fetchAttemptCount trying', u);
      const r = await _fetchUrlWithAuth(u);
      if (!r) continue;
      if (r.status === 401) return { error: 'unauthorized', status: 401, raw: r.data };
      if (r.status === 403) {
        const detail = r.data && r.data.detail ? r.data.detail : (typeof r.data === 'string' ? r.data : 'Forbidden');
        return { error: 'forbidden', status: 403, detail };
      }
      if (r.ok) {
        const data = r.data;
        if (Array.isArray(data)) return data.length;
        if (data && Array.isArray(data.results)) return data.results.length;
        if (data && Array.isArray(data.attempts)) return data.attempts.length;
        if (data && Array.isArray(data.data)) return data.data.length;
        if (data && typeof data.total === 'number') return data.total;
        return 0;
      }
    }
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
    } catch (e) {
      console.error('autoSubmitQuiz error', e);
    }
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

      const text = await r.text().catch(() => null);
      if (r.status === 403) {
        let msg = 'Maximum attempts reached';
        try { const parsed = text ? JSON.parse(text) : null; if (parsed && parsed.detail) msg = parsed.detail; } catch (e) { }
        const wrap = document.querySelector('#quiz-questions-wrap');
        if (wrap) wrap.innerHTML = `<div class="text-danger">${escapeHtmlLocal(msg)}</div>`;
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

      const summEl = document.querySelector('#attempt-summary');
      if (summEl) {
        const c = await fetchAttemptCount(jobId);
        if (typeof c === 'number') summEl.textContent = `Attempts: ${c} / 3`;
      }

      stopQuizTimer();
      closeQuizModal();
      showToast('Quiz submitted', 'success', 2500);

    } catch (e) {
      console.error('onQuizSubmit error', e);
      showToast('Network error — try again', 'error');
    }
  }

  function closeQuizModal() {
    const modal = document.querySelector('#quiz-modal');
    if (modal) modal.style.display = 'none';
    try { if (window.__quizTimerHandle) { clearInterval(window.__quizTimerHandle); window.__quizTimerHandle = null; } } catch (e) { }
    const pill = document.querySelector('#quiz-timer'); if (pill) pill.remove();
  }

  function attachQuizButtons() {
    createQuizModal();

    // load attempt history for each job-card present
    document.querySelectorAll('.job-card').forEach(card => {
      const jid = Number(card.dataset.jobId || card.getAttribute('data-job-id') || 0);
      if (jid) loadAttemptHistoryAndRender(jid);
    });

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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachQuizButtons);
  } else {
    attachQuizButtons();
  }
  setTimeout(attachQuizButtons, 1000);

  // expose a few functions
  window.createQuizModal = createQuizModal;
  window.openQuizModal = openQuizModal;
  window.closeQuizModal = closeQuizModal;
  window.onQuizSubmit = onQuizSubmit;
  window.loadAttemptHistoryAndRender = loadAttemptHistoryAndRender;
  window.fetchAttemptCount = fetchAttemptCount;
  window.handleQuizSubmitResponse = handleQuizSubmitResponse;

  console.log('candidate_dashboard.js loaded - quiz helpers registered.');
})();

/* ---------- Attempt history modal (small self-contained widget) ---------- */
(function(){
  function showModalEl() {
    const modal = document.getElementById('attempts-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
  function hideModalEl() {
    const modal = document.getElementById('attempts-modal');
    if (!modal) return;
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  function escapeHtmlX(s){ if (s==null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  async function fetchAttempts(jobId){
    const token = localStorage.getItem('token') || (document.getElementById('tokenInput') && document.getElementById('tokenInput').value.trim());
    const headers = {'Content-Type':'application/json'};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    try {
      const r = await fetch(`/api/quiz/${jobId}/attempts/`, {method:'GET', headers});
      const txt = await r.text().catch(()=>null);
      let data = null;
      try { data = txt ? JSON.parse(txt) : null; } catch(e){ data = txt; }
      if (!r.ok) return { error:true, status:r.status, detail: (data && data.detail) ? data.detail : txt || r.statusText };
      return Array.isArray(data) ? data : (data.results || data.attempts || []);
    } catch (e) {
      console.warn('fetchAttempts error', e);
      return { error:true, detail: String(e) };
    }
  }

  function renderAttemptList(attempts){
    const container = document.getElementById('attempts-list');
    if (!container) return;
    container.innerHTML = '';

    if (!attempts || attempts.length === 0) {
      container.innerHTML = '<div class="small-muted">No attempts yet.</div>';
      return;
    }

    const table = document.createElement('table');
    table.style.width='100%';
    table.style.borderCollapse='collapse';
    table.innerHTML = `
      <thead>
        <tr>
          <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Attempt ID</th>
          <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Finished</th>
          <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Score</th>
          <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Result</th>
          <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Answers</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');

    attempts.slice().sort((a,b)=> new Date(b.finished_at||b.started_at||0) - new Date(a.finished_at||a.started_at||0)).forEach(at => {
      const id = at.attempt_id ?? at.id ?? '';
      const finished = at.finished_at ? new Date(at.finished_at).toLocaleString() : (at.started_at ? new Date(at.started_at).toLocaleString() : '');
      const score = (at.score ?? 0) + ( (at.total && at.total>0) ? ` / ${at.total}` : (at.total_questions?` / ${at.total_questions}`:'') );
      const passed = at.passed ? '<strong style="color:green">Passed</strong>' : '<strong style="color:crimson">Failed</strong>';

      let answersHtml = '';
      if (at.answers) {
        try {
          answersHtml = '<pre style="white-space:pre-wrap;margin:0;padding:0;font-size:.9rem;">' + escapeHtmlX(typeof at.answers === 'string' ? at.answers : JSON.stringify(at.answers, null, 2)) + '</pre>';
        } catch(e){ answersHtml = escapeHtmlX(String(at.answers)); }
      } else if (at.data && at.data.answers) {
        answersHtml = '<pre style="white-space:pre-wrap;margin:0;padding:0;font-size:.9rem;">' + escapeHtmlX(JSON.stringify(at.data.answers, null, 2)) + '</pre>';
      } else {
        answersHtml = '<span class="small-muted">—</span>';
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:8px;border-bottom:1px solid #f2f2f2;vertical-align:top">${escapeHtmlX(id)}</td>
        <td style="padding:8px;border-bottom:1px solid #f2f2f2;vertical-align:top">${escapeHtmlX(finished)}</td>
        <td style="padding:8px;border-bottom:1px solid #f2f2f2;vertical-align:top">${escapeHtmlX(score)}</td>
        <td style="padding:8px;border-bottom:1px solid #f2f2f2;vertical-align:top">${passed}</td>
        <td style="padding:8px;border-bottom:1px solid #f2f2f2;vertical-align:top">${answersHtml}</td>
      `;
      tbody.appendChild(tr);
    });

    container.appendChild(table);
  }

  async function openAttemptHistoryModal(jobId) {
    const title = document.getElementById('attempts-modal-title');
    const loading = document.getElementById('attempts-loading');
    const list = document.getElementById('attempts-list');

    if (title) title.textContent = 'Attempt history — job ' + jobId;
    if (loading) { loading.style.display = 'block'; loading.textContent = 'Loading attempts…'; }
    if (list) { list.style.display = 'none'; list.innerHTML = ''; }

    showModalEl();

    const data = await fetchAttempts(jobId);
    if (loading) loading.style.display = 'none';

    if (data && data.error) {
      if (list) { list.style.display = 'block'; list.innerHTML = `<div class="text-danger">Error loading attempts: ${escapeHtmlX(data.detail || 'Unknown')}</div>`; }
      return;
    }
    renderAttemptList(data);
    if (list) list.style.display = 'block';
  }

  function attachViewHandlers(){
    document.querySelectorAll('.view-attempts-btn').forEach(btn=>{
      if (btn.__attemptAttached) return;
      btn.__attemptAttached = true;
      btn.addEventListener('click', (e)=>{
        const jid = Number(btn.dataset.jobId || btn.getAttribute('data-job-id'));
        if (!jid) { alert('Missing job id'); return; }
        openAttemptHistoryModal(jid);
      });
    });
  }

  document.addEventListener('click', function(e){
    if (e.target && (e.target.id === 'attempts-modal-close' || e.target.id === 'attempts-modal-ok')) {
      hideModalEl();
    }
    const modal = document.getElementById('attempts-modal');
    if (modal && e.target === modal) hideModalEl();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachViewHandlers);
  } else {
    attachViewHandlers();
  }
  window.openAttemptHistoryModal = openAttemptHistoryModal;
})();

/* ---------- Invites: load + respond + start wiring ---------- */
// FRONTEND candidate UI page route (change if your frontend route differs)
// invites_interview_helpers.js
// Requires: apiFetch (from utils.js), bootstrap, showToast, showSpinner, escapeHtml helpers present globally.
// If you don't have escapeHtml/showToast etc, quickly add minimal implementations.

const FRONTEND_INTERVIEW_PAGE = (id, inviteId) =>
  `/interviews/page/candidate/${encodeURIComponent(id)}/?invite=${encodeURIComponent(inviteId || '')}`;

const FRONTEND_INTERVIEW_START_HELPER = (id, inviteId) =>
  `/interviews/frontend/start/${encodeURIComponent(id)}/?invite=${encodeURIComponent(inviteId || '')}`;

/* small html escape fallback (if not already present) */
if (typeof escapeHtml !== 'function') {
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"'`]/g, m =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#x60;' })[m]
    );
  }
}

/* minimal showToast fallback if missing */
if (typeof showToast !== 'function') {
  window.showToast = function (msg, type='info', timeout=3000) {
    console.log('TOAST', type, msg);
    // no UI fallback here; assume real showToast exists.
  };
}

/* minimal spinner fallback */
if (typeof showSpinner !== 'function') {
  window.showSpinner = function (on, text='') { /* noop */ };
}

/* ---------- Open Invites Modal ---------- */
async function openInvitesModal() {
  const mEl = document.getElementById('invitesModal');
  const listEl = document.getElementById('invitesListModal');
  if (!mEl || !listEl) {
    alert('Invites modal DOM missing (add #invitesModal and #invitesListModal elements).');
    return;
  }

  try {
    new bootstrap.Modal(mEl, { backdrop: 'static' }).show();
  } catch (e) {
    mEl.style.display = 'block';
  }

  listEl.innerHTML = '<div class="text-muted small">Loading invites...</div>';

  const tries = [
    '/api/interviews/candidate/invites/',
    '/api/interviews/invites/candidate/',
    '/api/interviews/candidate/invites',
    '/api/interviews/invites/',
  ];

  let data = null;
  for (const u of tries) {
    try {
      const res = await apiFetch(u, { method: 'GET' });
      if (!res) continue;
      if (res.status === 401 || res.status === 403) {
        listEl.innerHTML = '<div class="text-danger">Authentication required. Paste token and Save.</div>';
        return;
      }
      if (!res.ok) continue;
      data = Array.isArray(res.data) ? res.data : (res.data?.results || res.data?.invitations || []);
      break;
    } catch (e) {
      console.warn('openInvitesModal fetch error', u, e);
      continue;
    }
  }

  if (!data || data.length === 0) {
    listEl.innerHTML = '<div class="text-muted">No invites found.</div>';
    return;
  }

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

  // wire buttons
  listEl.querySelectorAll('.modal-accept').forEach(b => {
    b.addEventListener('click', async () => {
      b.disabled = true;
      const r = await respondInvite(b.dataset.id, 'accept');
      if (r && r.ok) showToast('Accepted', 'success'); else showToast('Accept failed', 'error');
      setTimeout(openInvitesModal, 400);
    });
  });

  listEl.querySelectorAll('.modal-decline').forEach(b => {
    b.addEventListener('click', async () => {
      b.disabled = true;
      const r = await respondInvite(b.dataset.id, 'decline');
      if (r && r.ok) showToast('Declined', 'success'); else showToast('Decline failed', 'error');
      setTimeout(openInvitesModal, 400);
    });
  });

  listEl.querySelectorAll('.modal-start').forEach(b => {
    b.addEventListener('click', async () => {
      b.disabled = true;
      const iid = b.dataset.interviewId;
      const inviteId = b.dataset.inviteId;
      // prefer to open frontend login-required helper that will create attempt and redirect
      await startInterview(iid, inviteId);
      try { bootstrap.Modal.getInstance(document.getElementById('invitesModal')).hide(); } catch (e) {}
      b.disabled = false;
    });
  });
}

/* ---------- Inline invites (dashboard section) ---------- */
async function loadInvites() {
  const container = document.getElementById('invitesSection');
  const listEl = document.getElementById('invitesList');
  if (!listEl || !container) return;
  listEl.innerHTML = '<div class="small-muted">Loading invites...</div>';
  container.style.display = 'block';

  const tries = [
    '/api/interviews/candidate/invites/',
    '/api/interviews/invites/candidate/',
    '/api/interviews/candidate/invites',
    '/api/interviews/invites/',
  ];

  let data = null;
  for (const u of tries) {
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

  // wire
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
      const iid = btn.dataset.interviewId;
      const inviteId = btn.dataset.inviteId;
      await startInterview(iid, inviteId);
      btn.disabled = false;
    });
  });
}

/* ---------- Respond Invite (form encoded to avoid 415) ---------- */
async function respondInvite(inviteId, action) {
  if (!inviteId || !action) return { ok: false };
  try {
    // form-encoded payload — backend accepts 'response' or 'action' in views
    const form = new URLSearchParams();
    // use 'response' first (view accepts both); backend checks for both keys
    form.append('response', action);

    const res = await apiFetch(`/api/interviews/candidate/invites/${encodeURIComponent(inviteId)}/respond/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    return res;
  } catch (e) {
    console.error('respondInvite error', e);
    return { ok: false, error: e };
  }
}

/* ---------- Start Interview (open login-required frontend helper) ---------- */
// Robust startInterview helper
async function startInterview(interviewId, inviteId) {
  if (!interviewId) {
    showToast('Invalid interview id', 'error');
    return { ok: false };
  }

  // build URLs
  const frontendHelper = `/interviews/frontend/start/${encodeURIComponent(interviewId)}/?invite=${encodeURIComponent(inviteId || '')}`;
  const attemptsPageBase = (attemptId) => `/attempts/${encodeURIComponent(attemptId)}/`;
  const apiStart = `/api/interviews/candidate/${encodeURIComponent(interviewId)}/start/`;

  try {
    showSpinner(true, 'Opening interview...');

    // 1) HEAD check to frontend helper — quick check to avoid opening 404/login redirect
    try {
      const headResp = await fetch(frontendHelper, { method: 'HEAD', credentials: 'same-origin' });
      // Note: if server redirects to login, many servers respond 302; treat 2xx-3xx as "openable"
      if (headResp && headResp.status >= 200 && headResp.status < 400) {
        window.open(frontendHelper, '_blank', 'noopener,noreferrer');
        showSpinner(false);
        return { ok: true, url: frontendHelper, method: 'frontend_helper' };
      }
      console.debug('frontend helper HEAD status:', headResp && headResp.status, frontendHelper);
    } catch (headErr) {
      console.debug('frontend helper HEAD failed (CORS/network or not found):', headErr, frontendHelper);
      // continue to API fallback
    }

    // 2) API fallback: try POST start via token-based API
    try {
      const apiRes = await apiFetch(apiStart, { method: 'POST' });
      console.debug('API start response:', apiRes);

      if (apiRes && apiRes.ok) {
        // If API returned a join/redirect url — open it
        const join = apiRes.data?.redirect_url || apiRes.data?.url || apiRes.data?.join_url || apiRes.data?.redirect || null;
        if (join) {
          window.open(join, '_blank', 'noopener,noreferrer');
          showSpinner(false);
          return { ok: true, url: join, method: 'api_provided_url' };
        }

        // If API returned attempt id or created object, try to open attempts page
        const attemptId = apiRes.data?.id || apiRes.data?.attempt_id || apiRes.data?.pk || (apiRes.data && apiRes.data.id);
        if (attemptId) {
          const attemptUrl = attemptsPageBase(attemptId);
          window.open(attemptUrl, '_blank', 'noopener,noreferrer');
          showSpinner(false);
          return { ok: true, url: attemptUrl, method: 'api_attempt' };
        }

        // Success but no URL/ID — still consider ok (server may expect redirect flow)
        showToast('Interview started (no URL returned)', 'success');
        showSpinner(false);
        return { ok: true, method: 'api_ok_no_url' };
      } else {
        // not ok — capture status & body for debugging
        console.warn('API start failed', apiRes);
        // If API returned 401/403, it means token missing/invalid
        if (apiRes && (apiRes.status === 401 || apiRes.status === 403)) {
          showToast('Auth required to start via API. Save token or login in browser and try Start Interview again.', 'error', 6000);
        } else {
          showToast('Failed to start interview via API.', 'error', 5000);
        }
      }
    } catch (apiErr) {
      console.error('API start exception', apiErr);
    }

    // 3) Final fallback: try opening frontend helper anyway so dev can see Django 404 page
    try {
      window.open(frontendHelper, '_blank', 'noopener,noreferrer');
      showSpinner(false);
      return { ok: false, url: frontendHelper, method: 'final_frontend_open' };
    } catch (e) {
      console.error('final open failed', e);
      showSpinner(false);
      return { ok: false, error: e };
    }

  } catch (err) {
    showSpinner(false);
    console.error('startInterview overall error', err);
    showToast('Error starting interview. Check console/network for details.', 'error', 6000);
    return { ok: false, error: err };
  } finally {
    try { showSpinner(false); } catch (e) {}
  }
}

/* ---------- Expose globals & attach triggers ---------- */
window.openInvitesModal = openInvitesModal;
window.loadInvites = loadInvites;
window.respondInvite = respondInvite;
window.startInterview = startInterview;

// attach click handler for any [data-open-invites-modal] element
document.addEventListener('click', function (e) {
  const t = e.target.closest && e.target.closest('[data-open-invites-modal]');
  if (!t) return;
  e.preventDefault();
  openInvitesModal();
}, false);

// On page ready, attempt to load inline invites section if present
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { setTimeout(loadInvites, 200); });
} else {
  setTimeout(loadInvites, 200);
}




/* ---------- End file ---------- */
