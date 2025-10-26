// static/recruiter_dashboard.js
// recruiter_dashboard.js
import { apiFetchAsJson  as apiFetch,fetchWithAuth} from './utils.js';

async function initRecruiterDashboard() {
  // recruiter specific init
}

document.addEventListener('DOMContentLoaded', initRecruiterDashboard);

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
// recruiter_dashboard.js
// Usage: <script type="module" src="recruiter_dashboard.js"></script>

const API_ROOT = '/api'; // adjust if your API root different
const JOBS_ENDPOINT = `${API_ROOT}/jobs/`; // GET list, POST create
const TOKEN_KEY = 'recruiter_token_v1';

function showToast(msg, type='info', ms=2500) {
  const container = document.getElementById('toastContainer') || document.body;
  const el = document.createElement('div');
  el.innerHTML = `<div style="padding:10px 14px;border-radius:8px;background:${type==='error'?'#f8d7da':type==='success'?'#d1e7dd':'#fff8d6'};border:1px solid #ddd;margin-bottom:8px">${msg}</div>`;
  container.appendChild(el);
  setTimeout(()=> el.remove(), ms);
}

function savedToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

function setSavedToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

/* =========================
   DOM helpers & small utils
   ========================= */
function qs(sel, root=document) { return root.querySelector(sel); }
function qsa(sel, root=document) { return Array.from(root.querySelectorAll(sel)); }
function el(tag, opts={}) {
  const e = document.createElement(tag);
  Object.entries(opts).forEach(([k,v])=>{
    if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v);
  });
  return e;
}

function authHeaders() {
  const t = savedToken();
  return t ? { 'Authorization': `Bearer ${t}` } : {};
}

async function apiFetch(url, opts={}) {
  opts.headers = Object.assign({'Content-Type':'application/json'}, opts.headers || {}, authHeaders());
  try {
    const r = await fetch(url, opts);
    if (r.status === 401) {
      showToast('Unauthorized — token invalid or expired', 'error', 3000);
      return { error: true, status: 401, raw: null };
    }
    const txt = await r.text().catch(()=>null);
    let json = null;
    try { json = txt ? JSON.parse(txt) : null; } catch(e){ json = null; }
    return { ok: r.ok, status: r.status, data: json, text: txt };
  } catch (e) {
    console.error('apiFetch error', e);
    return { error:true, exception: String(e) };
  }
}

/* =========================
   JOBS: load, render, create, edit, delete
   ========================= */

async function loadJobs() {
  const list = document.getElementById('jobsList');
  if (!list) return;
  list.innerHTML = '<div class="small-muted">Loading jobs…</div>';
  const res = await apiFetch(JOBS_ENDPOINT, { method: 'GET' });
  if (res.error) {
    list.innerHTML = `<div class="text-danger">Error loading jobs</div>`;
    return;
  }
  if (!res.ok || !Array.isArray(res.data)) {
    list.innerHTML = `<div class="text-danger">No jobs available</div>`;
    return;
  }
  list.innerHTML = '';
  res.data.forEach(job => {
    const row = document.createElement('div');
    row.className = 'list-group-item';
    row.dataset.jobId = job.id;
    row.innerHTML = `
      <div class="d-flex w-100 justify-content-between align-items-start">
        <div style="flex:1;min-width:0">
          <h6 class="mb-1" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(job.title || '')}</h6>
          <div class="small-muted" style="font-size:.9rem;color:#666">${escapeHtml(job.company || '')}</div>
        </div>
        <div class="btn-group ms-2" role="group" aria-label="job actions">
          <button class="btn btn-sm btn-outline-primary view-job-btn" data-job-id="${job.id}">View</button>
          <button class="btn btn-sm btn-warning edit-job-btn" data-job-id="${job.id}">Edit</button>
          <button class="btn btn-sm btn-danger delete-job-btn" data-job-id="${job.id}">Delete</button>
        </div>
      </div>
    `;
    list.appendChild(row);
  });

  attachJobCardEvents();
}

