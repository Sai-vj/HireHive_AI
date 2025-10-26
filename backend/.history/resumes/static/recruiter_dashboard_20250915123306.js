// static/recruiter_dashboard.js
import { apiFetchAsJson, fetchWithAuth } from '/static/utils.js';
ss
const res = await apiFetchAsJson('/resumes/api/jobs/'); 
// after login success
saveTokens({ access: tokenData.access, refresh: tokenData.refresh });
// then redirect to dashboards
const token = getToken();
if (!token) {
  window.location.href = "/login/";
} 

/* ---------- tiny UI helpers ---------- */
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
  div.querySelector('button').onclick = () => div.remove();
  setTimeout(()=> { try { div.remove(); } catch(e){} }, timeout);
}

function showSpinner(on, text='') {
  let el = document.getElementById('globalSpinner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'globalSpinner';
    el.style = 'position:fixed;left:0;right:0;top:0;bottom:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.6);z-index:2000;';
    el.innerHTML = `<div style="text-align:center;"><div class="spinner-border" role="status" style="width:3rem;height:3rem"></div><div id="globalSpinnerText" style="margin-top:8px;font-weight:600"></div></div>`;
    document.body.appendChild(el);
  }
  el.style.display = on ? 'flex' : 'none';
  const textEl = document.getElementById('globalSpinnerText');
  if (textEl) textEl.innerText = text || '';
}

function getToken() {
  return localStorage.getItem('token') || (document.getElementById('tokenInput') && document.getElementById('tokenInput').value.trim());
}
function saveToken(val) {
  if (!val) return;
  localStorage.setItem('token', val);
  document.getElementById('tokenStatus') && (document.getElementById('tokenStatus').innerText = 'Token saved');
  showToast('Token saved', 'success');
}

/* disable main buttons while network actions */
function toggleButtons(disable) {
  ['refreshJobs','addJobBtn','showMatchesBtn','showShortlistsBtn','showApplicationsBtn','refreshAppsBtn','exportAppsBtn'].forEach(id => {
    const b = document.getElementById(id);
    if (!b) return;
    b.disabled = !!disable;
    if (disable) b.classList.add('btn-loading'); else b.classList.remove('btn-loading');
  });
}

/* ---------- API wrapper ---------- 
async function apiFetch(path, opts = {}) {
  showSpinner(true);
  toggleButtons(true);
  try {
    opts.headers = opts.headers || {};
    opts.headers['Accept'] = 'application/json';
    const token = getToken();
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;

    if (opts.body && !(opts.body instanceof FormData) && typeof opts.body === 'object') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }

    const resp = await apiFetch(path, opts);
    const text = await resp.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch(e) { data = text; }

    if (resp.status === 401 || resp.status === 403) {
      localStorage.removeItem('token');
      showToast('Not authorized (401/403). Paste a valid token and retry.', 'error', 5000);
    }
    return { ok: resp.ok, status: resp.status, data };
  } catch (err) {
    console.error('apiFetch network error', err);
    showToast('Network error', 'error');
    return { ok:false, status:0, data:null };
  } finally {
    toggleButtons(false);
    showSpinner(false);
  }
} */

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
  if (!jobs.length) {
    container.innerHTML = `<div class="small-muted">No jobs available</div>`;
    return;
  }
  container.innerHTML = '';
  jobs.forEach(j => {
    const a = document.createElement('a');
    a.className = 'list-group-item list-group-item-action job-card';
    a.style.cursor = 'pointer';
    a.dataset.jobId = j.id; // set data attribute to help selection
    a.innerHTML = `<div><strong>${escapeHtml(j.title)}</strong><div class="small-muted">${escapeHtml(j.company || '')} • ${escapeHtml(j.skills_required || '')}</div></div>`;
    a.onclick = () => selectJob(j);
    container.appendChild(a);
  });

  // optional: auto-select first job so recruiter doesn't have to click first
  // Comment this out if you prefer no auto select.
  // if (!selectedJob && jobs.length) selectJob(jobs[0]);
}

