// candidate_dashboard_cleaned_chunk2.js
// Continuation of cleaned candidate_dashboard.js (~500 lines)
// Covers: attempt history, job view/apply, quiz submit handler, my applications, export CSV, initDashboard

/* ---------- Attempt history ---------- */
async function loadAttemptHistory(jobId) {
  try {
    const res = await fetchWithAuth(`/api/quiz/attempts/?job_id=${jobId}`);
    if (!res.ok) return;
    const arr = await res.json();
    updateAttemptHistoryRender(jobId, arr);
    if (arr.length > 0) {
      const last = arr[0];
      const lbl = document.querySelector(`#quiz-status-${jobId}`);
      if (lbl) lbl.textContent = last.passed ? 'Passed' : 'Failed';
      if (last.passed) enableApplyButton(jobId); else disableApplyButton(jobId);
      const retake = document.getElementById(`retake-btn-${jobId}`);
      if (retake) retake.style.display = last.passed ? 'none' : 'inline-block';
    }
  } catch (err) { console.error(err); }
}

function updateAttemptHistoryRender(jobId, attempts) {
  const wrap = document.querySelector(`#attempt-history-${jobId}`);
  if (!wrap) return;
  wrap.innerHTML = attempts.slice(0, 5).map(a => {
    return `<div>Attempt ${a.id || a.attempt_id}: ${a.score}/${a.total} — ${a.passed ? 'Passed' : 'Failed'} <small>(${new Date(a.created_at || a.created || Date.now()).toLocaleString()})</small></div>`;
  }).join('');
}

function updateAttemptHistoryUI(jobId, attempt) {
  const wrap = document.querySelector(`#attempt-history-${jobId}`);
  if (!wrap) return;
  const node = document.createElement('div');
  node.innerHTML = `Attempt ${attempt.attempt_id || attempt.id}: ${attempt.score}/${attempt.total} — ${attempt.passed ? 'Passed' : 'Failed'} <small>(${new Date().toLocaleString()})</small>`;
  wrap.prepend(node);
}

/* ---------- Job detail modal ---------- */
async function viewJob(jobId) {
  if (!jobId) return showToast('Invalid job id', 'error');
  try {
    showSpinner(true, 'Loading job...');
    const res = await apiFetch(`/api/resumes/jobs/${jobId}/`);
    if (!res.ok) {
      showToast(`Failed to load job (${res.status})`, 'error', 4000);
      return;
    }
    renderJobModal(res.data || {});
  } catch (err) {
    console.error('viewJob error', err);
    showToast('Error fetching job', 'error');
  } finally {
    showSpinner(false);
  }
}

function renderJobModal(job) {
  let modalEl = document.getElementById('jobDetailModal');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.className = 'modal fade';
    modalEl.id = 'jobDetailModal';
    modalEl.tabIndex = -1;
    modalEl.innerHTML = `
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="jobDetailModalTitle"></h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="jobDetailModalBody"></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>
            <button id="jobDetailApplyBtn" type="button" class="btn btn-primary">Apply</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);
  }

  modalEl.querySelector('#jobDetailModalTitle').innerText = job.title || `Job ${job.id || ''}`;
  modalEl.querySelector('#jobDetailModalBody').innerHTML = `
    <div class="mb-2"><strong>Company:</strong> ${escapeHtml(job.company || '')}</div>
    <div class="mb-2"><strong>Experience required:</strong> ${escapeHtml(job.experience_required || '0')} yrs</div>
    <div class="mb-2"><strong>Vacancies:</strong> ${escapeHtml(String(job.vacancies ?? ''))}</div>
    <div class="mb-2"><strong>Skills:</strong> ${escapeHtml(job.skills_required || '')}</div>
    <hr>
    <div><strong>Description</strong></div>
    <div style="white-space:pre-wrap;margin-top:8px;color:#444">${escapeHtml(job.description || '') || '<em>No description</em>'}</div>
    <div class="small-muted mt-2">Posted: ${escapeHtml(job.created_at || job.posted_at || '')}</div>
  `;

  modalEl.querySelector('#jobDetailApplyBtn').onclick = function () {
    try { bootstrap.Modal.getInstance(modalEl)?.hide(); } catch (e) {}
    window.__apply_job_id = job.id || job.pk;
    if (typeof openApplyModal === 'function') openApplyModal(job.id || job.pk);
    else showToast('Apply modal not available', 'error');
  };

  new bootstrap.Modal(modalEl, { backdrop: 'static' }).show();
}
window.viewJob = viewJob;

/* ---------- Apply button helpers ---------- */
function enableApplyButton(jobId) {
  const btn = document.querySelector(`#apply-btn-${jobId}`);
  if (btn) { btn.disabled = false; btn.classList.remove('disabled'); }
}
function disableApplyButton(jobId) {
  const btn = document.querySelector(`#apply-btn-${jobId}`);
  if (btn) { btn.disabled = true; btn.classList.add('disabled'); }
}