function escapeHtml(s='') {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function attachJobCardEvents() {
  // view
  qsa('.view-job-btn').forEach(btn=>{
    if (btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', async ()=> {
      const jid = btn.dataset.jobId;
      await openJobDetail(jid);
    });
  });

  // edit
  qsa('.edit-job-btn').forEach(btn=>{
    if (btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', async ()=> {
      const jid = btn.dataset.jobId;
      openEditJobModal(jid);
    });
  });

  // delete
  qsa('.delete-job-btn').forEach(btn=>{
    if (btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', async ()=> {
      const jid = btn.dataset.jobId;
      if (!confirm('Delete this job?')) return;
      await deleteJob(jid);
    });
  });
}

async function openJobDetail(jobId) {
  // fetch single job then show right-side details
  const r = await apiFetch(`${JOBS_ENDPOINT}${jobId}/`, { method: 'GET' });
  if (!r.ok) { showToast('Unable to load job', 'error'); return; }
  const job = r.data;
  qs('#selectedJobTitle').textContent = job.title || 'Job';
  qs('#jobMeta').textContent = `${job.company || ''} • ${job.skills || ''}`;
  // show sections
  document.getElementById('noJob').style.display = 'none';
  document.getElementById('jobDetails').style.display = 'block';
  // set data-job on buttons
  qsa('#showMatchesBtn, #showShortlistsBtn, #exportCsvBtn, #showApplicationsBtn, .generate-quiz-btn').forEach(b=>{
    b.dataset.jobId = jobId;
  });
  // clear lists
  qs('#matchesList').innerHTML = '<div class="small-muted">Matches not loaded.</div>';
  qs('#applicationsList').innerHTML = '<div class="small-muted">Applications not loaded.</div>';
}

/* Create job via modal */
function openAddJobModal() {
  // reset form
  qs('#addJobForm').reset?.();
  const m = new bootstrap.Modal(document.getElementById('addJobModal'));
  m.show();
}

async function createJobFromForm(e) {
  e.preventDefault();
  const title = qs('#jobTitle').value.trim();
  if (!title) return showToast('Title required', 'error');
  const body = {
    title,
    company: qs('#jobCompany').value.trim(),
    skills: qs('#jobSkills').value.trim(),
    experience_required: Number(qs('#jobExperience').value || 0),
    vacancies: Number(qs('#jobVacancies').value || 1),
    short_description: (qs('#jobDescription').value || '').slice(0,300),
    description: qs('#jobDescription').value || ''
  };
  const res = await apiFetch(JOBS_ENDPOINT, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) {
    showToast('Create job failed', 'error');
    return;
  }
  showToast('Job created', 'success');
  bootstrap.Modal.getInstance(document.getElementById('addJobModal')).hide();
  await loadJobs();
}

/* Edit flow */
async function openEditJobModal(jobId) {
  const r = await apiFetch(`${JOBS_ENDPOINT}${jobId}/`, { method: 'GET' });
  if (!r.ok) return showToast('Failed to load job', 'error');
  const job = r.data;
  // reuse Add modal inputs for quick edit (or you can create separate edit modal)
  qs('#jobTitle').value = job.title || '';
  qs('#jobCompany').value = job.company || '';
  qs('#jobSkills').value = job.skills || job.skills_required || '';
  qs('#jobExperience').value = job.experience_required || 0;
  qs('#jobVacancies').value = job.vacancies || 1;
  qs('#jobDescription').value = job.description || job.short_description || '';
  // replace submit handler temporarily
  const form = document.getElementById('addJobForm');
  const submitHandler = async (ev) => {
    ev.preventDefault();
    const body = {
      title: qs('#jobTitle').value.trim(),
      company: qs('#jobCompany').value.trim(),
      skills: qs('#jobSkills').value.trim(),
      experience_required: Number(qs('#jobExperience').value || 0),
      vacancies: Number(qs('#jobVacancies').value || 1),
      short_description: (qs('#jobDescription').value || '').slice(0,300),
      description: qs('#jobDescription').value || ''
    };
    const updated = await apiFetch(`${JOBS_ENDPOINT}${jobId}/`, { method: 'PUT', body: JSON.stringify(body) });
    if (!updated.ok) {
      showToast('Update failed', 'error');
    } else {
      showToast('Job updated', 'success');
      bootstrap.Modal.getInstance(document.getElementById('addJobModal')).hide();
      await loadJobs();
    }
    form.removeEventListener('submit', submitHandler);
    // reattach original create handler
    form.addEventListener('submit', createJobFromForm);
  };

  // swap handlers
  form.removeEventListener('submit', createJobFromForm);
  form.addEventListener('submit', submitHandler);

  const m = new bootstrap.Modal(document.getElementById('addJobModal'));
  m.show();
}

