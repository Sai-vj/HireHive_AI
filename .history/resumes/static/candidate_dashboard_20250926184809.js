// candidate_dashboard.js (cleaned + patched)
// Updated: job-card layout, invites modal ID fix, removed token sidebar hookup.
// Requires: utils.js exports: apiFetchAsJson, fetchWithAuth, clearTokens, getAccessToken, isTokenExpired

import { apiFetchAsJson as apiFetch, fetchWithAuth, clearTokens, getAccessToken, isTokenExpired } from "./utils.js";

(function () {
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

  // small wrappers
  async function _fetchWithAuth(url, opts = {}) {
    return fetchWithAuth ? fetchWithAuth(url, opts) : fetch(url, opts);
  }
  async function _apiFetch(url, opts = {}) {
    return apiFetch ? apiFetch(url, opts) : (await fetch(url, opts)).json().catch(()=>({ ok:false, status:500 }));
  }

  // UI helpers
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"'`]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#x60;' })[m]);
  }
  function showToast(msg, type='info', timeout=3500) {
    let c = document.getElementById('toastContainer');
    if (!c) { c = document.createElement('div'); c.id='toastContainer'; document.body.appendChild(c); }
    const el = document.createElement('div');
    el.style.cssText = 'margin-top:8px;padding:8px 12px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.08)';
    el.style.background = type==='success'? '#d1e7dd' : type==='error'? '#f8d7da' : '#fff3cd';
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(()=>el.remove(), timeout);
  }
  function showSpinner(on, text='') {
    let sp = document.getElementById('globalSpinner');
    if (!sp && on) {
      sp = document.createElement('div');
      sp.id='globalSpinner';
      sp.style = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.6);z-index:99998';
      sp.innerHTML = `<div style="text-align:center"><div class="spinner-border" role="status" style="width:2.5rem;height:2.5rem"></div><div id="globalSpinnerText" style="margin-top:8px"></div></div>`;
      document.body.appendChild(sp);
    }
    if (sp) { sp.style.display = on? 'flex' : 'none'; const t = document.getElementById('globalSpinnerText'); if (t) t.innerText = text||''; }
  }

  // date helpers
  function parseDateTime(v){ if(!v) return null; const d=new Date(v); if(!isNaN(d.getTime())) return d; const d2=new Date(String(v).replace(' ','T')); return isNaN(d2.getTime())?null:d2; }
  function formatLocalDateTime(v){ const d = parseDateTime(v); if(!d) return String(v||'—'); return d.toLocaleString(); }
  function isScheduledNowOrPast(v){ const d=parseDateTime(v); if(!d) return false; return Date.now() >= d.getTime(); }

  // state
  let resumes = [], jobs = [], quizTimerHandle = null, quizSecondsRemaining = 0;

  /* -------- Resumes -------- */
  async function refreshResumes(){
    const container = document.getElementById('resumeList'); if(!container) return;
    container.innerHTML = '<div class="small-muted">Loading resumes...</div>';
    const res = await _apiFetch(API.MY_RESUMES);
    let list = (res && res.ok) ? (res.data || []) : [];
    if (!Array.isArray(list) && list?.results) list = list.results;
    resumes = Array.isArray(list)? list : [];
    if (!resumes.length) { container.innerHTML = '<div class="small-muted">No resumes uploaded.</div>'; return; }
    container.innerHTML = '';
    resumes.forEach(r => {
      const id = r.id || r.pk || r.resume_id || '';
      const fileUrl = (r.file && (typeof r.file === 'string')) ? r.file : (r.file && r.file.url ? r.file.url : '');
      const fileName = r.file_name || (fileUrl? fileUrl.split('/').pop() : `Resume ${id}`);
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
          <a class="btn btn-sm btn-outline-primary" href="${escapeHtml(fileUrl)||'#'}" target="_blank" ${fileUrl? '' : 'onclick="return false;"'}>View</a>
          <button class="btn btn-sm btn-outline-danger" data-resume-id="${id}">Delete</button>
        </div>
      </div>`;
      container.appendChild(div);
      div.querySelector('button[data-resume-id]')?.addEventListener('click', async ()=>{
        if(!confirm('Delete resume?')) return;
        const rdel = await _apiFetch(API.DELETE_RESUME(id), { method:'DELETE' });
        if (rdel && rdel.ok) { showToast('Deleted','success'); refreshResumes(); }
        else showToast('Delete failed','error');
      });
    });
  }

  async function handleUploadFile(file){
    if(!file) return showToast('No file','error');
    const maxMB = 20; if (file.size > maxMB*1024*1024) return showToast(`Max ${maxMB}MB`,'error');
    const fd = new FormData(); fd.append('file', file);
    showSpinner(true, 'Uploading resume...');
    try {
      const r = await _fetchWithAuth(API.UPLOAD, { method:'POST', body: fd });
      if (r && r.ok) { showToast('Upload successful','success'); await refreshResumes(); }
      else showToast('Upload failed','error');
    } catch (e) { showToast('Upload error','error'); }
    finally { showSpinner(false); }
  }

  /* -------- Jobs (render with clean layout) -------- */
// REPLACE your existing loadJobs() with this function
async function loadJobs(){
  const el = document.getElementById('jobsList'); if(!el) return;
  el.innerHTML = '<div class="small-muted">Loading jobs...</div>';
  const res = await _apiFetch(API.JOBS);
  if(!res || !res.ok) {
    el.innerHTML = `<div class="small-muted">Failed to load jobs (${res?.status||'error'})</div>`;
    return;
  }

  jobs = Array.isArray(res.data) ? res.data : (res.data?.results || []);
  if(!jobs || jobs.length === 0) { el.innerHTML = '<div class="small-muted">No jobs</div>'; return; }

  el.innerHTML = '';
  jobs.forEach(j => {
    const id = j.id || j.pk || '';
    const card = document.createElement('div');
    card.className = 'list-group-item job-card';
    card.setAttribute('data-job-id', id);

    card.innerHTML = `
      <div class="job-info">
        <strong>${escapeHtml(j.title || `Job ${id}`)}</strong>
        <div class="small-muted">${escapeHtml(j.company || '')} • ${escapeHtml(j.skills_required || j.skills || '')}</div>
      </div>

      <div class="job-actions" style="min-width:220px;justify-content:flex-end;">
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn btn-sm btn-outline-primary view-job-btn" data-id="${id}">View</button>
          <button class="btn btn-sm btn-outline-secondary take-quiz-btn" data-id="${id}">Take Quiz</button>
          <button class="btn btn-sm btn-success apply-btn" data-id="${id}" disabled>Apply</button>
        </div>
        <div style="width:100%;margin-top:6px;text-align:right;">
          <small id="quiz-status-${id}" class="small-muted">Not attempted</small>
        </div>
      </div>
    `;

    el.appendChild(card);

    // event wiring
    card.querySelector('.view-job-btn')?.addEventListener('click', () => viewJob(id));
    card.querySelector('.take-quiz-btn')?.addEventListener('click', () => openQuizModal(id));
    card.querySelector('.apply-btn')?.addEventListener('click', () => openApplyModal(id));
  });

  // populate attempt summaries (non-blocking)
  setTimeout(() => jobs.forEach(j => loadAttemptSummary(j.id)), 400);
}


  async function viewJob(jobId){
    if(!jobId) return showToast('Invalid job','error');
    showSpinner(true,'Loading job...');
    const res = await _apiFetch(API.JOB_DETAIL(jobId));
    showSpinner(false);
    if(!res || !res.ok) return showToast('Failed to load job','error');
    openJobDetailModal(res.data || {});
  }

 function openJobDetailModal(job) {
  let modal = document.getElementById('jobDetailModal');
  if (!modal) {
    modal = document.createElement('div'); 
    modal.id = 'jobDetailModal';
    modal.className = 'modal fade';
    modal.innerHTML = `
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="jobDetailTitle"></h5>
            <button class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="jobDetailBody"></div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
            <button id="jobDetailApplyBtn" class="btn btn-primary">Apply</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  const title = job.title || `Job ${job.id||''}`;
  const company = job.company || '';
  const location = job.location || job.city || job.place || 'Not specified';
  const exp = job.experience || job.experience_required || job.exp || 'Not specified';
  const skills = job.skills_required || job.skills || '';
  const desc = job.description || job.summary || '';

  modal.querySelector('#jobDetailTitle').innerText = title;

  modal.querySelector('#jobDetailBody').innerHTML = `
    <div><strong>Company:</strong> ${escapeHtml(company)}</div>
    <div><strong>Location:</strong> ${escapeHtml(location)}</div>
    <div><strong>Experience:</strong> ${escapeHtml(exp)}</div>
    <div><strong>Skills:</strong> ${escapeHtml(skills)}</div>
    <hr>
    <div style="white-space:pre-wrap">${escapeHtml(desc)}</div>
  `;

  const applyBtn = modal.querySelector('#jobDetailApplyBtn');
  applyBtn.onclick = () => { 
    try { bootstrap.Modal.getInstance(modal).hide(); } catch(e){} 
    openApplyModal(job.id || job.pk); 
  };

  try {
    document.activeElement && document.activeElement.blur();
    bootstrap.Modal.getOrCreateInstance(modal).show();
  } catch (e) {
    modal.style.display = 'block';
  }
}


  /* -------- Quiz modal / submit (unchanged logic, trimmed) -------- */
function createQuizModalIfMissing() {
  if (document.getElementById('quizModal')) return;
  const modal = document.createElement('div');
  modal.id = 'quizModal';
  modal.style = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);z-index:99999';

  modal.innerHTML = `
  <div style="background:#fff;padding:18px;border-radius:8px;max-width:900px;width:96%;max-height:88vh;overflow:auto;position:relative;">
    <div class="quiz-header" style="margin-bottom:8px;">
      <h4 id="quizTitle" style="margin:0">Quiz</h4>
      <div class="header-right">
        <div id="quizTimer">⏳ 0:00</div>
        <button id="quizClose" class="btn btn-sm btn-outline-secondary">Close</button>
      </div>
    </div>

    <div id="quizMeta" style="margin-top:4px;color:#666"></div>
    <div id="quizQuestions" style="margin-top:12px">Loading...</div>
    <div style="margin-top:12px;text-align:right"><button id="quizSubmit" class="btn btn-primary">Submit</button></div>
  </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#quizClose').addEventListener('click', closeQuizModal);
  modal.querySelector('#quizSubmit').addEventListener('click', () => submitQuizAttempt(false));

  // small style guard (in case not in CSS yet)
  const style = document.createElement('style');
  style.textContent = `
    #quizQuestions .quiz-question { margin-bottom:14px; }
    #quizQuestions label { display:block; margin:6px 0; cursor:pointer; }
    #quizQuestions input[type="radio"], #quizQuestions input[type="checkbox"] { margin-right:8px; }
    #quizQuestions .open-answer { width:100%; min-height:80px; padding:8px; border-radius:6px; border:1px solid #e6e6e6; }
  `;
  document.head.appendChild(style);
}


  async function openQuizModal(jobId){
    createQuizModalIfMissing();
    const modal = document.getElementById('quizModal'); modal.style.display='flex'; modal.dataset.jobId = jobId;
    const qWrap = modal.querySelector('#quizQuestions'); qWrap.innerHTML = 'Loading...';
    let res = await _apiFetch(API.QUIZ_GET(jobId));
    if(!res || !res.ok) {
      const gen = await _apiFetch(`/api/quiz/generate/${jobId}/`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ job_id: jobId }) });
      if (gen && gen.ok) res = gen;
    }
    if(!res || !res.ok) { qWrap.innerHTML = `<div class="text-danger">Failed to load quiz (${res?.status||'error'})</div>`; return; }
    const body = res.data || {};
    let questions = Array.isArray(body) ? body : (Array.isArray(body.questions) ? body.questions : (Array.isArray(body.questions_json) ? body.questions_json : []));
    if(!questions || !questions.length) { qWrap.innerHTML = `<div class="text-danger">No questions available</div>`; return; }
    let seconds = questions.length <=5 ? 120 : (questions.length <=10 ? 300 : Math.min(1800, Math.ceil(questions.length/10)*300));
    renderQuizQuestions(questions); startQuizTimer(seconds);
  }

 // ---- replace renderQuizQuestions ----
function renderQuizQuestions(questions){
  const qWrap = document.getElementById('quizQuestions'); if(!qWrap) return;
  qWrap.innerHTML = '';

  function normalizeChoices(q){
    if(!q) return null;
    if(Array.isArray(q.choices) && q.choices.length) return q.choices;
    if(Array.isArray(q.options) && q.options.length) return q.options;
    if(Array.isArray(q.answers) && q.answers.length) return q.answers;
    if(typeof q.choices === 'object' && !Array.isArray(q.choices)) return Object.values(q.choices);
    if(typeof q.options_text === 'string' && q.options_text.trim()){
      return q.options_text.split(/\r?\n|\|+/).map(s=>s.trim()).filter(Boolean);
    }
    if(typeof q.choices_html === 'string' && q.choices_html.trim()){
      const tmp = document.createElement('div'); tmp.innerHTML = q.choices_html;
      return Array.from(tmp.querySelectorAll('li,div,option,p')).map(n=>n.textContent.trim()).filter(Boolean);
    }
    return null;
  }

  questions.slice(0,50).forEach((q, idx) => {
    const qid = q.id || q.pk || `q${idx}`;
    const questionText = q.question || q.title || q.text || `Question ${idx+1}`;
    const choices = normalizeChoices(q);

    const qDiv = document.createElement('div');
    qDiv.className = 'quiz-question';
    qDiv.dataset.qid = qid;

    const titleDiv = document.createElement('div');
    titleDiv.className = 'question-title';
    titleDiv.textContent = questionText;
    qDiv.appendChild(titleDiv);

    if(choices && Array.isArray(choices) && choices.length){
      const multi = !!(q.multiple || q.multi || q.type === 'multiple_choice');
      const list = document.createElement('div');
      choices.forEach((c, i) => {
        const optId = `q-${qid}-opt-${i}`;
        const lbl = document.createElement('label'); lbl.htmlFor = optId;
        const inp = document.createElement('input');
        inp.type = multi ? 'checkbox' : 'radio';
        inp.name = `q-${qid}`;
        inp.value = (typeof c === 'object' ? (c.value || c.id || JSON.stringify(c)) : String(i));
        inp.id = optId;
        lbl.appendChild(inp);
        const span = document.createElement('span');
        span.textContent = (typeof c === 'object' ? (c.label || c.text || JSON.stringify(c)) : String(c));
        lbl.appendChild(span);
        list.appendChild(lbl);
      });
      qDiv.appendChild(list);
    } else {
      // open answer fallback
      const ta = document.createElement('textarea');
      ta.className = 'open-answer';
      ta.name = `q-${qid}-text`;
      ta.placeholder = 'Type your answer here (open-ended)';
      qDiv.appendChild(ta);
    }

    qWrap.appendChild(qDiv);
  });

  const meta = document.getElementById('quizMeta');
  if(meta) meta.textContent = `Questions: ${questions.length}`;
}

  function startQuizTimer(seconds){
    const timerEl = document.getElementById('quizTimer'); stopQuizTimer();
    quizSecondsRemaining = Number(seconds)||0;
    function tick(){
      const m = Math.floor(quizSecondsRemaining/60), s = quizSecondsRemaining%60;
      if(timerEl) timerEl.textContent = `⏳ ${m}:${String(s).padStart(2,'0')}`;
      if(quizSecondsRemaining<=0){ stopQuizTimer(); showToast('Time up — submitting','info'); submitQuizAttempt(true); return; }
      quizSecondsRemaining--;
    }
    tick(); quizTimerHandle = setInterval(tick,1000);
  }
  function stopQuizTimer(){ if(quizTimerHandle) clearInterval(quizTimerHandle); quizTimerHandle = null; const t=document.getElementById('quizTimer'); if(t) t.textContent=''; }
  function closeQuizModal(){ try{ stopQuizTimer(); const m=document.getElementById('quizModal'); if(m) m.style.display='none'; }catch(e){} }

// ---- replace submitQuizAttempt ----
async function submitQuizAttempt(auto=false){
  const modal = document.getElementById('quizModal'); if(!modal) return;
  const jobId = modal.dataset.jobId;
  const ans = {};
  modal.querySelectorAll('.quiz-question').forEach(q => {
    const qid = q.dataset.qid;
    // collect radios/checkboxes
    const radios = q.querySelectorAll('input[type="radio"][name="q-'+qid+'"]');
    const checks = q.querySelectorAll('input[type="checkbox"][name="q-'+qid+'"]');
    if(checks && checks.length){
      const vals = Array.from(checks).filter(c=>c.checked).map(c=>c.value);
      ans[qid] = vals;
      return;
    }
    if(radios && radios.length){
      const sel = Array.from(radios).find(r => r.checked);
      ans[qid] = sel ? sel.value : null;
      return;
    }
    // fallback: open text answer
    const ta = q.querySelector('textarea[name="q-'+qid+'-text"]') || q.querySelector('textarea');
    if(ta) ans[qid] = ta.value.trim();
    else ans[qid] = null;
  });

  const btn = document.getElementById('quizSubmit'); if(btn) btn.disabled = true;
  try {
    const payload = { job_id: jobId, answers: ans };
    // try cookie-auth POST first (if available)
    let r = null;
    try { r = await _fetchWithAuth(API.QUIZ_ATTEMPT_SUBMIT, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) }); } catch(e){ r = null; }
    let body = null;
    if(r && r.ok && typeof r.json === 'function'){ body = await r.json().catch(()=>null); }
    else {
      const rpc = await _apiFetch(API.QUIZ_ATTEMPT_SUBMIT, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      if(rpc && rpc.ok) body = rpc.data;
    }

    const status = body && body.status; // "passed" or "failed"
const score = body && (body.score !== undefined ? body.score : null);
if(status === 'passed') {
  showToast(`Passed — Score: ${score||0}%`, 'success');
} else if(status === 'failed') {
  showToast(`Failed — Score: ${score||0}%`, 'error');
} else {
  showToast(`Quiz submitted — ${score||''}`, 'info');
}

    await loadAttemptSummary(jobId);
    await loadMyApplications();
    closeQuizModal();
  } catch(e){
    console.error('quiz submit', e);
    showToast('Quiz submit failed','error');
  } finally {
    if(btn) btn.disabled = false;
  }
}

async function loadAttemptSummary(jobId){
  if(!jobId) return;
  const container = document.getElementById(`quiz-status-${jobId}`) || document.querySelector(`.job-card [id="quiz-status-${jobId}"]`);
  const tries = [ API.QUIZ_ATTEMPTS_BY_JOB(jobId), `/api/quiz/attempts/?job_id=${jobId}`, `/api/quiz/attempts/?job=${jobId}` ];
  for(const u of tries){
    try {
      const r = await _apiFetch(u);
      if(!r || !r.ok) continue;
      const arr = Array.isArray(r.data)? r.data : (r.data?.results || r.data?.attempts || []);
      if(!arr || arr.length===0) { if(container) container.textContent='Not attempted'; continue; }

      // pick latest attempt
      const latest = arr.slice().sort((a,b) => new Date(b.finished_at||b.started_at||0) - new Date(a.finished_at||a.started_at||0))[0];

      // backend sends: score (percent or value), correct, total, status, passed
      const score = latest.score ?? null;
      const correct = latest.correct ?? null;
      const total = latest.total ?? null;
      const status = latest.status || (latest.passed ? "passed" : "failed");

      let text = status ? status.toUpperCase() : 'UNKNOWN';
      if(correct !== null && total !== null) {
        text += ` (${correct}/${total})`;
      } else if(score !== null) {
        text += ` — Score: ${score}%`;
      }

      if(container) container.textContent = text;

      // disable apply button if not passed
      const applyBtn = document.querySelector(`.apply-btn[data-id="${jobId}"]`);
      if(applyBtn) applyBtn.disabled = (status !== 'passed');

      return arr;
    } catch(e){ continue; }
  }
}


  /* -------- Applications -------- */
  async function loadMyApplications(){
    const el = document.getElementById('myApplicationsList'); if(!el) return;
    el.innerHTML = '<div class="small-muted">Loading applications...</div>';
    const tries = [ API.MY_APPLICATIONS, API.APPLICATIONS, '/api/resumes/applications/?mine=true' ];
    let res = null;
    for(const u of tries){ const r = await _apiFetch(u); if(r && r.ok) { res = r; break; } }
    if(!res) { el.innerHTML = '<div class="small-muted">Failed to load applications</div>'; return; }
    let apps = Array.isArray(res.data) ? res.data : (res.data?.applications || res.data?.results || []);
    if(!Array.isArray(apps)) apps = [];
    // filter by token user if present
    const token = getAccessToken ? getAccessToken() : (localStorage.getItem('token') || '');
    let currentUserId = null;
    if(token) {
      try { const p = token.split('.')[1]; const payload = JSON.parse(atob(p)); currentUserId = payload?.user_id || payload?.id || payload?.sub; } catch(e){}
    }
    if(currentUserId) apps = apps.filter(a => { const cand = a.candidate || a.candidate_id || (a.candidate && a.candidate.id) || (a.resume && (a.resume.user || a.resume.user_id)); return String(cand) === String(currentUserId) || !cand; });

    if(!apps.length) { el.innerHTML = '<div class="small-muted">No applications yet</div>'; return; }
    el.innerHTML = '';
    apps.forEach(a => {
      const jobTitle = (a.job && (a.job.title || a.job)) || a.job_title || `Job ${a.job_id||''}`;
      const status = a.status || a.application_status || 'pending';
      const appliedAt = a.applied_at || a.created_at || '';
      const resumeUrl = a.resume_file || (a.resume && (a.resume.file || ''));
      const resumeLabel = (a.resume && (a.resume.file ? (a.resume.file.split('/').pop()) : `Resume ${a.resume.id||a.resume}`)) || `Resume ${a.resume_id||a.resume||''}`;
      const id = a.id || a.application_id || '';
      const div = document.createElement('div'); div.className='card mb-2 p-2';
      div.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:start">
        <div style="min-width:0">
          <strong>${escapeHtml(jobTitle)}</strong>
          <div class="small-muted">Applied: ${escapeHtml(appliedAt)} • Status: <span class="badge ${status==='shortlisted'?'bg-success':'bg-secondary'}">${escapeHtml(status)}</span></div>
          <div class="small-muted">Resume: ${resumeUrl? `<a href="${escapeHtml(resumeUrl)}" target="_blank">${escapeHtml(resumeLabel)}</a>` : escapeHtml(resumeLabel)}</div>
        </div>
        <div style="text-align:right">
          <button class="btn btn-sm btn-outline-danger remove-app-btn" data-id="${id}">Withdraw</button>
        </div>
      </div>`;
      el.appendChild(div);
      div.querySelector('.remove-app-btn')?.addEventListener('click', async ()=>{
        if(!confirm('Withdraw this application?')) return;
        const tryUrls = [ `/api/resumes/applications/${id}/`, `/api/applications/${id}/`, API.APPLICATIONS + `${id}/` ];
        let ok = false;
        for(const u of tryUrls){
          const r = await _apiFetch(u, { method:'DELETE' });
          if(r && r.ok){ ok=true; break; }
        }
        if(!ok){ const r2 = await _apiFetch(`/api/resumes/applications/${id}/withdraw/`, { method:'POST' }); if(r2 && r2.ok) ok=true; }
        if(ok) { showToast('Withdrawn','success'); loadMyApplications(); } else showToast('Could not withdraw','error');
      });
    });
  }

  async function exportApplicationsCSV(){
    const res = await _apiFetch(API.MY_APPLICATIONS);
    if(!res || !res.ok) return showToast('Export not available','error');
    const apps = Array.isArray(res.data)? res.data : (res.data?.applications || []);
    if(!apps.length) return showToast('No applications','info');
    const headers = ['application_id','job_title','resume_id','status','applied_at'];
    const rows = apps.map(a => [a.id||'', (a.job && (a.job.title||''))||a.job_title||'', a.resume_id || (a.resume && a.resume.id) || '', a.status||'', a.applied_at||a.created_at||'']);
    const csv = headers.join(',') + '\n' + rows.map(r=> r.map(c=> `"${(String(c||'')).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='my_applications.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    showToast('Downloaded CSV','success');
  }

  /* -------- Invites (modal-targeted) -------- */
/* -------- Invites (modal-targeted) -------- */
async function loadInvites(){
  const modal = document.getElementById('invitesModal');
  if(!modal) { console.error('#invitesModal missing'); return; }

  const wrap = modal.querySelector('#invitesListModal') || modal.querySelector('#invitesList');
  if(!wrap) { console.error('invites container missing inside modal'); return; }
  wrap.innerHTML = '<div class="small-muted">Loading invites...</div>';

  const res = await _apiFetch(API.INVITES, { credentials:'include' });
  if(!res) { wrap.innerHTML = `<div class="text-danger">Network error</div>`; return; }
  if(!res.ok) { const detail = res.data?.detail || res.data || `Status ${res.status}`; wrap.innerHTML = `<div class="text-danger">Failed: ${escapeHtml(String(detail))}</div>`; return; }

  const arr = res.data?.invites || res.data?.results || (Array.isArray(res.data)? res.data : []);
  if(!arr || arr.length===0) { wrap.innerHTML = '<div class="small-muted">No invites.</div>'; return; }

  wrap.innerHTML = '';

  arr.forEach(inv => {
    const interview = (inv.interview && typeof inv.interview === 'object') ? inv.interview : {};
    const interviewId = interview.id || inv.interview_id || inv.interview;
    const id = inv.id || inv.invite_id || '';

    // ---- title resolution (prefer job_title) ----
    let title =
      inv.job_title ||
      inv.interview_title ||
      interview.title ||
      inv.title || null;

    if (!title) {
      const jobId = interview.job || interview.job_id || inv.job_id || inv.job || null;
      if (jobId && Array.isArray(window.jobs) && window.jobs.length) {
        const found = (window.jobs || []).find(j => String(j.id) === String(jobId) || String(j.pk) === String(jobId));
        if (found && found.title) title = found.title;
      }
    }
    if (!title) {
      const nestedJob = inv.job && typeof inv.job === 'object'
        ? inv.job
        : (interview.job && typeof interview.job === 'object' ? interview.job : null);
      if (nestedJob) title = nestedJob.title || nestedJob.job_title || null;
    }
    if (!title) title = `Interview ${interviewId || id || ''}`;

    const scheduled = inv.scheduled_at || interview.scheduled_at || '';
    const recruiter = inv.recruiter_name || inv.recruiter || '';
    const status = (inv.status||'pending').toLowerCase();
    const canStart = (status==='accepted') && isScheduledNowOrPast(scheduled) && interviewId;
    const startBtnHtml = interviewId
      ? `<button class="btn btn-sm btn-success start-invite" data-interview="${escapeHtml(interviewId)}" data-invite="${escapeHtml(id)}" ${canStart? '' : 'disabled'}>Start</button>`
      : '';

    const card = document.createElement('div');
    card.className = 'card mb-2 p-2';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div style="min-width:0">
          <strong>${escapeHtml(title)}</strong>
          <div class="small-muted">${escapeHtml(recruiter)} • ${escapeHtml(formatLocalDateTime(scheduled))}</div>
        </div>
        <div style="text-align:right">
          <div class="small-muted">Status: ${escapeHtml(status)}</div>
          <div style="margin-top:6px">
            ${status==='pending' ? `<button class="btn btn-sm btn-success accept-invite" data-id="${escapeHtml(id)}">Accept</button><button class="btn btn-sm btn-outline-danger decline-invite" data-id="${escapeHtml(id)}">Decline</button>` : ''}
            ${startBtnHtml}
            <button class="btn btn-sm btn-outline-secondary ms-1 view-invite" data-id="${escapeHtml(id)}">View</button>
          </div>
        </div>
      </div>`;
    wrap.appendChild(card);

    // Accept
    card.querySelectorAll('.accept-invite').forEach(b => b.addEventListener('click', async ()=>{
      b.disabled = true;
      const r = await _apiFetch(API.INVITE_RESPOND(id), {
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ response: 'accept' })
      });
      if (r && r.ok) { showToast('Accepted','success'); await loadInvites(); } else { showToast('Accept failed','error'); b.disabled=false; }
    }));

    // Decline
    card.querySelectorAll('.decline-invite').forEach(b => b.addEventListener('click', async ()=>{
      b.disabled = true;
      const r = await _apiFetch(API.INVITE_RESPOND(id), {
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ response: 'decline' })
      });
      if (r && r.ok) { showToast('Declined','success'); await loadInvites(); } else { showToast('Decline failed','error'); b.disabled=false; }
    }));

    // Start
    card.querySelectorAll('.start-invite').forEach(b => b.addEventListener('click', async (e)=>{
      e.preventDefault();
      if (b.disabled) { showToast('Cannot start yet','info'); return; }
      const iid = b.dataset.interview, inviteId = b.dataset.invite;
      b.disabled = true;
      const r = await _apiFetch(API.START_INTERVIEW(iid), {
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ invite: inviteId })
      });
      if (r && (r.status===403 || r.status===400)) {
        const sched = r.data?.scheduled_start || r.data?.scheduled_at || null;
        if (r.status===403 && sched) showToast(`Cannot start yet. ${formatLocalDateTime(sched)}`, 'info', 6000);
        else showToast(r.data?.detail || `Status ${r.status}`,'error',5000);
        b.disabled = false; return;
      }
      let url = r && r.ok && r.data ? (r.data.redirect_url || r.data.join_url || r.data.url || r.data.attempt_url) : null;
      if (!url) {
        const pageBase = (API.INVITES || '/api/interviews/candidate/invites/').replace(/\/candidate\/.*$/, '');
        url = `${pageBase}/page/candidate/${encodeURIComponent(iid)}/?invite=${encodeURIComponent(inviteId)}`;
      }
      try { window.open(url,'_blank','noopener'); } catch(e) { window.location.href = url; }
      b.disabled = false;
    }));

    // View
    card.querySelectorAll('.view-invite').forEach(b => b.addEventListener('click', ()=> viewInvite(b.dataset.id)));
  });
}


