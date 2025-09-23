// recruiter_dashboard.js
// Put this file in your static JS and load with <script type="module" src="{% static 'recruiter_dashboard.js' %}"></script>

(function () {
  // ============== CONFIG ==============
  // Base API prefixes - adjust if your API prefix differs
  const API_BASE = '/api/interviews';       // interviews endpoints
  const RESUMES_BASE = '/api/resumes';      // jobs/applications endpoints (if used)
  // ====================================

  // DOM refs (must match your HTML)
  const jobsList = document.getElementById('jobsList');
  const applicationsList = document.getElementById('applicationsList');
  const tokenInput = document.getElementById('tokenInput');
  const saveTokenBtn = document.getElementById('saveTokenBtn');
  const tokenStatus = document.getElementById('tokenStatus');
  const refreshJobsBtn = document.getElementById('refreshJobs');

  // Invite modal elements (from your template)
  const inviteModal = document.getElementById('inviteModal');
  const inviteCandidateIdInput = document.getElementById('invite_candidate_id');
  const inviteScheduledAtInput = document.getElementById('invite_scheduled_at');
  const inviteMessageInput = document.getElementById('invite_message');
  const inviteSendBtn = document.getElementById('inviteSendBtn');
  const inviteCancelBtn = document.getElementById('inviteCancelBtn');

  // internal state
  let state = {
    token: localStorage.getItem('token') || '',
    jobs: [],
    selectedJobId: null,
    selectedJob: null,
    // used when showing invite modal
    inviteContext: {
      jobId: null,
      interviewId: null, // not required; backend will create or use interview
      candidateId: null,
      candidateName: null,
    }
  };

  // helper: show simple toast in the page
  function showToast(text, type = 'info', timeout = 2500) {
    const container = document.getElementById('toastContainer') || document.body;
    const el = document.createElement('div');
    el.className = `toast-message p-2 mb-2 shadow-sm rounded`;
    el.style.background = type === 'error' ? '#f8d7da' : type === 'success' ? '#d1e7dd' : '#e2e3e5';
    el.innerText = text;
    container.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, timeout);
  }

  // attach token UI handlers
  function initTokenUI() {
    // populate token input from storage
    tokenInput.value = state.token || '';
    tokenStatus.innerText = state.token ? 'Token saved' : 'Token not saved.';

    saveTokenBtn.addEventListener('click', () => {
      const val = tokenInput.value.trim();
      if (!val) {
        localStorage.removeItem('token'); state.token = '';
        tokenStatus.innerText = 'Token removed';
        showToast('Token removed', 'info');
        return;
      }
      localStorage.setItem('token', val);
      state.token = val;
      tokenStatus.innerText = 'Token saved';
      showToast('Saved new access token', 'success');
      // reload data that needs auth
      loadJobs();
      if (state.selectedJobId) loadApplications(state.selectedJobId);
    });
  }

  // Make headers helper
  function makeHeaders(extra = {}) {
    const h = { 'Content-Type': 'application/json', ...extra };
    if (state.token) h['Authorization'] = `Bearer ${state.token}`;
    return h;
  }

  // ============== JOBS / UI ==============
  // load jobs from resumes API (adjust path if your backend)
  async function loadJobs() {
    jobsList.innerHTML = '<div class="small-muted">Loading jobs…</div>';
    try {
      // If your jobs endpoint is different, change this URL:
      const res = await fetch(`${RESUMES_BASE}/jobs/`, { headers: makeHeaders() });
      if (!res.ok) {
        console.error('loadJobs failed', res.status);
        jobsList.innerHTML = `<div class="text-danger">Failed to load jobs (${res.status})</div>`;
        return;
      }
      const data = await res.json();
      state.jobs = data;
      renderJobs();
    } catch (err) {
      console.error('loadJobs error', err);
      jobsList.innerHTML = '<div class="text-danger">Network error</div>';
    }
  }

  // render the left column job cards
  function renderJobs() {
    if (!state.jobs || !state.jobs.length) {
      jobsList.innerHTML = '<div class="small-muted">No jobs</div>';
      return;
    }
    jobsList.innerHTML = state.jobs.map(jobCardHtml).join('');
    // attach job click handlers
    document.querySelectorAll('.view-job-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const jobId = Number(btn.dataset.jobId);
        selectJob(jobId);
      });
    });

    // invite buttons that appear inside a job card (if present)
    document.querySelectorAll('.invite-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const jobId = Number(btn.dataset.jobId);
        // open modal with only job context; user will choose candidate id or we pre-fill if present
        showInviteModal({ jobId });
      });
    });
  }

  function jobCardHtml(job) {
    // job fields vary — adjust to your job serializer fields
    const title = job.title || 'Untitled';
    const skills = (job.skills_required || []).join(', ') || '';
    return `
      <div class="job-card" data-job-id="${job.id}">
        <div class="d-flex justify-content-between">
          <div>
            <h6 class="job-title mb-0">${escapeHtml(title)}</h6>
            <div class="small-muted">${escapeHtml(skills)}</div>
          </div>
        </div>
        <div class="mt-2 job-actions">
          <button class="btn btn-sm btn-outline-primary view-job-btn" data-job-id="${job.id}">View</button>
          <button class="btn btn-sm btn-outline-success generate-quiz-btn" data-job-id="${job.id}">Generate Quiz</button>
          <button class="btn btn-sm btn-outline-secondary invite-btn" data-job-id="${job.id}">Invite</button>
        </div>
      </div>
    `;
  }

  // simple escape
  function escapeHtml(s) {
    if (!s) return '';
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // selecting job -> show details and load applications
  async function selectJob(jobId) {
    const job = state.jobs.find(j => Number(j.id) === Number(jobId));
    state.selectedJobId = jobId;
    state.selectedJob = job || null;
    // display job details on right column
    document.getElementById('noJob').style.display = 'none';
    document.getElementById('jobDetails').style.display = 'block';
    document.getElementById('selectedJobTitle').innerText = job?.title || 'Job';
    document.getElementById('jobMeta').innerText = `Experience required: ${job?.experience_required ?? '-'}`;
    document.getElementById('jobSkills').innerText = (job?.skills_required || []).join(', ');
    // show applications section and refresh
    document.getElementById('applicationsSection').style.display = 'block';
    loadApplications(jobId);
  }

  // ============== APPLICATIONS ==============
  async function loadApplications(jobId) {
    applicationsList.innerHTML = '<div class="small-muted">Loading applications…</div>';
    try {
      // Endpoint used earlier in screenshots: /api/resumes/recruiter/job/<jobId>/applications/
      const res = await fetch(`${RESUMES_BASE}/recruiter/job/${jobId}/applications/`, {
        headers: makeHeaders()
      });
      if (!res.ok) {
        console.error('loadApplications failed', res.status);
        applicationsList.innerHTML = `<div class="text-danger">Failed to load applications (${res.status})</div>`;
        return;
      }
      const data = await res.json();
      renderApplications(data, jobId);
    } catch (err) {
      console.error('loadApplications error', err);
      applicationsList.innerHTML = '<div class="text-danger">Network error</div>';
    }
  }

  function renderApplications(apps = [], jobId) {
    if (!apps || !apps.length) {
      applicationsList.innerHTML = '<div class="small-muted">No applications.</div>';
      return;
    }

    const html = apps.map(app => {
      // app fields: candidate_name, candidate_id, applied_at, message, status
      return `
        <div class="card mb-2 p-2 application-row" data-application-id="${app.id}" data-candidate-id="${app.candidate_id}">
          <div class="d-flex justify-content-between">
            <div>
              <strong>${escapeHtml(app.candidate_name || 'candidate')}</strong>
              <div class="small-muted">Applied: ${escapeHtml(app.applied_at || '')}</div>
              <div class="small-muted">Message: ${escapeHtml(app.message || '')}</div>
            </div>
            <div class="text-end">
              <button class="btn btn-sm btn-outline-primary view-candidate-btn" data-candidate-id="${app.candidate_id}">View</button>
              <button class="btn btn-sm btn-success invite-application-btn" data-job-id="${jobId}" data-candidate-id="${app.candidate_id}" data-candidate-name="${escapeHtml(app.candidate_name)}">Invite</button>
              <span class="badge bg-secondary ms-2">${escapeHtml(app.status || 'pending')}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
    applicationsList.innerHTML = html;

    // attach handlers for invite per application
    document.querySelectorAll('.invite-application-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        const jobId = btn.dataset.jobId;
        const candidateId = btn.dataset.candidateId;
        const candidateName = btn.dataset.candidateName || '';
        showInviteModal({ jobId: Number(jobId), candidateId: Number(candidateId), candidateName });
      });
    });
  }

  // ============== INVITE MODAL ==============
  // show modal with optional prefilled candidate
  function showInviteModal({ jobId = null, candidateId = null, candidateName = null, interviewId = null } = {}) {
    // store context
    state.inviteContext.jobId = jobId;
    state.inviteContext.interviewId = interviewId || null;
    state.inviteContext.candidateId = candidateId || null;
    state.inviteContext.candidateName = candidateName || null;

    // prefill fields
    inviteCandidateIdInput.value = candidateId ? String(candidateId) : '';
    inviteMessageInput.value = `Hi, you are invited for interview.`;
    inviteScheduledAtInput.value = ''; // user choose

    // show modal (remove d-none and focus)
    inviteModal.classList.remove('d-none');
    inviteModal.style.pointerEvents = 'auto';
    setTimeout(() => inviteCandidateIdInput.focus(), 50);
  }

  function hideInviteModal() {
    inviteModal.classList.add('d-none');
    inviteModal.style.pointerEvents = 'none';
  }

  // send invite: POST to /api/interviews/recruiter/<jobId>/invite/
  async function sendInvite() {
    const jobId = state.inviteContext.jobId;
    if (!jobId) {
      showToast('No job context for invite', 'error');
      return;
    }
    const candidate_id = inviteCandidateIdInput.value.trim();
    const scheduled_at = inviteScheduledAtInput.value || null;
    const message = inviteMessageInput.value.trim() || 'You are invited for an interview';

    if (!candidate_id) {
      showToast('Enter candidate id', 'error'); inviteCandidateIdInput.focus(); return;
    }

    const url = `${API_BASE}/recruiter/${jobId}/invite/`; // matches your urls.py

    try {
      inviteSendBtn.disabled = true;
      const res = await fetch(url, {
        method: 'POST',
        headers: makeHeaders(),
        body: JSON.stringify({ candidate_id, scheduled_at, message })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        hideInviteModal();
        showToast('Invite sent', 'success');
        // optionally update UI badge / app status
        loadApplications(jobId);
      } else {
        // handle common statuses
        if (res.status === 401) {
          showToast('Unauthorized. Save a valid token first.', 'error', 4000);
        } else if (res.status === 404) {
          showToast('Endpoint not found (404). Check API path.', 'error', 4000);
        } else {
          const msg = (data && (data.detail || JSON.stringify(data))) || `Error ${res.status}`;
          showToast(`Invite failed: ${msg}`, 'error', 5000);
        }
        console.error('invite failed', res.status, data);
      }
    } catch (err) {
      console.error('sendInvite error', err);
      showToast('Network error sending invite', 'error');
    } finally {
      inviteSendBtn.disabled = false;
    }
  }

  // ============== EVENT BINDINGS ==============
  function initEvents() {
    inviteCancelBtn.addEventListener('click', hideInviteModal);
    inviteSendBtn.addEventListener('click', sendInvite);

    // close modal on background click (optional)
    inviteModal.addEventListener('click', (e) => {
      if (e.target === inviteModal) hideInviteModal();
    });

    refreshJobsBtn?.addEventListener('click', () => loadJobs());

    // keyboard: Escape to close modal
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !inviteModal.classList.contains('d-none')) hideInviteModal();
    });
  }

  // ============== BOOT ==============
  function init() {
    console.log('recruiter dashboard initialized');
    initTokenUI();
    initEvents();
    loadJobs();
  }

  // start
  init();

})();