/* Delete job */
async function deleteJob(jobId) {
  const res = await apiFetch(`${JOBS_ENDPOINT}${jobId}/`, { method: 'DELETE' });
  if (!res.ok) {
    showToast('Delete failed', 'error');
    return;
  }
  showToast('Deleted', 'success');
  await loadJobs();
}

/* =========================
   Matches / Applications / CSV / Quiz generation
   ========================= */

async function showMatches(jobId) {
  const list = qs('#matchesList');
  if (!list) return;
  list.innerHTML = '<div class="small-muted">Loading matches…</div>';
  const r = await apiFetch(`${API_ROOT}/resumes/matches/?job_id=${jobId}`, { method: 'GET' });
  if (!r.ok || !Array.isArray(r.data)) {
    list.innerHTML = '<div class="text-danger">No matches found or error</div>';
    return;
  }
  list.innerHTML = '';
  r.data.forEach(m => {
    const div = el('div', { 'class': 'mb-3 p-2', 'html': `
      <div style="display:flex;justify-content:space-between">
        <div>
          <strong>${escapeHtml(m.candidate_name||m.email||'Candidate')}</strong><br/>
          <small class="small-muted">${escapeHtml(m.skills || '')}</small>
        </div>
        <div style="text-align:right">
          <button class="btn btn-sm btn-outline-success view-attempts-btn" data-job-id="${jobId}" data-candidate-id="${m.candidate_id||''}">View Attempts</button>
          <button class="btn btn-sm btn-primary open-profile-btn" data-candidate-id="${m.candidate_id||''}">Profile</button>
        </div>
      </div>
    `});
    list.appendChild(div);
  });
}

async function showApplications(jobId) {
  const list = qs('#applicationsList');
  if (!list) return;
  list.innerHTML = '<div class="small-muted">Loading applications…</div>';
  const r = await apiFetch(`${API_ROOT}/applications/?job_id=${jobId}`, { method: 'GET' });
  if (!r.ok || !Array.isArray(r.data)) {
    list.innerHTML = '<div class="text-danger">No applications or error</div>';
    return;
  }
  list.innerHTML = '';
  r.data.forEach(app => {
    const node = document.createElement('div');
    node.className = 'p-2 mb-2 border rounded';
    node.innerHTML = `
      <div class="d-flex justify-content-between">
        <div>
          <strong>${escapeHtml(app.candidate_name||app.email||'Candidate')}</strong>
          <div class="small-muted">${escapeHtml(app.resume_summary || '')}</div>
        </div>
        <div style="text-align:right">
          <div class="small-muted">${escapeHtml(app.status || '')}</div>
          <button class="btn btn-sm btn-outline-secondary ms-1 app-edit-btn" data-app-id="${app.id}">Edit</button>
        </div>
      </div>
    `;
    list.appendChild(node);
  });
}

