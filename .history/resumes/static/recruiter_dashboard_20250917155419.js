// static/recruiter_dashboard.js
// Recruiter Dashboard – with Edit (full form), Delete (robust), Quiz generation, Matches & Applications

const API_ROOT = '/api';
const JOBS_ENDPOINT = `${API_ROOT}/resumes/jobs/`; // adjust if different
const TOKEN_KEY = 'recruiter_token_v1';

/* ---------------- small helpers ---------------- */
function showToast(msg, type = 'info', ms = 3000) {
  const container = document.getElementById('toastContainer') || document.body;
  const el = document.createElement('div');
  el.innerHTML = `<div style="padding:10px 14px;border-radius:8px;background:${
    type === 'error'
      ? '#f8d7da'
      : type === 'success'
      ? '#d1e7dd'
      : '#fff8d6'
  };border:1px solid #ddd;margin-bottom:8px">${msg}</div>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), ms);
}
function qs(sel, root = document) {
  return root.querySelector(sel);
}
function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}
function escapeHtml(s = '') {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"'`]/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '`': '&#x60;',
  })[m]);
}
function savedToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}
function setSavedToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}
function authHeaders() {
  const t = savedToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/* ---------------- apiFetch wrapper ---------------- */
async function apiFetch(path, opts = {}) {
  opts.headers = Object.assign(
    { 'Content-Type': 'application/json' },
    opts.headers || {},
    authHeaders()
  );
  try {
    const r = await fetch(path, opts);
    if (r.status === 401 || r.status === 403) {
      localStorage.removeItem(TOKEN_KEY);
      showToast('Not authorized — paste a valid token and retry', 'error', 4000);
      return { ok: false, status: r.status, data: null };
    }
    const txt = await r.text().catch(() => null);
    let json = null;
    try {
      json = txt ? JSON.parse(txt) : null;
    } catch (e) {
      json = null;
    }
    return { ok: r.ok, status: r.status, data: json, text: txt };
  } catch (e) {
    console.error('apiFetch error', e);
    return { ok: false, status: 0, error: true, exception: String(e) };
  }
}

/* ---------------- Jobs list & render ---------------- */
let selectedJob = null;

async function loadJobs() {
  const container = document.getElementById('jobsList');
  if (!container) return;
  container.innerHTML = '<div class="small-muted">Loading jobs...</div>';
  const res = await apiFetch(JOBS_ENDPOINT);
  if (!res || !res.ok) {
    container.innerHTML = `<div class="small-muted">Failed to load jobs (${
      res ? res.status : 'network'
    })</div>`;
    return;
  }
  const jobs = res.data || [];
  if (!jobs.length) {
    container.innerHTML = `<div class="small-muted">No jobs available</div>`;
    return;
  }

  container.innerHTML = ''; // clear

  jobs.forEach((j) => {
    const row = document.createElement('div');
    row.className =
      'list-group-item job-card d-flex align-items-start justify-content-between';
    row.dataset.jobId = j.id;

    const left = document.createElement('div');
    left.style.minWidth = '0';
    left.style.flex = '1';
    left.innerHTML = `
      <h4 style="margin:0 0 4px 0; font-size:1rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(
        j.title || ''
      )}</h4>
      <div class="small-muted" style="font-size:.9rem; color:#666;">
        ${escapeHtml(j.company || '')} • ${escapeHtml(
      j.skills_required || j.skills || ''
    )}
      </div>
    `;

    const right = document.createElement('div');
    right.style.minWidth = '180px';
    right.className = 'text-end';
    right.innerHTML = `
      <div class="btn-group" role="group">
        <button class="btn btn-sm btn-outline-primary view-job-btn" data-job-id="${
          j.id
        }">View</button>
        <button class="btn btn-sm btn-warning edit-job-btn" data-job-id="${
          j.id
        }">Edit</button>
        <button class="btn btn-sm btn-danger delete-job-btn" data-job-id="${
          j.id
        }">Delete</button>
      </div>
      <div style="margin-top:6px;">
        <button class="btn btn-sm btn-secondary generate-quiz-btn" data-job-id="${
          j.id
        }">Generate Quiz</button>
      </div>
    `;

    row.appendChild(left);
    row.appendChild(right);

    left.addEventListener('click', () => openJobDetail(j.id));

    container.appendChild(row);
  });

  attachJobCardEvents();
}

function attachJobCardEvents() {
  document.querySelectorAll('.view-job-btn').forEach((btn) => {
    if (btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      await openJobDetail(btn.dataset.jobId);
    });
  });

  document.querySelectorAll('.edit-job-btn').forEach((btn) => {
    if (btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openEditJob(btn.dataset.jobId);
    });
  });

  document.querySelectorAll('.delete-job-btn').forEach((btn) => {
    if (btn._bound) return;
    btn._bound = true;
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      confirmAndDeleteJob(btn.dataset.jobId);
    });
  });

  document.querySelectorAll('.generate-quiz-btn').forEach((btn) => {
    if (btn._boundQuiz) return;
    btn._boundQuiz = true;
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      if (!confirm('Generate quiz questions for this job?')) return;
      await generateQuizForJob(btn.dataset.jobId, 5);
    });
  });
}