/* selected job state */
let selectedJob = null;
function selectJob(j) {
  selectedJob = j;
  document.getElementById('noJob') && (document.getElementById('noJob').style.display = 'none');
  document.getElementById('jobDetails') && (document.getElementById('jobDetails').style.display = 'block');
  const title = document.getElementById('selectedJobTitle'); if (title) title.innerText = j.title || '';
  const meta = document.getElementById('jobMeta'); if (meta) meta.innerText = `${j.company || ''} • Experience required: ${j.experience_required || 0}`;
  // hide match/shortlist/applications panels until user asks
  document.getElementById('matchesSection') && (document.getElementById('matchesSection').style.display = 'none');
  document.getElementById('shortlistSection') && (document.getElementById('shortlistSection').style.display = 'none');
  document.getElementById('applicationsSection') && (document.getElementById('applicationsSection').style.display = 'none');
  // clear lists
  document.getElementById('matchesList') && (document.getElementById('matchesList').innerHTML = '');
  document.getElementById('shortlistList') && (document.getElementById('shortlistList').innerHTML = '');
  document.getElementById('applicationsList') && (document.getElementById('applicationsList').innerHTML = '');

  // visually highlight selected job card
  document.querySelectorAll('#jobsList .job-card').forEach(el => {
    if (el.dataset && String(el.dataset.jobId) === String(j.id)) el.classList.add('active');
    else el.classList.remove('active');
  });
}

/* ---------- Create job (modal) ---------- */
function openAddJobModal() {
  const modalEl = document.getElementById('addJobModal');
  if (!modalEl) return;
  const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
  const form = document.getElementById('addJobForm');
  if (form) form.reset();
  modal.show();
}

async function submitAddJob(e) {
  if (e && e.preventDefault) e.preventDefault();
  const title = (document.getElementById('jobTitle')?.value || '').trim();
  const company = (document.getElementById('jobCompany')?.value || '').trim();
  const skills = (document.getElementById('jobSkills')?.value || '').trim();
  const experience = Number(document.getElementById('jobExperience')?.value || 0);
  const vacancies = Number(document.getElementById('jobVacancies')?.value || 1);
  const description = (document.getElementById('jobDescription')?.value || '').trim();

  if (!title) return showToast('Title required', 'error');

  const payload = { title, company, skills_required: skills, experience_required: experience, vacancies, description };
  const res = await apiFetch('/api/resumes/jobs/', { method: 'POST', body: payload });
  if (!res.ok) {
    showToast('Create job failed: ' + (res.data?.detail || res.status), 'error', 6000);
    return;
  }
  showToast('Job created', 'success');
  // hide modal
  const modalEl = document.getElementById('addJobModal');
  bootstrap.Modal.getInstance(modalEl)?.hide();
  loadJobs();
}

/* ---------- Matches ---------- */
async function showMatchesForSelectedJob() {
  if (!selectedJob) return showToast('Select job first', 'error');
  const res = await apiFetch(`/api/resumes/jobs/${selectedJob.id}/match`);
  const listEl = document.getElementById('matchesList');
  if (!listEl) return;
  if (!res.ok) { listEl.innerHTML = `<div class="small-muted">Failed to load matches (${res.status})</div>`; return; }
  const matches = res.data?.matched_resumes || res.data || [];
  listEl.innerHTML = '';
  if (!matches.length) { listEl.innerHTML = `<div class="small-muted">No matches found.</div>`; document.getElementById('matchesSection').style.display = 'block'; return; }

  matches.forEach(m => {
    const scoreRaw = m.score ?? m.score_percent ?? m.embedding_score ?? (Array.isArray(m) ? m[0] : 0);
    let score = parseFloat(scoreRaw) || 0;
    if (score > 0 && score <= 1) score = Math.round(score * 100);
    score = Number.isFinite(score) ? Math.round(score) : 0;

    const badge = score >= 75 ? 'bg-success' : (score >= 50 ? 'bg-warning text-dark' : 'bg-danger');

    const card = document.createElement('div');
    card.className = 'card mb-2 p-2';
    card.innerHTML = `
      <div class="d-flex justify-content-between">
        <div>
          <strong>${escapeHtml(m.user || m.username || 'candidate')}</strong> — ${escapeHtml(m.experience || 0)} yrs
          <div class="small-muted">skills: ${escapeHtml(m.skills || '')}</div>
          <div class="small-muted">missing: ${escapeHtml((m.missing_skills || []).join(', '))}</div>
        </div>
        <div style="text-align:right;">
          <span class="badge ${badge}" style="font-size:1rem;padding:0.6rem 0.8rem;">${score}%</span>
          <div style="margin-top:8px;">
            <button class="btn btn-sm btn-primary" onclick="shortlist(${selectedJob.id}, ${m.resume_id || m.id || 0})">Shortlist</button>
          </div>
        </div>
      </div>`;
    listEl.appendChild(card);
  });
  document.getElementById('matchesSection').style.display = 'block';
}