/* -------- Invite detail view (robust) -------- */
async function viewInvite(inviteId){
  if(!inviteId) return showToast('Invite id missing','error');
  let modal = document.getElementById('inviteDetailModal');
  if(!modal){
    modal = document.createElement('div'); modal.id='inviteDetailModal'; modal.className='modal fade';
    modal.innerHTML = `<div class="modal-dialog modal-lg"><div class="modal-content">
      <div class="modal-header"><h5 class="modal-title">Invite details</h5><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
      <div class="modal-body"><div id="inviteDetailContent">Loading...</div></div>
      <div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">Close</button></div>
    </div></div>`;
    document.body.appendChild(modal);
  }
  const content = modal.querySelector('#inviteDetailContent'); if(!content) return;
  try { document.activeElement && document.activeElement.blur(); bootstrap.Modal.getOrCreateInstance(modal).show(); } catch(e){ modal.style.display='block'; }
  content.innerHTML = `<div style="padding:14px;text-align:center"><div class="spinner-border" role="status" style="width:2rem;height:2rem"></div><div style="margin-top:8px">Loading invite…</div></div>`;

  try {
    const listResp = await _apiFetch(API.INVITES, { credentials:'include' });
    if(!listResp || !listResp.ok) { content.innerHTML = `<div class="text-danger">Error loading invite</div>`; return; }
    const arr = listResp.data?.invites || listResp.data?.results || (Array.isArray(listResp.data)? listResp.data : []);
    const inv = (arr||[]).find(x => String(x.id)===String(inviteId) || String(x.invite_id)===String(inviteId));
    if(!inv) { content.innerHTML = `<div class="text-muted">Invite not found</div>`; return; }
    const interview = inv.interview || {};
    const title = inv.job_title || inv.interview_title || interview.title || inv.title || 'Interview';
    const scheduledRaw = inv.scheduled_at || interview.scheduled_at || '';
    const scheduledLocal = formatLocalDateTime(scheduledRaw);
    const status = (inv.status||'pending').toLowerCase();

    content.innerHTML = `<div><strong>${escapeHtml(title)}</strong></div>
      <div style="margin-top:6px"><strong>When:</strong> ${escapeHtml(scheduledLocal)}</div>
      <div style="margin-top:8px"><strong>Message:</strong><div style="white-space:pre-wrap">${escapeHtml(inv.message||inv.note||'')}</div></div>
      <div style="margin-top:8px"><strong>Status:</strong> ${escapeHtml(status)}</div>
      <div style="margin-top:12px;text-align:right">
        ${status==='pending' ? `<button id="inviteAcceptBtn" class="btn btn-success btn-sm">Accept</button><button id="inviteDeclineBtn" class="btn btn-outline-danger btn-sm">Decline</button>` : ''}
        ${(status==='accepted') && (interview.id||inv.interview_id) ? `<button id="inviteStartBtn" class="btn btn-primary btn-sm">Start</button>` : ''}
      </div>`;

    modal.querySelector('#inviteAcceptBtn')?.addEventListener('click', async ()=>{
      const r = await _apiFetch(API.INVITE_RESPOND(inv.id), {
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ response:'accept' })
      });
      if(r && r.ok){ showToast('Accepted','success'); await loadInvites(); try{ bootstrap.Modal.getInstance(modal).hide(); }catch(e){ modal.style.display='none'; } }
      else { showToast('Accept failed','error'); }
    });

    modal.querySelector('#inviteDeclineBtn')?.addEventListener('click', async ()=>{
      const r = await _apiFetch(API.INVITE_RESPOND(inv.id), {
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ response:'decline' })
      });
      if(r && r.ok){ showToast('Declined','success'); await loadInvites(); try{ bootstrap.Modal.getInstance(modal).hide(); }catch(e){ modal.style.display='none'; } }
      else { showToast('Decline failed','error'); }
    });

    modal.querySelector('#inviteStartBtn')?.addEventListener('click', async ()=>{
      const iid = (interview.id || inv.interview_id);
      try {
        const r = await _apiFetch(API.START_INTERVIEW(iid), {
          method:'POST', credentials:'include',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ invite: inv.id })
        });
        if (r && (r.status===403 || r.status===400)) {
          const sched = r.data?.scheduled_start || r.data?.scheduled_at || null;
          if (r.status===403 && sched) showToast(`Cannot start yet. Scheduled at ${formatLocalDateTime(sched)}`, 'info', 6000);
          else showToast(r.data?.detail || `Status ${r.status}`,'error',5000);
          return;
        }
        let url = r && r.ok && r.data ? (r.data.redirect_url || r.data.join_url || r.data.url || r.data.attempt_url) : null;
        if (!url) {
          const pageBase = (API.INVITES || '/api/interviews/candidate/invites/').replace(/\/candidate\/.*$/,'');
          url = `${pageBase}/page/candidate/${encodeURIComponent(iid)}/?invite=${encodeURIComponent(inv.id)}`;
        }
        try { window.open(url,'_blank','noopener'); } catch(e) { window.location.href = url; }
      } catch(e){ showToast('Failed to start interview','error'); }
    });
  } catch(err){
    console.error('viewInvite error', err);
    content.innerHTML = `<div class="text-danger">Error loading invite (see console)</div>`;
  }
}


