// static/js/candidate_dashboard.js
// Cleaned & defensive candidate dashboard script
(function () {
  'use strict';

  // ---------------- Config (override from template)
  const API_ROOT = (window && (window.CDB_API_ROOT || window.API_ROOT)) || '/api';
  const TOKEN_KEYS = (window && window.CDB_TOKEN_KEYS) || ['token', 'access_token', 'auth_token'];
  const TOKEN_STORAGE_KEY = (window && window.CDB_TOKEN_KEY) || TOKEN_KEYS[0];

  // ---------------- API endpoints (use API_ROOT)
  const API = {
    JOBS: `${API_ROOT}/resumes/jobs/`,
    JOB_DETAIL: (id) => `${API_ROOT}/resumes/jobs/${encodeURIComponent(id)}/`,
    MY_RESUMES: `${API_ROOT}/resumes/my-resumes/`,
    UPLOAD: `${API_ROOT}/resumes/upload/`,
    DELETE_RESUME: (id) => `${API_ROOT}/resumes/my-resumes/${encodeURIComponent(id)}/`,
    APPLY: `${API_ROOT}/resumes/apply/`,
    APPLICATIONS: `${API_ROOT}/resumes/applications/`,
    MY_APPLICATIONS: `${API_ROOT}/resumes/my-applications/`,
    SHORTLIST: `${API_ROOT}/resumes/shortlist/`,
    QUIZ_GET: (jobId) => `${API_ROOT}/quiz/${encodeURIComponent(jobId)}/`,
    QUIZ_ATTEMPTS_BY_JOB: (jobId) => `${API_ROOT}/quiz/${encodeURIComponent(jobId)}/attempts/`,
    QUIZ_ATTEMPT_SUBMIT: `${API_ROOT}/quiz/attempt/`,
    INVITES: `${API_ROOT}/interviews/candidate/invites/`,
    INVITE_RESPOND: (inviteId) => `${API_ROOT}/interviews/candidate/invites/${encodeURIComponent(inviteId)}/respond/`,
    START_INTERVIEW: (interviewId) => `${API_ROOT}/interviews/candidate/${encodeURIComponent(interviewId)}/start/`,
  };

  // ---------------- Helpers
  function escapeHtml(s) { if (s === null || s === undefined) return ''; return String(s).replace(/[&<>"'`]/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#x60;'}[m])); }
  function qs(sel, root=document) { try { return root.querySelector(sel); } catch(e) { return null; } }
  function qsa(sel, root=document) { try { return Array.from(root.querySelectorAll(sel)); } catch(e) { return []; } }
  function showToast(msg, type='info', timeout=3500) {
    let container = document.getElementById('toastContainer');
    if (!container) {
      container = document.createElement('div'); container.id = 'toastContainer';
      container.style = 'position:fixed;right:18px;bottom:18px;z-index:99999;max-width:320px';
      document.body.appendChild(container);
    }
    const el = document.createElement('div');
    el.style = 'margin-top:8px;padding:8px 12px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.08);';
    el.style.background = type==='success' ? '#d1e7dd' : type==='error' ? '#f8d7da' : '#fff3cd';
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(()=>el.remove(), timeout);
  }
  function getStoredToken() {
    try {
      for (const k of TOKEN_KEYS) { const v = localStorage.getItem(k); if (v) return v; }
      return '';
    } catch(e){ return ''; }
  }

  // safe show/hide modal (bootstrap preferred)
  function safeShowModal(modalEl) {
    if (!modalEl) return;
    try { if (typeof bootstrap !== 'undefined' && bootstrap.Modal) { bootstrap.Modal.getOrCreateInstance(modalEl).show(); return; } } catch(e){}
    modalEl.style.display = 'flex'; modalEl.style.alignItems = 'center'; modalEl.style.justifyContent = 'center';
  }
  function safeHideModal(modalEl) {
    if (!modalEl) return;
    try { if (typeof bootstrap !== 'undefined' && bootstrap.Modal) { const inst = bootstrap.Modal.getInstance(modalEl); if (inst) { inst.hide(); return; } } } catch(e){}
    modalEl.style.display = 'none';
  }

  // ---------------- Fetch wrappers
  async function fetchWithAuth(url, opts={}) {
    const headers = Object.assign({}, opts.headers || {});
    const token = getStoredToken();
    if (token && !headers['Authorization']) headers['Authorization'] = 'Bearer ' + token;
    const options = Object.assign({}, opts, { headers, credentials: opts.credentials || 'same-origin' });
    return fetch(url, options);
  }

  async function apiFetch(url, opts={}) {
    try {
      const r = await fetchWithAuth(url, opts);
      const txt = await r.text().catch(()=>null);
      let data = null;
      try { data = txt ? JSON.parse(txt) : null; } catch(e) { data = txt; }
      return { ok: r.ok, status: r.status, data };
    } catch (e) { return { ok:false, status:0, error:String(e) }; }
  }

  // ---------------- State
  let resumes = [];
  let jobs = [];
  let quizTimer = null;
  let quizSecondsRemaining = 0;

  // -------------- Resumes
  async function refreshResumes() {
    const container = qs('#resumeList');
    if (!container) return;
    container.innerHTML = '<div class="small-muted">Loading resumes...</div>';
    const r = await apiFetch(API.MY_RESUMES);
    let list = [];
    if (r && r.ok) list = r.data || [];
    else {
      // fallback try common paths
      const alt = await apiFetch(`${API_ROOT}/resumes/resumes/`);
      if (alt && alt.ok) list = alt.data || [];
    }
    resumes = Array.isArray(list) ? list : (list?.results || []);
    if (!resumes.length) { container.innerHTML = '<div class="small-muted">No resumes uploaded.</div>'; return; }
    container.innerHTML = '';
    resumes.forEach(rm => {
      const id = rm.id || rm.pk || rm.resume_id || '';
      const fileUrl = (rm.file && typeof rm.file === 'string') ? rm.file : (rm.file && rm.file.url ? rm.file.url : '');
      const fileName = rm.file_name || (fileUrl ? fileUrl.split('/').pop() : `Resume ${id}`);
      const uploaded = rm.uploaded_at || rm.created_at || '';
      const card = document.createElement('div'); card.className = 'card mb-2 p-2';
      card.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
        <div style="min-width:0"><strong>${escapeHtml(fileName)}</strong><br><small class="text-muted">${escapeHtml(uploaded)}</small></div>
        <div style="display:flex;gap:8px">
          <a class="btn btn-sm btn-outline-primary" href="${escapeHtml(fileUrl)||'#'}" target="_blank" ${fileUrl ? '' : 'onclick="return false;"'}>View</a>
          <button class="btn btn-sm btn-outline-danger delete-resume-btn" data-id="${escapeHtml(id)}">Delete</button>
        </div></div>`;
      container.appendChild(card);
      const del = card.querySelector('.delete-resume-btn');
      if (del && !del._bound) {
        del._bound = true;
        del.addEventListener('click', async () => {
          if (!confirm('Delete resume?')) return;
          const resp = await apiFetch(API.DELETE_RESUME(id), { method: 'DELETE' });
          if (resp && resp.ok) { showToast('Deleted', 'success'); refreshResumes(); } else showToast('Delete failed', 'error');
        });
      }
    });
  }

  async function handleUploadFile(file) {
    if (!file) return showToast('No file selected', 'error');
    const maxMB = 20;
    if (file.size > maxMB * 1024 * 1024) return showToast(`Max ${maxMB}MB`, 'error');
    const fd = new FormData(); fd.append('file', file);
    try {
      const r = await fetchWithAuth(API.UPLOAD, { method:'POST', body: fd });
      if (r.ok) { showToast('Upload successful', 'success'); await refreshResumes(); } else { showToast('Upload failed', 'error'); }
    } catch (e) { showToast('Upload error', 'error'); }
  }

  // ---------------- Jobs
  async function loadJobs() {
    const el = qs('#jobsList'); if (!el) return;
    el.innerHTML = '<div class="small-muted">Loading jobs...</div>';
    const r = await apiFetch(API.JOBS);
    if (!r || !r.ok) { el.innerHTML = `<div class="small-muted">Failed to load jobs (${r ? r.status : 'network'})</div>`; return; }
    jobs = Array.isArray(r.data) ? r.data : (r.data?.results || []);
    if (!jobs.length) { el.innerHTML = '<div class="small-muted">No jobs</div>'; return; }
    el.innerHTML = '';
    jobs.forEach(j => {
      const id = j.id || j.pk || '';
      const card = document.createElement('div'); card.className = 'list-group-item job-card d-flex justify-content-between align-items-start'; card.dataset.jobId = id;
      card.innerHTML = `<div style="min-width:0">
    <strong>${escapeHtml(j.title || `Job ${id}`)}</strong>
    <div class="small-muted">${escapeHtml(j.company || '')} • ${escapeHtml(j.skills_required || j.skills || '')}</div>
  </div>
  <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
    <div>
      <a class="btn btn-sm btn-outline-primary" href="/jobs/${encodeURIComponent(id)}/">View</a>
      <button class="btn btn-sm btn-outline take-quiz-btn" data-id="${id}">Take Quiz</button>
      <button class="btn btn-sm btn-success apply-btn" data-id="${id}" disabled>Apply</button>
    </div>
    ...
  </div>`;

      el.appendChild(card);
      // Remove or guard this:
const viewBtn = card.querySelector('.view-job-btn');
if (viewBtn && !viewBtn._bound) { viewBtn._bound = true; viewBtn.addEventListener('click', ()=> viewJob(id)); }

      const quizBtn = card.querySelector('.take-quiz-btn'); if (quizBtn && !quizBtn._bound) { quizBtn._bound = true; quizBtn.addEventListener('click', ()=> openQuizModal(id)); }
      const applyBtn = card.querySelector('.apply-btn'); if (applyBtn && !applyBtn._bound) { applyBtn._bound = true; applyBtn.addEventListener('click', ()=> openApplyModal(id)); }
    });
    // attempt summaries
    setTimeout(()=> jobs.forEach(j => loadAttemptSummary(j.id)), 300);
  }

  async function viewJob(jobId) {
    if (!jobId) return showToast('Invalid job', 'error');
    const r = await apiFetch(API.JOB_DETAIL(jobId));
    if (!r || !r.ok) return showToast('Failed to load job', 'error');
    openJobDetailModal(r.data || {});
  }

  function openJobDetailModal(job) {
    // create modal (bootstrap preferred)
    let modal = qs('#jobDetailModal');
    if (!modal) {
      modal = document.createElement('div'); modal.id = 'jobDetailModal'; modal.className='modal fade';
      modal.innerHTML = `<div class="modal-dialog modal-lg"><div class="modal-content"><div class="modal-header">
        <h5 id="jobDetailTitle" class="modal-title"></h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body" id="jobDetailBody"></div>
        <div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">Close</button><button id="jobDetailApplyBtn" class="btn btn-primary">Apply</button></div>
      </div></div>`;
      document.body.appendChild(modal);
    }
    qs('#jobDetailTitle', modal).textContent = job.title || `Job ${job.id||''}`;
    qs('#jobDetailBody', modal).innerHTML = `<div><strong>Company:</strong> ${escapeHtml(job.company||'')}</div>
      <div><strong>Skills:</strong> ${escapeHtml(job.skills_required||job.skills||'')}</div><hr><div style="white-space:pre-wrap">${escapeHtml(job.description||job.summary||'')}</div>`;
    const applyBtn = qs('#jobDetailApplyBtn', modal);
    if (applyBtn) {
      applyBtn.onclick = () => { try { bootstrap.Modal.getInstance(modal).hide(); } catch(e){}; openApplyModal(job.id || job.pk); };
    }
    safeShowModal(modal);
  }

  // -------------- Quiz modal + timer + submit
  function createQuizModalIfMissing() {
    if (qs('#quizModal')) return;
    const m = document.createElement('div'); m.id='quizModal'; m.className='cdb-quiz-modal'; m.style.display='none';
    m.innerHTML = `<div style="background:#fff;padding:18px;border-radius:8px;max-width:900px;width:96%;max-height:88vh;overflow:auto;position:relative">
      <div style="display:flex;justify-content:space-between;align-items:center"><h4 id="quizTitle">Quiz</h4><button id="quizClose" class="btn btn-sm btn-outline-secondary">Close</button></div>
      <div id="quizMeta" style="margin-top:8px;color:#666"></div>
      <div id="quizQuestions" style="margin-top:12px">Loading...</div>
      <div id="quizTimer" style="position:absolute;right:16px;top:14px;font-weight:600"></div>
      <div style="margin-top:12px;text-align:right"><button id="quizSubmit" class="btn btn-primary">Submit</button></div>
    </div>`;
    document.body.appendChild(m);
    m.querySelector('#quizClose').addEventListener('click', closeQuizModal);
    m.querySelector('#quizSubmit').addEventListener('click', ()=> submitQuizAttempt(false));
  }

  async function openQuizModal(jobId) {
    createQuizModalIfMissing();
    const modal = qs('#quizModal'); if (!modal) return;
    modal.style.display = 'flex'; modal.dataset.jobId = String(jobId);
    const qWrap = qs('#quizQuestions', modal); if (qWrap) qWrap.innerHTML = 'Loading...';
    let r = await apiFetch(API.QUIZ_GET(jobId));
    if (!r || !r.ok) {
      // try generate endpoint if server allows
      const gen = await apiFetch(`${API_ROOT}/quiz/generate/${encodeURIComponent(jobId)}/`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ job_id: jobId }) });
      if (gen && gen.ok) r = gen;
    }
    if (!r || !r.ok) { if (qWrap) qWrap.innerHTML = `<div class="text-danger">Failed to load quiz (${r ? r.status : 'network'})</div>`; return; }
    const body = r.data || {};
    let questions = Array.isArray(body) ? body : (Array.isArray(body.questions) ? body.questions : (Array.isArray(body.questions_json) ? body.questions_json : []));
    if (!questions || !questions.length) { if (qWrap) qWrap.innerHTML = `<div class="text-danger">No questions available</div>`; return; }
    renderQuizQuestions(questions);
    // choose reasonable time
    let seconds = (questions.length <= 5) ? 120 : (questions.length <= 10 ? 300 : Math.min(1800, Math.ceil(questions.length/10)*300));
    startQuizTimer(seconds);
  }

  function renderQuizQuestions(questions) {
    const qWrap = qs('#quizQuestions'); if (!qWrap) return;
    qWrap.innerHTML = '';
    questions.slice(0,50).forEach(q => {
      const qid = q.id || q.pk || Math.random().toString(36).slice(2,9);
      const choices = Array.isArray(q.choices) ? q.choices : (Array.isArray(q.options) ? q.options : (typeof q.choices === 'object' ? Object.values(q.choices) : []));
      const div = document.createElement('div'); div.className='quiz-question'; div.dataset.qid = qid;
      const title = `<div style="font-weight:600">${escapeHtml(q.question || q.title || '')}</div>`;
      const opts = choices.map((c,i) => `<div><label><input type="radio" name="q-${escapeHtml(String(qid))}" value="${escapeHtml(String(i))}"> ${escapeHtml(String(c))}</label></div>`).join('');
      div.innerHTML = `${title}<div style="margin-left:8px">${opts}</div>`;
      qWrap.appendChild(div);
    });
    qs('#quizMeta') && (qs('#quizMeta').textContent = `Questions: ${questions.length}`);
  }

  function startQuizTimer(seconds) {
    stopQuizTimer();
    quizSecondsRemaining = Number(seconds)||0;
    function tick() {
      const m = Math.floor(quizSecondsRemaining/60); const s = quizSecondsRemaining%60;
      const timer = qs('#quizTimer'); if (timer) timer.textContent = `⏳ ${m}:${String(s).padStart(2,'0')}`;
      if (quizSecondsRemaining <= 0) { stopQuizTimer(); showToast('Time up — submitting', 'info'); submitQuizAttempt(true); return; }
      quizSecondsRemaining--;
    }
    tick(); quizTimer = setInterval(tick, 1000);
  }
  function stopQuizTimer() { if (quizTimer) { clearInterval(quizTimer); quizTimer = null; } const t = qs('#quizTimer'); if (t) t.textContent = ''; }
  function closeQuizModal() { stopQuizTimer(); const modal = qs('#quizModal'); if (modal) modal.style.display = 'none'; }

  async function submitQuizAttempt(auto=false) {
    const modal = qs('#quizModal'); if (!modal) return showToast('No quiz open','error');
    const jobId = modal.dataset.jobId;
    const answers = {};
    qsa('.quiz-question', modal).forEach(q => {
      const qid = q.dataset.qid; const sel = q.querySelector('input[type="radio"]:checked'); answers[qid] = sel ? sel.value : null;
    });
    const btn = qs('#quizSubmit'); if (btn) btn.disabled = true;
    try {
      // try direct POST JSON
      let r = await fetchWithAuth(API.QUIZ_ATTEMPT_SUBMIT, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ job_id: jobId, answers }) });
      let body = null;
      if (r && r.ok) { try { body = await r.json(); } catch(e){ body = null; } }
      else {
        // fallback to API wrapper
        const rpc = await apiFetch(API.QUIZ_ATTEMPT_SUBMIT, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ job_id: jobId, answers }) });
        if (rpc && rpc.ok) body = rpc.data;
      }
      const passed = body && (body.passed === true || String(body.passed) === 'true');
      const score = (body && (body.score || body.total)) ? `${body.score||''}/${body.total||''}` : '';
      if (passed) showToast(`Passed — ${score}`, 'success'); else showToast(`Quiz submitted — ${score}`, 'info');
      await loadAttemptSummary(jobId); await loadMyApplications();
      closeQuizModal();
    } catch (e) {
      console.error('submitQuizAttempt', e); showToast('Quiz submit failed','error');
    } finally { if (btn) btn.disabled = false; }
  }

  // --------------- Attempt summary (enables apply if passed)
  async function loadAttemptSummary(jobId) {
    if (!jobId) return;
    const statusEl = qs(`#quiz-status-${jobId}`) || qs(`.job-card #quiz-status-${jobId}`);
    const tryUrls = [ API.QUIZ_ATTEMPTS_BY_JOB(jobId), `${API_ROOT}/quiz/attempts/?job_id=${jobId}`, `${API_ROOT}/quiz/attempts/?job=${jobId}` ];
    for (const u of tryUrls) {
      const r = await apiFetch(u);
      if (!r || !r.ok) continue;
      const arr = Array.isArray(r.data) ? r.data : (r.data?.results || r.data?.attempts || []);
      if (!arr || !arr.length) { if (statusEl) statusEl.textContent = 'Not attempted'; const applyBtn = qs(`.apply-btn[data-id="${jobId}"]`); if (applyBtn) applyBtn.disabled = true; continue; }
      const latest = arr.slice().sort((a,b)=> new Date(b.finished_at||b.started_at||0)-new Date(a.finished_at||a.started_at||0))[0];
      const passed = !!latest.passed;
      if (statusEl) statusEl.textContent = passed ? 'Passed' : 'Failed';
      const applyBtn = qs(`.apply-btn[data-id="${jobId}"]`); if (applyBtn) applyBtn.disabled = !passed;
      return arr;
    }
    return null;
  }

  // --------------- Applications
  async function loadMyApplications() {
    const container = qs('#myApplicationsList'); if (!container) return;
    container.innerHTML = '<div class="small-muted">Loading applications...</div>';
    const tries = [ API.MY_APPLICATIONS, API.APPLICATIONS, `${API_ROOT}/resumes/applications/?mine=true` ];
    let r = null;
    for (const u of tries) { const rr = await apiFetch(u); if (rr && rr.ok) { r = rr; break; } }
    if (!r) { container.innerHTML = '<div class="small-muted">Failed to load applications</div>'; return; }
    let apps = Array.isArray(r.data) ? r.data : (r.data?.applications || r.data?.results || []);
    if (!Array.isArray(apps)) apps = [];
    if (!apps.length) { container.innerHTML = '<div class="small-muted">No applications yet</div>'; return; }
    container.innerHTML = '';
    // optional filter by JWT user id if token available
    let currentUserId = null;
    try {
      const token = getStoredToken();
      if (token) { const p = token.split('.')[1]; const payload = JSON.parse(atob(p)); currentUserId = payload?.user_id || payload?.id || payload?.sub; }
    } catch(e){}
    apps.forEach(a => {
      const jobTitle = (a.job && (a.job.title || a.job)) || a.job_title || `Job ${a.job_id||''}`;
      let rawStatus = (a.status || a.application_status || '') || '';
      if (!rawStatus) {
        if (a.shortlisted === true) rawStatus = 'shortlisted';
        else if (a.rejected === true) rawStatus = 'rejected';
      }
      const s = String(rawStatus || 'pending').toLowerCase();
      const statusMap = { 'shortlisted':['Shortlisted','bg-success'],'rejected':['Rejected','bg-danger'],'pending':['Pending','bg-secondary'] };
      const mapped = statusMap[s] || [s.charAt(0).toUpperCase()+s.slice(1), 'bg-secondary'];
      const appliedAt = a.applied_at || a.created_at || '';
      const resumeUrl = a.resume_file || (a.resume && (a.resume.file||'')) || '';
      const resumeLabel = (a.resume && (a.resume.file ? (a.resume.file.split('/').pop()) : `Resume ${a.resume.id||a.resume}`)) || `Resume ${a.resume_id||''}`;
      const id = a.id || a.application_id || '';
      const card = document.createElement('div'); card.className='card mb-2 p-2';
      card.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:start">
        <div style="min-width:0"><strong>${escapeHtml(jobTitle)}</strong>
          <div class="small-muted">Applied: ${escapeHtml(appliedAt)} • Status: <span class="badge ${mapped[1]}">${escapeHtml(mapped[0])}</span></div>
          <div class="small-muted">Resume: ${resumeUrl ? `<a href="${escapeHtml(resumeUrl)}" target="_blank">${escapeHtml(resumeLabel)}</a>` : escapeHtml(resumeLabel)}</div>
        </div>
        <div style="text-align:right"><button class="btn btn-sm btn-outline-danger withdraw-app-btn" data-id="${escapeHtml(id)}">Withdraw</button></div>
      </div>`;
      container.appendChild(card);
      const btn = card.querySelector('.withdraw-app-btn');
      if (btn && !btn._bound) {
        btn._bound = true;
        btn.addEventListener('click', async () => {
          if (!confirm('Withdraw this application?')) return;
          const tryUrls = [ `${API_ROOT}/resumes/applications/${id}/`, `${API_ROOT}/applications/${id}/`, `${API.APPLICATIONS}${id}/` ];
          let ok = false;
          for (const u of tryUrls) {
            const rr = await apiFetch(u, { method:'DELETE' });
            if (rr && rr.ok) { ok = true; break; }
          }
          if (!ok) {
            const alt = await apiFetch(`${API_ROOT}/resumes/applications/${id}/withdraw/`, { method:'POST' });
            if (alt && alt.ok) ok = true;
          }
          if (ok) { showToast('Withdrawn','success'); loadMyApplications(); } else showToast('Could not withdraw','error');
        });
      }
    });
  }

  async function exportApplicationsCSV() {
    const r = await apiFetch(API.MY_APPLICATIONS);
    if (!r || !r.ok) return showToast('Export not available','error');
    const apps = Array.isArray(r.data) ? r.data : (r.data?.applications || []);
    if (!apps.length) return showToast('No applications','info');
    const headers = ['application_id','job_title','resume_id','status','applied_at'];
    const rows = apps.map(a => [a.id||'', (a.job && a.job.title) || a.job_title||'', a.resume_id || (a.resume && a.resume.id) || '', a.status || '', a.applied_at || a.created_at || '']);
    const csv = headers.join(',') + '\n' + rows.map(rw => rw.map(c => `"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type:'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'my_applications.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    showToast('Downloaded CSV','success');
  }

  // --------------- Invites
  async function loadInvites() {
    const modal = qs('#invitesModal');
    if (!modal) return console.error('Invites modal missing');
    const wrap = qs('#invitesList', modal) || qs('#invitesList') || modal;
    wrap.innerHTML = '<div class="small-muted">Loading invites...</div>';
    const r = await apiFetch(API.INVITES);
    if (!r) { wrap.innerHTML = `<div class="text-danger">Network error</div>`; return; }
    if (!r.ok) { const detail = r.data?.detail || r.data || `Status ${r.status}`; wrap.innerHTML = `<div class="text-danger">Failed: ${escapeHtml(String(detail))}</div>`; return; }
    const arr = r.data?.invites || r.data?.results || (Array.isArray(r.data) ? r.data : []);
    if (!arr || !arr.length) { wrap.innerHTML = '<div class="small-muted">No invites.</div>'; return; }
    wrap.innerHTML = '';
    arr.forEach(inv => {
      (function(inv){ // closure to safe-guard inv in handlers
        const interview = (inv.interview && typeof inv.interview === 'object') ? inv.interview : {};
        const interviewId = interview.id || inv.interview_id || inv.interview;
        const id = inv.id || inv.invite_id || '';
        const title = inv.interview_title || interview.title || inv.title || 'Interview';
        const scheduled = inv.scheduled_at || interview.scheduled_at || '';
        const status = (inv.status || 'pending').toLowerCase();
        const canStart = (status === 'accepted') && (new Date(scheduled || 0).getTime() <= Date.now()) && interviewId;
        const card = document.createElement('div'); card.className='card mb-2 p-2';
        const startBtnHtml = interviewId ? `<button class="btn btn-sm btn-success start-invite" data-interview="${escapeHtml(interviewId)}" data-invite="${escapeHtml(id)}" ${canStart ? '' : 'disabled'}>Start</button>` : '';
        card.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
          <div style="min-width:0"><strong>${escapeHtml(title)}</strong><div class="small-muted">${escapeHtml(formatLocalDateTime(scheduled))}</div></div>
          <div style="text-align:right"><div class="small-muted">Status: ${escapeHtml(status)}</div><div style="margin-top:8px">
            ${status==='pending' ? `<button class="btn btn-sm btn-success accept-invite" data-id="${escapeHtml(id)}">Accept</button><button class="btn btn-sm btn-outline-danger decline-invite" data-id="${escapeHtml(id)}">Decline</button>` : ''}
            ${startBtnHtml}
            <button class="btn btn-sm btn-outline-secondary ms-1 view-invite" data-id="${escapeHtml(id)}">View</button>
          </div></div></div>`;
        wrap.appendChild(card);

        const acceptBtn = card.querySelector('.accept-invite');
        if (acceptBtn && !acceptBtn._bound) { acceptBtn._bound = true; acceptBtn.addEventListener('click', async () => {
          acceptBtn.disabled = true;
          const resp = await apiFetch(API.INVITE_RESPOND(id), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ response:'accept' }) });
          if (resp && resp.ok) { showToast('Accepted','success'); await loadInvites(); } else { showToast('Accept failed','error'); acceptBtn.disabled = false; }
        }); }

        const declineBtn = card.querySelector('.decline-invite');
        if (declineBtn && !declineBtn._bound) { declineBtn._bound = true; declineBtn.addEventListener('click', async ()=> {
          declineBtn.disabled = true;
          const resp = await apiFetch(API.INVITE_RESPOND(id), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ response:'decline' }) });
          if (resp && resp.ok) { showToast('Declined','success'); await loadInvites(); } else { showToast('Decline failed','error'); declineBtn.disabled = false; }
        }); }

        const startBtn = card.querySelector('.start-invite');
        if (startBtn && !startBtn._bound) { startBtn._bound = true; startBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          if (startBtn.disabled) { showToast(`Starts at ${formatLocalDateTime(inv.scheduled_at||inv.interview?.scheduled_at||'')}`, 'info', 6000); return; }
          startBtn.disabled = true;
          const iid = startBtn.dataset.interview;
          const inviteId = startBtn.dataset.invite;
          const resp = await apiFetch(API.START_INTERVIEW(iid), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ invite: inviteId }) });
          if (resp && (resp.status === 403 || resp.status === 400)) {
            const detail = resp.data?.detail || resp.data || `Status ${resp.status}`;
            const sched = resp.data?.scheduled_start || resp.data?.scheduled_at || null;
            if (resp.status === 403 && sched) showToast(`Cannot start yet. Scheduled at ${formatLocalDateTime(sched)}`, 'info', 6000);
            else showToast(detail, 'error', 5000);
            startBtn.disabled = false;
            return;
          }
          let url = resp && resp.ok && resp.data ? (resp.data.redirect_url || resp.data.join_url || resp.data.url || resp.data.attempt_url) : null;
          if (!url) {
            const pageBase = API.INVITES.replace(/\/candidate\/.*$/, '');
            url = `${pageBase}/page/candidate/${encodeURIComponent(iid)}/?invite=${encodeURIComponent(inviteId)}`;
          }
          try { window.open(url, '_blank'); } catch(e) { window.location.href = url; }
          startBtn.disabled = false;
        }); }

        const viewBtn = card.querySelector('.view-invite');
        if (viewBtn && !viewBtn._bound) { viewBtn._bound = true; viewBtn.addEventListener('click', ()=> viewInvite(inv.id || inv.invite_id || '')); }
      })(inv);
    });
  }

  // --------------- viewInvite (modal)
  async function viewInvite(inviteId) {
    if (!inviteId) return showToast('Invite id missing','error');
    let modal = qs('#inviteDetailModal');
    if (!modal) {
      modal = document.createElement('div'); modal.id = 'inviteDetailModal'; modal.className='modal fade';
      modal.innerHTML = `<div class="modal-dialog modal-lg"><div class="modal-content"><div class="modal-header">
        <h5 class="modal-title">Invite details</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body"><div id="inviteDetailContent">Loading...</div></div>
        <div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">Close</button></div></div></div>`;
      document.body.appendChild(modal);
    }
    const content = qs('#inviteDetailContent', modal); if (!content) return;
    try { try { document.activeElement && document.activeElement.blur(); } catch(e){} safeShowModal(modal); } catch(e){ modal.style.display='block'; }
    content.innerHTML = `<div style="padding:14px;text-align:center"><div class="spinner-border" role="status" style="width:2rem;height:2rem"></div><div style="margin-top:8px">Loading invite…</div></div>`;
    const listResp = await apiFetch(API.INVITES);
    if (!listResp || !listResp.ok) { content.innerHTML = `<div class="text-danger">Error loading invite</div>`; return; }
    const arr = listResp.data?.invites || listResp.data?.results || (Array.isArray(listResp.data) ? listResp.data : []);
    const inv = (arr || []).find(x => String(x.id) === String(inviteId) || String(x.invite_id) === String(inviteId));
    if (!inv) { content.innerHTML = `<div class="text-muted">Invite not found</div>`; return; }
    const interview = inv.interview || {};
    const title = inv.interview_title || interview.title || inv.title || 'Interview';
    const scheduledLocal = formatLocalDateTime(inv.scheduled_at || interview.scheduled_at || '');
    const status = (inv.status || 'pending').toLowerCase();
    content.innerHTML = `<div><strong>${escapeHtml(title)}</strong></div>
      <div style="margin-top:6px"><strong>When:</strong> ${escapeHtml(scheduledLocal)}</div>
      <div style="margin-top:8px"><strong>Message:</strong><div style="white-space:pre-wrap">${escapeHtml(inv.message || inv.note || '')}</div></div>
      <div style="margin-top:8px"><strong>Status:</strong> ${escapeHtml(status)}</div>
      <div style="margin-top:12px;text-align:right">
      ${status==='pending' ? `<button id="inviteAcceptBtn" class="btn btn-success btn-sm">Accept</button><button id="inviteDeclineBtn" class="btn btn-outline-danger btn-sm">Decline</button>` : ''}
      ${(status==='accepted' && (interview.id || inv.interview_id)) ? `<button id="inviteStartBtn" class="btn btn-primary btn-sm">Start</button>` : ''}
      </div>`;
    qs('#inviteAcceptBtn', modal)?.addEventListener('click', async ()=> { const r = await apiFetch(API.INVITE_RESPOND(inv.id), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ response:'accept' }) }); if (r && r.ok) { showToast('Accepted','success'); await loadInvites(); safeHideModal(modal); } else showToast('Accept failed','error'); });
    qs('#inviteDeclineBtn', modal)?.addEventListener('click', async ()=> { const r = await apiFetch(API.INVITE_RESPOND(inv.id), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ response:'decline' }) }); if (r && r.ok) { showToast('Declined','success'); await loadInvites(); safeHideModal(modal); } else showToast('Decline failed','error'); });
    qs('#inviteStartBtn', modal)?.addEventListener('click', async ()=> {
      const iid = (interview.id || inv.interview_id);
      const r = await apiFetch(API.START_INTERVIEW(iid), { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ invite: inv.id }) });
      if (r && (r.status === 403 || r.status === 400)) { const detail = r.data?.detail || r.data || `Status ${r.status}`; const sched = r.data?.scheduled_start || r.data?.scheduled_at || null; if (r.status === 403 && sched) showToast(`Cannot start yet. Scheduled at ${formatLocalDateTime(sched)}`, 'info', 6000); else showToast(detail,'error',5000); return; }
      const url = r && r.ok && r.data ? (r.data.redirect_url || r.data.join_url || r.data.url || r.data.attempt_url) : `${API_ROOT}/page/candidate/${encodeURIComponent(iid)}?invite=${encodeURIComponent(inv.id)}`;
      try { window.open(url, '_blank'); } catch(e) { window.location.href = url; }
    });
  }

  // ------------- Misc helpers: date/time
  function parseDateTime(val) { if (!val) return null; const d = new Date(val); if (!isNaN(d.getTime())) return d; const d2 = new Date(String(val).replace(' ', 'T')); return isNaN(d2.getTime()) ? null : d2; }
  function formatLocalDateTime(val) { const d = parseDateTime(val); if (!d) return String(val || '—'); return d.toLocaleString(); }

  // -------------- Apply modal wiring
  window.openApplyModal = function(jobId) {
    window.__apply_job_id = jobId;
    let modal = qs('#applyModal');
    if (!modal) {
      modal = document.createElement('div'); modal.id='applyModal'; modal.className='modal fade';
      modal.innerHTML = `<div class="modal-dialog modal-md"><div class="modal-content"><form id="applyForm">
        <div class="modal-header"><h5 class="modal-title">Apply</h5><button class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body"><label>Resume</label><select id="applyResumeSelect" class="form-control"></select><div style="margin-top:8px"><label>Message</label><textarea id="applyMessage" class="form-control" rows="3"></textarea></div></div>
        <div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button id="applySubmitBtn" class="btn btn-primary">Apply</button></div>
      </form></div></div>`;
      document.body.appendChild(modal);
    }
    const sel = qs('#applyResumeSelect', modal); if (!sel) return showToast('Apply modal missing','error');
    sel.innerHTML = '<option value="">-- choose resume --</option>';
    resumes.forEach(r => { const id = r.id || r.pk || r.resume_id || ''; const name = r.file_name || (r.file && (typeof r.file === 'string' ? r.file.split('/').pop() : (r.file.url ? r.file.url.split('/').pop() : `Resume ${id}`))) || `Resume ${id}`; const opt = document.createElement('option'); opt.value = id; opt.text = name; sel.appendChild(opt); });
    safeShowModal(modal);
    const form = qs('#applyForm', modal);
    if (form && !form._bound) {
      form._bound = true;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const jobIdLocal = window.__apply_job_id; const resumeId = qs('#applyResumeSelect', modal)?.value; const message = qs('#applyMessage', modal)?.value || '';
        if (!jobIdLocal || !resumeId) return showToast('Select job and resume','error');
        try {
          const jsonResp = await apiFetch(API.APPLY, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ job_id: jobIdLocal, resume_id: resumeId, message }) });
          if (jsonResp && jsonResp.ok) { showToast('Applied','success'); safeHideModal(modal); loadMyApplications(); return; }
          // fallback to formdata
          const fd = new FormData(); fd.append('job_id', jobIdLocal); fd.append('resume_id', resumeId); fd.append('message', message);
          const r2 = await fetchWithAuth(API.APPLY, { method:'POST', body: fd });
          if (r2.ok) { showToast('Applied','success'); safeHideModal(modal); loadMyApplications(); } else { showToast('Apply failed','error'); }
        } catch(e) { showToast('Apply error','error'); }
      });
    }
  };

  // --------------- Init
  function init() {
    // token save
    const saveBtn = qs('#saveTokenBtn'); if (saveBtn && !saveBtn._bound) { saveBtn._bound = true; saveBtn.addEventListener('click', ()=> { const v = (qs('#tokenInput')?.value||'').trim(); if (!v) return showToast('Paste token first','error'); try { localStorage.setItem(TOKEN_STORAGE_KEY, v); showToast('Token saved','success'); } catch(e){ showToast('Unable to save token','error'); } }); }
    // upload
    const uploadBtn = qs('#uploadBtn'); if (uploadBtn && !uploadBtn._bound) { uploadBtn._bound = true; uploadBtn.addEventListener('click', (e)=> { e.preventDefault(); const fi = qs('#resumeFile'); if (!fi || !fi.files || !fi.files.length) return showToast('Choose file','error'); handleUploadFile(fi.files[0]); }); }
    qs('#refreshJobs')?.addEventListener('click', loadJobs);
    qs('#refreshMyAppsBtn')?.addEventListener('click', loadMyApplications);
    qs('#exportMyAppsBtn')?.addEventListener('click', exportApplicationsCSV);

    // ensure invites modal exists
    if (!qs('#invitesModal')) {
      const m = document.createElement('div'); m.id='invitesModal'; m.className='modal fade';
      m.innerHTML = `<div class="modal-dialog modal-lg"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Invites</h5><button class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body"><div id="invitesList"></div></div><div class="modal-footer"><button id="invitesClose" class="btn btn-secondary" data-bs-dismiss="modal">Close</button></div></div></div>`;
      document.body.appendChild(m);
      qs('#invitesClose', m)?.addEventListener('click', ()=> safeHideModal(m));
    }

    qs('#viewInvitesBtn')?.addEventListener('click', () => {
      const m = qs('#invitesModal'); if (!m) return; try { document.activeElement && document.activeElement.blur(); bootstrap.Modal.getOrCreateInstance(m).show(); } catch(e){ m.style.display='block'; } loadInvites().catch(e=>console.error(e));
    });

    // initial loads
    refreshResumes(); loadJobs(); loadMyApplications(); setTimeout(()=>{ try { loadInvites(); } catch(e){} }, 300);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  // expose for debugging
  window.cdb = { refreshResumes, loadJobs, loadMyApplications, loadInvites, openApplyModal, openQuizModal, exportApplicationsCSV };

})();