/* Export CSV simple helper */
function toCsv(rows) {
  if (!rows || !rows.length) return '';
  const keys = Object.keys(rows[0]);
  const lines = [keys.join(',')];
  rows.forEach(r => {
    const line = keys.map(k=>{
      let v = r[k];
      if (v === null || v === undefined) v = '';
      v = String(v).replace(/"/g,'""');
      return `"${v}"`;
    }).join(',');
    lines.push(line);
  });
  return lines.join('\n');
}

function downloadFile(filename, content, mime='text/csv') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

async function exportResultsCsv(jobId) {
  const r = await apiFetch(`${API_ROOT}/quiz/attempts/?job_id=${jobId}`, { method: 'GET' });
  if (!r.ok) { showToast('Failed to fetch attempts', 'error'); return; }
  const rows = (r.data && (r.data.results || r.data)) || [];
  const csv = toCsv(rows.map(x=>({
    candidate: x.candidate || '',
    score: x.score || '',
    passed: x.passed ? 'yes' : 'no',
    finished_at: x.finished_at || '',
    answers: JSON.stringify(x.answers || {})
  })));
  downloadFile(`quiz_results_job_${jobId}.csv`, csv);
}

/* Generate quiz (recruiter) */
async function generateQuiz(jobId) {
  if (!confirm('Generate quiz questions for this job (AI)?')) return;
  const count = prompt('How many questions? (default 5)', '5');
  const skills = prompt('Optional skills override (comma separated)', '') || '';
  const body = { questions_count: Number(count||5), skills };
  const r = await apiFetch(`${API_ROOT}/quiz/generate/${jobId}/`, { method: 'POST', body: JSON.stringify(body) });
  if (!r.ok) {
    showToast('Quiz generation failed', 'error');
    return;
  }
  showToast('Quiz generated', 'success');
}

/* =========================
   Event wiring
   ========================= */

function attachUI() {
  // token save
  const tokenInput = qs('#tokenInput');
  const saveBtn = qs('#saveTokenBtn');
  const tokenStatus = qs('#tokenStatus');
  if (tokenInput) tokenInput.value = savedToken();
  if (saveBtn) {
    saveBtn.addEventListener('click', ()=> {
      const val = tokenInput.value.trim();
      setSavedToken(val);
      tokenStatus.textContent = val ? 'Token saved' : 'Token cleared';
      showToast('Token saved');
    });
  }

  // refresh jobs
  const ref = qs('#refreshJobs');
  if (ref) ref.addEventListener('click', ()=> loadJobs());

  // Add job button
  const addBtn = qs('#addJobBtn');
  if (addBtn) addBtn.addEventListener('click', openAddJobModal);

  // add job form submit
  const addForm = qs('#addJobForm');
  if (addForm) addForm.addEventListener('submit', createJobFromForm);

  // show matches button
  const showMatchesBtn = qs('#showMatchesBtn');
  if (showMatchesBtn) {
    showMatchesBtn.addEventListener('click', async (ev)=>{
      const jid = ev.currentTarget.dataset.jobId;
      document.getElementById('matchesSection').style.display = 'block';
      document.getElementById('applicationsSection').style.display = 'none';
      document.getElementById('shortlistSection').style.display = 'none';
      await showMatches(jid);
    });
  }

  const showAppsBtn = qs('#showApplicationsBtn');
  if (showAppsBtn) {
    showAppsBtn.addEventListener('click', async (ev)=>{
      const jid = ev.currentTarget.dataset.jobId;
      document.getElementById('applicationsSection').style.display = 'block';
      document.getElementById('matchesSection').style.display = 'none';
      document.getElementById('shortlistSection').style.display = 'none';
      await showApplications(jid);
    });
  }

  // Export results
  const exportBtn = qs('#exportCsvBtn');
  if (exportBtn) exportBtn.addEventListener('click', async (ev)=>{
    const jid = ev.currentTarget.dataset.jobId;
    await exportResultsCsv(jid);
  });

  // generate quiz
  const genQuizBtn = qs('.generate-quiz-btn');
  if (genQuizBtn) genQuizBtn.addEventListener('click', (ev)=>{
    const jid = ev.currentTarget.dataset.jobId;
    generateQuiz(jid);
  });

  // refresh initial jobs
  loadJobs();
}

/* =========================
   Boot
   ========================= */
document.addEventListener('DOMContentLoaded', () => {
  try {
    attachUI();
    console.log('recruiter dashboard initialized');
  } catch (e) {
    console.error('init error', e);
  }
});

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
// robust wiring for Show Applications (accepts both id variants for safety)
const showAppsBtn = document.getElementById('showApplicationsBtn') || document.getElementById('ShowApplicationsBtn');
if (showAppsBtn) {
  showAppsBtn.addEventListener('click', async function () {
    if (!selectedJob || !selectedJob.id) return showToast('Select a job first', 'error');
    // prefer the recruiter function name you have; try both fallbacks
    if (typeof loadApplicationsForSelectedJob === 'function') {
      return loadApplicationsForSelectedJob();
    } else if (typeof loadApplicationsForJob === 'function') {
      return loadApplicationsForJob(selectedJob.id);
    } else {
      // final fallback: try the generic loader that accepts job id
      if (typeof loadApplicationsForJob === 'function') return loadApplicationsForJob(selectedJob.id);
      showToast('Load applications function not found in JS', 'error', 4000);
    }
  });
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
  // expose both names to be safe (if one exists)
if (typeof window.loadApplicationsForSelectedJob === 'undefined') {
  if (typeof loadApplicationsForSelectedJob === 'function') window.loadApplicationsForSelectedJob = loadApplicationsForSelectedJob;
  else if (typeof loadApplicationsForJob === 'function') window.loadApplicationsForSelectedJob = () => loadApplicationsForJob(selectedJob.id);
}
if (typeof window.loadApplicationsForJob === 'undefined') {
  if (typeof loadApplicationsForJob === 'function') window.loadApplicationsForJob = loadApplicationsForJob;
  else if (typeof loadApplicationsForSelectedJob === 'function') window.loadApplicationsForJob = (id) => loadApplicationsForSelectedJob();
}

  // initial load
  loadJobs();
})();