async function respondInvite(inviteId, action) {
  if (!inviteId) return showToast('Invite id missing','error');
  const act = String(action||'').toLowerCase();
  if (!['accept','decline','yes','no'].includes(act)) return showToast('Invalid action','error');
  const payload = { response: act.startsWith('acc') ? 'accept' : 'decline' };
  try {
    const r = await _apiFetch(API.INVITE_RESPOND(inviteId), {
      method:'POST', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    if (!r || !r.ok) { showToast('Failed to respond','error'); return; }
    showToast(`Invite ${payload.response}ed`,'success');
    await loadInvites();
    const detailModal = document.getElementById('inviteDetailModal');
    if (detailModal) try { bootstrap.Modal.getInstance(detailModal)?.hide(); } catch(e){ detailModal.style.display='none'; }
  } catch(e){ showToast('Network error','error'); }
}
if(!window.startInterview) {
  window.startInterview = async function(interviewId, inviteId=null){
    if(!interviewId) return;
    const q = inviteId ? `?invite=${encodeURIComponent(inviteId)}` : '';
    const base = (API.INVITES || '/api/interviews/candidate/invites/').replace(/\/candidate\/.*$/,'');
    window.location.href = `${base}/page/candidate/${encodeURIComponent(interviewId)}/${q}`;
  };
}


  /* -------- Init & wiring -------- */
  function init(){
    console.log('candidate dashboard init');
    // Upload
    document.getElementById('uploadBtn')?.addEventListener('click', (e)=>{
      e.preventDefault();
      const fi = document.getElementById('resumeFile'); if(!fi || !fi.files || fi.files.length===0) return showToast('Choose file','error');
      handleUploadFile(fi.files[0]);
    });

    document.getElementById('refreshJobs')?.addEventListener('click', loadJobs);
    document.getElementById('refreshMyAppsBtn')?.addEventListener('click', loadMyApplications);
    document.getElementById('exportMyAppsBtn')?.addEventListener('click', exportApplicationsCSV);

    // create lightweight apply modal only if missing
    if(!document.getElementById('applyModal')){
      const div = document.createElement('div'); div.id='applyModal'; div.className='modal fade';
      div.innerHTML = `<div class="modal-dialog modal-md modal-dialog-centered"><div class="modal-content"><form id="applyForm">
        <div class="modal-header"><h5 class="modal-title">Apply</h5><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
        <div class="modal-body"><div class="mb-2"><label>Resume</label><select id="applyResumeSelect" class="form-select"></select></div>
        <div class="mb-2"><label>Message</label><textarea id="applyMessage" class="form-control" rows="3"></textarea></div></div>
        <div class="modal-footer"><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button><button id="applySubmitBtn" class="btn btn-primary">Apply</button></div>
      </form></div></div>`;
      document.body.appendChild(div);
    }

    // apply form submit
    document.addEventListener('submit', async (e)=>{
      if(!e.target || e.target.id !== 'applyForm') return;
      e.preventDefault();
      const jobId = window.__apply_job_id;
      const resumeId = document.getElementById('applyResumeSelect')?.value;
      const message = (document.getElementById('applyMessage')?.value || '').trim();
      if(!jobId || !resumeId) return showToast('Select job and resume','error');
      showSpinner(true, 'Applying...');
      try {
        let res = await _apiFetch(API.APPLY, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ job_id: jobId, resume_id: resumeId, message }) });
        if(!res || !res.ok){
          // fallback to FormData + fetchWithAuth
          const fd = new FormData(); fd.append('job_id', jobId); fd.append('resume_id', resumeId); fd.append('message', message);
          const r2 = await _fetchWithAuth(API.APPLY, { method:'POST', body: fd }).catch(()=>null);
          res = (r2 && r2.ok) ? { ok: true, data: await (async ()=>{ try{ return await r2.json(); }catch{ return null; } })() } : res;
        }
        if(res && res.ok) { showToast('Applied','success'); const m=document.getElementById('applyModal'); try{ bootstrap.Modal.getInstance(m)?.hide(); }catch(e){ m.style.display='none'; } loadMyApplications(); }
        else { showToast('Apply failed: ' + (res?.data?.detail || res?.data?.message || `Status ${res?.status}`),'error'); }
      } catch(e){ showToast('Apply error','error'); }
      finally { showSpinner(false); }
    });

    // invites modal: do not duplicate if template already has one
    const staticInvModal = document.getElementById('invitesModal');
    if(!staticInvModal){
      const m = document.createElement('div'); m.id='invitesModal'; m.className='modal fade';
      m.innerHTML = `<div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h5 class="modal-title">Invites</h5><button class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body"><div id="invitesListModal"><div class="small-muted">Loading invites...</div></div></div><div class="modal-footer"><button id="invitesClose" class="btn btn-secondary" data-bs-dismiss="modal">Close</button></div></div></div>`;
      document.body.appendChild(m);
      m.querySelector('#invitesClose')?.addEventListener('click', ()=> { try{ bootstrap.Modal.getInstance(m).hide(); }catch(e){ m.style.display='none'; } });
    } else {
      // ensure modal has invitesListModal inside for consistent selector
      if(!staticInvModal.querySelector('#invitesListModal') && staticInvModal.querySelector('#invitesList')) {
        // if template uses invitesList, leave it; else add invitesListModal wrapper for safety
      }
    }

    document.getElementById('viewInvitesBtn')?.addEventListener('click', ()=>{
      const m = document.getElementById('invitesModal'); if(!m) return;
      try { document.activeElement && document.activeElement.blur(); bootstrap.Modal.getOrCreateInstance(m).show(); } catch(e){ m.style.display='block'; }
      loadInvites().catch(err => console.error('loadInvites error', err));
    });

    // initial loads
    refreshResumes(); loadJobs(); loadMyApplications(); setTimeout(()=> loadInvites().catch(()=>{}), 400);
  }

  // open apply modal helper

  // ---- helpers (add if missing) ----
