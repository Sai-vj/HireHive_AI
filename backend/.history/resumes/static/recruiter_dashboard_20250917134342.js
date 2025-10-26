// static/recruiter_dashboard.js
// Consolidated recruiter dashboard JS (save as static/recruiter_dashboard.js)

const API_ROOT = '/api';
const JOBS_ENDPOINT = `${API_ROOT}/jobs/`;
const TOKEN_KEY = 'recruiter_token_v1';

/* ---------------------- Small helpers ---------------------- */
function showToast(msg, type='info', ms=3000) {
  const container = document.getElementById('toastContainer') || document.body;
  const el = document.createElement('div');
  el.innerHTML = `<div style="padding:10px 14px;border-radius:8px;background:${type==='error'?'#f8d7da':type==='success'?'#d1e7dd':'#fff8d6'};border:1px solid #ddd;margin-bottom:8px">${msg}</div>`;
  container.appendChild(el);
  setTimeout(()=> el.remove(), ms);
}
function qs(sel, root=document) { return root.querySelector(sel); }
function qsa(sel, root=document) { return Array.from(root.querySelectorAll(sel)); }
function escapeHtml(s='') { if (s===null || s===undefined) return ''; return String(s).replace(/[&<>"'`]/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#x60;' })[m]); }

function savedToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
function setSavedToken(t) { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }
function authHeaders() { const t = savedToken(); return t ? { 'Authorization': `Bearer ${t}` } : {}; }

/* ---------------------- API fetch wrapper ---------------------- */
async function apiFetch(url, opts = {}) {
  opts.headers = Object.assign({'Content-Type':'application/json'}, opts.headers || {}, authHeaders());
  try {
    const r = await fetch(url, opts);
    if (r.status === 401 || r.status === 403) {
      // remove token if server rejects
      localStorage.removeItem(TOKEN_KEY);
      showToast('Not authorized — paste a valid token and retry', 'error', 4000);
      return { ok:false, status:r.status, data:null, error:true };
    }
    const txt = await r.text().catch(()=>null);
    let json = null;
    try { json = txt ? JSON.parse(txt) : null; } catch(e){ json = null; }
    return { ok: r.ok, status: r.status, data: json, text: txt };
  } catch (e) {
    console.error('apiFetch error', e);
    return { ok:false, status:0, data:null, error:true, exception: String(e) };
  }
}

/* ---------------------- Jobs list ---------------------- */
async function loadJobs() {
  const list = document.getElementById('jobsList');
  if (!list) return;
  list.innerHTML = '<div class="small-muted">Loading jobs…</div>';
  const res = await apiFetch(`${JOBS_ENDPOINT}`, { method: 'GET' });
  if (!res.ok || !Array.isArray(res.data)) {
    list.innerHTML = `<div class="small-muted">No jobs or error (${res.status})</div>`;
    return;
  }
  list.innerHTML = '';
  res.data.forEach(job => {
    const row = document.createElement('div');
    row.className = 'list-group-item job-card';
    row.dataset.jobId = job.id;
    row.innerHTML = `
      <div class="d-flex w-100 justify-content-between align-items-start">
        <div style="flex:1;min-width:0">
          <h6 class="mb-1" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(job.title || '')}</h6>
          <div class="small-muted" style="font-size:.9rem;color:#666">${escapeHtml(job.company || '')} • ${escapeHtml(job.skills || job.skills_required || '')}</div>
        </div>
        <div class="btn-group ms-2" role="group">
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

let selectedJob = null;
function selectJobFromList(jobObj) {
  selectedJob = jobObj;
  document.getElementById('noJob') && (document.getElementById('noJob').style.display = 'none');
  document.getElementById('jobDetails') && (document.getElementById('jobDetails').style.display = 'block');
  qs('#selectedJobTitle').textContent = jobObj.title || '';
  qs('#jobMeta').textContent = `${jobObj.company || ''} • Experience: ${jobObj.experience_required || 0}`;
  qsa('#showMatchesBtn, #showShortlistsBtn, #exportCsvBtn, #showApplicationsBtn, .generate-quiz-btn').forEach(b=>{ b.dataset.jobId = jobObj.id; });
  // clear
  qs('#matchesList') && (qs('#matchesList').innerHTML = '');
  qs('#applicationsList') && (qs('#applicationsList').innerHTML = '');
}

async function openJobDetail(jobId) {
  const r = await apiFetch(`${JOBS_ENDPOINT}${jobId}/`, { method: 'GET' });
  if (!r.ok) { showToast('Unable to load job', 'error'); return; }
  const job = r.data;
  // find corresponding job card object to set selectedJob
  selectedJob = job;
  selectJobFromList(job);
}

/* ---------------------- attach card events ---------------------- */
function attachJobCardEvents() {
  qsa('.view-job-btn').forEach(btn=>{
    if (btn._bound) return; btn._bound = true;
    btn.addEventListener('click', async ()=> { await openJobDetail(btn.dataset.jobId); });
  });
  qsa('.edit-job-btn').forEach(btn=>{
    if (btn._bound) return; btn._bound = true;
    btn.addEventListener('click', async ()=> { await openEditJobModal(btn.dataset.jobId); });
  });
  qsa('.delete-job-btn').forEach(btn=>{
    if (btn._bound) return; btn._bound = true;
    btn.addEventListener('click', async ()=> { if (!confirm('Delete this job?')) return; await deleteJob(btn.dataset.jobId); });
  });
}

/* ---------------------- Create / Edit / Delete ---------------------- */
function openAddJobModal() {
  const form = qs('#addJobForm');
  form?.reset();
  const m = new bootstrap.Modal(document.getElementById('addJobModal'));
  m.show();
}
async function createJobFromForm(e) {
  e && e.preventDefault && e.preventDefault();
  const title = qs('#jobTitle').value.trim();
  if (!title) return showToast('Title required', 'error');
  const body = {
    title,
    company: qs('#jobCompany').value.trim(),
    skills: qs('#jobSkills').value.trim(),
    experience_required: Number(qs('#jobExperience').value||0),
    vacancies: Number(qs('#jobVacancies').value||1),
    short_description: (qs('#jobDescription').value||'').slice(0,300),
    description: qs('#jobDescription').value||''
  };
  const res = await apiFetch(JOBS_ENDPOINT, { method:'POST', body: JSON.stringify(body) });
  if (!res.ok) { showToast('Create job failed', 'error'); return; }
  showToast('Job created', 'success'); bootstrap.Modal.getInstance(document.getElementById('addJobModal'))?.hide();
  await loadJobs();
}

async function openEditJobModal(jobId) {
  const r = await apiFetch(`${JOBS_ENDPOINT}${jobId}/`, { method:'GET' });
  if (!r.ok) return showToast('Failed to load job', 'error');
  const job = r.data;
  qs('#jobTitle').value = job.title || '';
  qs('#jobCompany').value = job.company || '';
  qs('#jobSkills').value = job.skills || job.skills_required || '';
  qs('#jobExperience').value = job.experience_required || 0;
  qs('#jobVacancies').value = job.vacancies || 1;
  qs('#jobDescription').value = job.description || job.short_description || '';

  const form = document.getElementById('addJobForm');
  // temporary handler
  const handler = async (ev) => {
    ev.preventDefault();
    const body = {
      title: qs('#jobTitle').value.trim(),
      company: qs('#jobCompany').value.trim(),
      skills: qs('#jobSkills').value.trim(),
      experience_required: Number(qs('#jobExperience').value||0),
      vacancies: Number(qs('#jobVacancies').value||1),
      short_description: (qs('#jobDescription').value||'').slice(0,300),
      description: qs('#jobDescription').value||''
    };
    const updated = await apiFetch(`${JOBS_ENDPOINT}${jobId}/`, { method:'PUT', body: JSON.stringify(body) });
    if (!updated.ok) showToast('Update failed', 'error');
    else { showToast('Job updated', 'success'); bootstrap.Modal.getInstance(document.getElementById('addJobModal'))?.hide(); await loadJobs(); }
    form.removeEventListener('submit', handler);
    form.addEventListener('submit', createJobFromForm);
  };
  form.removeEventListener('submit', createJobFromForm);
  form.addEventListener('submit', handler);
  new bootstrap.Modal(document.getElementById('addJobModal')).show();
}

async function deleteJob(jobId) {
  const res = await apiFetch(`${JOBS_ENDPOINT}${jobId}/`, { method:'DELETE' });
  if (!res.ok) { showToast('Delete failed', 'error'); return; }
  showToast('Deleted', 'success'); await loadJobs();
}

/* ---------------------- Matches / Applications ---------------------- */
async function showMatchesForSelectedJob() {
  if (!selectedJob) return showToast('Select job first', 'error');
  const res = await apiFetch(`/api/resumes/jobs/${selectedJob.id}/match`);
  const listEl = qs('#matchesList');
  if (!listEl) return;
  if (!res.ok) { listEl.innerHTML = `<div class="small-muted">Failed to load matches (${res.status})</div>`; return; }
  const matches = res.data?.matched_resumes || res.data || [];
  listEl.innerHTML = '';
  if (!matches.length) { listEl.innerHTML = `<div class="small-muted">No matches found.</div>`; qs('#matchesSection').style.display = 'block'; return; }

  matches.forEach(m => {
    const scoreRaw = m.score ?? m.score_percent ?? 0;
    let score = parseFloat(scoreRaw) || 0; if (score>0 && score<=1) score = Math.round(score*100);
    const badge = score >= 75 ? 'bg-success' : (score >= 50 ? 'bg-warning text-dark' : 'bg-danger');
    const card = document.createElement('div');
    card.className = 'card mb-2 p-2';
    card.innerHTML = `
      <div class="d-flex justify-content-between">
        <div>
          <strong>${escapeHtml(m.user || m.username || m.candidate_name || 'candidate')}</strong> — ${escapeHtml(m.experience || 0)} yrs
          <div class="small-muted">skills: ${escapeHtml(m.skills || '')}</div>
        </div>
        <div style="text-align:right;">
          <span class="badge ${badge}" style="font-size:1rem;padding:0.5rem 0.6rem;">${score}%</span>
          <div style="margin-top:8px;">
            <button class="btn btn-sm btn-primary view-attempts-btn" data-job-id="${selectedJob.id}" data-candidate-id="${m.candidate_id || m.user_id || ''}">View Attempts</button>
            <button class="btn btn-sm btn-outline-secondary ms-1" onclick="shortlist(${selectedJob.id}, ${m.resume_id || m.id || 0})">Shortlist</button>
          </div>
        </div>
      </div>`;
    listEl.appendChild(card);
  });
  qs('#matchesSection').style.display = 'block';
  // attach attempts button handlers
  qsa('.view-attempts-btn').forEach(b=>{
    if (b._bound) return; b._bound = true;
    b.addEventListener('click', ()=> openAttemptHistoryModal(Number(b.dataset.jobId), Number(b.dataset.candidateId)));
  });
}

/* Applications loader simplified */
async function loadApplicationsForSelectedJob() {
  if (!selectedJob) return showToast('Select job first', 'error');
  const listEl = qs('#applicationsList'); if (!listEl) return;
  listEl.innerHTML = '<div class="small-muted">Loading applications...</div>';
  const urlsToTry = [
    `/api/resumes/applications/?job_id=${selectedJob.id}`,
    `/api/resumes/jobs/${selectedJob.id}/applications/`,
    `/api/applications/?job_id=${selectedJob.id}`
  ];
  let res = null;
  for (const u of urlsToTry) {
    try { res = await apiFetch(u); if (res.ok) break; } catch(e){console.warn(e);}
  }
  if (!res || !res.ok) { listEl.innerHTML = `<div class="small-muted">No applications (${res ? res.status : 'no response'})</div>`; return; }
  let apps = Array.isArray(res.data) ? res.data : (res.data.results || res.data.applications || []);
  if (!apps || !apps.length) { listEl.innerHTML = '<div class="small-muted">No applications yet.</div>'; return; }
  listEl.innerHTML = '';
  apps.forEach(a => {
    const id = a.id || a.application_id || '';
    const resume_file = a.resume_file || (a.resume && a.resume.file) || '';
    const name = a.candidate_name || a.user || a.username || a.applicant || '';
    const status = a.status || '';
    const applied = a.applied_at || a.created_at || '';
    const card = document.createElement('div');
    card.className = 'card mb-2 p-2';
    card.innerHTML = `
      <div class="d-flex justify-content-between">
        <div style="min-width:0;">
          <strong>${escapeHtml(name || `Resume ${a.resume_id||''}`)}</strong>
          <div class="small-muted">Applied: ${escapeHtml(applied)}</div>
          <div class="small-muted">Message: ${escapeHtml(a.message || '')}</div>
        </div>
        <div style="min-width:180px;text-align:right;">
          <div class="mb-1"><span class="badge ${status==='shortlisted'?'bg-success':status==='rejected'?'bg-danger':'bg-secondary'}">${escapeHtml(status||'')}</span></div>
          <div>
            ${resume_file ? `<a class="btn btn-sm btn-outline-primary me-1" href="${resume_file}" target="_blank">View</a>` : ''}
            <button class="btn btn-sm btn-primary" onclick="shortlist(${selectedJob.id}, ${a.resume_id || 0})">Shortlist</button>
            <button class="btn btn-sm btn-outline-danger" onclick="changeApplicationStatus(${id}, 'rejected')">Reject</button>
          </div>
        </div>
      </div>`;
    listEl.appendChild(card);
  });
  qs('#applicationsSection').style.display = 'block';
}

/* ---------------------- Shortlist / status ---------------------- */
async function shortlist(job_id, resume_id) {
  if (!job_id || !resume_id) return showToast('Invalid shortlist', 'error');
  const res = await apiFetch('/api/resumes/shortlist/', { method:'POST', body: JSON.stringify({ job_id, resume_id }) });
  if (res.ok) { showToast('Shortlisted', 'success'); loadApplicationsForSelectedJob(); showShortlistsForSelectedJob(); }
  else showToast('Shortlist failed', 'error');
}
async function changeApplicationStatus(applicationId, newStatus) {
  if (!applicationId) return;
  const res = await apiFetch(`/api/resumes/applications/${applicationId}/`, { method:'PATCH', body: JSON.stringify({ status: newStatus }) });
  if (res.ok) { showToast('Status updated', 'success'); loadApplicationsForSelectedJob(); }
  else showToast('Update failed', 'error');
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
    const div = document.createElement('div'); div.className='card mb-2 p-2';
    div.innerHTML = `<div class="d-flex justify-content-between">
      <div><strong>Resume #${escapeHtml(s.resume)}</strong><div class="small-muted">${escapeHtml(s.shortlisted_by||'')}</div></div>
      <div><button class="btn btn-sm btn-outline-primary" onclick="resend(${s.job},${s.resume})">Resend</button>
           <button class="btn btn-sm btn-outline-danger" onclick="removeShortlist(${s.id})">Remove</button></div>
    </div>`;
    container.appendChild(div);
  });
  qs('#shortlistSection').style.display = 'block';
}
async function removeShortlist(id) {
  if (!id) return showToast('Invalid id', 'error');
  if (!confirm('Remove shortlist?')) return;
  const res = await apiFetch('/api/resumes/shortlist/', { method:'DELETE', body: JSON.stringify({ id }) });
  if (res.ok) { showToast('Removed', 'success'); showShortlistsForSelectedJob(); } else showToast('Remove failed','error');
}

/* ---------------------- Generate quiz (recruiter) ---------------------- */
async function generateQuiz(jobId) {
  if (!confirm('Generate quiz questions for this job (AI)?')) return;
  const count = Number(prompt('How many questions? (default 5)', '5') || 5);
  const skills = prompt('Optional skills override (comma separated)', '') || '';
  const res = await apiFetch(`/api/quiz/generate/${jobId}/`, { method:'POST', body: JSON.stringify({ questions_count: count, skills }) });
  if (!res.ok) { showToast('Quiz generation failed', 'error'); return; }
  showToast('Quiz generated', 'success');
}

/* ---------------------- Recruiter results panel ---------------------- */
async function fetchRecruiterResults(jobId) {
  if (!jobId) return;
  const r = await apiFetch(`/api/quiz/${jobId}/recruiter/results/`, { method:'GET' });
  if (!r.ok) { showToast('Failed to fetch results', 'error'); return; }
  renderResultsTable(r.data.results || [], r.data.job_title || '');
}
function renderResultsTable(rows, jobTitle) {
  const tbody = qs('#results-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  document.getElementById('job-title') && (document.getElementById('job-title').textContent = `Results — ${jobTitle}`);
  const filter = qs('#filter')?.value || 'all';
  rows.forEach(r => {
    if (filter === 'passed' && !r.last_passed) return;
    if (filter === 'failed' && r.last_passed) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(r.name || r.username || '—')}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${r.attempts_count ?? 0}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${r.last_score ?? '—'}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${r.last_passed ? '<strong style="color:green">Passed</strong>' : '<strong style="color:crimson">Failed</strong>'}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">${r.last_finished_at ? (new Date(r.last_finished_at)).toLocaleString() : '—'}</td>
      <td style="padding:8px;border-bottom:1px solid #eee">
        <button class="btn btn-sm btn-outline-primary view-attempts-result" data-cid="${r.candidate_id || r.id || ''}" data-job="${r.job_id || ''}">View Attempts</button>
        <button class="btn btn-sm btn-outline-danger reset-attempts" data-cid="${r.candidate_id || r.id || ''}" data-job="${r.job_id || ''}">Reset</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
  // attach handlers
  qsa('.view-attempts-result').forEach(b=>{
    if (b._bound) return; b._bound = true;
    b.addEventListener('click', ()=> openAttemptHistoryModal(Number(b.dataset.job), Number(b.dataset.cid)));
  });
  qsa('.reset-attempts').forEach(b=>{
    if (b._bound) return; b._bound = true;
    b.addEventListener('click', async ()=>{
      if (!confirm('Reset attempts for this candidate?')) return;
      const job = b.dataset.job; const cid = b.dataset.cid;
      const res = await apiFetch(`/api/quiz/${job}/reset_attempts/${cid}/`, { method:'POST' });
      if (res.ok) { showToast('Reset OK', 'success'); fetchRecruiterResults(job); } else showToast('Reset failed','error');
    });
  });
}

/* ---------------------- Attempt History modal ---------------------- */
(function(){
  // build attempts modal markup once
  if (!document.getElementById('attempts-modal')) {
    const modal = document.createElement('div');
    modal.id = 'attempts-modal';
    modal.style = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);z-index:9999;';
    modal.innerHTML = `
      <div style="background:#fff;padding:18px;border-radius:8px;max-width:900px;width:96%;max-height:82vh;overflow:auto;position:relative;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h4 id="attempts-modal-title" style="margin:0;">Attempts</h4>
          <button id="attempts-modal-close" class="btn btn-sm btn-outline-secondary">Close</button>
        </div>
        <div id="attempts-loading" style="margin-top:12px">Loading…</div>
        <div id="attempts-list" style="margin-top:12px;display:none"></div>
        <div style="margin-top:12px;text-align:right;"><button id="attempts-modal-ok" class="btn btn-primary">OK</button></div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById('attempts-modal-close').addEventListener('click', ()=> { modal.style.display = 'none'; document.body.style.overflow=''; });
    document.getElementById('attempts-modal-ok').addEventListener('click', ()=> { modal.style.display = 'none'; document.body.style.overflow=''; });
  }

  async function fetchAttempts(jobId, candidateId) {
    const token = savedToken();
    const headers = {'Content-Type':'application/json', ...authHeaders()};
    const tries = [
      `/api/quiz/${jobId}/attempts/`,
      `/api/quiz/attempts/?job_id=${jobId}&candidate=${candidateId}`,
      `/api/quiz/attempts/?job=${jobId}`
    ];
    for (const u of tries) {
      try {
        const r = await fetch(u, { method:'GET', headers });
        if (!r) continue;
        const txt = await r.text().catch(()=>null);
        let data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch(e){ data = txt; }
        if (r.status === 401) return { error:true, status:401 };
        if (r.status === 403) return { error:true, status:403, detail: data && data.detail ? data.detail : 'Forbidden' };
        if (r.ok) {
          if (Array.isArray(data)) return data.filter(a => !candidateId || String(a.candidate) === String(candidateId) || String(a.candidate_id) === String(candidateId));
          if (Array.isArray(data.results)) return data.results;
          if (Array.isArray(data.attempts)) return data.attempts;
          return [];
        }
      } catch (e) { console.warn('fetchAttempts try failed', e, u); continue; }
    }
    return [];
  }

  function renderAttemptList(attempts) {
    const container = document.getElementById('attempts-list');
    container.innerHTML = '';
    if (!attempts || attempts.length === 0) {
      container.innerHTML = '<div class="small-muted">No attempts yet.</div>';
      return;
    }
    const table = document.createElement('table'); table.style.width='100%'; table.style.borderCollapse='collapse';
    table.innerHTML = `<thead><tr>
      <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Attempt ID</th>
      <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Finished</th>
      <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Score</th>
      <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Result</th>
      <th style="text-align:left;padding:8px;border-bottom:1px solid #eee">Answers</th>
    </tr></thead><tbody></tbody>`;
    const tbody = table.querySelector('tbody');
    attempts.slice().sort((a,b)=> new Date(b.finished_at||b.started_at||0) - new Date(a.finished_at||a.started_at||0)).forEach(at=>{
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

  // expose
  window.openAttemptHistoryModal = async function(jobId, candidateId) {
    const modal = document.getElementById('attempts-modal');
    if (!modal) return;
    const loading = document.getElementById('attempts-loading');
    const list = document.getElementById('attempts-list');
    document.getElementById('attempts-modal-title').textContent = `Attempts — job ${jobId} candidate ${candidateId || 'all'}`;
    loading.style.display = 'block'; list.style.display = 'none'; list.innerHTML = '';
    modal.style.display = 'flex'; document.body.style.overflow = 'hidden';
    const data = await fetchAttempts(jobId, candidateId);
    loading.style.display = 'none';
    if (data && data.error) {
      list.style.display = 'block';
      list.innerHTML = `<div class="text-danger">Error loading attempts: ${escapeHtml(data.detail || 'Forbidden')}</div>`;
      return;
    }
    renderAttemptList(data || []);
    list.style.display = 'block';
  };
})();

/* ---------------------- Wire UI and boot ---------------------- */
function attachUI() {
  // token save
  const tokenInput = qs('#tokenInput'); const saveBtn = qs('#saveTokenBtn'); const tokenStatus = qs('#tokenStatus');
  if (tokenInput && savedToken()) tokenInput.value = savedToken();
  saveBtn?.addEventListener('click', ()=> {
    const v = tokenInput?.value.trim() || '';
    setSavedToken(v);
    if (tokenStatus) tokenStatus.innerText = v ? 'Token saved' : '';
    showToast('Token saved', 'success');
  });

  // buttons
  qs('#refreshJobs')?.addEventListener('click', loadJobs);
  qs('#addJobBtn')?.addEventListener('click', openAddJobModal);
  qs('#addJobForm')?.addEventListener('submit', createJobFromForm);
  qs('#showMatchesBtn')?.addEventListener('click', ()=> showMatchesForSelectedJob());
  qs('#showShortlistsBtn')?.addEventListener('click', ()=> showShortlistsForSelectedJob());
  qs('#showApplicationsBtn')?.addEventListener('click', ()=> loadApplicationsForSelectedJob());
  qs('#exportCsvBtn')?.addEventListener('click', async (ev)=> { const jid = ev.currentTarget.dataset.jobId; await exportResultsCsv(jid); });
  qs('#filter')?.addEventListener('change', ()=> fetchRecruiterResults(selectedJob ? selectedJob.id : null));
  qs('#refresh-btn')?.addEventListener('click', ()=> fetchRecruiterResults(selectedJob ? selectedJob.id : null));

  // global click for generate quiz and dynamic buttons
  document.addEventListener('click', (e)=> {
    const gen = e.target.closest('.generate-quiz-btn');
    if (gen) { const jid = Number(gen.dataset.jobId); generateQuiz(jid); }
  });

  // initial load
  loadJobs();
  // try loading recruiter results if job id present (from template we might set selectedJob later)
  if (qs('#results-table')) {
    // if template provided job id in data-job, use it
    const el = qs('.generate-quiz-btn') || qs('#showMatchesBtn');
    const jid = el && el.dataset && el.dataset.jobId ? Number(el.dataset.jobId) : null;
    if (jid) fetchRecruiterResults(jid);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  try { attachUI(); console.log('recruiter dashboard initialized'); } catch(e){ console.error('init error', e); }
});

/* ---------------------- Expose some helpers globally ---------------------- */
window.loadJobs = loadJobs;
window.openJobDetail = openJobDetail;
window.generateQuiz = generateQuiz;
window.loadApplicationsForSelectedJob = loadApplicationsForSelectedJob;
window.showMatchesForSelectedJob = showMatchesForSelectedJob;
window.showShortlistsForSelectedJob = showShortlistsForSelectedJob;