/* ---------- Quiz submit handler ---------- */
async function onQuizSubmit(jobId, answers) {
  try {
    const res = await fetchWithAuth('/api/quiz/attempt/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, answers })
    });
    const data = await res.json();
    updateAttemptHistoryUI(jobId, data);
    if (data.passed) enableApplyButton(jobId); else disableApplyButton(jobId);
    showToast(data.passed ? 'Passed ✅' : 'Failed ❌', data.passed ? 'success' : 'error');
  } catch (err) {
    console.error('Quiz submit failed', err);
    showToast('Network error — try again', 'error');
  }
}
window.onQuizSubmit = onQuizSubmit;

/* ---------- My Applications ---------- */
async function loadMyApplications() {
  const el = document.getElementById('myApplicationsList');
  if (!el) return;
  el.innerHTML = '<div class="small-muted">Loading your applications...</div>';

  let res = await apiFetch('/api/resumes/applications/?mine=true');
  if (!res.ok) { el.innerHTML = `<div class="small-muted">Failed (${res.status})</div>`; return; }
  let apps = Array.isArray(res.data) ? res.data : (res.data?.applications || []);
  if (!apps.length) { el.innerHTML = `<div class="small-muted">You have not applied to any jobs yet.</div>`; return; }

  el.innerHTML = '';
  apps.forEach(a => {
    const jobTitle = a.job?.title || a.job_title || 'Job';
    const status = a.status || 'pending';
    const appliedAt = a.applied_at || a.created_at || '';
    el.innerHTML += `
      <div class="card mb-2 p-2">
        <strong>${escapeHtml(jobTitle)}</strong>
        <div class="small-muted">Applied: ${escapeHtml(appliedAt)} • Status: ${escapeHtml(status)}</div>
      </div>`;
  });
}
window.loadMyApplications = loadMyApplications;

async function exportMyApplicationsCSV() {
  const res = await apiFetch('/api/resumes/applications/my/');
  if (!res.ok) return showToast('Export failed', 'error');
  const apps = Array.isArray(res.data) ? res.data : (res.data?.applications || []);
  if (!apps.length) return showToast('No applications', 'info');

  const headers = ['application_id', 'job_title', 'status', 'applied_at'];
  const rows = apps.map(a => [a.id || '', a.job?.title || '', a.status || '', a.applied_at || '']);
  const csv = headers.join(',') + '\n' + rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'my_applications.csv'; a.click();
  URL.revokeObjectURL(url);
  showToast('CSV downloaded', 'success');
}
window.exportMyApplicationsCSV = exportMyApplicationsCSV;

/* ---------- Init ---------- */
function initDashboard() {
  document.getElementById('refreshJobs')?.addEventListener('click', loadJobs);
  document.getElementById('refreshMyAppsBtn')?.addEventListener('click', loadMyApplications);
  document.getElementById('exportMyAppsBtn')?.addEventListener('click', exportMyApplicationsCSV);

  refreshResumes();
  loadJobs();
  loadMyApplications();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDashboard);
else initDashboard();

/* end of cleaned chunk 2 */
