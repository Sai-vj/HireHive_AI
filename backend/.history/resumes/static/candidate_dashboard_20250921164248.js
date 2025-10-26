// candidate_dashboard.js -- Candidate-only dashboard (clean, defensive)
// Patched: Start button shows only after invite accepted; viewInvite modal fixed.

import {
  saveTokens,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  isTokenExpired,
  refreshAccessToken,
  fetchWithAuth,
  apiFetchAsJson as apiFetch
} from './utils.js';

(function () {
  // small helpers & config
  const API = {
    JOBS: '/api/resumes/jobs/',
    JOB_DETAIL: (id) => `/api/resumes/jobs/${id}/`,
    MY_RESUMES: '/api/resumes/my-resumes/',
    UPLOAD: '/api/resumes/upload/',
    DELETE_RESUME: (id) => `/api/resumes/my-resumes/${id}/`,
    APPLY: '/api/resumes/apply/',
    APPLICATIONS: '/api/resumes/applications/',
    MY_APPLICATIONS: '/api/resumes/my-applications/',
    SHORTLIST: '/api/resumes/shortlist/',
    QUIZ_GET: (jobId) => `/api/quiz/${jobId}/`,
    QUIZ_ATTEMPTS_BY_JOB: (jobId) => `/api/quiz/${jobId}/attempts/`,
    QUIZ_ATTEMPT_SUBMIT: '/api/quiz/attempt/',
    // interview endpoints (adjust to /interviews/ if your project doesn't use /api/)
    INVITES: '/api/interviews/candidate/invites/',
    INVITE_RESPOND: (inviteId) => `/api/interviews/candidate/invites/${inviteId}/respond/`,
    START_INTERVIEW: (interviewId) => `/api/interviews/candidate/${interviewId}/start/`,
  };

  // Base path for interviews pages (used for redirects)
  // If your interviews app is included at /api/interviews change to '/api/interviews'
  const INTERVIEWS_BASE = '/interviews';

  // If you have a utils module, use it; otherwise fallback to basic wrappers
  const hasUtils = (typeof window.fetchWithAuth === 'function' && typeof window.apiFetch === 'function');
  async function fetchWithAuthFallback(url, options = {}) {
    if (hasUtils) return fetchWithAuth(url, options);
    // default: include token from localStorage if present
    const headers = Object.assign({}, options.headers || {});
    const token = localStorage.getItem('token') || '';
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const opts = Object.assign({}, options, { headers, credentials: 'same-origin' }); // ensure credentials
    return fetch(url, opts);
  }
  async function apiFetch(url, opts = {}) {
    // returns normalized { ok, status, data }
    try {
      if (hasUtils) {
        if (typeof window.apiFetch === 'function') {
          return await window.apiFetch(url, opts);
        }
        const res = await apiFetch(url, opts);
        return res;
      }
      const r = await fetchWithAuthFallback(url, opts);
      let data = null;
      const text = await r.text().catch(() => null);
      try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
      return { ok: r.ok, status: r.status, data };
    } catch (e) {
      return { ok: false, status: 0, error: e.message || String(e) };
    }
  }

  // UI helpers
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"'`]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#x60;' })[m]);
  }
  function showToast(msg, type = 'info', timeout = 3500) {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toastContainer';
      container.style.position = 'fixed';
      container.style.right = '18px';
      container.style.bottom = '18px';
      container.style.zIndex = 99999;
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.style.marginTop = '8px';
    el.style.padding = '8px 12px';
    el.style.borderRadius = '8px';
    el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
    el.style.background = type === 'success' ? '#d1e7dd' : type === 'error' ? '#f8d7da' : '#fff3cd';
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => el.remove(), timeout);
  }
  function showSpinner(on, text = '') {
    let sp = document.getElementById('globalSpinner');
    if (!sp) {
      sp = document.createElement('div');
      sp.id = 'globalSpinner';
      sp.style = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.6);z-index:99998;';
      sp.innerHTML = `<div style="text-align:center;"><div class="spinner-border" role="status" style="width:2.5rem;height:2.5rem"></div><div id="globalSpinnerText" style="margin-top:8px"></div></div>`;
      document.body.appendChild(sp);
    }
    sp.style.display = on ? 'flex' : 'none';
    const t = document.getElementById('globalSpinnerText');
    if (t) t.innerText = text || '';
  }

  // State
  let resumes = [];
  let jobs = [];
  let selectedJob = null;
  let quizTimerHandle = null;
  let quizSecondsRemaining = 0;

  /* ================= Resumes ================= */
  async function refreshResumes() {
    const container = document.getElementById('resumeList');
    if (!container) return;
    container.innerHTML = '<div class="small-muted">Loading resumes...</div>';
    const res = await apiFetch(API.MY_RESUMES);
    if (!res.ok) {
      // try alternate endpoints
      const alt = await apiFetch('/api/resumes/resumes/');
      if (alt.ok) res.data = alt.data;
    }
    const list = res.data || [];
    resumes = list;
    if (!list.length) {
      container.innerHTML = `<div class="small-muted">No resumes uploaded.</div>`;
      return;
    }
    container.innerHTML = '';
    list.forEach(r => {
      const id = r.id || r.pk || r.resume_id || '';
      const fileUrl = (r.file && typeof r.file === 'string') ? r.file : (r.file && r.file.url ? r.file.url : '');
      const fileName = r.file_name || (fileUrl ? fileUrl.split('/').pop() : `Resume ${id}`);
      const skills = r.skills || '';
      const uploaded = r.uploaded_at || r.created_at || '';
      const div = document.createElement('div');
      div.className = 'card mb-2 p-2';
      div.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
        <div style="min-width:0">
          <strong>${escapeHtml(fileName)}</strong><br>
          <small class="text-muted">${escapeHtml(uploaded)}</small>
          <div class="small-muted">${escapeHtml(String(skills)).slice(0,180)}</div>
        </div>
        <div style="display:flex;gap:8px">
          <a class="btn btn-sm btn-outline-primary" href="${escapeHtml(fileUrl) || '#'}" target="_blank" ${fileUrl ? '' : 'onclick="return false;"'}>View</a>
          <button class="btn btn-sm btn-outline-danger" data-resume-id="${id}">Delete</button>
        </div>
      </div>`;
      container.appendChild(div);
      const del = div.querySelector('button[data-resume-id]');
      del.addEventListener('click', async () => {
        if (!confirm('Delete resume? This cannot be undone.')) return;
        const rdel = await apiFetch(API.DELETE_RESUME(id), { method: 'DELETE' });
        if (rdel.ok) { showToast('Deleted', 'success'); refreshResumes(); }
        else showToast('Delete failed', 'error');
      });
    });
  }

  async function handleUploadFile(file) {
    if (!file) return showToast('No file', 'error');
    const maxMB = 20;
    if (file.size > maxMB * 1024 * 1024) return showToast(`Max ${maxMB}MB`, 'error');
    const fd = new FormData(); fd.append('file', file);
    showSpinner(true, 'Uploading resume...');
    try {
      const r = await fetchWithAuthFallback(API.UPLOAD, { method: 'POST', body: fd });
      const text = await r.text().catch(()=>null);
      let data = null; try { data = text ? JSON.parse(text) : null } catch(e){ data = text; }
      if (r.ok) { showToast('Upload successful', 'success'); refreshResumes(); }
      else showToast(`Upload failed: ${r.status}`, 'error');
    } catch (e) {
      showToast('Upload error', 'error');
    } finally { showSpinner(false); }
  }

  /* ================= Jobs ================= */
  async function loadJobs() {
    const el = document.getElementById('jobsList'); if (!el) return;
    el.innerHTML = '<div class="small-muted">Loading jobs...</div>';
    const res = await apiFetch(API.JOBS);
    if (!res.ok) {
      el.innerHTML = `<div class="small-muted">Failed to load jobs (${res.status})</div>`;
      return;
    }
    jobs = Array.isArray(res.data) ? res.data : (res.data?.results || []);
    if (!jobs || jobs.length === 0) { el.innerHTML = '<div class="small-muted">No jobs</div>'; return; }
    el.innerHTML = '';
    jobs.forEach(j => {
      const id = j.id || j.pk || '';
      const card = document.createElement('div');
      card.className = 'list-group-item job-card d-flex justify-content-between align-items-start';
      card.setAttribute('data-job-id', id);
      card.innerHTML = `<div style="min-width:0">
          <strong>${escapeHtml(j.title || `Job ${id}`)}</strong>
          <div class="small-muted">${escapeHtml(j.company || '')} • ${escapeHtml(j.skills_required || j.skills || '')}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
          <div>
            <button class="btn btn-sm btn-outline-primary view-job-btn" data-id="${id}">View</button>
            <button class="btn btn-sm btn-outline take-quiz-btn" data-id="${id}">Take Quiz</button>
            <button class="btn btn-sm btn-success apply-btn" data-id="${id}" disabled>Apply</button>
          </div>
          <div style="text-align:right"><span id="quiz-status-${id}" class="small text-muted">Not attempted</span></div>
        </div>`;
      el.appendChild(card);

      card.querySelector('.view-job-btn')?.addEventListener('click', () => viewJob(id));
      card.querySelector('.take-quiz-btn')?.addEventListener('click', () => openQuizModal(id));
      card.querySelector('.apply-btn')?.addEventListener('click', () => openApplyModal(id));
    });

    // load attempt summary for each job
    setTimeout(() => jobs.forEach(j => loadAttemptSummary(j.id)), 400);
  }

  async function viewJob(jobId) {
    if (!jobId) return showToast('Invalid job', 'error');
    showSpinner(true, 'Loading job...');
    const res = await apiFetch(API.JOB_DETAIL(jobId));
    showSpinner(false);
    if (!res.ok) return showToast('Failed to load job', 'error');
    const job = res.data || {};
    openJobDetailModal(job);
  }

  function openJobDetailModal(job) {
    let modal = document.getElementById('jobDetailModal');
    if (!modal) {
      modal = document.createElement('div'); modal.id = 'jobDetailModal';
      modal.className = 'modal fade';
      modal.innerHTML = `
      <div class="modal-dialog modal-lg"><div class="modal-content">
        <div class="modal-header"><h5 class="modal-title" id="jobDetailTitle"></h5><button class="btn-close" data-dismiss="modal"></button></div>
        <div class="modal-body" id="jobDetailBody"></div>
        <div class="modal-footer"><button class="btn btn-secondary" data-dismiss="modal">Close</button><button id="jobDetailApplyBtn" class="btn btn-primary">Apply</button></div>
      </div></div>`;
      document.body.appendChild(modal);
    }
    const title = modal.querySelector('#jobDetailTitle'); const body = modal.querySelector('#jobDetailBody'); const applyBtn = modal.querySelector('#jobDetailApplyBtn');
    title.innerText = job.title || `Job ${job.id||''}`;
    const company = job.company || '';
    const desc = job.description || job.summary || '';
    const skills = job.skills_required || job.skills || '';
    body.innerHTML = `<div><strong>Company:</strong> ${escapeHtml(company)}</div>
      <div><strong>Skills:</strong> ${escapeHtml(skills)}</div>
      <hr><div style="white-space:pre-wrap">${escapeHtml(desc)}</div>`;
    applyBtn.onclick = () => { try { bootstrap.Modal.getInstance(modal).hide(); } catch(e){}; openApplyModal(job.id || job.pk); };
    try { new bootstrap.Modal(modal, { backdrop:'static' }).show(); } catch (e) { modal.style.display = 'block'; }
  }

  /* ================= Quiz: modal, fetch, timer, submit ================= */
  function createQuizModalIfMissing() {
    if (document.getElementById('quizModal')) return;
    const modal = document.createElement('div');
    modal.id = 'quizModal';
    modal.style = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);z-index:99999';
    modal.innerHTML = `<div style="background:#fff;padding:18px;border-radius:8px;max-width:900px;width:96%;max-height:88vh;overflow:auto;position:relative;">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h4 id="quizTitle">Quiz</h4><button id="quizClose" class="btn btn-sm btn-outline-secondary">Close</button>
      </div>
      <div id="quizMeta" style="margin-top:8px;color:#666"></div>
      <div id="quizQuestions" style="margin-top:12px">Loading...</div>
      <div id="quizTimer" style="position:absolute;right:16px;top:14px;font-weight:600"></div>
      <div style="margin-top:12px;text-align:right"><button id="quizSubmit" class="btn btn-primary">Submit</button></div>
    </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#quizClose').addEventListener('click', closeQuizModal);
    modal.querySelector('#quizSubmit').addEventListener('click', submitQuizAttempt);
  }

  async function openQuizModal(jobId) {
    createQuizModalIfMissing();
    const modal = document.getElementById('quizModal');
    modal.style.display = 'flex';
    modal.dataset.jobId = jobId;
    const qWrap = modal.querySelector('#quizQuestions');
    qWrap.innerHTML = 'Loading...';
    // fetch quiz (or generate)
    let res = await apiFetch(API.QUIZ_GET(jobId));
    if (!res.ok) {
      // try generate endpoint (fallback)
      const gen = await apiFetch(`/api/quiz/generate/${jobId}/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_id: jobId }) });
      if (gen.ok) res = gen;
    }
    if (!res.ok) { qWrap.innerHTML = `<div class="text-danger">Failed to load quiz (${res.status})</div>`; return; }
    const body = res.data || {};
    let questions = Array.isArray(body) ? body : (Array.isArray(body.questions) ? body.questions : (Array.isArray(body.questions_json) ? body.questions_json : null));
    if (!questions || !Array.isArray(questions) || questions.length === 0) { qWrap.innerHTML = `<div class="text-danger">No questions available</div>`; return; }

    // decide time: <=5 -> 2min, <=10 -> 5min, else 5min per 10 (cap)
    let seconds = 300;
    if (questions.length <= 5) seconds = 120;
    else if (questions.length <= 10) seconds = 300;
    else seconds = Math.min(1800, Math.ceil(questions.length / 10) * 300);

    renderQuizQuestions(questions);
    startQuizTimer(seconds);
  }

  function renderQuizQuestions(questions) {
    const qWrap = document.getElementById('quizQuestions');
    if (!qWrap) return;
    qWrap.innerHTML = questions.slice(0, 50).map(q => {
      const choices = (q.choices && typeof q.choices === 'object') ? q.choices : (Array.isArray(q.options) ? q.options : []);
      const opts = Array.isArray(choices) ? choices.map((c, i) => `<div><label><input type="radio" name="q-${q.id}" value="${escapeHtml(String(i))}"> ${escapeHtml(String(c))}</label></div>`).join('') :
        Object.entries(choices).map(([k, v]) => `<div><label><input type="radio" name="q-${q.id}" value="${escapeHtml(String(k))}"> ${escapeHtml(String(v))}</label></div>`).join('');
      return `<div class="quiz-question" data-qid="${q.id}" style="margin-bottom:12px"><div style="font-weight:600">${escapeHtml(q.question || q.title || '')}</div><div style="margin-left:8px">${opts}</div></div>`;
    }).join('');
    const meta = document.getElementById('quizMeta');
    if (meta) meta.textContent = `Questions: ${questions.length}`;
  }

  function startQuizTimer(seconds) {
    const timerEl = document.getElementById('quizTimer');
    stopQuizTimer();
    quizSecondsRemaining = Number(seconds) || 0;
    function tick() {
      const m = Math.floor(quizSecondsRemaining / 60);
      const s = quizSecondsRemaining % 60;
      if (timerEl) timerEl.textContent = `⏳ ${m}:${String(s).padStart(2, '0')}`;
      if (quizSecondsRemaining <= 0) {
        stopQuizTimer();
        showToast('Time up — submitting', 'info');
        submitQuizAttempt(true);
        return;
      }
      quizSecondsRemaining--;
    }
    tick();
    quizTimerHandle = setInterval(tick, 1000);
  }
  function stopQuizTimer() { if (quizTimerHandle) { clearInterval(quizTimerHandle); quizTimerHandle = null; } const t = document.getElementById('quizTimer'); if (t) t.textContent = ''; }
  function closeQuizModal() { try { stopQuizTimer(); const modal = document.getElementById('quizModal'); if (modal) modal.style.display = 'none'; } catch (e) {} }

  async function submitQuizAttempt(auto = false) {
    const modal = document.getElementById('quizModal'); if (!modal) return;
    const jobId = modal.dataset.jobId;
    const ans = {};
    modal.querySelectorAll('.quiz-question').forEach(q => {
      const qid = q.dataset.qid;
      const sel = q.querySelector('input[type="radio"]:checked');
      ans[qid] = sel ? sel.value : null;
    });
    const btn = document.getElementById('quizSubmit'); if (btn) btn.disabled = true;
    try {
      const payload = { job_id: jobId, answers: ans };
      let res = await fetchWithAuthFallback(API.QUIZ_ATTEMPT_SUBMIT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      let body = null;
      try { body = await res.json(); } catch (e) { body = null; }
      if (!res.ok) {
        const alt = await fetchWithAuthFallback(`/api/quiz/${jobId}/attempt/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: ans }) });
        if (alt.ok) body = await alt.json();
      }
      const passed = body && (body.passed === true || (body.passed && body.passed === 'true'));
      const score = body && (body.score || body.total ? `${body.score || body.value || 0}/${body.total || body.max || ''}` : null);
      if (passed) showToast(`Passed — ${score || ''}`, 'success');
      else showToast(`Quiz submitted — ${score || ''}`, 'info');
      await loadAttemptSummary(jobId);
      await loadMyApplications();
      closeQuizModal();
    } catch (e) {
      console.error('quiz submit', e);
      showToast('Quiz submit failed', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* attempt summary for job (show latest attempt & enable apply) */
  async function loadAttemptSummary(jobId) {
    if (!jobId) return;
    const container = document.getElementById(`quiz-status-${jobId}`) || document.querySelector(`.job-card [id="quiz-status-${jobId}"]`);
    const tries = [
      API.QUIZ_ATTEMPTS_BY_JOB(jobId),
      `/api/quiz/attempts/?job_id=${jobId}`,
      `/api/quiz/attempts/?job=${jobId}`
    ];
    for (const u of tries) {
      try {
        const r = await apiFetch(u);
        if (!r.ok) continue;
        const arr = Array.isArray(r.data) ? r.data : (r.data?.results || r.data?.attempts || []);
        if (!arr || arr.length === 0) { if (container) container.textContent = 'Not attempted'; continue; }
        const latest = arr.slice().sort((a,b) => new Date(b.finished_at||b.started_at||0) - new Date(a.finished_at||a.started_at||0))[0];
        const passed = !!latest.passed;
        if (container) container.textContent = passed ? 'Passed' : 'Failed';
        const applyBtn = document.querySelector(`.apply-btn[data-id="${jobId}"]`);
        if (applyBtn) applyBtn.disabled = !passed;
        return arr;
      } catch (e) { continue; }
    }
  }

  /* ================= Applications ================= */
  async function loadMyApplications() {
    const el = document.getElementById('myApplicationsList'); if (!el) return;
    el.innerHTML = '<div class="small-muted">Loading applications...</div>';
    const tries = [API.MY_APPLICATIONS, API.APPLICATIONS, '/api/resumes/applications/?mine=true'];
    let res = null;
    for (const u of tries) {
      const r = await apiFetch(u);
      if (!r) continue;
      res = r;
      break;
    }
    if (!res) { el.innerHTML = '<div class="small-muted">Failed to load applications</div>'; return; }
    let apps = Array.isArray(res.data) ? res.data : (res.data?.applications || res.data?.results || []);
    if (!Array.isArray(apps)) apps = [];
    const token = localStorage.getItem('token') || '';
    let currentUserId = null;
    if (token) {
      try {
        const p = token.split('.')[1]; const payload = JSON.parse(atob(p)); currentUserId = payload?.user_id || payload?.id || payload?.sub;
      } catch (e) {}
    }
    if (currentUserId) {
      apps = apps.filter(a => {
        const cand = a.candidate || a.candidate_id || (a.candidate && a.candidate.id) || (a.resume && (a.resume.user || a.resume.user_id));
        return String(cand) === String(currentUserId) || !cand;
      });
    }

    if (!apps.length) { el.innerHTML = '<div class="small-muted">No applications yet</div>'; return; }
    el.innerHTML = '';
    apps.forEach(a => {
      const jobTitle = (a.job && (a.job.title || a.job)) || a.job_title || `Job ${a.job_id||''}`;
      const status = a.status || a.application_status || 'pending';
      const appliedAt = a.applied_at || a.created_at || '';
      const resumeUrl = a.resume_file || (a.resume && (a.resume.file || ''));
      const resumeLabel = (a.resume && (a.resume.file ? (a.resume.file.split('/').pop()) : `Resume ${a.resume.id||a.resume}`)) || `Resume ${a.resume_id || a.resume || ''}`;
      const id = a.id || a.application_id || '';
      const div = document.createElement('div');
      div.className = 'card mb-2 p-2';
      div.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:start">
        <div style="min-width:0">
          <strong>${escapeHtml(jobTitle)}</strong>
          <div class="small-muted">Applied: ${escapeHtml(appliedAt)} • Status: <span class="badge ${status==='shortlisted'?'bg-success':'bg-secondary'}">${escapeHtml(status)}</span></div>
          <div class="small-muted">Resume: ${resumeUrl ? `<a href="${escapeHtml(resumeUrl)}" target="_blank">${escapeHtml(resumeLabel)}</a>` : escapeHtml(resumeLabel)}</div>
        </div>
        <div style="text-align:right">
          <button class="btn btn-sm btn-outline-danger remove-app-btn" data-id="${id}">Withdraw</button>
        </div>
      </div>`;
      el.appendChild(div);
      div.querySelector('.remove-app-btn').addEventListener('click', async () => {
        if (!confirm('Withdraw this application?')) return;
        const tryUrls = [
          `/api/resumes/applications/${id}/`,
          `/api/applications/${id}/`,
          API.APPLICATIONS + `${id}/`
        ];
        let ok = false;
        for (const u of tryUrls) {
          const r = await apiFetch(u, { method: 'DELETE' });
          if (r.ok) { ok = true; break; }
        }
        if (!ok) {
          const r2 = await apiFetch(`/api/resumes/applications/${id}/withdraw/`, { method:'POST' });
          if (r2.ok) ok = true;
        }
        if (ok) { showToast('Withdrawn', 'success'); loadMyApplications(); }
        else showToast('Could not withdraw', 'error');
      });
    });
  }

  async function exportApplicationsCSV() {
    const res = await apiFetch(API.MY_APPLICATIONS);
    if (!res.ok) return showToast('Export not available', 'error');
    const apps = Array.isArray(res.data) ? res.data : (res.data?.applications || []);
    if (!apps.length) return showToast('No applications', 'info');
    const headers = ['application_id','job_title','resume_id','status','applied_at'];
    const rows = apps.map(a => [
      a.id || '',
      (a.job && (a.job.title || '')) || a.job_title || '',
      a.resume_id || (a.resume && a.resume.id) || '',
      a.status || '',
      a.applied_at || a.created_at || ''
    ]);
    const csv = headers.join(',') + '\n' + rows.map(r => r.map(c => `"${(String(c||'')).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'my_applications.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    showToast('Downloaded CSV', 'success');
  }

  /* ================= Invites ================= */
// ---- Replace loadInvites / processInvitesData / viewInvite / respondInvite with this block ----

// small local modal shim (prefer existing helpers if present)
const _showModal = (el, opts = {}) => {
  if (!el) return null;
  if (typeof window.safeShowModal === 'function') return window.safeShowModal(el, opts);
  if (typeof window.safeShowBootstrapModal === 'function') return window.safeShowBootstrapModal(el, opts);
  // fallback
  try { if (!document.body.contains(el)) document.body.appendChild(el); el.style.display = 'flex'; el.classList.remove('d-none'); document.body.style.overflow = 'hidden'; return null; } catch(e){ return null; }
};
const _hideModal = (el) => {
  if (!el) return;
  if (typeof window.safeHideModal === 'function') return window.safeHideModal(el);
  if (typeof window.safeHideBootstrapModal === 'function') return window.safeHideBootstrapModal(el);
  try { el.style.display = 'none'; el.classList.add('d-none'); document.body.style.overflow = ''; } catch(e) {}
};
const _attachGlobalModalCloseHandlers = () => { if (typeof window.attachGlobalModalCloseHandlers === 'function') return window.attachGlobalModalCloseHandlers(); /* else do nothing */ };

async function loadInvites() {
  const wrap = document.getElementById('invitesList');
  const modalWrap = document.getElementById('invitesListModal');
  if (wrap) wrap.innerHTML = '<div class="small-muted">Loading invites...</div>';
  if (modalWrap) modalWrap.innerHTML = '<div class="text-muted small">Loading invites...</div>';

  const res = await apiFetch(API.INVITES);
  if (!res || !res.ok) {
    // try alternate path
    try {
      const alt = await apiFetch('/interviews/candidate/invites/');
      if (alt && alt.ok) { processInvitesData(alt.data); return; }
    } catch(e) { /* ignore */ }
    if (wrap) wrap.innerHTML = `<div class="small-muted">Failed to load invites (${res ? res.status : 'network'})</div>`;
    if (modalWrap) modalWrap.innerHTML = `<div class="text-muted small">Failed to load invites (${res ? res.status : 'network'})</div>`;
    return;
  }

  processInvitesData(res.data);
}

function processInvitesData(raw) {
  // normalize array
  let arr = [];
  if (Array.isArray(raw)) arr = raw;
  else if (raw && Array.isArray(raw.results)) arr = raw.results;
  else if (raw && Array.isArray(raw.invites)) arr = raw.invites;
  else if (raw && Array.isArray(raw.data)) arr = raw.data;
  else arr = [];

  // normalize each invite
  const invites = arr.map(i => ({
    id: i.id || i.invite_id || null,
    status: (i.status || '').toString().toLowerCase() || 'pending',
    scheduled_at: i.scheduled_at || (i.interview && i.interview.scheduled_at) || '',
    message: i.message || i.note || '',
    interview: (typeof i.interview === 'object' ? i.interview : { id: i.interview || i.interview_id }),
    recruiter: i.recruiter_name || i.recruiter || '',
    raw: i
  }));

  // ----- Sidebar render -----
  const sidebarWrap = document.getElementById('invitesList');
  if (sidebarWrap) {
    sidebarWrap.innerHTML = '';
    if (!invites.length) {
      sidebarWrap.innerHTML = '<div class="small-muted">No invites.</div>';
    } else {
      invites.forEach(inv => {
        const id = inv.id;
        const interview = inv.interview || {};
        const title = interview.title || inv.raw.title || 'Interview';
        const scheduled = inv.scheduled_at || '';
        const status = inv.status;
        const recruiter = inv.recruiter || '';
        const div = document.createElement('div');
        div.className = 'card mb-2 p-2';
        div.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="min-width:0">
              <strong>${escapeHtml(title)}</strong>
              <div class="small-muted">${escapeHtml(recruiter)} • ${escapeHtml(scheduled)}</div>
            </div>
            <div style="text-align:right">
              <div class="small-muted">Status: ${escapeHtml(status)}</div>
              <div style="margin-top:6px">
                ${status === 'pending' ? `<button class="btn btn-sm btn-success accept-invite" data-id="${id}">Accept</button>
                                         <button class="btn btn-sm btn-outline-danger decline-invite" data-id="${id}">Decline</button>` : ''}
                ${status === 'accepted' && (interview.id || inv.raw.interview_id) ? `<button class="btn btn-sm btn-primary start-invite" data-interview="${interview.id||inv.raw.interview_id}" data-invite="${id}">Start</button>` : ''}
                <button class="btn btn-sm btn-outline-secondary ms-1 view-invite" data-id="${id}">View</button>
              </div>
            </div>
          </div>`;
        sidebarWrap.appendChild(div);

        // wire handlers
        div.querySelectorAll('.accept-invite').forEach(b => b.addEventListener('click', async () => {
          b.disabled = true;
          try {
            const r = await apiFetch(API.INVITE_RESPOND(id), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ response: 'accept' })
            });
            if (r && r.ok) { showToast('Accepted', 'success'); // update UI + close detail modal if open
              await loadInvites();
              const detailModal = document.getElementById('inviteDetailModal');
              if (detailModal) _hideModal(detailModal);
            } else { showToast('Accept failed','error'); b.disabled=false; }
          } catch (e) { console.error('accept error', e); showToast('Accept failed','error'); b.disabled=false; }
        }));

        div.querySelectorAll('.decline-invite').forEach(b => b.addEventListener('click', async () => {
          b.disabled = true;
          try {
            const r = await apiFetch(API.INVITE_RESPOND(id), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ response: 'decline' })
            });
            if (r && r.ok) { showToast('Declined', 'success'); await loadInvites(); const detailModal = document.getElementById('inviteDetailModal'); if (detailModal) _hideModal(detailModal); }
            else { showToast('Decline failed','error'); b.disabled=false; }
          } catch (e) { console.error('decline error', e); showToast('Decline failed','error'); b.disabled=false; }
        }));

        div.querySelectorAll('.start-invite').forEach(b => b.addEventListener('click', async () => {
          b.disabled = true;
          const iid = b.dataset.interview;
          const inviteId = b.dataset.invite;
          try {
            const r = await apiFetch(API.START_INTERVIEW(iid), { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ invite: inviteId }) });
            if (r && r.ok && (r.data?.redirect_url || r.data?.join_url || r.data?.url)) {
              window.location.href = r.data.redirect_url || r.data.join_url || r.data.url;
            } else {
              window.location.href = `${INTERVIEWS_BASE}/page/candidate/${iid}/?invite=${inviteId}`;
            }
          } catch (e) {
            console.error('start invite error', e);
            window.location.href = `${INTERVIEWS_BASE}/page/candidate/${iid}/?invite=${inviteId}`;
          } finally { b.disabled = false; }
        }));

        div.querySelectorAll('.view-invite').forEach(b => b.addEventListener('click', () => viewInvite(b.dataset.id)));
      }
 ) }
  }

  // ----- Modal render (if present) -----
  const modalWrap = document.getElementById('invitesListModal');
  if (modalWrap) {
    modalWrap.innerHTML = '';
    if (!invites.length) {
      modalWrap.innerHTML = '<div class="text-muted small">No invites.</div>';
    } else {
      invites.forEach(inv => {
        const id = inv.id;
        const interview = inv.interview || {};
        const title = interview.title || inv.raw.title || 'Interview';
        const scheduled = inv.scheduled_at || '';
        const status = inv.status;
        const recruiter = inv.recruiter || '';
        const row = document.createElement('div');
        row.className = 'mb-3 p-2 border rounded';
        row.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="min-width:0">
              <div style="font-weight:600">${escapeHtml(title)}</div>
              <div class="small-muted">${escapeHtml(recruiter)} • ${escapeHtml(scheduled)}</div>
              <div class="small-muted">Status: ${escapeHtml(status)}</div>
              <div style="margin-top:6px">${escapeHtml(inv.message || '')}</div>
            </div>
            <div style="text-align:right">
              ${status === 'pending' ? `<button class="btn btn-sm btn-success accept-invite-modal mb-1" data-id="${id}">Accept</button>
                                       <button class="btn btn-sm btn-outline-danger decline-invite-modal mb-1" data-id="${id}">Decline</button>` : ''}
              ${status === 'accepted' && (interview.id || inv.raw.interview_id) ? `<button class="btn btn-sm btn-primary start-invite-modal" data-interview="${interview.id||inv.raw.interview_id}" data-invite="${id}">Start</button>` : ''}
              <div style="margin-top:6px"><button class="btn btn-sm btn-outline-secondary view-invite-modal" data-id="${id}">View</button></div>
            </div>
          </div>`;
        modalWrap.appendChild(row);

        row.querySelectorAll('.accept-invite-modal').forEach(b => b.addEventListener('click', async () => {
          b.disabled = true;
          try {
            const r = await apiFetch(API.INVITE_RESPOND(id), { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ response: 'accept' }) });
            if (r && r.ok) { showToast('Accepted', 'success'); await loadInvites(); const invitesModal = document.getElementById('invitesModal'); if (invitesModal) _hideModal(invitesModal); } else { showToast('Accept failed', 'error'); b.disabled = false; }
          } catch (e) { console.error(e); showToast('Accept failed', 'error'); b.disabled = false; }
        }));

        row.querySelectorAll('.decline-invite-modal').forEach(b => b.addEventListener('click', async () => {
          b.disabled = true;
          try {
            const r = await apiFetch(API.INVITE_RESPOND(id), { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ response: 'decline' }) });
            if (r && r.ok) { showToast('Declined', 'success'); await loadInvites(); const invitesModal = document.getElementById('invitesModal'); if (invitesModal) _hideModal(invitesModal); } else { showToast('Decline failed', 'error'); b.disabled = false; }
          } catch (e) { console.error(e); showToast('Decline failed', 'error'); b.disabled = false; }
        }));

        row.querySelectorAll('.start-invite-modal').forEach(b => b.addEventListener('click', () => startInterview(b.dataset.interview, b.dataset.invite)));
        row.querySelectorAll('.view-invite-modal').forEach(b => b.addEventListener('click', () => viewInvite(b.dataset.id)));
      });
    }

    // show invites modal if present
    const invitesModal = document.getElementById('invitesModal');
    if (invitesModal) {
      // place content inside the modal body if structure exists
      const body = invitesModal.querySelector('#invitesList') || invitesModal.querySelector('#invitesListModal') || invitesModal.querySelector('.modal-body #invitesList');
      if (body) body.innerHTML = modalWrap.innerHTML;
      _showModal(invitesModal);
      _attachGlobalModalCloseHandlers();
    }
  }
}

