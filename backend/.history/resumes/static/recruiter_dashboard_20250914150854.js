// recruiter_dashboard.js

// ---- config ----
const apiBase = '/api/resumes'; // change if your API lives elsewhere

// ---- small helpers ----
function getToken(){ return localStorage.getItem('token') || document.getElementById('tokenInput').value.trim(); }
function showToast(msg, type='info') {
  const id = 't' + Date.now();
  const wrapper = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = 'toast align-items-center text-bg-' + (type==='error' ? 'danger' : (type==='success' ? 'success' : 'secondary')) + ' border-0';
  el.innerHTML = '<div class="d-flex"><div class="toast-body">'+msg+'</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>';
  wrapper.appendChild(el);
  const bs = new bootstrap.Toast(el, { delay: 4000 });
  bs.show();
  el.addEventListener('hidden.bs.toast', ()=>el.remove());
}
function authHeaders(){ const t=getToken(); return t ? { 'Authorization': 'Bearer ' + t } : {}; }

function showSpinner(on){
  const el = document.getElementById('globalSpinner');
  if (!el) return;
  el.style.display = on ? 'flex' : 'none';
}
function toggleLoadingButtons(disable){
  ['#refreshJobs','#showMatchesBtn','#showShortlistsBtn','#saveTokenBtn'].forEach(sel=>{
    const b = document.querySelector(sel);
    if (!b) return;
    if (disable){ b.classList.add('btn-loading'); b.setAttribute('disabled','disabled'); }
    else { b.classList.remove('btn-loading'); b.removeAttribute('disabled'); }
  });
}

// Improved fetch wrapper
async function api(path, opts = {}){
  showSpinner(true);
  try{
    opts.headers = opts.headers || {};
    opts.headers['Accept'] = 'application/json';
    Object.assign(opts.headers, authHeaders());
    if (!opts.body && (opts.method === 'POST' || opts.method === 'DELETE')) opts.headers['Content-Type'] = 'application/json';
    toggleLoadingButtons(true);
    const resp = await fetch(path, opts);
    const txt = await resp.text();
    let json = null;
    try { json = txt ? JSON.parse(txt) : null; } catch(e){ json = txt; }
    if (resp.status === 401){
      localStorage.removeItem('token');
      document.getElementById('tokenInput').value = '';
      showToast('Token invalid/expired. Paste new token.', 'error');
      return { ok:false, status:401, data: json };
    }
    return { ok: resp.ok, status: resp.status, data: json };
  }catch(err){
    console.error('API error', err);
    showToast('Network/server error', 'error');
    return { ok:false, status:0, data:null };
  }finally{
    toggleLoadingButtons(false);
    showSpinner(false);
  }
}

// ---- UI logic ----
document.getElementById('saveTokenBtn').addEventListener('click', ()=>{
  const val = document.getElementById('tokenInput').value.trim();
  if (!val) { showToast('Paste token first', 'error'); return; }
  localStorage.setItem('token', val); showToast('Token saved', 'success');
});

document.getElementById('refreshJobs').addEventListener('click', loadJobs);

let jobs = [], selectedJob = null;

async function loadJobs(){
  const res = await api(apiBase + '/jobs/');
  if (!res.ok) return showToast('Failed to load jobs: ' + (res.data?.detail || res.status), 'error');
  jobs = res.data || [];
  const container = document.getElementById('jobsList'); container.innerHTML = '';
  jobs.forEach(j=>{
    const a = document.createElement('a');
    a.className = 'list-group-item list-group-item-action job-card';
    a.innerHTML = `<div><strong>${j.title}</strong><div class="small-muted">${j.company || ''} • ${j.skills_required || ''}</div></div>`;
    a.onclick = ()=> selectJob(j);
    container.appendChild(a);
  });
  showToast('Jobs loaded', 'success');
}

function selectJob(j){
  selectedJob = j;
  document.getElementById('noJob').style.display = 'none';
  document.getElementById('jobDetails').style.display = 'block';
  document.getElementById('jobTitle').innerText = j.title;
  document.getElementById('jobMeta').innerText = (j.company || '') + ' • Experience required: ' + (j.experience_required || 0);
  document.getElementById('matchesSection').style.display = 'none';
  document.getElementById('shortlistSection').style.display = 'none';
  document.getElementById('matchesList').innerHTML = '';
  document.getElementById('shortlistList').innerHTML = '';
}