function isScheduledNowOrPast(iso){
  if(!iso) return true;
  const t = new Date(iso);
  if (isNaN(t)) return true;
  return Date.now() >= t.getTime();
}
function formatLocalDateTime(iso){
  try { return iso ? new Date(iso).toLocaleString() : '—'; } catch { return '—'; }
}

  window.openApplyModal = function(jobId){
    window.__apply_job_id = jobId;
    const modal = document.getElementById('applyModal');
    const sel = document.getElementById('applyResumeSelect');
    if(!sel) return showToast('Apply modal missing','error');
    sel.innerHTML = '<option value="">-- choose resume --</option>';
    resumes.forEach(r => {
      const id = r.id || r.pk || r.resume_id || '';
      const name = r.file_name || (r.file ? (typeof r.file === 'string' ? r.file.split('/').pop() : (r.file.url ? r.file.url.split('/').pop() : `Resume ${id}`)) : `Resume ${id}`);
      const opt = document.createElement('option'); opt.value = id; opt.text = name; sel.appendChild(opt);
    });
    try { bootstrap.Modal.getOrCreateInstance(modal).show(); } catch(e){ modal.style.display='block'; }
  };

  window.cdb = { refreshResumes, loadJobs, loadMyApplications, loadInvites, openApplyModal, openQuizModal, exportApplicationsCSV };

  // boot
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  /* -------- small JWT status helper (keeps showing on sidebar) -------- */
  (function jwtAuthStatus(){
    const sidebar = document.querySelector('.sidebar') || document.body;
    let statusEl = document.getElementById('jwtAuthStatus');
    if(!statusEl){ statusEl = document.createElement('div'); statusEl.id='jwtAuthStatus'; statusEl.style.marginBottom='8px'; sidebar.prepend(statusEl); }
    function setStatus(txt,isErr=false){ statusEl.innerText = txt; statusEl.style.color = isErr? 'crimson' : ''; }
    function checkAuth(){
      const token = getAccessToken ? getAccessToken() : (localStorage.getItem('token')||'');
      if(!token) { setStatus('Not logged in', true); return false; }
      if(isTokenExpired && isTokenExpired(token)) { setStatus('Token expired', true); return false; }
      setStatus('Authenticated with JWT'); createLogoutBtn(); return true;
    }
    function createLogoutBtn(){
      if(document.getElementById('jwtLogoutBtn')) return;
      const btn = document.createElement('button'); btn.id='jwtLogoutBtn'; btn.className='btn btn-sm btn-outline-danger ms-2'; btn.innerText='Logout';
      btn.addEventListener('click', ()=> { clearTokens && clearTokens(); location.href = '/'; });
      statusEl.insertAdjacentElement('afterend', btn);
    }
    checkAuth();
  })();

})();
