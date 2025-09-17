// candidate_dashboard.js - improved + hardened version
// candidate_dashboard.js
import { fetchWithAuth, apiFetchAsJson as apiFetch,saveTokens,getAccessToken,clearTokens,getAccessToken} from './utils.js';

async function initCandidateDashboard() {
  // candidate specific init code
  console.log("Candidate dashboard initialized");

  // Example: auto-fetch jobs
  const jobs = await apiFetchAsJson('/resumes/jobs/',{method:'GET'});
  if(!)
  console.log(jobs);
}

document.addEventListener("DOMContentLoaded", initCandidateDashboard);

/* ---------- Config ---------- */
const APPLY_URL = '/api/resumes/apply/';
const JOBS_URL = '/api/jobs/';
const MY_RESUMES_URL = '/api/resumes/my-resumes/';
const UPLOAD_URL = '/api/resumes/upload/';
const SHORTLIST_URL = '/api/resumes/shortlist/';
const APPLICATIONS_URL = '/api/resumes/applications/'; // used by recruiter + candidate fallbacks
const tries=['/api/resumes/applications/'];

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

  container.innerHTML = '';
  jobs.forEach(j => {
    const card = document.createElement('div');
    card.className = 'list-group-item job-card d-flex justify-content-between align-items-center';
    // attach job to element for highlight logic
    card._job = j;
    // NOTE: View button now calls viewJob(j.id) which fetches API and shows modal
    card.innerHTML = `
      <div>
        <strong>${escapeHtml(j.title)}</strong>
        <div class="small-muted">${escapeHtml(j.company || '')} • ${escapeHtml(j.skills_required || '')}</div>
      </div>
      <div>
        <button class="btn btn-sm btn-outline-primary me-1" onclick="viewJob(${j.id})">View</button>
        <button class="btn btn-sm btn-success" onclick="openApplyModal(${j.id})">Apply</button>
      </div>
    `;
    container.appendChild(card);
  });
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
    const res = await apiFetch(APPLY_URL, { method:'POST', body: { job_id: jobId, resume_id: resumeId, message }});
    console.log('apply_for_job response:', res);

    if (res.ok) {
      showToast('Applied successfully', 'success', 3000);
      // hide modal gracefully
      try {
        const modalEl = document.getElementById('applyModal');
        if (modalEl) {
          const inst = (window.bootstrap && window.bootstrap.Modal) ? bootstrap.Modal.getInstance(modalEl) : null;
          if (inst) inst.hide();
          else if (window.bootstrap && window.bootstrap.Modal) {
            const tmp = new bootstrap.Modal(modalEl, { backdrop: 'static' });
            tmp.hide();
          } else {
            modalEl.style.display = 'none';
          }
        }
      } catch (err) { console.warn('Could not hide modal automatically:', err); }

      // refresh UI
      try { refreshResumes(); } catch(e) { console.warn(e); }
      try {
        const appsEl = document.getElementById('applicationsList');
        if (appsEl && selectedJob && Number(selectedJob.id) === Number(jobId)) {
          loadApplicationsForJob(jobId);
        }
      } catch(e) { console.warn(e); }
    } else {
      if (res.status === 409 && res.data) {
        if (typeof res.data === 'object' && res.data.application) {
          const a = res.data.application;
          const at = a.applied_at || '';
          const st = a.status || '';
          showToast(`Already applied — status: ${st} (applied: ${at})`, 'info', 7000);
        } else {
          const detail = res.data.detail || JSON.stringify(res.data);
          showToast('Already applied: ' + detail, 'info', 7000);
        }
      } else {
        const msg = (res.data && (res.data.detail || JSON.stringify(res.data))) || `Status ${res.status}`;
        showToast('Apply failed: ' + msg, 'error', 7000);
      }
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
// replace existing loadMyApplications() with this
async function loadMyApplications() {
  const el = document.getElementById('myApplicationsList');
  if (!el) return;
  el.innerHTML = '<div class="small-muted">Loading your applications...</div>';

  // helper: try decode JWT (Bearer) to get user id/username
  function decodeJwtPayload(token) {
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const payload = parts[1].replace(/-/g,'+').replace(/_/g,'/');
      const json = decodeURIComponent(atob(payload).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(json);
    } catch (e) { return null; }
  }

  // get token and try decode
  const token = getToken();
  let currentUserId = null;
  let currentUsername = null;
  if (token) {
    const payload = decodeJwtPayload(token.replace(/^Bearer\s+/i, ''));
    if (payload) {
      // try common claim names
      currentUserId = payload.user_id || payload.user || payload.id || payload.sub || null;
      currentUsername = payload.username || payload.user_name || payload.email || null;
    }
  }

  // Try server endpoints in order; prefer ones that may filter server-side
  const tries = [
    '/api/resumes/applications/?mine=true',
    '/api/resumes/applications/?candidate=true',
    '/api/resumes/applications/?user=me',
    '/api/resumes/applications/'  // last resort
  ];

  let res = null;
  for (const url of tries) {
    try {
      res = await apiFetch(url);
      // if 401/403, exit with helpful message
      if (res && (res.status === 401 || res.status === 403)) {
        el.innerHTML = `<div class="small-muted">Authentication required to view applications. Paste token above and save.</div>`;
        return;
      }
      // success or array response — break
      if (res && (res.ok || Array.isArray(res.data) || res.data?.applications || res.data?.results)) break;
    } catch (e) {
      // ignore and try next
    }
  }

  if (!res) { el.innerHTML = `<div class="small-muted">Failed to fetch (no response)</div>`; return; }
  if (!res.ok && !Array.isArray(res.data) && !res.data?.applications && !res.data?.results) {
    el.innerHTML = `<div class="small-muted">Failed to load applications (${res.status})</div>`;
    return;
  }

  // normalize apps array
  let apps = Array.isArray(res.data) ? res.data : (res.data?.applications || res.data?.results || []);
  if (!apps || !Array.isArray(apps)) apps = [];

  // If server returned all applications, filter client-side by candidate id/username if available
  if (apps.length > 0 && (currentUserId || currentUsername)) {
    apps = apps.filter(a => {
      // possible fields for candidate in response:
      // a.candidate (id), a.candidate_id, a.candidate_username, a.candidate_name, a.user, a.user_id
      const candId = a.candidate || a.candidate_id || a.user_id || (a.candidate && a.candidate.id) || null;
      const candUsername = a.candidate_username || a.candidate_name || a.user || (a.candidate && a.candidate.username) || null;

      if (currentUserId && candId) {
        // compare numbers or strings robustly
        try {
          if (String(candId) === String(currentUserId)) return true;
        } catch(e) {}
      }
      if (currentUsername && candUsername) {
        if (String(candUsername).toLowerCase() === String(currentUsername).toLowerCase()) return true;
      }
      // also if application contains `resume` and resume belongs to current user (if resume.user present)
      if (a.resume && (a.resume.user || a.resume.user_id)) {
        if (currentUserId && String(a.resume.user || a.resume.user_id) === String(currentUserId)) return true;
      }
      return false;
    });
  }

  if (!apps.length) { el.innerHTML = `<div class="small-muted">You have not applied to any jobs yet.</div>`; return; }

  // render
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
          <div class="small-muted">Applied: ${escapeHtml(appliedAt)} • Status: <span class="badge ${status === 'shortlisted' ? 'bg-success' : (status === 'rejected'? 'bg-danger':'bg-secondary')}">${escapeHtml(status)}</span></div>
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
