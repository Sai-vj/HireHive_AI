// candidate_dashboard.js -- Candidate-only dashboard (clean, defensive)
// Minimal changes: adds robust local fetch wrappers and small Bootstrap fixes.
// Do NOT change your server URLs.

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
    INVITES: '/api/interviews/candidate/invites/',
    INVITE_RESPOND: (inviteId) => `/api/interviews/candidate/invites/${inviteId}/respond/`,
    START_INTERVIEW: (interviewId) => `/api/interviews/candidate/${interviewId}/start/`,
  };

  // ----------------- safe wrappers -----------------
  // If you provide window.fetchWithAuth or window.apiFetch (from utils), prefer them.
  const hasFetchWithAuth = typeof window.fetchWithAuth === 'function';
  const hasApiFetch = typeof window.apiFetch === 'function' || typeof window.apiFetchAsJson === 'function';

  async function _fetchWithAuth(url, options = {}) {
    // prefer user-provided fetchWithAuth if present
    if (hasFetchWithAuth) return window.fetchWithAuth(url, options);

    // fallback: include token from localStorage if any
    const headers = Object.assign({}, options.headers || {});
    const token = localStorage.getItem('token') || localStorage.getItem('access_token') || '';
    if (token && !headers['Authorization']) headers['Authorization'] = 'Bearer ' + token;
    const opts = Object.assign({}, options, { headers, credentials: options.credentials || 'same-origin' });
    return fetch(url, opts);
  }

  // normalized api fetch returning { ok, status, data }
  async function _apiFetch(url, opts = {}) {
    // prefer user-provided apiFetch / apiFetchAsJson if available
    try {
      if (hasApiFetch) {
        if (typeof window.apiFetch === 'function') {
          return await window.apiFetch(url, opts);
        }
        if (typeof window.apiFetchAsJson === 'function') {
          return await window.apiFetchAsJson(url, opts);
        }
      }
    } catch (e) {
      // fall through to local implementation
      console.debug('user apiFetch failed, falling back', e);
    }

    // fallback implementation
    try {
      const r = await _fetchWithAuth(url, opts);
      const text = await r.text().catch(() => null);
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
      return { ok: r.ok, status: r.status, data };
    } catch (e) {
      return { ok: false, status: 0, error: e.message || String(e) };
    }
  }

  // ----------------- UI helpers -----------------
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

  // ----------------- State -----------------
  let resumes = [];
  let jobs = [];
  let quizTimerHandle = null;
  let quizSecondsRemaining = 0;

  /* ================= Resumes ================= */
  async function refreshResumes() {
    const container = document.getElementById('resumeList');
    if (!container) return;
    container.innerHTML = '<div class="small-muted">Loading resumes...</div>';
    const res = await _apiFetch(API.MY_RESUMES);
    let list = [];
    if (res && res.ok) list = res.data || [];
    else {
      // fallback
      const alt = await _apiFetch('/api/resumes/resumes/');
      if (alt && alt.ok) list = alt.data || [];
    }
    resumes = Array.isArray(list) ? list : (list?.results || []);
    if (!resumes.length) {
      container.innerHTML = `<div class="small-muted">No resumes uploaded.</div>`;
      return;
    }
    container.innerHTML = '';
    resumes.forEach(r => {
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
        const rdel = await _apiFetch(API.DELETE_RESUME(id), { method: 'DELETE' });
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
      const r = await _fetchWithAuth(API.UPLOAD, { method: 'POST', body: fd });
      const text = await r.text().catch(()=>null);
      if (r.ok) { showToast('Upload successful', 'success'); await refreshResumes(); }
      else showToast(`Upload failed: ${r.status}`, 'error');
    } catch (e) {
      showToast('Upload error', 'error');
    } finally { showSpinner(false); }
  }

  /* ================= Jobs ================= */
  async function loadJobs() {
    const el = document.getElementById('jobsList'); if (!el) return;
    el.innerHTML = '<div class="small-muted">Loading jobs...</div>';
    const res = await _apiFetch(API.JOBS);
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
    const res = await _apiFetch(API.JOB_DETAIL(jobId));
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
        <div class="modal-header"><h5 class="modal-title" id="jobDetailTitle"></h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body" id="jobDetailBody"></div>
        <div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">Close</button><button id="jobDetailApplyBtn" class="btn btn-primary">Apply</button></div>
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
    let res = await _apiFetch(API.QUIZ_GET(jobId));
    if (!res.ok) {
      // try generate endpoint (fallback)
      const gen = await _apiFetch(`/api/quiz/generate/${jobId}/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_id: jobId }) });
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
    // collect answers
    const ans = {};
    modal.querySelectorAll('.quiz-question').forEach(q => {
      const qid = q.dataset.qid;
      const sel = q.querySelector('input[type="radio"]:checked');
      ans[qid] = sel ? sel.value : null;
    });
    const btn = document.getElementById('quizSubmit'); if (btn) btn.disabled = true;
    try {
      const payload = { job_id: jobId, answers: ans };
      // try JSON submission with normalized wrapper when possible
      let res;
      try {
        res = await _fetchWithAuth(API.QUIZ_ATTEMPT_SUBMIT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        // res might be a fetch Response or a normalized object (if user-provided)
        if (res && typeof res.ok === 'boolean') {
          // user-provided api returned normalized object; convert to body
          // but when using _fetchWithAuth we get real Response
        }
      } catch (e) {
        // ignore - we'll try _apiFetch below
      }

      // prefer calling normalized _apiFetch if the previous was not a fetch Response
      let body = null;
      if (res && typeof res.json === 'function') {
        try { body = await res.json(); } catch (e) { body = null; }
        if (!res.ok) {
          // fallback endpoint
          const alt = await _fetchWithAuth(`/api/quiz/${jobId}/attempt/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: ans }) });
          if (alt && typeof alt.json === 'function') {
            try { body = await alt.json(); } catch (e) { body = body || null; }
          }
        }
      } else {
        // use normalized wrapper
        const rpc = await _apiFetch(API.QUIZ_ATTEMPT_SUBMIT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (rpc && rpc.ok) body = rpc.data;
        else {
          const altRpc = await _apiFetch(`/api/quiz/${jobId}/attempt/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: ans }) });
          if (altRpc && altRpc.ok) body = altRpc.data;
        }
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
        const r = await _apiFetch(u);
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
      const r = await _apiFetch(u);
      if (!r) continue;
      res = r;
      break;
    }
    if (!res) { el.innerHTML = '<div class="small-muted">Failed to load applications</div>'; return; }
    let apps = Array.isArray(res.data) ? res.data : (res.data?.applications || res.data?.results || []);
    if (!Array.isArray(apps)) apps = [];
    // filter by current user if JWT present
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
          const r = await _apiFetch(u, { method: 'DELETE' });
          if (r.ok) { ok = true; break; }
        }
        if (!ok) {
          const r2 = await _apiFetch(`/api/resumes/applications/${id}/withdraw/`, { method:'POST' });
          if (r2.ok) ok = true;
        }
        if (ok) { showToast('Withdrawn', 'success'); loadMyApplications(); }
        else showToast('Could not withdraw', 'error');
      });
    });
  }

  async function exportApplicationsCSV() {
    const res = await _apiFetch(API.MY_APPLICATIONS);
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
  async function loadInvites() {
    const wrap = document.getElementById('invitesList'); if (!wrap) {
      // if invitesList doesn't exist, nothing to render
      return;
    }
    wrap.innerHTML = '<div class="small-muted">Loading invites...</div>';
    const res = await _apiFetch(API.INVITES);
    if (!res.ok) {
      wrap.innerHTML = `<div class="small-muted">Failed to load invites (${res.status})</div>`;
      return;
    }
    const arr = Array.isArray(res.data) ? res.data : (res.data?.results || []);
    if (!arr || arr.length === 0) { wrap.innerHTML = '<div class="small-muted">No invites.</div>'; return; }
    wrap.innerHTML = '';
    arr.forEach(inv => {
      const id = inv.id || inv.invite_id || inv.pk || '';
      const interview = inv.interview || inv.interview_data || {};
      const title = interview.title || inv.title || 'Interview';
      const scheduled = inv.scheduled_at || interview.scheduled_at || '';
      const recruiter = inv.recruiter_name || inv.recruiter || '';
      const status = (inv.status || 'pending').toLowerCase();
      const div = document.createElement('div');
      div.className = 'card mb-2 p-2';
      div.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
        <div style="min-width:0">
          <strong>${escapeHtml(title)}</strong><div class="small-muted">${escapeHtml(recruiter)} • ${escapeHtml(scheduled)}</div>
        </div>
        <div style="text-align:right">
          <div class="small-muted">Status: ${escapeHtml(status)}</div>
          <div style="margin-top:6px">
            ${status==='pending' ? `<button class="btn btn-sm btn-success accept-invite" data-id="${id}">Accept</button><button class="btn btn-sm btn-outline-danger decline-invite" data-id="${id}">Decline</button>` : ''}
            ${status==='accepted' && (interview.id||inv.interview_id) ? `<button class="btn btn-sm btn-primary start-invite" data-interview="${escapeHtml(interview.id||inv.interview_id)}" data-invite="${escapeHtml(id)}">Start</button>` : ''}
            <button class="btn btn-sm btn-outline-secondary ms-1 view-invite" data-id="${escapeHtml(id)}">View</button>
          </div>
        </div>
      </div>`;
      wrap.appendChild(div);

      div.querySelectorAll('.accept-invite').forEach(b => b.addEventListener('click', async () => {
        b.disabled = true;
        const r = await _apiFetch(API.INVITE_RESPOND(id), { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ response: 'accept' }) });
        if (r.ok) { showToast('Accepted', 'success'); loadInvites(); } else { showToast('Accept failed','error'); b.disabled=false; }
      }));
      div.querySelectorAll('.decline-invite').forEach(b => b.addEventListener('click', async () => {
        b.disabled = true;
        const r = await _apiFetch(API.INVITE_RESPOND(id), { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ response: 'decline' }) });
        if (r.ok) { showToast('Declined', 'success'); loadInvites(); } else { showToast('Decline failed','error'); b.disabled=false; }
      }));
      div.querySelectorAll('.start-invite').forEach(b => b.addEventListener('click', async () => {
        b.disabled = true;
        const iid = b.dataset.interview;
        const inviteId = b.dataset.invite;
        const r = await _apiFetch(API.START_INTERVIEW(iid), { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ invite: inviteId }) });
        if (r.ok && (r.data?.redirect_url || r.data?.join_url || r.data?.url)) {
          window.location.href = r.data.redirect_url || r.data.join_url || r.data.url;
        } else {
          window.location.href = `/interviews/page/candidate/${encodeURIComponent(iid)}/?invite=${encodeURIComponent(inviteId)}`;
        }
        b.disabled = false;
      }));
      div.querySelectorAll('.view-invite').forEach(b => b.addEventListener('click', () => viewInvite(b.dataset.id)));
    });
  }

  /* ---------- Invite modal helpers ---------- */