// ---------- Invite modal helpers ----------
async function viewInvite(inviteId) {
  if (!inviteId) return showToast('Invite id missing', 'error');

  // ensure modal exists
  let modal = document.getElementById('inviteDetailModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'inviteDetailModal';
    modal.className = 'modal fade';
    modal.innerHTML = `<div class="modal-dialog modal-lg"><div class="modal-content">
      <div class="modal-header"><h5 class="modal-title">Invite details</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
      <div class="modal-body"><div id="inviteDetailContent">Loading...</div></div>
      <div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">Close</button></div>
    </div></div>`;
    document.body.appendChild(modal);
    // close wiring (works with our _hideModal)
    modal.querySelectorAll('[data-bs-dismiss="modal"], .btn-close').forEach(b => b.addEventListener('click', () => _hideModal(modal)));
  }

  const content = modal.querySelector('#inviteDetailContent');
  if (!content) return;
  content.innerHTML = 'Loading...';
  _showModal(modal);
  _attachGlobalModalCloseHandlers();

  // try to fetch HTML fragment first
  try {
    const fragUrl = `${INTERVIEWS_BASE}/fragments/invite_row/${inviteId}/`;
    const fragResp = await fetch(fragUrl, { method: 'GET', credentials: 'same-origin' });
    if (fragResp.ok) {
      const html = await fragResp.text();
      content.innerHTML = html;
      return;
    }
  } catch (e) {
    console.debug('Fragment fetch failed, fallback to JSON', e);
  }

  try {
    const listResp = await apiFetch(API.INVITES);
    if (!listResp || !listResp.ok) {
      content.innerHTML = `<div class="text-danger">Failed to load invite (status ${listResp ? listResp.status : 'network'})</div>`;
      return;
    }
    let arr = Array.isArray(listResp.data) ? listResp.data : (listResp.data?.results || listResp.data?.invites || []);
    const inv = (arr || []).find(x => String(x.id) === String(inviteId) || String(x.invite_id) === String(inviteId));
    if (!inv) {
      content.innerHTML = `<div class="text-muted">Invite not found</div>`;
      return;
    }
    const interview = inv.interview || {};
    const status = (inv.status || 'pending').toString().toLowerCase();
    content.innerHTML = `
      <div><strong>${escapeHtml((interview.title||inv.title||'Interview'))}</strong></div>
      <div style="margin-top:6px"><strong>When:</strong> ${escapeHtml(inv.scheduled_at || interview.scheduled_at || '—')}</div>
      <div style="margin-top:6px"><strong>Message:</strong><div style="white-space:pre-wrap">${escapeHtml(inv.message || inv.note || '')}</div></div>
      <div style="margin-top:6px"><strong>Status:</strong> ${escapeHtml(status)}</div>
      <div style="margin-top:10px;text-align:right">
        ${status === 'pending' ? `<button id="inviteAcceptBtn" class="btn btn-success btn-sm">Accept</button>
          <button id="inviteDeclineBtn" class="btn btn-outline-danger btn-sm">Decline</button>` : ''}
        ${(status === 'accepted') && (interview.id || inv.interview_id) ? `<button id="inviteStartBtn" class="btn btn-primary btn-sm">Start</button>` : ''}
      </div>
    `;

    // attach handlers (use our safe hide to close)
    modal.querySelector('#inviteAcceptBtn')?.addEventListener('click', async () => {
      await respondInvite(inviteId, 'accept');
      _hideModal(modal);
    });
    modal.querySelector('#inviteDeclineBtn')?.addEventListener('click', async () => {
      await respondInvite(inviteId, 'decline');
      _hideModal(modal);
    });
    modal.querySelector('#inviteStartBtn')?.addEventListener('click', () => {
      const iid = (interview.id || inv.interview_id);
      _hideModal(modal);
      startInterview(iid, inviteId);
    });

  } catch (err) {
    console.error('viewInvite error', err);
    content.innerHTML = `<div class="text-danger">Error loading invite (see console)</div>`;
  }
}