/* ---------------- open job detail ---------------- */
async function openJobDetail(jobId) {
  const r = await apiFetch(`${JOBS_ENDPOINT}${jobId}/`, { method: 'GET' });
  if (!r.ok) {
    showToast('Unable to load job', 'error');
    return;
  }
  selectedJob = r.data;
  document.getElementById('noJob').style.display = 'none';
  document.getElementById('jobDetails').style.display = 'block';
  qs('#selectedJobTitle').textContent = selectedJob.title || '';
  qs('#jobMeta').textContent = `${selectedJob.company || ''} • Experience required: ${
    selectedJob.experience_required || 0
  }`;
  qsa(
    '#showMatchesBtn, #showShortlistsBtn, #exportCsvBtn, #showApplicationsBtn, .generate-quiz-btn'
  ).forEach((b) => {
    b.dataset.jobId = jobId;
  });
  qs('#matchesList').innerHTML = '';
  qs('#applicationsList').innerHTML = '';
}

/* ---------------- Create/Edit job ---------------- */
function openAddJobModal() {
  const modalEl = document.getElementById('addJobModal');
  const form = document.getElementById('addJobForm');
  if (form) {
    form.reset();
    delete form.dataset.editing;
  }
  const modal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
  modal.show();
}

async function submitAddJob(e) {
  if (e && e.preventDefault) e.preventDefault();
  const form = document.getElementById('addJobForm');
  const title = (qs('#jobTitle')?.value || '').trim();
  if (!title) return showToast('Title required', 'error');

  const payload = {
    title,
    company: qs('#jobCompany')?.value || '',
    skills_required: qs('#jobSkills')?.value || '',
    experience_required: Number(qs('#jobExperience')?.value || 0),
    vacancies: Number(qs('#jobVacancies')?.value || 1),
    description: qs('#jobDescription')?.value || '',
  };

  const editingId = form?.dataset?.editing || null;
  let res;
  if (editingId) {
    res = await apiFetch(`${JOBS_ENDPOINT}${editingId}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      res = await apiFetch(`/api/recruiter/job/${editingId}/`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    }
  } else {
    res = await apiFetch(JOBS_ENDPOINT, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  if (!res || !res.ok) {
    showToast('Save failed', 'error');
    return;
  }

  showToast(editingId ? 'Job updated' : 'Job created', 'success');
  bootstrap.Modal.getInstance(document.getElementById('addJobModal')).hide();
  delete form.dataset.editing;
  await loadJobs();
  if (editingId && selectedJob && String(selectedJob.id) === String(editingId)) {
    await openJobDetail(editingId);
  }
}

async function openEditJob(jobId) {
  const r = await apiFetch(`${JOBS_ENDPOINT}${jobId}/`, { method: 'GET' });
  if (!r.ok) return showToast('Failed to load job for edit', 'error');
  const job = r.data || {};

  document.getElementById('jobTitle').value = job.title || '';
  document.getElementById('jobCompany').value = job.company || '';
  document.getElementById('jobSkills').value = job.skills_required || '';
  document.getElementById('jobExperience').value =
    job.experience_required ?? 0;
  document.getElementById('jobVacancies').value = job.vacancies ?? 1;
  document.getElementById('jobDescription').value = job.description || '';

  const form = document.getElementById('addJobForm');
  form.dataset.editing = String(jobId);

  const modalTitle = qs('#addJobModal .modal-title');
  if (modalTitle) modalTitle.textContent = 'Edit job';
  const submitBtn = form.querySelector('[type="submit"]');
  if (submitBtn) submitBtn.textContent = 'Update';

  const modal = new bootstrap.Modal(document.getElementById('addJobModal'));
  modal.show();
}

/* ---------------- Delete job ---------------- */
async function confirmAndDeleteJob(jobId) {
  if (!confirm('Delete job permanently?')) return;

  const endpoints = [
    `${JOBS_ENDPOINT}${jobId}/`,
    `/api/recruiter/job/${jobId}/delete/`,
  ];

  let lastErr = null;
  for (const url of endpoints) {
    try {
      const r = await fetch(url, {
        method: 'DELETE',
        headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
      });
      if (r.ok) {
        showToast('Job deleted', 'success');
        const card = document.querySelector(`.job-card[data-job-id="${jobId}"]`);
        if (card) card.remove();
        if (selectedJob && String(selectedJob.id) === String(jobId)) {
          selectedJob = null;
          document.getElementById('jobDetails').style.display = 'none';
          document.getElementById('noJob').style.display = 'block';
        }
        await loadJobs();
        return;
      } else {
        lastErr = `${r.status}`;
        continue;
      }
    } catch (e) {
      lastErr = String(e);
      continue;
    }
  }
  showToast('Delete failed: ' + (lastErr || 'unknown'), 'error');
}

/* ---------------- Matches & Applications ---------------- */
// ... (keep your existing showMatchesForSelectedJob, loadApplicationsForSelectedJob, etc.)

/* ---------------- UI boot ---------------- */
function attachUI() {
  if (qs('#tokenInput') && savedToken()) qs('#tokenInput').value = savedToken();
  qs('#saveTokenBtn')?.addEventListener('click', () => {
    const v = (qs('#tokenInput')?.value || '').trim();
    if (!v) return showToast('Paste token first', 'error');
    setSavedToken(v);
    showToast('Token saved', 'success');
  });

  qs('#refreshJobs')?.addEventListener('click', loadJobs);
  qs('#addJobBtn')?.addEventListener('click', openAddJobModal);
  qs('#addJobForm')?.addEventListener('submit', submitAddJob);
  qs('#showMatchesBtn')?.addEventListener('click', showMatchesForSelectedJob);
  qs('#showShortlistsBtn')?.addEventListener('click', showShortlistsForSelectedJob);
  qs('#showApplicationsBtn')?.addEventListener('click', loadApplicationsForSelectedJob);
  qs('#exportCsvBtn')?.addEventListener('click', () =>
    exportResultsCsv(selectedJob ? selectedJob.id : null)
  );

  loadJobs();
}
document.addEventListener('DOMContentLoaded', attachUI);