// --- Replace existing viewInvite(inviteId) with this robust version ---
async function viewInvite(inviteId) {
  if (!inviteId) return showToast('Invite id missing', 'error');

  // Ensure modal exists
  let modal = document.getElementById('inviteDetailModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'inviteDetailModal';
    modal.className = 'modal fade';
    modal.style.display = 'none';
    modal.innerHTML = `<div class="modal-dialog modal-lg"><div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Invite details</h5>
        <button type="button" class="btn-close" aria-label="Close"></button>
      </div>
      <div class="modal-body"><div id="inviteDetailContent">Loading...</div></div>
      <div class="modal-footer"><button class="btn btn-secondary" data-close>Close</button></div>
    </div></div>`;
    document.body.appendChild(modal);

    // Close wiring (single time)
    const closeButtons = modal.querySelectorAll('[data-close], .btn-close');
    closeButtons.forEach(b => b.addEventListener('click', () => {
      try { bootstrap.Modal.getInstance(modal)?.hide(); } catch(e) { modal.style.display = 'none'; document.body.style.overflow = ''; }
    }));

    // Ensure clicking backdrop hides modal (bootstrap will do this if used)
    modal.addEventListener('click', (ev) => {
      if (ev.target === modal) {
        try { bootstrap.Modal.getInstance(modal)?.hide(); } catch(e) { modal.style.display='none'; document.body.style.overflow = ''; }
      }
    });
  }

  const content = modal.querySelector('#inviteDetailContent');
  if (!content) return;
  content.innerHTML = 'Loading...';

  // show modal ASAP so user sees response; but make sure it doesn't block pointer
  // --- Bootstrap-friendly inviteDetailModal creation + show ---
let modal = document.getElementById('inviteDetailModal');
if (!modal) {
  modal = document.createElement('div');
  modal.id = 'inviteDetailModal';
  modal.className = 'modal fade';
  modal.setAttribute('tabindex', '-1');           // required for keyboard / focus
  modal.setAttribute('aria-hidden', 'true');      // bootstrap will toggle
  modal.innerHTML = `<div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Invite details</h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
      </div>
      <div class="modal-body"><div id="inviteDetailContent">Loading...</div></div>
      <div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">Close</button></div>
    </div>
  </div>`;
  document.body.appendChild(modal);

  // optional: one-time cleanup hook when modal hides
  modal.addEventListener('hidden.bs.modal', () => {
    // If you added event listeners inside inviteDetailContent, remove them here.
    // const content = modal.querySelector('#inviteDetailContent'); content.innerHTML = '';
  });
}

// show modal using Bootstrap API (ensures aria/focus handled)
try {
  const inst = bootstrap.Modal.getOrCreateInstance(modal, { backdrop: true });
  inst.show();
} catch (e) {
  // fallback in case bootstrap is unavailable — avoid changing aria-hidden manually
  modal.style.display = 'block';
}

  // Try rapid fragment fetch with timeout, otherwise fall back to JSON data
  const fragUrl = `${INTERVIEWS_BASE}/fragments/invite_row/${encodeURIComponent(inviteId)}/`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

  try {
    const fragResp = await fetch(fragUrl, { method: 'GET', credentials: 'same-origin', signal: controller.signal });
    clearTimeout(timeout);
    if (fragResp.ok) {
      const html = await fragResp.text();
      content.innerHTML = html || '<div class="text-muted">No fragment content</div>';
      return;
    }
  } catch (e) {
    // fetch aborted or failed -> we'll fetch JSON fallback
    console.debug('Fragment fetch failed/timeout, falling back to JSON', e);
  } finally {
    try { clearTimeout(timeout); } catch (_) {}
  }

  // Fallback: fetch invites JSON once (not blocking)
  try {
    const listResp = await _apiFetch(API.INVITES);
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
    // Build safe HTML for modal body
    const html = `
      <div><strong>${escapeHtml(interview.title || inv.title || 'Interview')}</strong></div>
      <div style="margin-top:6px"><strong>When:</strong> ${escapeHtml(inv.scheduled_at || interview.scheduled_at || '—')}</div>
      <div style="margin-top:6px"><strong>Message:</strong><div style="white-space:pre-wrap">${escapeHtml(inv.message || inv.note || '')}</div></div>
      <div style="margin-top:6px"><strong>Status:</strong> ${escapeHtml(status)}</div>
      <div style="margin-top:10px;text-align:right">
        ${status === 'pending' ? `<button id="inviteAcceptBtn" class="btn btn-success btn-sm">Accept</button>
          <button id="inviteDeclineBtn" class="btn btn-outline-danger btn-sm">Decline</button>` : ''}
        ${(status === 'accepted') && (interview.id || inv.interview_id) ? `<button id="inviteStartBtn" class="btn btn-primary btn-sm">Start</button>` : ''}
      </div>
    `;
    content.innerHTML = html;

    // attach handlers (single bind)
    const acceptBtn = modal.querySelector('#inviteAcceptBtn');
    if (acceptBtn) {
      acceptBtn.addEventListener('click', async () => {
        acceptBtn.disabled = true;
        await respondInvite(inviteId, 'accept');
        acceptBtn.disabled = false;
        // close or refresh
        try { bootstrap.Modal.getInstance(modal)?.hide(); } catch(e){ modal.style.display='none'; document.body.style.overflow=''; }
      });
    }
    const declineBtn = modal.querySelector('#inviteDeclineBtn');
    if (declineBtn) {
      declineBtn.addEventListener('click', async () => {
        declineBtn.disabled = true;
        await respondInvite(inviteId, 'decline');
        declineBtn.disabled = false;
        try { bootstrap.Modal.getInstance(modal)?.hide(); } catch(e){ modal.style.display='none'; document.body.style.overflow=''; }
      });
    }
    const startBtn = modal.querySelector('#inviteStartBtn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        const iid = interview.id || inv.interview_id;
        try { bootstrap.Modal.getInstance(modal)?.hide(); } catch(e){ modal.style.display='none'; document.body.style.overflow=''; }
        startInterview(iid, inviteId);
      });
    }
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
      const r = await _apiFetch(API.INVITE_RESPOND(inviteId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r || !r.ok) {
        showToast('Failed to respond to invite', 'error');
        return;
      }
      showToast(`Invite ${payload.response}ed`, 'success');
      await loadInvites();
      const detailModal = document.getElementById('inviteDetailModal'); if (detailModal) try { const b = bootstrap.Modal.getInstance(detailModal); if (b) b.hide(); } catch(e){ detailModal.style.display='none'; }
      const invitesModal = document.getElementById('invitesModal'); if (invitesModal) invitesModal.style.display = 'none';
    } catch (e) {
      console.error('respondInvite error', e);
      showToast('Network error', 'error');
    }
  }

  // ensure a startInterview fallback is defined
  if (!window.startInterview) {
    window.startInterview = async function (interviewId, inviteId = null) {
      try {
        if (!interviewId) return;
        const q = inviteId ? `?invite=${encodeURIComponent(inviteId)}` : '';
        window.location.href = `/interviews/page/candidate/${encodeURIComponent(interviewId)}/${q}`;
      } catch (e) { console.error('fallback startInterview error', e); }
    };
  }

  /* ================= Init + wiring ================= */
  function init() {
    console.log('candidate dashboard init');
    // wire token save
    document.getElementById('saveTokenBtn')?.addEventListener('click', () => {
      const v = (document.getElementById('tokenInput')?.value || '').trim();
      if (!v) return showToast('Paste token first', 'error');
      localStorage.setItem('token', v); showToast('Token saved', 'success');
    });
    // upload
    document.getElementById('uploadBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      const fi = document.getElementById('resumeFile'); if (!fi || !fi.files || fi.files.length===0) return showToast('Choose file', 'error');
      handleUploadFile(fi.files[0]);
    });
    // refresh buttons
    document.getElementById('refreshJobs')?.addEventListener('click', loadJobs);
    document.getElementById('refreshMyAppsBtn')?.addEventListener('click', loadMyApplications);
    document.getElementById('exportMyAppsBtn')?.addEventListener('click', exportApplicationsCSV);

    // apply modal wiring: create minimal modal if missing
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

    // apply form submit
    document.addEventListener('submit', async (e) => {
      if (!e.target || e.target.id !== 'applyForm') return;
      e.preventDefault();
      const jobId = window.__apply_job_id;
      const resumeId = document.getElementById('applyResumeSelect')?.value;
      const message = (document.getElementById('applyMessage')?.value || '').trim();
      if (!jobId || !resumeId) return showToast('Select job and resume', 'error');
      showSpinner(true, 'Applying...');
      try {
        let res = await _apiFetch(API.APPLY, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ job_id: jobId, resume_id: resumeId, message }) });
        if (!res.ok) {
          const fd = new FormData(); fd.append('job_id', jobId); fd.append('resume_id', resumeId); fd.append('message', message);
          const r2 = await _fetchWithAuth(API.APPLY, { method:'POST', body: fd });
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

    // invites modal auto-create if missing
    if (!document.getElementById('invitesModal')) {
      const m = document.createElement('div'); m.id='invitesModal'; m.style='display:none;position:fixed;inset:0;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);z-index:99998';
      m.innerHTML = `<div style="background:#fff;padding:16px;border-radius:8px;width:90%;max-width:720px;"><h5>Invites</h5><div id="invitesList"></div><div style="text-align:right;margin-top:12px"><button id="invitesClose" class="btn btn-secondary">Close</button></div></div>`;
      document.body.appendChild(m);
      m.querySelector('#invitesClose').addEventListener('click', ()=> m.style.display = 'none');
    }

    // view invites button wiring
    document.getElementById('viewInvitesBtn')?.addEventListener('click', () => {
      const m = document.getElementById('invitesModal');
      if (m) m.style.display = 'flex';
      loadInvites();
    });

    // initial load
    refreshResumes(); loadJobs(); loadMyApplications(); setTimeout(loadInvites, 400);
  }

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

  // init on DOM ready
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

})();