async function respondInvite(inviteId, action) {
  if (!inviteId) return showToast('Invite id missing', 'error');
  const act = String(action || '').toLowerCase();
  if (!['accept','accepted','decline','declined','yes','no'].includes(act)) return showToast('Invalid action', 'error');
  const payload = { response: act.startsWith('acc') ? 'accept' : 'decline' };

  try {
    const r = await apiFetch(API.INVITE_RESPOND(inviteId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!r || !r.ok) {
      console.warn('respondInvite failed', r);
      showToast('Failed to respond to invite', 'error');
      return;
    }
    showToast(`Invite ${payload.response}ed`, 'success');
    // refresh invites and close any open inviteDetailModal
    if (typeof loadInvites === 'function') await loadInvites();
    const detailModal = document.getElementById('inviteDetailModal'); if (detailModal) _hideModal(detailModal);
    const invitesModal = document.getElementById('invitesModal'); if (invitesModal) _hideModal(invitesModal);
  } catch (e) {
    console.error('respondInvite error', e);
    showToast('Network error', 'error');
  }
}
async function startInterview(interviewId, inviteId = null) { if (!interviewId) return showToast('Interview id missing', 'error'); try { const r = await apiFetch(API.START_INTERVIEW(interviewId), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invite: inviteId }) }); if (!r.ok) { let msg = r.data?.detail || r.data?.message || Status ${r.status}; if (r.data && r.data.scheduled_start) msg += — Starts at ${new Date(r.data.scheduled_start).toLocaleString()}; showToast('Cannot start: ' + msg, 'error', 7000); return; } const data = r.data || {}; if (data.redirect_url || data.join_url || data.url) { window.location.href = data.redirect_url || data.join_url || data.url; return; } const attemptParam = data.attempt_id ? ?attempt=${data.attempt_id} : (inviteId ? ?invite=${inviteId} : ''); window.location.href = ${INTERVIEWS_BASE}/page/candidate/${interviewId}/${attemptParam}; } catch (err) { console.error('startInterview error', err); window.location.href = ${INTERVIEWS_BASE}/page/candidate/${interviewId}/ + (inviteId ? ?invite=${inviteId} : ''); } }


  // --- Auto-auth init: if token already in input box, save to localStorage ---
  (function autoSaveTokenFromInput() {
    try {
      const tokenInputEl = document.getElementById('tokenInput');
      const saveBtn = document.getElementById('saveTokenBtn');

      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          const val = (tokenInputEl?.value || '').trim();
          if (!val) return showToast('Paste token first', 'error');

          try {
            const parsed = JSON.parse(val);
            const access = parsed.access || parsed.token || parsed.access_token;
            const refresh = parsed.refresh || parsed.refresh_token || null;
            if (access) {
              saveTokens({ access, refresh });
              showToast('Tokens saved', 'success');
            }
          } catch (e) {
            saveTokens({ access: val, refresh: null });
            showToast('Access token saved', 'success');
          }

          if (tokenInputEl) tokenInputEl.style.display = 'none';
          if (saveBtn) saveBtn.style.display = 'none';
        });
      }

      if (getAccessToken()) {
        if (tokenInputEl) tokenInputEl.style.display = 'none';
        if (saveBtn) saveBtn.style.display = 'none';
      }
    } catch (err) {
      console.warn('autoSaveTokenFromInput error', err);
    }
  })();

  /* ================= Init + wiring ================= */
  function init() {
    console.log('candidate dashboard init');
    document.getElementById('saveTokenBtn')?.addEventListener('click', () => {
      const v = (document.getElementById('tokenInput')?.value || '').trim();
      if (!v) return showToast('Paste token first', 'error');
      localStorage.setItem('token', v); showToast('Token saved', 'success');
    });
    document.getElementById('uploadBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      const fi = document.getElementById('resumeFile'); if (!fi || !fi.files || fi.files.length===0) return showToast('Choose file', 'error');
      handleUploadFile(fi.files[0]);
    });
    document.getElementById('refreshJobs')?.addEventListener('click', loadJobs);
    document.getElementById('refreshMyAppsBtn')?.addEventListener('click', loadMyApplications);
    document.getElementById('exportMyAppsBtn')?.addEventListener('click', exportApplicationsCSV);

    if (!document.getElementById('applyModal')) {
      const div = document.createElement('div'); div.id='applyModal'; div.style='display:none';
      div.innerHTML = `<div style="padding:12px;background:#fff;border-radius:8px;max-width:520px;">
        <h5>Apply</h5>
        <form id="applyForm">
          <div><label>Resume</label><select id="applyResumeSelect" class="form-control"></select></div>
          <div style="margin-top:8px"><label>Message</label><textarea id="applyMessage" class="form-control" rows="3"></textarea></div>
          <div style="margin-top:12px;text-align:right"><button id="applySubmitBtn" class="btn btn-primary">Apply</button></div>
        </form>
      </div>`;
      document.body.appendChild(div);
    }

    const saveBtn = document.getElementById('saveTokenBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const tokenInput = document.getElementById('tokenInput');
        if (!tokenInput) return showToast('Token input not found', 'error');
        const val = (tokenInput.value || '').trim();
        if (!val) return showToast('Paste token or JSON then click Save', 'error');
        try {
          const parsed = JSON.parse(val);
          const access = parsed.access || parsed.token || parsed.access_token || null;
          const refresh = parsed.refresh || parsed.refresh_token || null;
          if (access) {
            saveTokens({ access, refresh });
            showToast('Tokens saved', 'success');
            tokenInput.style.display = 'none';
            saveBtn.style.display = 'none';
            return;
          }
        } catch (e) {}
        saveTokens({ access: val, refresh: null });
        showToast('Access token saved (no refresh token).', 'success');
        tokenInput.style.display = 'none';
        saveBtn.style.display = 'none';
      });
    }

    document.addEventListener('submit', async (e) => {
      if (!e.target || e.target.id !== 'applyForm') return;
      e.preventDefault();
      const jobId = window.__apply_job_id;
      const resumeId = document.getElementById('applyResumeSelect')?.value;
      const message = (document.getElementById('applyMessage')?.value || '').trim();
      if (!jobId || !resumeId) return showToast('Select job and resume', 'error');
      showSpinner(true, 'Applying...');
      try {
        let res = await apiFetch(API.APPLY, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ job_id: jobId, resume_id: resumeId, message }) });
        if (!res.ok) {
          const fd = new FormData(); fd.append('job_id', jobId); fd.append('resume_id', resumeId); fd.append('message', message);
          const r2 = await fetchWithAuthFallback(API.APPLY, { method:'POST', body: fd });
          res = { ok: r2.ok, status: r2.status, data: await (async ()=>{ try { return await r2.json(); } catch { return null; } })() };
        }
        if (res.ok) {
          showToast('Applied', 'success');
          try { const m = document.getElementById('applyModal'); if (m && m.classList.contains('modal')) bootstrap.Modal.getInstance(m).hide(); else m.style.display='none'; } catch(e){}
          loadMyApplications();
        } else {
          const msg = res.data?.detail || res.data?.message || `Status ${res.status}`;
          showToast('Apply failed: ' + msg, 'error');
        }
      } catch (e) {
        showToast('Apply error', 'error');
      } finally { showSpinner(false); }
    });

    if (!document.getElementById('invitesModal')) {
      const m = document.createElement('div'); m.id='invitesModal'; m.className='modal fade'; m.tabIndex='-1'; m.setAttribute('aria-hidden','true');
      m.innerHTML = `<div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Invites</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div><div class="modal-body p-3"><div id="invitesModalAlert" style="display:none" class="mb-2"></div><div id="invitesListModal"><div class="text-muted small">Loading invites...</div></div></div><div class="modal-footer"><button id="invitesModalClose" type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button><button id="invitesModalRefresh" type="button" class="btn btn-primary">Refresh</button></div></div></div>`;
      document.body.appendChild(m);
      m.querySelector('#invitesModalClose')?.addEventListener('click', ()=> {
        try { const modal = bootstrap.Modal.getInstance(m); if(modal) modal.hide(); } catch(e){ m.style.display='none'; }
      });
      m.querySelector('#invitesModalRefresh')?.addEventListener('click', () => loadInvites());
    }

    // initial load
    refreshResumes(); loadJobs(); loadMyApplications(); setTimeout(loadInvites, 400);

    // view invites button wiring
    document.getElementById('viewInvitesBtn')?.addEventListener('click', () => {
      const m = document.getElementById('invitesModal');
      if (m) {
        try { const modal = new bootstrap.Modal(m); modal.show(); } catch (e) { m.style.display = 'block'; }
      }
      loadInvites();
    });
  }

  // --- Auto-auth init: hide token UI if tokens exist, and try refresh access token ---
  (function autoAuthInit() {
    try {
      const tokenInputEl = document.getElementById('tokenInput');
      const saveBtn = document.getElementById('saveTokenBtn');
      if ((getRefreshToken && getRefreshToken()) || (getAccessToken && getAccessToken())) {
        if (tokenInputEl) tokenInputEl.style.display = 'none';
        if (saveBtn) saveBtn.style.display = 'none';
      }
      refreshAccessToken().catch(()=>{});
    } catch (e) {
      console.warn('autoAuthInit error', e);
    }
  })();

  // helpers to open apply modal (populates resume select)
  window.openApplyModal = function (jobId) {
    window.__apply_job_id = jobId;
    const modal = document.getElementById('applyModal');
    const sel = document.getElementById('applyResumeSelect');
    if (!sel) return showToast('Apply modal missing', 'error');
    sel.innerHTML = '<option value="">-- choose resume --</option>';
    resumes.forEach(r => {
      const id = r.id || r.pk || r.resume_id || '';
      const name = r.file_name || (r.file ? (typeof r.file === 'string' ? r.file.split('/').pop() : (r.file.url ? r.file.url.split('/').pop() : `Resume ${id}`)) : `Resume ${id}`);
      const opt = document.createElement('option'); opt.value = id; opt.text = name; sel.appendChild(opt);
    });
    try { if (modal && modal.classList.contains('modal')) new bootstrap.Modal(modal, { backdrop:'static' }).show(); else modal.style.display='block'; }
    catch (e) { modal.style.display = 'block'; }
  };

  // expose some functions to console for debugging
  window.cdb = {
    refreshResumes, loadJobs, loadMyApplications, loadInvites, openApplyModal, openQuizModal, exportApplicationsCSV
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  window.cdb = {
    refreshResumes, loadJobs, loadMyApplications, loadInvites, openApplyModal, openQuizModal, exportApplicationsCSV
  };

  // expose utilities
  window.viewInvite = viewInvite;
  window.respondInvite = respondInvite;
  window.startInterview = startInterview;

})();
