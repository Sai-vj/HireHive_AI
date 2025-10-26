/* candidate_dashboard.js - patched standalone version
   - No ES module imports
   - local apiFetch / fetchWithAuth wrappers
   - saveTokenVal exposed to window
   - retains original UI IDs & behavior
*/

(function () {
  // ---------------- Config ----------------
  const APPLY_URL = '/api/resumes/apply/';
  const JOBS_URL = '/api/resumes/jobs/'; // used by loadJobs
  const MY_RESUMES_URL = '/api/resumes/my-resumes/';
  const UPLOAD_URL = '/api/resumes/upload/';
  const SHORTLIST_URL = '/api/resumes/shortlist/';
  const APPLICATIONS_URL = '/api/applications/';

  // ---------------- Token helpers (global) ----------------
  function getToken() {
    return (localStorage.getItem('token') || '').trim() ||
           (document.getElementById('tokenInput') && document.getElementById('tokenInput').value.trim()) || '';
  }
  function saveTokenVal(val) {
    if (!val) return;
    localStorage.setItem('token', val);
    try { document.getElementById('tokenStatus').innerText = 'Token saved'; } catch(e) {}
    showToast('Token saved', 'success');
  }
  // expose globally in case other code expects it
  window.saveTokenVal = saveTokenVal;

  // ---------------- Small utilities ----------------
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"'`]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#x60;' })[m]);
  }

  // ---------------- Toast + Spinner ----------------
  function showToast(msg, type = 'info', timeout = 3500) {
    const colors = { info: 'secondary', success: 'success', error: 'danger' };
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.style.position = 'fixed';
      container.style.right = '20px';
      container.style.top = '20px';
      container.style.zIndex = 99999;
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

  function showSpinner(on, text = '') {
    let el = document.getElementById('globalSpinner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'globalSpinner';
      el.style = 'position:fixed;left:0;right:0;top:0;bottom:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.65);z-index:20000;';
      el.innerHTML = `<div style="text-align:center;"><div class="spinner-border" role="status" style="width:3rem;height:3rem"></div><div id="globalSpinnerText" style="margin-top:8px;font-weight:600;"></div></div>`;
      document.body.appendChild(el);
    }
    el.style.display = on ? 'flex' : 'none';
    const textEl = document.getElementById('globalSpinnerText');
    if (textEl) textEl.innerText = text || '';
  }

  // ---------------- Network wrappers ----------------
  async function fetchWithAuth(url, opts = {}) {
    opts = Object.assign({}, opts);
    opts.headers = opts.headers || {};
    const token = getToken();
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    try {
      return await fetch(url, opts);
    } catch (e) {
      console.error('fetchWithAuth network error', e);
      throw e;
    }
  }

  async function apiFetch(path, opts = {}) {
    opts = Object.assign({}, opts);
    opts.headers = opts.headers || {};
    if (!opts.headers['Content-Type'] && !(opts.body instanceof FormData)) {
      opts.headers['Content-Type'] = 'application/json';
    }
    const token = getToken();
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;

    try {
      const r = await fetch(path, opts);
      if (r.status === 401 || r.status === 403) {
        // helpful UX: tell user to paste/save token
        showToast('Authentication required — paste token and Save.', 'error', 5000);
      }
      const txt = await r.text().catch(() => null);
      let json = null;
      try { json = txt ? JSON.parse(txt) : null; } catch (e) { json = null; }
      return { ok: r.ok, status: r.status, data: json, text: txt };
    } catch (e) {
      console.error('apiFetch error', e);
      return { ok: false, status: 0, error: e };
    }
  }

  // ---------------- Global state ----------------
  let resumesList = [];
  let selectedJob = null;
  window.__apply_job_id = null;

  // ---------------- Resume handling ----------------
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
      card.className = 'resume-card mb-2 d-flex justify-content-between align-items-center';
      card.innerHTML = `
        <div>
          <strong>${escapeHtml(fileName)}</strong><br>
          <small class="small-muted">${escapeHtml(uploaded)}</small>
          <div class="small-muted" style="margin-top:8px;">${escapeHtml(skills)}</div>
        </div>
        <div class="btn-group">
          <a class="btn btn-sm btn-outline-primary" href="${escapeHtml(fileUrl) || '#'}" target="_blank" ${fileUrl ? '' : 'onclick="return false;"'}>View</a>
          <button class="btn btn-sm btn-outline-danger" data-resume-id="${escapeHtml(id)}">Delete</button>
        </div>`;
      container.appendChild(card);
      const delBtn = card.querySelector('button[data-resume-id]');
      if (delBtn) {
        delBtn.addEventListener('click', () => deleteResume(id));
      }
    });
  }

  async function deleteResume(id) {
    if (!id) { showToast('Invalid resume id', 'error'); return; }
    const ok = confirm('Delete resume permanently?');
    if (!ok) return;
    try {
      const res = await apiFetch(`${MY_RESUMES_URL}${id}/`, { method: 'DELETE' });
      if (res.ok) { showToast('Resume deleted', 'success'); await refreshResumes(); }
      else { showToast('Delete failed: ' + (res.data?.detail || `Status ${res.status}`), 'error'); }
    } catch (e) { console.error(e); showToast('Delete failed', 'error'); }
  }

  // ---------------- Jobs & matches ----------------
  async function loadJobs() {
    const container = document.getElementById('jobsList');
    if (!container) return;
    container.innerHTML = '<div class="small-muted">Loading jobs...</div>';
    const res = await apiFetch(JOBS_URL);
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
      card.dataset.jobId = j.id;
      card._job = j;

      const applyId = `apply-btn-${j.id}`;
      const retakeId = `retake-btn-${j.id}`;

      card.innerHTML = `
        <div style="min-width:0;">
          <strong>${escapeHtml(j.title || '')}</strong>
          <div class="small-muted">${escapeHtml(j.company || '')} • ${escapeHtml(j.skills_required || j.skills || '')}</div>
        </div>

        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
          <div>
            <button class="btn btn-sm btn-outline-primary me-1 view-job-btn" type="button" data-job-id="${j.id}">View</button>
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

      // attach view job
      card.querySelector('.view-job-btn')?.addEventListener('click', () => viewJob(j.id));
    });

    // attach quiz buttons / attempt loaders
    if (typeof attachQuizButtons === 'function') {
      try { attachQuizButtons(); } catch (e) { console.warn('attachQuizButtons failed', e); }
    }
  }

  // ---------------- Attempt history & quiz helpers ----------------
  async function fetchAttempts(jobId) {
    try {
      const token = getToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;
      const r = await fetch(`/api/quiz/${jobId}/attempts/`, { method: 'GET', headers });
      if (!r) {
        return { error: true, detail: 'No response' };
      }
      const txt = await r.text().catch(()=>null);
      let data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
      if (!r.ok) return { error: true, status: r.status, detail: (data && data.detail) ? data.detail : txt || r.statusText };
      return Array.isArray(data) ? data : (data.results || data.attempts || []);
    } catch (e) {
      console.warn('fetchAttempts error', e);
      return { error: true, detail: String(e) };
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
      const sc = (at.score ?? 0);
      const total = at.total ?? at.total_questions ?? '';
      const score = total ? `${sc} / ${total}` : `${sc}`;
      const passed = at.passed ? '<strong style="color:green">Passed</strong>' : '<strong style="color:crimson">Failed</strong>';

      let answersHtml = '<span class="small-muted">—</span>';
      if (at.answers) {
        try { answersHtml = '<pre style="white-space:pre-wrap;margin:0;font-size:.9rem;">' + escapeHtml(typeof at.answers === 'string' ? at.answers : JSON.stringify(at.answers, null, 2)) + '</pre>'; } catch(e) { answersHtml = escapeHtml(String(at.answers)); }
      } else if (at.data && at.data.answers) {
        answersHtml = '<pre style="white-space:pre-wrap;margin:0;font-size:.9rem;">' + escapeHtml(JSON.stringify(at.data.answers, null, 2)) + '</pre>';
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:8px;border-bottom:1px solid #f2f2f2;vertical-align:top">${escapeHtml(id)}</td>
        <td style="padding:8px;border-bottom:1px solid #f2f2f2;vertical-align:top">${escapeHtml(finished)}</td>
        <td style="padding:8px;border-bottom:1px solid #f2f2f2;vertical-align:top">${escapeHtml(score)}</td>
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

    const modal = document.getElementById('attempts-modal');
    if (modal) { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }

    const data = await fetchAttempts(jobId);
    if (loading) loading.style.display = 'none';

    if (data && data.error) {
      if (list) { list.style.display = 'block'; list.innerHTML = `<div class="text-danger">Error loading attempts: ${escapeHtml(data.detail || 'Unknown')}</div>`; }
      return;
    }
    renderAttemptList(data);
    if (list) list.style.display = 'block';
  }

  // attach handlers for view-attempts buttons
  function attachViewHandlers(){
    document.querySelectorAll('.view-attempts-btn').forEach(btn=>{
      if (btn.__attemptAttached) return;
      btn.__attemptAttached = true;
      btn.addEventListener('click', (e)=>{
        e.preventDefault();
        const jid = Number(btn.dataset.jobId || btn.getAttribute('data-job-id'));
        if (!jid) { alert('Missing job id'); return; }
        openAttemptHistoryModal(jid);
      });
    });
  }

  // attempt modal close handlers (OK / Close / outside click)
  document.addEventListener('click', function(e){
    const modal = document.getElementById('attempts-modal');
    if (!modal) return;
    if (e.target && (e.target.id === 'attempts-modal-close' || e.target.id === 'attempts-modal-ok')) {
      modal.style.display = 'none'; document.body.style.overflow = '';
    }
    if (e.target === modal) { modal.style.display = 'none'; document.body.style.overflow = ''; }
  });

  // ---------------- Apply flow ----------------
  function openApplyModal(jobIdOrObj) {
    const jobId = (typeof jobIdOrObj === 'object' && jobIdOrObj !== null) ? jobIdOrObj.id : jobIdOrObj;
    if (!jobId) { showToast('Invalid job to apply', 'error'); return; }
    window.__apply_job_id = jobId;

    const select = document.getElementById('applyResumeSelect');
    if (!select) { showToast('Apply modal missing in HTML. Add apply modal markup.', 'error'); return; }
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

  // apply form submit (delegated earlier in previous file, we attach here)
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

    if (!jobId) { showToast('No job selected for apply', 'error'); if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = submitBtn.dataset.origText || 'Apply'; } return; }
    if (!resumeId) { showToast('Select a resume to apply', 'error'); if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = submitBtn.dataset.origText || 'Apply'; } return; }

    try {
      showSpinner(true, 'Applying...');
      const payload = { job_id: jobId, resume_id: resumeId, message };

      // Try JSON
      let res = await apiFetch(APPLY_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      // If JSON fails due to 400/415/422, retry FormData
      if (!res.ok && (res.status === 400 || res.status === 415 || res.status === 422)) {
        const fd = new FormData();
        fd.append('job_id', jobId);
        fd.append('resume_id', resumeId);
        fd.append('message', message || '');
        const r2 = await fetchWithAuth(APPLY_URL, { method: 'POST', body: fd });
        const txt = await r2.text().catch(()=>null);
        let data = null; try { data = txt ? JSON.parse(txt) : null; } catch(e){ data = txt; }
        res = { ok: r2.ok, status: r2.status, data };
      }

      if (res.ok) {
        showToast('Applied successfully', 'success', 3000);
        try {
          const modalEl = document.getElementById('applyModal');
          if (modalEl) {
            const inst = (window.bootstrap && window.bootstrap.Modal) ? bootstrap.Modal.getInstance(modalEl) : null;
            if (inst) inst.hide();
          }
        } catch (e) {}
        refreshResumes();
        if (selectedJob && Number(selectedJob.id) === Number(jobId)) loadApplicationsForJob(jobId);
      } else {
        if (res.status === 409) {
          const body = res.data || {};
          let msg = body.detail || body.message || body.error || null;
          let appInfo = null;
          if (!msg && typeof body === 'object') {
            appInfo = body.application || body.existing_application || (body.data && body.data.application);
          }
          if (appInfo) {
            const id = appInfo.id || appInfo.pk || appInfo.application_id || '';
            const status = appInfo.status || '';
            const at = appInfo.applied_at || appInfo.created_at || appInfo.created || '';
            msg = msg || `Already applied (id:${id}) status:${status} applied:${at}`;
          }
          showToast('Already applied: ' + (msg || 'Conflict'), 'info', 8000);
          if (selectedJob && Number(selectedJob.id) === Number(jobId)) loadApplicationsForJob(jobId);
          return;
        }
        if (res.status === 401 || res.status === 403) {
          showToast('Authentication required. Paste token and save.', 'error', 6000);
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

  // ---------------- My applications loader ----------------
  async function loadMyApplications() {
    const el = document.getElementById('myApplicationsList');
    if (!el) return;
    el.innerHTML = '<div class="small-muted">Loading your applications...</div>';

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

  // ---------------- Shortlist ----------------
  async function shortlist(job_id, resume_id) {
    if (!job_id || !resume_id) return showToast('Invalid shortlist', 'error');
    try {
      const res = await apiFetch(SHORTLIST_URL, { method: 'POST', body: JSON.stringify({ job_id, resume_id }) });
      if (res.ok) { showToast('Shortlisted', 'success'); showShortlistsForSelectedJob(); }
      else if (res.status === 409) showToast('Already shortlisted', 'info');
      else showToast('Shortlist failed', 'error');
    } catch (e) { console.error(e); showToast('Shortlist failed', 'error'); }
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
      div.innerHTML = `<div class="d-flex justify-content-between align-items-start"><div><strong>Resume #${escapeHtml(s.resume)}</strong> — by ${escapeHtml(s.shortlisted_by)}<div class="small-muted">created: ${escapeHtml(s.created_at || '')}</div></div><div><button class="btn btn-sm btn-outline-primary" type="button" data-resend-job="${s.job}" data-resume="${s.resume}">Resend</button> <button class="btn btn-sm btn-outline-danger" type="button" data-remove-id="${s.id}">Remove</button></div></div>`;
      container.appendChild(div);
      div.querySelector('[data-resend-job]')?.addEventListener('click', (e) => resend(s.job, s.resume));
      div.querySelector('[data-remove-id]')?.addEventListener('click', (e) => removeShortlist(s.id));
    });
    document.getElementById('shortlistSection') && (document.getElementById('shortlistSection').style.display = 'block');
  }

  async function resend(job_id, resume_id) {
    const res = await apiFetch(SHORTLIST_URL, { method: 'POST', body: JSON.stringify({ job_id, resume_id, resend: true }) });
    if (res.ok) showToast('Email resent (queued)', 'success'); else showToast('Resend failed', 'error');
  }
  async function removeShortlist(id) {
    if (!id) { showToast('Invalid shortlist id', 'error'); return; }
    const ok = confirm('Remove shortlist?');
    if (!ok) return;
    const res = await apiFetch(SHORTLIST_URL, { method: 'DELETE', body: JSON.stringify({ id }) });
    if (res.ok) { showToast('Shortlist removed', 'success'); document.getElementById('showShortlistsBtn')?.click(); }
    else showToast('Remove failed', 'error');
  }

  // ---------------- Recruiter: load applications for job ----------------
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

  // ---------------- Quiz stubs (attachers created dynamically later) ----------------
  // Minimal attachQuizButtons - main logic (the detailed quiz modal code from earlier can be used unchanged).
  function attachQuizButtons() {
    // load attempt histories for job cards
    document.querySelectorAll('.job-card').forEach(card => {
      const jid = Number(card.dataset.jobId || card.getAttribute('data-job-id') || 0);
      if (jid) {
        // non-blocking
        fetchAttempts(jid).then(arr => {
          if (!arr || arr.error) return;
          const last = Array.isArray(arr) && arr.length ? arr[0] : null;
          const lbl = document.querySelector(`#quiz-status-${jid}`);
          if (lbl && last) { lbl.textContent = last.passed ? 'Passed' : 'Failed'; }
          if (last && last.passed) {
            const applyBtn = document.querySelector(`#apply-btn-${jid}`);
            if (applyBtn) { applyBtn.disabled = false; applyBtn.classList.remove('disabled'); }
          }
        }).catch(e => {});
      }
    });

    // wire take-quiz buttons
    document.querySelectorAll('.take-quiz-btn').forEach(btn => {
      if (btn.__quizAttached) return;
      btn.__quizAttached = true;
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const jid = Number(btn.dataset.jobId || btn.getAttribute('data-job-id') || 0);
        if (!jid) { showToast('Job id missing', 'error'); return; }
        if (typeof openQuizModal === 'function') openQuizModal(jid);
        else showToast('Quiz not available', 'info');
      });
    });

    // wire apply buttons
    document.querySelectorAll('.apply-btn').forEach(btn => {
      if (btn.__applyAttached) return;
      btn.__applyAttached = true;
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const jid = Number(btn.dataset.jobId || btn.getAttribute('data-job-id') || 0);
        if (!jid) { showToast('Job id missing', 'error'); return; }
        openApplyModal(jid);
      });
    });

    // wire view-attempts buttons (if any)
    attachViewHandlers();
  }

  // ---------------- Wiring & init ----------------
  function initDashboard() {
    console.log('candidate_dashboard.js init');

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
      try {
        const res = await handleUpload(f);
        if (res && res.ok) { showToast('Upload successful', 'success'); fi.value = ''; refreshResumes(); }
        else {
          let msg = 'Upload failed';
          if (res) { if (res.data && typeof res.data === 'object') { msg = res.data.detail || JSON.stringify(res.data); } else if (res.status) msg = `Status ${res.status}`; else if (res.error) msg = String(res.error); }
          showToast(msg, 'error', 7000);
        }
      } catch (e) { console.error(e); showToast('Upload error', 'error'); }
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

    // initial loads
    refreshResumes();
    loadJobs();
    setTimeout(() => { try { loadMyApplications(); } catch (e) { } }, 300);

    // attach quiz/buttons after small delay to handle dynamic content
    setTimeout(attachQuizButtons, 800);
  }

  // ---------------- Upload helpers (same as original) ----------------
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

  // ---------------- Matches - simplified wrapper ----------------
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
      const scoreRaw = m.score ?? m.score_percent ?? 0;
      let score = Number(scoreRaw) || 0; if (score > 0 && score <= 1) score = Math.round(score * 100);
      const badge = score >= 75 ? 'bg-success' : (score >= 50 ? 'bg-warning text-dark' : 'bg-danger');
      const card = document.createElement('div');
      card.className = 'card mb-2 p-2';
      card.innerHTML = `
        <div class="d-flex justify-content-between">
          <div>
            <strong>${escapeHtml(m.user || m.username || m.candidate_name || 'candidate')}</strong> — ${escapeHtml(m.experience || 0)} yrs
            <div class="small-muted">skills: ${escapeHtml(m.skills || '')}</div>
            <div class="small-muted">missing: ${escapeHtml((m.missing_skills || []).join(', '))}</div>
          </div>
          <div style="text-align:right;">
            <span class="badge ${badge}" style="font-size:1rem;padding:.5rem .6rem">${score}%</span>
            <div style="margin-top:.6rem;">
              <button class="btn btn-sm btn-primary view-attempts-btn" data-job-id="${selectedJob.id}" data-candidate-id="${m.candidate_id || m.user_id || ''}">View Attempts</button>
              <button class="btn btn-sm btn-outline-secondary ms-1" type="button">Shortlist</button>
            </div>
          </div>
        </div>`;
      listEl.appendChild(card);
    });
    document.getElementById('matchesSection') && (document.getElementById('matchesSection').style.display = 'block');
    attachViewHandlers();
  }

  // ---------------- Export my applications CSV ----------------
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

  // ---------------- Exports & boot ----------------
  window.openApplyModal = openApplyModal;
  window.loadApplicationsForJob = loadApplicationsForJob;
  window.selectJob = function (j) { selectedJob = j; };
  window.selectJobById = function (id) { /* optional helper - find card */ };
  window.refreshResumes = refreshResumes;
  window.deleteResume = deleteResume;
  window.shortlist = shortlist;
  window.showMatchesForSelectedJob = showMatchesForSelectedJob;
  window.exportMyApplicationsCSV = exportMyApplicationsCSV;

  if (document.readyState === 'loading') { window.addEventListener('DOMContentLoaded', initDashboard); } else { initDashboard(); }
})();