/* ---------- Applications (Recruiter) ---------- */
/* --- robust applications loader with debug/logging --- */
// robust loader for applications - replace existing loadApplicationsForSelectedJob()
async function loadApplicationsForSelectedJob() {
  if (!selectedJob) {
    console.warn('loadApplicationsForSelectedJob: no selectedJob');
    return showToast('Select job first', 'error');
  }
  const listEl = document.getElementById('applicationsList');
  if (!listEl) {
    console.warn('loadApplicationsForSelectedJob: missing #applicationsList element');
    return showToast('Applications container missing in HTML', 'error');
  }

  listEl.innerHTML = '<div class="small-muted">Loading applications...</div>';
  console.log('Loading applications for job id=', selectedJob.id);

  // try endpoint shapes
  const urlsToTry = [
    `/api/resumes/applications/?job_id=${encodeURIComponent(selectedJob.id)}`,
    `/api/resumes/jobs/${encodeURIComponent(selectedJob.id)}/applications/`,
    `/api/applications/?job_id=${encodeURIComponent(selectedJob.id)}`,
  ];

  let res = null;
  for (const url of urlsToTry) {
    try {
      console.log('Trying', url);
      res = await apiFetch(url);
      console.log('Response for', url, res);
      if (res && res.ok) break; // success
      // if 404/401/403 try next
    } catch (e) {
      console.error('Error fetching', url, e);
    }
  }

  if (!res) {
    listEl.innerHTML = `<div class="small-muted">Failed to fetch applications (no response)</div>`;
    return;
  }
  if (!res.ok) {
    listEl.innerHTML = `<div class="small-muted">Failed to load applications (${res.status})</div>`;
    // show detailed server message in console
    console.warn('Applications fetch failed:', res);
    return;
  }

  // normalize data into array `apps`
  let apps = [];
  if (Array.isArray(res.data)) apps = res.data;
  else if (res.data && Array.isArray(res.data.applications)) apps = res.data.applications;
  else if (res.data && Array.isArray(res.data.results)) apps = res.data.results;
  else if (res.data && Array.isArray(res.data.data)) apps = res.data.data;
  else if (res.data && typeof res.data === 'object') {
    // maybe server returned { applications: {...} } or single object
    // try to extract top-level array-like properties
    for (const k of ['applications','results','data','items']) {
      if (Array.isArray(res.data[k])) { apps = res.data[k]; break; }
    }
    if (!apps.length) {
      // last resort: if object keys are numeric
      const keys = Object.keys(res.data).filter(x => /^\d+$/.test(x));
      if (keys.length) apps = keys.map(k => res.data[k]);
    }
  }

  if (!apps || apps.length === 0) {
    listEl.innerHTML = `<div class="small-muted">No applications yet.</div>`;
    return;
  }

  // render each app (flexible field mapping)
  listEl.innerHTML = '';
  apps.forEach(a => {
    // flexible mapping
    const id = a.id || a.application_id || a.pk || null;
    const resume_id = a.resume_id || (a.resume && (a.resume.id || a.resume)) || (a.resume_pk) || '';
    const resume_file = a.resume_file || (a.resume && a.resume.file) || a.file || '';
    const candidate_name = a.candidate_name || a.candidate || a.user || a.username || a.applicant || a.applicant_name || '';
    const candidate_email = a.candidate_email || a.email || a.user_email || '';
    const message = a.message || a.notes || a.note || '';
    const status = a.status || a.application_status || (a.state) || '';
    const applied_at = a.applied_at || a.created_at || a.created || '';

    // build card
    const card = document.createElement('div');
    card.className = 'card mb-2 p-2';
    card.innerHTML = `
      <div class="d-flex justify-content-between align-items-start">
        <div style="min-width:0;">
          <strong>${escapeHtml(candidate_name || `Resume ${resume_id || ''}`)}</strong>
          ${candidate_email ? `<div class="small-muted">Email: ${escapeHtml(candidate_email)}</div>` : ''}
          <div class="small-muted">Resume: ${resume_file ? `<a href="${resume_file}" target="_blank">#${escapeHtml(String(resume_id))}</a>` : escapeHtml(String(resume_id))} • Applied: ${escapeHtml(String(applied_at||''))}</div>
          <div class="small-muted">Message: ${escapeHtml(message || '')}</div>
        </div>
        <div style="min-width:180px;text-align:right;">
          <div class="mb-1"><span class="badge ${status === 'shortlisted' ? 'bg-success' : (status === 'rejected' ? 'bg-danger' : 'bg-secondary')}">${escapeHtml(String(status||''))}</span></div>
          <div>
            ${resume_file ? `<a class="btn btn-sm btn-outline-primary me-1" href="${resume_file}" target="_blank">View</a>` : ''}
            <button class="btn btn-sm btn-primary" onclick="shortlist(${selectedJob.id}, ${resume_id || 0})">Shortlist</button>
            <button class="btn btn-sm btn-outline-danger" onclick="changeApplicationStatus(${id}, 'rejected')">Reject</button>
          </div>
        </div>
      </div>`;
    listEl.appendChild(card);
  });

  // reveal section
  document.getElementById('applicationsSection') && (document.getElementById('applicationsSection').style.display = 'block');
}

// open edit modal, prefill fields
function openEditApplicationModal(appObj) {
  let a = appObj;
  if (typeof appObj === 'string') {
    try { a = JSON.parse(appObj); } catch(e){ console.error('parse appObj', e); a = null; }
  }
  if (!a || !a.id) {
    showToast('Application data missing', 'error');
    return;
  }
  document.getElementById('editAppId').value = a.id;
  document.getElementById('editAppStatus').value = a.status || 'pending';
  document.getElementById('editAppNotes').value = a.notes || '';
  const modalEl = document.getElementById('editAppModal');
  const bs = new bootstrap.Modal(modalEl, { backdrop: 'static' });
  bs.show();
}

// submit patch to application endpoint
async function submitEditApplication(e) {
  e.preventDefault();
  const btn = document.getElementById('editAppSubmit');
  if (btn) btn.disabled = true;
  const appId = document.getElementById('editAppId').value;
  const data = {
    status: document.getElementById('editAppStatus').value,
    notes: document.getElementById('editAppNotes').value
  };
  try {
    const res = await apiFetch(`/api/resumes/applications/${appId}/`, { method: 'PATCH', body: data });
    if (res.ok) {
      showToast('Application updated', 'success');
      bootstrap.Modal.getInstance(document.getElementById('editAppModal'))?.hide();
      loadApplicationsForSelectedJob();
    } else {
      showToast('Update failed: ' + (res.data?.detail || res.status), 'error');
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}


// shortlist action from application card
async function shortlistFromApp(job_id, application_id) {
  if (!job_id || !application_id) return showToast('Invalid', 'error');
  try {
    const res = await apiFetch('/api/resumes/shortlist/', { method:'POST', body: { job_id, application_id }});
    if (res.ok) {
      showToast('Shortlisted', 'success');
      loadApplicationsForSelectedJob();
      showShortlistsForSelectedJob();
    } else {
      showToast('Shortlist failed: ' + (res.data?.detail || res.status), 'error');
    }
  } catch (e) { console.error(e); showToast('Shortlist failed', 'error'); }
}

// change application status
async function changeApplicationStatus(applicationId, newStatus) {
  if (!applicationId) return;
  try {
    const res = await apiFetch(`/api/resumes/applications/${applicationId}/`, { method: 'PATCH', body: { status: newStatus }});
    if (res.ok) {
      showToast('Status updated', 'success');
      loadApplicationsForSelectedJob();
    } else {
      showToast('Update failed: ' + (res.data?.detail || res.status), 'error');
    }
  } catch (e) { console.error(e); showToast('Update failed','error'); }
}

// export applications CSV
async function exportApplicationsCSVForSelectedJob() {
  if (!selectedJob) return showToast('Select job first', 'error');
  const token = getToken();
  const url = `/api/resumes/applications/export/?job_id=${selectedJob.id}`;

  try {
    showSpinner(true, 'Preparing CSV...');
    const headers = { 'Accept': 'text/csv' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      showSpinner(false);
      showToast('Export failed: ' + resp.status, 'error');
      return;
    }
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `applications_job_${selectedJob.id}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
    showSpinner(false);
    showToast('CSV downloaded', 'success');
  } catch (err) {
    showSpinner(false);
    console.error('export CSV error', err);
    showToast('Export failed', 'error');
  }
}
/* ---------- My Applications ---------- */
async function loadMyApplications() {
  const container = document.getElementById('applicationsList');
  if (!container) return;
  container.innerHTML = '<div class="small-muted">Loading applications...</div>';

  const res = await apiFetch('/api/resumes/applications/?me=true');
  if (!res.ok) {
    container.innerHTML = `<div class="small-muted">Failed to load applications (${res.status})</div>`;
    return;
  }
  const apps = res.data || [];
  if (!apps.length) {
    container.innerHTML = '<div class="small-muted">No applications yet.</div>';
    return;
  }

  container.innerHTML = '';
  apps.forEach(a => {
    const jobTitle = escapeHtml(a.job_title || a.job || 'Untitled Job');
    const resume = escapeHtml(a.resume_file ? `<a href="${a.resume_file}" target="_blank">Resume</a>` : `Resume #${a.resume}`);
    const status = escapeHtml(a.status || 'pending');
    const applied = escapeHtml(a.applied_at || '');

    const card = document.createElement('div');
    card.className = 'card mb-2 p-2';
    card.innerHTML = `
      <div class="d-flex justify-content-between align-items-start">
        <div>
          <strong>${jobTitle}</strong>
          <div class="small-muted">Applied: ${applied}</div>
          <div class="small-muted">Status: ${status}</div>
          <div class="small-muted">${resume}</div>
        </div>
      </div>`;
    container.appendChild(card);
  });
}


/* ---------- Shortlist / Shortlist list ---------- */
async function shortlist(job_id, resume_id) {
  if (!job_id || !resume_id) return showToast('Invalid shortlist', 'error');
  const res = await apiFetch('/api/resumes/shortlist/', { method: 'POST', body: { job_id, resume_id } });
  if (res.ok) { showToast('Shortlisted', 'success'); document.getElementById('showShortlistsBtn')?.click(); }
  else if (res.status === 409) showToast('Already shortlisted. Use resend if needed.', 'info');
  else showToast('Shortlist failed: ' + (res.data?.detail || res.status), 'error');
}

async function resend(job_id, resume_id) {
  const res = await apiFetch('/api/resumes/shortlist/', { method: 'POST', body: { job_id, resume_id, resend: true } });
  if (res.ok) showToast('Resend queued', 'success'); else showToast('Resend failed', 'error');
}

async function showShortlistsForSelectedJob() {
  if (!selectedJob) return showToast('Select job first', 'error');
  const res = await apiFetch(`/api/resumes/shortlist/?job_id=${selectedJob.id}`);
  const container = document.getElementById('shortlistList');
  if (!container) return;
  if (!res.ok) { container.innerHTML = `<div class="small-muted">Failed to load shortlist (${res.status})</div>`; return; }
  const list = res.data || [];
  container.innerHTML = '';
  if (!list.length) { container.innerHTML = `<div class="small-muted">No shortlists found.</div>`; return; }
  list.forEach(s => {
    const div = document.createElement('div');
    div.className = 'card mb-2 p-2';
    div.innerHTML = `<div class="d-flex justify-content-between align-items-start">
      <div>
        <strong>Resume #${escapeHtml(s.resume)}</strong> — by ${escapeHtml(s.shortlisted_by)}
        <div class="small-muted">created: ${escapeHtml(s.created_at || '')}</div>
        <div class="small-muted">email_sent: ${escapeHtml(String(s.email_sent || false))} ${s.email_sent_at ? 'at ' + escapeHtml(s.email_sent_at) : ''}</div>
      </div>
      <div>
        <button class="btn btn-sm btn-outline-primary" onclick="resend(${s.job}, ${s.resume})">Resend</button>
        <button class="btn btn-sm btn-outline-danger" onclick="removeShortlist(${s.id})">Remove</button>
      </div>
    </div>`;
    container.appendChild(div);
  });
  document.getElementById('shortlistSection').style.display = 'block';
}

async function removeShortlist(id) {
  if (!id) return showToast('Invalid id', 'error');
  if (!confirm('Remove shortlist?')) return;
  const res = await apiFetch('/api/resumes/shortlist/', { method: 'DELETE', body: { id } });
  if (res.ok) { showToast('Removed', 'success'); document.getElementById('showShortlistsBtn')?.click(); }
  else showToast('Remove failed', 'error');
}

/* ---------- CSV helpers ---------- */
function downloadCSV(content, filename='shortlist.csv') {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
}
async function exportShortlistCSV() {
  if (!selectedJob) return showToast('Select job first', 'error');
  const res = await apiFetch(`/api/resumes/shortlist_export_csv/?job_id=${selectedJob.id}`);
  if (!res.ok) return showToast('Export failed', 'error');
  if (typeof res.data === 'string') {
    downloadCSV(res.data, `shortlist_${selectedJob.id}.csv`);
  } else {
    showToast('Export returned unexpected format', 'error');
  }
}
async function downloadShortlistCsv(jobId) {
  if (!jobId) { showToast('No job selected', 'error'); return; }
  const token = getToken();
  if (!token) { showToast('Paste token first', 'error'); return; }

  try {
    showSpinner(true, 'Preparing CSV...');
    const url = `/api/resumes/shortlist_export_csv/?job_id=${encodeURIComponent(jobId)}`;
    const resp = await fetchWithAuth(url, { headers: { 'Accept': 'text/csv' }});
    if (!resp.ok) {
      const txt = await resp.text().catch(()=>null);
      showToast(`Export failed: ${resp.status} ${txt || ''}`, 'error', 5000);
      return;
    }
    const blob = await resp.blob();
    const filename = `shortlist_job_${jobId}.csv`;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('CSV downloaded', 'success');
  } catch (err) {
    console.error('CSV download error', err);
    showToast('Export error', 'error', 5000);
  } finally {
    showSpinner(false);
  }
}

/* ---------- utils ---------- */
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"'`]/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#x60;' })[m]);
}

