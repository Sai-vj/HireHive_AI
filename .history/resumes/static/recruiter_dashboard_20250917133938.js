// static/recruiter_dashboard.js
// Self-contained recruiter dashboard script (ES module style but can be loaded as normal script)

(() => {
  const API_ROOT = '/api';
  const JOBS_ENDPOINT = `${API_ROOT}/jobs/`;
  const TOKEN_KEY = 'recruiter_token_v1';

  /* ---------------- utils ---------------- */
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"'`]/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#x60;' })[m]);
  }

  function qs(sel, root=document) { return root.querySelector(sel); }
  function qsa(sel, root=document) { return Array.from((root||document).querySelectorAll(sel)); }

  function getStoredToken() {
    return localStorage.getItem(TOKEN_KEY) || (qs('#tokenInput') && qs('#tokenInput').value.trim()) || '';
  }
  function saveStoredToken(t) {
    if (!t) { localStorage.removeItem(TOKEN_KEY); return; }
    localStorage.setItem(TOKEN_KEY, t);
  }

  function showToast(msg, type='info', ms=2800) {
    let container = qs('#toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.style.position = 'fixed';
      container.style.right = '20px';
      container.style.bottom = '20px';
      container.style.zIndex = 9999;
      document.body.appendChild(container);
    }
    const colors = { info:'#fff8d6', success:'#d1e7dd', error:'#f8d7da' };
    const bg = colors[type] || colors.info;
    const item = document.createElement('div');
    item.style = `background:${bg};border:1px solid #ddd;padding:10px 14px;border-radius:8px;margin-top:8px;min-width:200px`;
    item.textContent = msg;
    container.appendChild(item);
    setTimeout(()=> item.remove(), ms);
  }

  function showSpinner(on, text='') {
    let el = qs('#globalSpinner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'globalSpinner';
      el.style = 'position:fixed;left:0;right:0;top:0;bottom:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.5);z-index:2000;';
      el.innerHTML = `<div style="text-align:center"><div class="spinner-border" role="status" style="width:3rem;height:3rem"></div><div id="globalSpinnerText" style="margin-top:8px;font-weight:600"></div></div>`;
      document.body.appendChild(el);
    }
    el.style.display = on ? 'flex' : 'none';
    const txt = qs('#globalSpinnerText');
    if (txt) txt.innerText = text || '';
  }

  async function apiFetch(path, opts = {}) {
    showSpinner(true);
    opts = opts || {};
    opts.headers = opts.headers || {};
    opts.headers['Accept'] = 'application/json';
    const token = getStoredToken();
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;

    if (opts.body && !(opts.body instanceof FormData) && typeof opts.body === 'object') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }

    try {
      const resp = await fetch(path, opts);
      const txt = await resp.text().catch(()=>null);
      let data = null;
      try { data = txt ? JSON.parse(txt) : null; } catch(e) { data = txt; }
      if (resp.status === 401 || resp.status === 403) {
        // unauthorized
        localStorage.removeItem(TOKEN_KEY);
        showToast('Not authorized. Paste a valid token and retry.', 'error', 4000);
      }
      return { ok: resp.ok, status: resp.status, data, text: txt };
    } catch (err) {
      console.error('apiFetch error', err);
      showToast('Network error', 'error', 3000);
      return { ok:false, status:0, data:null };
    } finally {
      showSpinner(false);
    }
  }

  /* ---------------- Jobs ---------------- */
  let selectedJob = null;

  async function loadJobs() {
    const list = qs('#jobsList');
    if (!list) return;
    list.innerHTML = '<div class="small-muted">Loading jobs...</div>';
    const res = await apiFetch(JOBS_ENDPOINT, { method: 'GET' });
    if (!res.ok) {
      list.innerHTML = `<div class="small-muted">Failed to load jobs (${res.status})</div>`;
      return;
    }
    const jobs = Array.isArray(res.data) ? res.data : (res.data && res.data.results ? res.data.results : []);
    if (!jobs || jobs.length === 0) {
      list.innerHTML = `<div class="small-muted">No jobs available</div>`;
      return;
    }
    list.innerHTML = '';
    jobs.forEach(j => {
      const a = document.createElement('div');
      a.className = 'list-group-item job-card';
      a.style.cursor = 'pointer';
      a.dataset.jobId = j.id;
      a.innerHTML = `<div><strong>${escapeHtml(j.title || '')}</strong><div class="small-muted">${escapeHtml(j.company || '')} • ${escapeHtml(j.skills_required || j.skills || '')}</div></div>`;
      a.addEventListener('click', ()=> selectJob(j));
      list.appendChild(a);
    });
    // optionally auto-select first job if none selected
    if (!selectedJob && jobs[0]) selectJob(jobs[0]);
  }

  function selectJob(j) {
    selectedJob = j;
    qs('#noJob') && (qs('#noJob').style.display = 'none');
    qs('#jobDetails') && (qs('#jobDetails').style.display = 'block');
    qs('#selectedJobTitle') && (qs('#selectedJobTitle').textContent = j.title || '');
    qs('#jobMeta') && (qs('#jobMeta').textContent = `${j.company || ''} • ${j.skills || j.skills_required || ''}`);
    // attach dataset to buttons which need jobId
    qsa('#showMatchesBtn, #showShortlistsBtn, #exportCsvBtn, #showApplicationsBtn, .generate-quiz-btn').forEach(b => {
      b.dataset.jobId = j.id;
    });
    // clear panels
    qs('#matchesList') && (qs('#matchesList').innerHTML = '');
    qs('#applicationsList') && (qs('#applicationsList').innerHTML = '');
    qs('#shortlistList') && (qs('#shortlistList').innerHTML = '');
    // highlight selection
    qsa('#jobsList .job-card').forEach(el => {
      el.classList.toggle('active', String(el.dataset.jobId) === String(j.id));
    });
  }

  async function submitAddJob(e) {
    if (e && e.preventDefault) e.preventDefault();
    const title = (qs('#jobTitle')?.value || '').trim();
    if (!title) return showToast('Title required', 'error');
    const payload = {
      title,
      company: (qs('#jobCompany')?.value || '').trim(),
      skills_required: (qs('#jobSkills')?.value || '').trim(),
      experience_required: Number(qs('#jobExperience')?.value || 0),
      vacancies: Number(qs('#jobVacancies')?.value || 1),
      short_description: (qs('#jobDescription')?.value || '').slice(0,300),
      description: qs('#jobDescription')?.value || ''
    };
    const res = await apiFetch(`${API_ROOT}/resumes/jobs/`, { method: 'POST', body: payload });
    if (!res.ok) {
      showToast('Create job failed: ' + (res.data?.detail || res.status), 'error');
      return;
    }
    showToast('Job created', 'success');
    bootstrap.Modal.getInstance(qs('#addJobModal'))?.hide();
    await loadJobs();
  }

  async function openEditJobModal(jobId) {
    const r = await apiFetch(`${API_ROOT}/jobs/${jobId}/`, { method: 'GET' });
    if (!r.ok) return showToast('Failed to load job', 'error');
    const job = r.data;
    // prefill add-job form for quick edit
    qs('#jobTitle').value = job.title || '';
    qs('#jobCompany').value = job.company || '';
    qs('#jobSkills').value = job.skills || job.skills_required || '';
    qs('#jobExperience').value = job.experience_required || 0;
    qs('#jobVacancies').value = job.vacancies || 1;
    qs('#jobDescription').value = job.description || job.short_description || '';

    const form = qs('#addJobForm');
    // temporary submit handler for update
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
      const up = await apiFetch(`${API_ROOT}/jobs/${jobId}/`, { method: 'PATCH', body });
      if (!up.ok) showToast('Update failed', 'error');
      else {
        showToast('Job updated', 'success');
        bootstrap.Modal.getInstance(qs('#addJobModal'))?.hide();
        await loadJobs();
      }
      form.removeEventListener('submit', handler);
      // restore create handler
      form.addEventListener('submit', submitAddJob);
    };

    form.removeEventListener('submit', submitAddJob);
    form.addEventListener('submit', handler);
    new bootstrap.Modal(qs('#addJobModal')).show();
  }

  async function deleteJob(jobId) {
    if (!confirm('Delete this job?')) return;
    const res = await apiFetch(`${API_ROOT}/jobs/${jobId}/`, { method: 'DELETE' });
    if (!res.ok) {
      showToast('Delete failed: ' + (res.data?.detail || res.status), 'error');
      return;
    }
    showToast('Deleted', 'success');
    await loadJobs();
  }

  /* ---------------- Matches ---------------- */
  async function showMatchesForSelectedJob() {
    if (!selectedJob) return showToast('Select a job first', 'error');
    const listEl = qs('#matchesList');
    if (!listEl) return;
    listEl.innerHTML = '<div class="small-muted">Loading matches…</div>';
    const urlCandidates = [
      `${API_ROOT}/resumes/jobs/${selectedJob.id}/match`,
      `${API_ROOT}/resumes/matches/?job_id=${selectedJob.id}`,
      `${API_ROOT}/resumes/match/?job_id=${selectedJob.id}`
    ];
    let r = null;
    for (const u of urlCandidates) {
      r = await apiFetch(u);
      if (r.ok) break;
    }
    if (!r || !r.ok) {
      listEl.innerHTML = `<div class="small-muted">No matches or error (${r?.status})</div>`; return;
    }
    const matches = r.data?.matched_resumes || r.data || [];
    if (!matches || matches.length === 0) { listEl.innerHTML = `<div class="small-muted">No matches</div>`; return; }
    listEl.innerHTML = '';
    matches.forEach(m => {
      const scoreRaw = m.score ?? m.score_percent ?? m.embedding_score ?? 0;
      let score = parseFloat(scoreRaw) || 0;
      if (score > 0 && score <= 1) score = Math.round(score * 100);
      const badge = score >= 75 ? 'bg-success' : (score >= 50 ? 'bg-warning text-dark' : 'bg-danger');
      const card = document.createElement('div');
      card.className = 'card mb-2 p-2';
      card.innerHTML = `
        <div class="d-flex justify-content-between">
          <div>
            <strong>${escapeHtml(m.user || m.username || m.candidate_name || m.email || 'Candidate')}</strong><br/>
            <div class="small-muted">Skills: ${escapeHtml(Array.isArray(m.skills)?m.skills.join(', '): (m.skills||''))}</div>
            <div class="small-muted">Missing: ${escapeHtml((m.missing_skills||[]).join ? (m.missing_skills||[]).join(', ') : (m.missing_skills||''))}</div>
          </div>
          <div style="text-align:right;">
            <span class="badge ${badge}" style="font-size:1rem;padding:0.5rem 0.6rem">${score}%</span>
            <div style="margin-top:8px">
              <button class="btn btn-sm btn-primary" data-action="shortlist" data-resume="${m.resume_id||m.id||''}" data-job="${selectedJob.id}">Shortlist</button>
              <button class="btn btn-sm btn-outline-secondary" data-action="view-profile" data-resume="${m.resume_id||m.id||''}">Profile</button>
            </div>
          </div>
        </div>`;
      listEl.appendChild(card);
    });
    qs('#matchesSection') && (qs('#matchesSection').style.display = 'block');
  }

  /* ---------------- Applications ---------------- */
  async function loadApplicationsForSelectedJob() {
    if (!selectedJob) return showToast('Select job first', 'error');
    const listEl = qs('#applicationsList');
    if (!listEl) return;
    listEl.innerHTML = '<div class="small-muted">Loading applications...</div>';
    // try multiple endpoints to be robust
    const urls = [
      `${API_ROOT}/resumes/applications/?job_id=${selectedJob.id}`,
      `${API_ROOT}/resumes/jobs/${selectedJob.id}/applications/`,
      `${API_ROOT}/applications/?job_id=${selectedJob.id}`
    ];
    let res = null;
    for (const u of urls) {
      res = await apiFetch(u);
      if (res.ok) break;
    }
    if (!res || !res.ok) {
      listEl.innerHTML = `<div class="small-muted">Failed to load applications (${res?.status})</div>`;
      return;
    }
    // normalize array
    let apps = Array.isArray(res.data) ? res.data : (res.data && (res.data.results || res.data.applications || res.data.data) ? (res.data.results || res.data.applications || res.data.data) : []);
    if (!apps || apps.length === 0) { listEl.innerHTML = `<div class="small-muted">No applications yet.</div>`; return; }
    listEl.innerHTML = '';
    apps.forEach(a => {
      const id = a.id || a.application_id || a.pk || '';
      const resume_id = a.resume_id || (a.resume && (a.resume.id || a.resume)) || '';
      const resume_file = a.resume_file || (a.resume && a.resume.file) || a.file || '';
      const candidate_name = a.candidate_name || a.candidate || a.user || a.username || a.applicant || '';
      const candidate_email = a.candidate_email || a.email || '';
      const status = a.status || a.application_status || a.state || 'pending';
      const applied_at = a.applied_at || a.created_at || a.created || '';
      const message = a.message || a.notes || '';

      const card = document.createElement('div');
      card.className = 'card mb-2 p-2';
      card.innerHTML = `
        <div class="d-flex justify-content-between align-items-start">
          <div style="min-width:0;">
            <strong>${escapeHtml(candidate_name || `Resume ${resume_id}`)}</strong>
            ${candidate_email ? `<div class="small-muted">Email: ${escapeHtml(candidate_email)}</div>` : ''}
            <div class="small-muted">Applied: ${escapeHtml(applied_at)} • Status: ${escapeHtml(status)}</div>
            <div class="small-muted">Message: ${escapeHtml(message)}</div>
          </div>
          <div style="min-width:160px;text-align:right;">
            ${resume_file ? `<a class="btn btn-sm btn-outline-primary me-1" href="${resume_file}" target="_blank">View</a>` : ''}
            <button class="btn btn-sm btn-primary" data-action="shortlist-app" data-job="${selectedJob.id}" data-application="${id}" data-resume="${resume_id}">Shortlist</button>
            <button class="btn btn-sm btn-outline-danger" data-action="reject-app" data-application="${id}">Reject</button>
          </div>
        </div>`;
      listEl.appendChild(card);
    });

    qs('#applicationsSection') && (qs('#applicationsSection').style.display = 'block');
  }

  /* Action handlers (delegated) */
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;

    // shortlists from matches
    if (btn.dataset.action === 'shortlist' || btn.dataset.action === 'shortlist-app') {
      const jobId = btn.dataset.job || (selectedJob && selectedJob.id);
      const resumeId = btn.dataset.resume;
      if (!jobId || !resumeId) return showToast('Invalid shortlist', 'error');
      shortlist(jobId, resumeId);
      return;
    }

    if (btn.dataset.action === 'view-profile') {
      const resumeId = btn.dataset.resume;
      if (!resumeId) return;
      // open profile page (site-specific)
      window.open(`/resumes/${resumeId}/`, '_blank');
      return;
    }

    if (btn.dataset.action === 'reject-app') {
      const applicationId = btn.dataset.application;
      if (!applicationId) return;
      changeApplicationStatus(applicationId, 'rejected');
      return;
    }

    // delete/edit job buttons (if present in DOM)
    if (btn.classList.contains('delete-job-btn')) {
      const parent = btn.closest('.job-card') || btn.closest('[data-job-id]');
      const jobId = btn.dataset.jobId || (parent && parent.dataset && parent.dataset.jobId);
      if (!jobId) return;
      if (!confirm('Delete job permanently?')) return;
      deleteJob(jobId);
      return;
    }
    if (btn.classList.contains('edit-job-btn')) {
      const parent = btn.closest('.job-card') || btn.closest('[data-job-id]');
      const jobId = btn.dataset.jobId || (parent && parent.dataset && parent.dataset.jobId);
      if (!jobId) return;
      // open prompt edit (quick) or modal
      openEditJobModal(jobId);
      return;
    }
  });

  async function shortlist(jobId, resumeId) {
    const payload = { job_id: jobId, resume_id: resumeId };
    const res = await apiFetch(`${API_ROOT}/resumes/shortlist/`, { method: 'POST', body: payload });
    if (res.ok) {
      showToast('Shortlisted', 'success');
      showShortlistsForSelectedJob();
    } else showToast('Shortlist failed: ' + (res.data?.detail || res.status), 'error');
  }

  async function changeApplicationStatus(applicationId, newStatus) {
    if (!confirm(`Change status to ${newStatus}?`)) return;
    const res = await apiFetch(`${API_ROOT}/resumes/applications/${applicationId}/`, { method: 'PATCH', body: { status: newStatus } });
    if (res.ok) {
      showToast('Status updated', 'success');
      loadApplicationsForSelectedJob();
    } else showToast('Update failed', 'error');
  }

  async function showShortlistsForSelectedJob() {
    if (!selectedJob) return showToast('Select job first', 'error');
    const res = await apiFetch(`${API_ROOT}/resumes/shortlist/?job_id=${selectedJob.id}`);
    const container = qs('#shortlistList');
    if (!container) return;
    if (!res.ok) { container.innerHTML = `<div class="small-muted">Failed to load shortlist (${res.status})</div>`; return; }
    const list = Array.isArray(res.data) ? res.data : (res.data && res.data.results ? res.data.results : []);
    container.innerHTML = '';
    if (!list || list.length === 0) { container.innerHTML = `<div class="small-muted">No shortlists found.</div>`; return; }
    list.forEach(s => {
      const div = document.createElement('div');
      div.className = 'card mb-2 p-2';
      div.innerHTML = `<div class="d-flex justify-content-between">
        <div><strong>Resume #${escapeHtml(s.resume || '')}</strong><div class="small-muted">created: ${escapeHtml(s.created_at||'')}</div></div>
        <div><button class="btn btn-sm btn-outline-primary" data-action="resend-shortlist" data-job="${s.job}" data-resume="${s.resume}">Resend</button> <button class="btn btn-sm btn-outline-danger" data-action="remove-shortlist" data-id="${s.id}">Remove</button></div>
      </div>`;
      container.appendChild(div);
    });
    qs('#shortlistSection') && (qs('#shortlistSection').style.display = 'block');
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const act = btn.dataset.action;
    if (act === 'resend-shortlist') {
      shortlist(btn.dataset.job, btn.dataset.resume); // resend with same endpoint
    } else if (act === 'remove-shortlist') {
      removeShortlist(btn.dataset.id);
    }
  });

  async function removeShortlist(id) {
    if (!id) return showToast('Invalid id', 'error');
    if (!confirm('Remove shortlist?')) return;
    const res = await apiFetch(`${API_ROOT}/resumes/shortlist/`, { method: 'DELETE', body: { id } });
    if (res.ok) { showToast('Removed', 'success'); showShortlistsForSelectedJob(); }
    else showToast('Remove failed', 'error');
  }

  /* ---------------- Export CSV helpers ---------------- */
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }
  async function exportApplicationsCSVForSelectedJob() {
    if (!selectedJob) return showToast('Select job first', 'error');
    const token = getStoredToken();
    try {
      showSpinner(true, 'Preparing CSV...');
      const headers = { 'Accept': 'text/csv' };
      if (token) headers['Authorization'] = 'Bearer ' + token;
      const resp = await fetch(`${API_ROOT}/resumes/applications/export/?job_id=${encodeURIComponent(selectedJob.id)}`, { headers });
      if (!resp.ok) { showToast('Export failed: ' + resp.status, 'error'); return; }
      const blob = await resp.blob();
      downloadBlob(blob, `applications_job_${selectedJob.id}.csv`);
      showToast('CSV downloaded', 'success');
    } catch (err) {
      console.error('export error', err);
      showToast('Export failed', 'error');
    } finally { showSpinner(false); }
  }

  async function exportResultsCsv(jobId) {
    const r = await apiFetch(`${API_ROOT}/quiz/attempts/?job_id=${jobId}`, { method: 'GET' });
    if (!r.ok) { showToast('Failed to fetch attempts', 'error'); return; }
    const rows = (r.data && (r.data.results || r.data)) || [];
    if (!rows.length) { showToast('No attempts to export', 'info'); return; }
    const keys = ['candidate','score','passed','finished_at','answers'];
    const csv = [keys.join(',')].concat(rows.map(x=>{
      const out = [
        `"${(x.candidate||'').toString().replace(/"/g,'""')}"`,
        `"${(x.score||'').toString().replace(/"/g,'""')}"`,
        `"${x.passed? 'yes':'no'}"`,
        `"${(x.finished_at||'').toString().replace(/"/g,'""')}"`,
        `"${JSON.stringify(x.answers||{}).replace(/"/g,'""')}"`
      ];
      return out.join(',');
    })).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    downloadBlob(blob, `quiz_results_job_${jobId}.csv`);
  }

  /* ---------------- Quiz generation ---------------- */
  async function generateQuizForJob(jobId) {
    if (!confirm('Generate quiz questions for this job (AI)?')) return null;
    const count = Number(prompt('How many questions? (default 5)', '5')) || 5;
    const skills = prompt('Optional skills override (comma separated)', '') || '';
    const res = await apiFetch(`${API_ROOT}/quiz/generate/${jobId}/`, { method: 'POST', body: { questions_count: count, skills } });
    if (!res.ok) { showToast('Quiz generation failed', 'error'); return null; }
    showToast('Quiz generated', 'success');
    return res.data;
  }

  /* ---------------- Recruiter Results Panel ---------------- */
  async function fetchRecruiterResults(jobId) {
    if (!jobId) jobId = (selectedJob && selectedJob.id) || null;
    if (!jobId) return showToast('Select a job first', 'error');
    let token = getStoredToken();
    let headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    let r = await fetch(`${API_ROOT}/quiz/${jobId}/recruiter/results/`, { headers });
    if (r.status === 401) {
      // can't auto-refresh token here; ask user
      showToast('Session expired. Paste valid token and retry.', 'error', 4000);
      return;
    }
    if (!r.ok) {
      const txt = await r.text().catch(()=>null);
      showToast('Error fetching results: ' + (txt || r.status), 'error');
      return;
    }
    const data = await r.json().catch(()=>null);
    renderRecruiterResults((data && (data.results || data)) || [], data?.job_title);
  }

  function renderRecruiterResults(rows, jobTitle) {
    const tbody = qs('#results-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    const filter = qs('#filter') ? qs('#filter').value : 'all';
    rows.forEach(r => {
      const passed = !!(r.last_passed || r.passed || r.passed_last);
      if (filter === 'passed' && !passed) return;
      if (filter === 'failed' && passed) return;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:8px;border-bottom:1px solid #eee">${escapeHtml(r.name || r.username || r.candidate || '—')}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">${r.attempts_count ?? r.attempts ?? 0}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">${r.last_score ?? '—'}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">${passed ? '<strong style="color:green">Passed</strong>' : '<strong style="color:crimson">Failed</strong>'}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">${r.last_finished_at ? (new Date(r.last_finished_at)).toLocaleString() : '—'}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">
          <button class="btn btn-sm btn-outline-primary view-attempts" data-cid="${r.candidate_id || r.user_id || r.id}">View</button>
          <button class="btn btn-sm btn-outline-danger reset-attempts" data-cid="${r.candidate_id || r.user_id || r.id}">Reset</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // attach actions
    qsa('.view-attempts').forEach(b => {
      b.onclick = () => {
        const cid = b.dataset.cid;
        if (!cid) return;
        window.open(`/recruiter/candidate/${cid}/attempts?job=${selectedJob?.id || ''}`, '_blank');
      };
    });
    qsa('.reset-attempts').forEach(b => {
      b.onclick = async () => {
        const cid = b.dataset.cid;
        if (!cid) return;
        if (!confirm('Reset attempts for this candidate?')) return;
        const token = getStoredToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const res = await fetch(`${API_ROOT}/quiz/${selectedJob.id}/reset_attempts/${cid}/`, { method: 'POST', headers });
        if (!res.ok) { showToast('Reset failed', 'error'); return; }
        showToast('Reset done', 'success');
        fetchRecruiterResults(selectedJob.id);
      };
    });

    if (jobTitle) qs('#job-title') && (qs('#job-title').textContent = `Results — ${jobTitle}`);
  }

  /* ---------------- Wire UI & boot ---------------- */
  function wireUI() {
    // token
    qs('#saveTokenBtn')?.addEventListener('click', () => {
      const v = (qs('#tokenInput')?.value || '').trim();
      if (!v) return showToast('Paste token first', 'error');
      saveStoredToken(v);
      showToast('Token saved', 'success');
    });

    // refresh jobs
    qs('#refreshJobs')?.addEventListener('click', loadJobs);
    // add job modal open
    qs('#addJobBtn')?.addEventListener('click', () => new bootstrap.Modal(qs('#addJobModal')).show());
    // add job submit
    qs('#addJobForm')?.addEventListener('submit', submitAddJob);
    // show matches / apps / shortlists
    qs('#showMatchesBtn')?.addEventListener('click', showMatchesForSelectedJob);
    qs('#showApplicationsBtn')?.addEventListener('click', loadApplicationsForSelectedJob);
    qs('#showShortlistsBtn')?.addEventListener('click', showShortlistsForSelectedJob);
    // export apps CSV
    qs('#exportAppsBtn')?.addEventListener('click', exportApplicationsCSVForSelectedJob);
    // export results CSV
    qs('#exportCsvBtn')?.addEventListener('click', () => {
      if (!selectedJob) return showToast('Select job first', 'error');
      exportResultsCsv(selectedJob.id);
    });
    // generate quiz (button may exist per job details)
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.generate-quiz-btn');
      if (!btn) return;
      const jid = btn.dataset.jobId || (selectedJob && selectedJob.id);
      if (!jid) return showToast('No job id', 'error');
      generateQuizForJob(jid);
    });

    // recruiter results refresh
    qs('#refresh-btn')?.addEventListener('click', () => fetchRecruiterResults(selectedJob?.id));
    qs('#filter')?.addEventListener('change', () => fetchRecruiterResults(selectedJob?.id));
    // edit application modal submit
    qs('#editAppForm')?.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const appId = qs('#editAppId')?.value;
      const payload = { status: qs('#editAppStatus')?.value, notes: qs('#editAppNotes')?.value };
      if (!appId) return showToast('Application missing', 'error');
      const res = await apiFetch(`${API_ROOT}/resumes/applications/${appId}/`, { method: 'PATCH', body: payload });
      if (res.ok) {
        showToast('Application updated', 'success');
        bootstrap.Modal.getInstance(qs('#editAppModal'))?.hide();
        loadApplicationsForSelectedJob();
      } else showToast('Update failed', 'error');
    });

    // small safety: fill token input from storage
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored && qs('#tokenInput')) qs('#tokenInput').value = stored;
  }

  // boot
  document.addEventListener('DOMContentLoaded', () => {
    try {
      wireUI();
      loadJobs();
      // initial recruiter results load if a job auto-selected later when user clicks
      console.log('Recruiter dashboard initialized');
    } catch (e) {
      console.error('init error', e);
    }
  });

})(); // IIFE end
