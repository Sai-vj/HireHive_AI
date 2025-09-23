// candidate_dashboard_cleaned_chunk1.js
// Cleaned first ~500 lines of candidate_dashboard.js
// - Removed duplicated functions
// - Unified quiz submit handler (use window.onQuizSubmit)
// - Single escapeHtml implementation attached to window
// - Defensive DOM checks
// - Exported commonly used functions to window for inline calls

// Imports (adjust path to your utils.js)
import { fetchWithAuth, apiFetchAsJson as apiFetch, saveTokens, getAccessToken, clearTokens } from './utils.js';

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

/* ---------- Utility: escapeHtml (single canonical) ---------- */
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>\"'`]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#x60;' })[m]);
}
window.escapeHtml = escapeHtml;

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

/* Toast (canonical): uses escapeHtml */
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
window.showToast = showToast;

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

/* Toggle buttons loading state */
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

/* ---------- Jobs & matches (loadJobs kept concise) ---------- */
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
    card.setAttribute('data-job-id', j.id);

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

/* ---------- Export some global helpers ---------- */
window.refreshResumes = refreshResumes;
window.loadJobs = loadJobs;
window.deleteResume = deleteResume;

/* end of cleaned chunk 1 */