/* ---------- Wire buttons used by the applications feature ---------- */
function wireApplicationsButtons() {
  document.getElementById('exportAppsBtn')?.addEventListener('click', exportApplicationsCSVForSelectedJob);
  document.getElementById('refreshAppsBtn')?.addEventListener('click', loadApplicationsForSelectedJob);
  document.getElementById('showApplicationsBtn')?.addEventListener('click', loadApplicationsForSelectedJob);
}

/* ---------- DOM wiring & init ---------- */
(function init() {
  console.log('recruiter dashboard init');

  // token UI
  document.getElementById('saveTokenBtn')?.addEventListener('click', ()=> {
    const v = (document.getElementById('tokenInput') && document.getElementById('tokenInput').value.trim()) || '';
    if (!v) { showToast('Paste token first', 'error'); return; }
    saveToken(v);
  });

  // main actions
  document.getElementById('refreshJobs')?.addEventListener('click', loadJobs);
  document.getElementById('addJobBtn')?.addEventListener('click', openAddJobModal);
  document.getElementById('addJobForm')?.addEventListener('submit', submitAddJob);
  document.getElementById('showMatchesBtn')?.addEventListener('click', showMatchesForSelectedJob);
  document.getElementById('showShortlistsBtn')?.addEventListener('click', showShortlistsForSelectedJob);
  document.getElementById('editAppForm')?.addEventListener('submit',submitEditApplication);
  document.getElementById('myApplicationsBtn')?.addEventListener('click,loadMyApplications');
  // wire extra application-related buttons
  wireApplicationsButtons();

  // wire export shortlist short-cut if present
  document.getElementById('exportCsvBtn')?.addEventListener('click', () => {
    if (!selectedJob) return showToast('Select a job first', 'error');
    downloadShortlistCsv(selectedJob.id);
  });

  const saved = localStorage.getItem('token');
  if (saved && document.getElementById('tokenInput')) document.getElementById('tokenInput').value = saved;

  // initial load
  loadJobs();
})();
