// static/recruiter_review.js
// Recruiter review page JS — fetches attempts for a job and shows details in a modal

(function () {
  'use strict';

  // Helpers
  function qs(sel, root = document) { try { return root.querySelector(sel); } catch (e) { return null; } }
  function qsa(sel, root = document) { try { return Array.from(root.querySelectorAll(sel)); } catch (e) { return []; } }
  function escapeHtml(s='') { return String(s===null||s===undefined ? '' : s).replace(/[&<>"'`]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;',"`":'&#x60;'}[m])); }

  function getQueryParam(name) {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get(name);
    } catch (e) { return null; }
  }

  function formatDate(iso) {
    if (!iso) return '-';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return escapeHtml(String(iso));
      return d.toLocaleString();
    } catch (e) { return escapeHtml(String(iso)); }
  }

  // API fetch wrapper using same conventions as your dashboard
  async function apiFetch(path, opts = {}) {
    opts = Object.assign({ credentials: 'include' }, opts);
    opts.headers = Object.assign({}, opts.headers || {});
    if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
      if (!opts.headers['Content-Type'] && !opts.headers['content-type']) opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    try {
      const r = await fetch(path, opts);
      const text = await r.text().catch(()=>null);
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch(e) { data = text; }
      return { ok: r.ok, status: r.status, data, text };
    } catch (e) {
      console.error('apiFetch error', e);
      return { ok:false, error:String(e) };
    }
  }

  // Render a single attempt row
  function buildAttemptRow(at) {
    const tr = document.createElement('tr');

    const candidate = escapeHtml(at.candidate_name || (`id:${at.candidate_id || ''}`));
    const score = (at.score === null || typeof at.score === 'undefined') ? '-' : escapeHtml(String(at.score));
    const status = (at.passed ? '<span class="badge bg-success">Passed</span>' : (at.passed === false ? '<span class="badge bg-danger">Failed</span>' : '<span class="badge bg-secondary">—</span>'));
    const started = formatDate(at.started_at);
    const finished = formatDate(at.finished_at);

    // Actions: view answers (modal), open attempt (if you want), reset attempt (optional)
    const actions = document.createElement('div');
    actions.className = 'd-flex gap-2';

    const btnView = document.createElement('button');
    btnView.type = 'button';
    btnView.className = 'btn btn-sm btn-outline-primary';
    btnView.textContent = 'View answers';
    btnView.addEventListener('click', (e) => {
      e.preventDefault();
      showAnswersModal(at);
    });
    actions.appendChild(btnView);

    // optional: open interview detail in new tab if interview_id present
    if (at.interview_id) {
      const btnOpen = document.createElement('button');
      btnOpen.type = 'button';
      btnOpen.className = 'btn btn-sm btn-outline-secondary';
      btnOpen.textContent = 'Open interview';
      btnOpen.addEventListener('click', (e) => {
        e.preventDefault();
        // change this path if your UI route differs
        window.open(`/interviews/${encodeURIComponent(at.interview_id)}/`, '_blank');
      });
      actions.appendChild(btnOpen);
    }

    // optional: link to candidate profile if you have such route
    if (at.candidate_id) {
      const a = document.createElement('a');
      a.href = `/admin/auth/user/${encodeURIComponent(at.candidate_id)}/change/`; // default admin path as fallback
      a.target = '_blank';
      a.className = 'btn btn-sm btn-outline-info';
      a.textContent = 'Profile';
      actions.appendChild(a);
    }

    tr.innerHTML = `
      <td style="vertical-align:middle">${candidate}</td>
      <td style="vertical-align:middle">${score}</td>
      <td style="vertical-align:middle">${status}</td>
      <td style="vertical-align:middle">${started}</td>
      <td style="vertical-align:middle">${finished}</td>
    `;
    const tdActions = document.createElement('td');
    tdActions.style.verticalAlign = 'middle';
    tdActions.appendChild(actions);
    tr.appendChild(tdActions);

    return tr;
  }

  // Show answers in the modal (pretty JSON + keys -> values)
  function showAnswersModal(attempt) {
    const modalEl = qs('#answersModal');
    const contentEl = qs('#answersContent');
    if (!modalEl || !contentEl) {
      alert('Answers modal missing');
      return;
    }

    // Build readable representation
    let html = `<div class="mb-2"><strong>Candidate:</strong> ${escapeHtml(attempt.candidate_name || String(attempt.candidate_id || ''))}</div>`;
    html += `<div class="mb-2"><strong>Score:</strong> ${attempt.score ?? '-' } &nbsp; <strong>Passed:</strong> ${attempt.passed ? 'Yes' : 'No'}</div>`;
    html += `<div class="mb-2"><strong>Started:</strong> ${formatDate(attempt.started_at)}</div>`;
    html += `<div class="mb-2"><strong>Finished:</strong> ${formatDate(attempt.finished_at)}</div>`;

    const answers = attempt.answers || attempt.answers_snapshot || attempt.answers_data || null;

    if (!answers || (typeof answers === 'object' && Object.keys(answers).length === 0)) {
      html += `<div class="small-muted">No answers saved.</div>`;
    } else {
      // pretty print mapping question -> answer if we have question_snapshot
      if (attempt.question_snapshot && Array.isArray(attempt.question_snapshot) && attempt.question_snapshot.length) {
        // create mapping from id -> prompt
        const qmap = {};
        attempt.question_snapshot.forEach(q => {
          qmap[String(q.id)] = q.prompt || q.text || q.question || ('Question ' + (q.id||''));
        });
        html += '<div><strong>Answers</strong></div>';
        html += '<div style="max-height:60vh;overflow:auto;padding-top:8px">';
        // answers could be object keyed by qid
        if (typeof answers === 'object') {
          html += '<table class="table table-sm"><tbody>';
          Object.keys(answers).forEach(k => {
            const qtext = escapeHtml(qmap[k] || `Question ${k}`);
            const aval = escapeHtml(typeof answers[k] === 'object' ? JSON.stringify(answers[k]) : String(answers[k]));
            html += `<tr><td style="width:45%"><strong>${qtext}</strong></td><td><pre style="white-space:pre-wrap;margin:0;">${aval}</pre></td></tr>`;
          });
          html += '</tbody></table>';
        } else {
          html += `<pre>${escapeHtml(typeof answers === 'string' ? answers : JSON.stringify(answers, null, 2))}</pre>`;
        }
        html += '</div>';
      } else {
        // Fallback: show raw JSON
        html += `<div><strong>Answers (raw)</strong></div><pre>${escapeHtml(typeof answers === 'string' ? answers : JSON.stringify(answers, null, 2))}</pre>`;
      }
    }

    contentEl.innerHTML = html;

    // show bootstrap modal
    try {
      const modal = new bootstrap.Modal(modalEl);
      modal.show();
      // focus content for accessibility
      contentEl.focus();
    } catch (e) {
      // fallback: reveal modal by toggling classes
      modalEl.classList.add('show');
      modalEl.style.display = 'block';
      document.body.classList.add('modal-open');
    }
  }

  // Load attempts for a job id and populate table
  async function loadAttemptsForJob(jobId) {
    const tbody = qs('#reviewBody');
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6">Loading…</td></tr>`;

    const res = await apiFetch(`/api/interviews/recruiter/review/?job_id=${encodeURIComponent(jobId)}`, { method: 'GET' });
    if (!res || !res.ok) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-danger">Failed to load attempts (${res && res.status ? res.status : 'network'})</td></tr>`;
      console.error('Load attempts failed', res);
      return;
    }

    const data = res.data || {};
    const attempts = data.attempts || (Array.isArray(res.data) ? res.data : []);
    if (!attempts || attempts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="small-muted">No attempts found for this job.</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    // ensure question_snapshot is included if backend provides it per attempt
    attempts.forEach(at => {
      // normalize keys (if backend returned different naming)
      const norm = Object.assign({}, at);
      // If the backend nested answers under 'data' or returned attempt object, try to extract common fields
      // keep as-is, viewAnswers will handle structure
      const row = buildAttemptRow(norm);
      // attach data for modal read
      row.dataset.attemptJson = JSON.stringify(norm);
      // add event: the "View answers" button uses closure, but attach a quick click to table row optionally
      tbody.appendChild(row);
    });

    // After rows added, attach small enhancement: replace each view button to pull JSON dataset if present
    qsa('#reviewBody button').forEach(btn => {
      // no-op: the view button already closes over attempt object via closure; but if you need dataset-based retrieval, use below
    });
  }

  // init: determine job id and load
  document.addEventListener('DOMContentLoaded', function () {
    // try query param
    let jobId = getQueryParam('job') || getQueryParam('job_id') || null;

    // also try server-rendered initial_job variable (if view passed it into template via context as JS var)
    try {
      if (!jobId && typeof initial_job !== 'undefined' && initial_job) jobId = initial_job;
    } catch (e) {}

    // As a last fallback check if a global selectedJob exists (from dashboard) — optional
    try {
      if (!jobId && window.selectedJob && window.selectedJob.id) jobId = window.selectedJob.id;
    } catch (e) {}

    if (!jobId) {
      const tbody = qs('#reviewBody');
      if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="text-danger">Missing job id. Provide ?job=<id> or pass initial_job from view.</td></tr>`;
      return;
    }

    loadAttemptsForJob(jobId);
  });

})();