// call when recruiter clicks "Generate Quiz"
async function generateQuizForJob(jobId, questionsCount=5) {
  const token = localStorage.getItem('token') || '';
  const headers = {'Content-Type':'application/json'};
  if (token) headers['Authorization'] = 'Bearer ' + token;

  try {
    const r = await fetch(`/api/quiz/generate/${jobId}/`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ questions_count: questionsCount })
    });

    const text = await r.text().catch(()=>null);
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch(e){ data = null; }

    if (!r.ok) {
      const msg = data?.detail || data?.message || `${r.status} ${r.statusText}` ;
      showToast('Generate failed: ' + msg, 'error', 5000);
      return null;
    }

    showToast('Quiz generated', 'success', 3000);
    // optionally refresh UI / show admin view
    return data;
  } catch (e) {
    console.error('generateQuizForJob err', e);
    showToast('Network error', 'error');
    return null;
  }
}

// attach to buttons
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.generate-quiz-btn');
  if (!btn) return;
  const jid = Number(btn.dataset.jobId);
  if (!jid) return;
  generateQuizForJob(jid, 5).then(data => {
    console.log('generate result', data);
    // you may show admin panel or update job card
  });
});

  (function(){
    const jobId = /* insert job id here, e.g. from template context */ 1;
    const token = localStorage.getItem('token') || '';

    async function fetchResults() {
  let token = localStorage.getItem("access");
  let hdrs = { "Content-Type": "application/json" };
  if (token) hdrs["Authorization"] = "Bearer " + token;

  let r = await fetch(`/api/quiz/${jobId}/recruiter/results/`, { headers: hdrs });

  if (r.status === 401) {
    // try refresh
    token = await refreshToken();
    if (!token) { alert("Session expired. Please login again."); return; }
    hdrs["Authorization"] = "Bearer " + token;
    r = await fetch(`/api/quiz/${jobId}/recruiter/results/`, { headers: hdrs });
  }

  if (!r.ok) {
    const txt = await r.text();
    alert("Error fetching results: " + txt);
    return;
  }
  const data = await r.json();
  renderResults(data.results || []);
  document.getElementById("job-title").textContent = `Results — ${data.job_title || ""}`;
}

    function renderResults(rows) {
      const tbody = document.querySelector('#results-table tbody');
      tbody.innerHTML = '';
      const filter = document.getElementById('filter').value;
      rows.forEach(r => {
        if (filter === 'passed' && !r.last_passed) return;
        if (filter === 'failed' && r.last_passed) return;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(r.name || r.username || '—')}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">${r.attempts_count}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">${r.last_score ?? '—'}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">${r.last_passed ? '<strong style="color:green">Passed</strong>' : '<strong style="color:crimson">Failed</strong>'}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">${r.last_finished_at ? (new Date(r.last_finished_at)).toLocaleString() : '—'}</td>
          <td style="padding:8px;border-bottom:1px solid #eee">
            <button class="view-attempts" data-cid="${r.candidate_id}">View Attempts</button>
            <button class="reset-attempts" data-cid="${r.candidate_id}">Reset</button>
          </td>
        `;
        tbody.appendChild(tr);
      });

      // attach actions
      document.querySelectorAll('.view-attempts').forEach(b=>{
        b.onclick = () => {
          const cid = b.dataset.cid;
          // open candidate attempts modal or navigate
          window.open(`/recruiter/candidate/${cid}/attempts?job=${jobId}`, '_blank');
        };
      });
      document.querySelectorAll('.reset-attempts').forEach(b=>{
        b.onclick = async ()=>{
          const cid = b.dataset.cid;
          if (!confirm('Reset attempts for this candidate?')) return;
          const hdrs = { 'Content-Type': 'application/json' };
          if (token) hdrs['Authorization'] = 'Bearer ' + token;
          const r = await fetch(`/api/quiz/${jobId}/reset_attempts/${cid}/`, { method:'POST', headers: hdrs });
          if (!r.ok) { alert('Reset failed'); return; }
          alert('Reset OK');
          fetchResults();
        };
      });
    }

    function escapeHtml(s){ if (s==null) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    document.getElementById('refresh-btn').addEventListener('click', fetchResults);
    document.getElementById('filter').addEventListener('change', fetchResults);

    // initial load
    fetchResults();
  })();


  
(function(){
  function getAuthHeaders() {
    const token = localStorage.getItem('token'); // if you use JWT
    const h = {'Content-Type':'application/json'};
    if (token) h['Authorization'] = 'Bearer ' + token;
    return h;
  }

  // Confirm + delete
  document.addEventListener('click', function(e){
    const btn = e.target.closest('.delete-job-btn');
    if (!btn) return;
    const jobId = btn.dataset.jobId;
    if (!confirm('Delete job permanently?')) return;

    fetch(`/api/jobs/recruiter/job/${jobId}/delete/`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    }).then(async r => {
      if (!r.ok) {
        const text = await r.text().catch(()=>null);
        alert('Delete failed: ' + (text || r.status));
        return;
      }
      // remove job card from DOM
      const card = document.querySelector(`.job-card[data-job-id="${jobId}"]`);
      if (card) card.remove();
      alert('Job deleted');
    }).catch(err=>{
      console.error(err);
      alert('Network error');
    });
  });

  // Open edit modal (simple prompt approach) + PATCH
  document.addEventListener('click', function(e){
    const btn = e.target.closest('.edit-job-btn');
    if (!btn) return;
    const jobId = btn.dataset.jobId;
    // you can build a nicer modal; quick prompt example for title
    const newTitle = prompt('New title?');
    if (newTitle == null) return;
    fetch(`/api/jobs/recruiter/job/${jobId}/`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ title: newTitle })
    }).then(async r => {
      const data = await r.json().catch(()=>null);
      if (!r.ok) {
        alert('Update failed: ' + (data && data.detail ? data.detail : JSON.stringify(data)));
        return;
      }
      // update DOM title
      const card = document.querySelector(`.job-card[data-job-id="${jobId}"]`);
      if (card) {
        const h = card.querySelector('h4');
        if (h) h.textContent = data.title || newTitle;
      }
      alert('Updated');
    }).catch(err=>{
      console.error(err);
      alert('Network error');
    });
  });

})();