document.getElementById('showMatchesBtn').addEventListener('click', async ()=>{
  if (!selectedJob) return showToast('Select job first', 'error');
  const res = await api(`${apiBase}/jobs/${selectedJob.id}/match`);
  if (!res.ok) return showToast('Failed to fetch matches: ' + (res.data?.detail || res.status), 'error');
  const list = document.getElementById('matchesList'); list.innerHTML = '';
  (res.data?.matched_resumes || []).forEach(m=>{
    const div = document.createElement('div');
    div.className = 'card mb-2 p-2';
    div.innerHTML = `
      <div class="d-flex justify-content-between">
        <div>
          <strong>${m.user}</strong> — ${m.score}% <span class="small-muted">(${m.experience || 0} yrs)</span>
          <div class="small-muted">skills: ${m.skills || ''}</div>
          <div class="small-muted">missing: ${(m.missing_skills || []).join(', ')}</div>
        </div>
        <div>
          <button class="btn btn-sm btn-primary" onclick='shortlist(${selectedJob.id}, ${m.resume_id})'>Shortlist</button>
        </div>
      </div>`;
    list.appendChild(div);
  });
  document.getElementById('matchesSection').style.display = 'block';
});

async function shortlist(job_id, resume_id){
  const payload = { job_id, resume_id };
  const res = await api(`${apiBase}/shortlist/`, { method: 'POST', body: JSON.stringify(payload) });
  if (res.ok) showToast('Shortlisted (created)', 'success');
  else if (res.status === 409) showToast('Already shortlisted — use resend', 'info');
  else showToast('Shortlist failed: ' + (res.data?.detail || res.status), 'error');
}

document.getElementById('showShortlistsBtn').addEventListener('click', async ()=>{
  if (!selectedJob) return showToast('Select job first', 'error');
  const res = await api(`${apiBase}/shortlist/?job_id=${selectedJob.id}`);
  if (!res.ok) return showToast('Failed to load shortlist: ' + (res.data?.detail || res.status), 'error');
  const list = document.getElementById('shortlistList'); list.innerHTML = '';
  (res.data || []).forEach(s=>{
    const div = document.createElement('div');
    div.className = 'card mb-2 p-2';
    div.innerHTML = `
      <div class="d-flex justify-content-between align-items-start">
        <div>
          <strong>Resume #${s.resume}</strong> — by user ${s.shortlisted_by}
          <div class="small-muted">created: ${s.created_at || ''}</div>
          <div class="small-muted">email_sent: ${s.email_sent} ${s.email_sent_at ? 'at ' + s.email_sent_at : ''}</div>
        </div>
        <div>
          <button class="btn btn-sm btn-outline-primary" onclick='resend(${s.job}, ${s.resume})'>Resend</button>
          <button class="btn btn-sm btn-outline-danger" onclick='removeShortlist(${s.id})'>Remove</button>
        </div>
      </div>`;
    list.appendChild(div);
  });
  document.getElementById('shortlistSection').style.display = 'block';
});

async function resend(job_id, resume_id){
  const res = await api(`${apiBase}/shortlist/`, { method:'POST', body: JSON.stringify({ job_id, resume_id, resend: true })});
  if (res.ok) showToast('Email resent', 'success');
  else showToast('Resend failed: ' + (res.data?.detail || res.status), 'error');
}

async function removeShortlist(id){
  if (!confirm('Remove shortlist?')) return;
  const res = await api(`${apiBase}/shortlist/`, { method: 'DELETE', body: JSON.stringify({ id }) });
  if (res.ok){ showToast('Removed', 'success'); document.getElementById('showShortlistsBtn').click(); }
  else showToast('Remove failed', 'error');
}

document.getElementById('exportCsvBtn').addEventListener('click', async ()=>{
  if (!selectedJob) return showToast('Select job first', 'error');
  const token = getToken(); if (!token) return showToast('Paste token first', 'error');
  const url = `${apiBase}/shortlist/export/?job_id=${selectedJob.id}`;
  try {
    const resp = await fetch(url, { headers: {'Authorization':'Bearer ' + token }});
    if (!resp.ok) return showToast('Export failed: ' + resp.status, 'error');
    const blob = await resp.blob();
    const filename = `shortlist_job_${selectedJob.id}.csv`;
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast('CSV downloaded', 'success');
  } catch(e){ console.error(e); showToast('Export error', 'error'); }
});

// init
(function(){
  const saved = localStorage.getItem('token');
  if (saved) document.getElementById('tokenInput').value = saved;
  loadJobs();
})();
document.getElementById('showMatchesBtn').addEventListener('click', async ()=>{
  if (!selectedJob) return showToast('Select job first','error');
  setBtnLoading('#showMatchesBtn', true);
  const res = await api(`/api/resumes/jobs/${selectedJob.id}/match`);
  setBtnLoading('#showMatchesBtn', false);
  
});

