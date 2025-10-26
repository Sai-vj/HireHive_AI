// static/recruiter_review.js
// Lightweight module to power recruiter_review.html
// - reads ?interview= or ?job=
// - fetches attempts from several possible endpoints (api and non-api fallback)
// - renders table, supports "View answers" modal and "Reset attempt" action
// - uses token from localStorage key 'recruiter_token_v1' if present, otherwise sends credentials

(function () {
  'use strict';

  const tokenKey = 'recruiter_token_v1';

  function log(...s){ console.debug('[rreview]', ...s); }
  function qs(sel){ return document.querySelector(sel); }
  function qsa(sel){ return Array.from(document.querySelectorAll(sel)); }
  function escapeHtml(s = ''){ return String(s||'').replace(/[&<>"'`]/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#x60;' }[m])); }

  const params = new URLSearchParams(window.location.search);
  const interviewId = params.get('interview') || null;
  const jobId = params.get('job') || null;
  const targetId = interviewId || jobId || null;

  const attemptsContainer = qs('#reviewBody');
  const infoEl = qs('#info') || { textContent: '' };

  if (!attemptsContainer) {
    log('No #reviewBody found, abort');
    return;
  }

  function setInfo(msg) { try { infoEl.textContent = msg; } catch(e){} }

  function authHeaders() {
    const t = localStorage.getItem(tokenKey);
    return t ? { 'Authorization': 'Bearer ' + t } : {};
  }

  // candidate-friendly endpoints we will try in order (as functions returning URL)
  const endpointFns = [
    id => `/api/interviews/recruiter/${encodeURIComponent(id)}/attempts/`,
    id => `/api/interviews/${encodeURIComponent(id)}/attempts/`,
    id => `/interviews/recruiter/${encodeURIComponent(id)}/attempts/`,
    id => `/interviews/${encodeURIComponent(id)}/attempts/`,
  ];

  async function tryFetchAttempts(id) {
    let lastErr = null;
    for (const fn of endpointFns) {
      const url = fn(id);
      try {
        const headers = Object.assign({ 'Content-Type': 'application/json' }, authHeaders());
        const opts = { method: 'GET', headers, credentials: 'same-origin' };
        const res = await fetch(url, opts);
        if (!res.ok) {
          lastErr = `(${res.status}) ${res.statusText} @ ${url}`;
          log('fetch failed', url, res.status);
          continue;
        }
        const data = await res.json().catch(()=>null);
        // handle both array return and {results: [...]} style
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.results)) return data.results;
        // sometimes API returns attempts under data.attempts
        if (data && Array.isArray(data.attempts)) return data.attempts;
        // if object mapping or unexpected, try to coerce
        return data || [];
      } catch (e) {
        lastErr = String(e);
        log('fetch error', e, url);
        continue;
      }
    }
    throw new Error(lastErr || 'No endpoint responded');
  }

  function formatDate(d) {
    try {
      if (!d) return '';
      const dt = new Date(d);
      if (isNaN(dt)) return d;
      return dt.toLocaleString();
    } catch(e){ return d; }
  }

  function buildRow(a) {
    // normalize common fields
    const attemptId = a.attempt_id ?? a.id ?? a.pk ?? a.attemptId ?? '';
    const candidate = a.candidate_name ?? a.candidate_display ?? a.candidate ?? (a.user && (a.user.full_name || a.user.username)) ?? '';
    const score = (typeof a.score !== 'undefined') ? a.score : (a.last_score ?? '');
    const passed = !!a.passed;
    const started = formatDate(a.started_at ?? a.started ?? a.created_at ?? '');
    const finished = formatDate(a.finished_at ?? a.ended_at ?? a.finished ?? '');

    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td style="vertical-align:middle">${escapeHtml(candidate)}</td>
      <td style="vertical-align:middle">${escapeHtml(String(score || '—'))}</td>
      <td style="vertical-align:middle">${passed ? '<span class="badge bg-success">Passed</span>' : '<span class="badge bg-danger">Failed</span>'}</td>
      <td style="vertical-align:middle">${escapeHtml(started)}</td>
      <td style="vertical-align:middle">${escapeHtml(finished)}</td>
      <td style="vertical-align:middle;min-width:200px">
        <button class="btn btn-sm btn-outline-primary me-1 view-answers-btn" data-attempt-id="${escapeHtml(attemptId)}">View answers</button>
        <button class="btn btn-sm btn-outline-secondary me-1 open-attempt-btn" data-attempt-id="${escapeHtml(attemptId)}">Open attempt</button>
        <button class="btn btn-sm btn-outline-danger reset-attempt-btn" data-attempt-id="${escapeHtml(attemptId)}">Reset</button>
      </td>
    `;
    // attach dataset for modal convenience
    tr.dataset.attemptRaw = JSON.stringify(a || {});
    return tr;
  }

  function clearTableAndShowLoading() {
    attemptsContainer.innerHTML = `<tr><td colspan="6" class="small-muted">Loading…</td></tr>`;
  }

  // modal helpers (bootstrap)
  function showModalWithContent(title, html) {
    const modalEl = document.getElementById('answersModal');
    if (!modalEl) {
      alert('Answers modal not found');
      return;
    }
    const label = modalEl.querySelector('#answersModalLabel');
    const content = modalEl.querySelector('#answersContent');
    if (label) label.textContent = title || 'Answers';
    if (content) { content.innerHTML = html || '<div class="small-muted">No answers</div>'; content.focus(); }
    if (window.bootstrap && window.bootstrap.Modal) {
      let inst = null;
      try { inst = bootstrap.Modal.getInstance(modalEl); } catch(e){ inst = null; }
      if (!inst) inst = new bootstrap.Modal(modalEl, { backdrop: 'static' });
      inst.show();
    } else {
      modalEl.style.display = 'block';
      modalEl.classList.remove('d-none');
    }
  }

  // attempt reset: try a few endpoints (POST)
  const resetEndpoints = [
    (aid) => `/api/interviews/attempts/${encodeURIComponent(aid)}/reset/`,
    (aid) => `/interviews/candidate/attempts/${encodeURIComponent(aid)}/reset/`,
    (aid) => `/candidate/attempts/${encodeURIComponent(aid)}/reset/`,
    (aid) => `/api/candidate/attempts/${encodeURIComponent(aid)}/reset/`,
    (aid) => `/interviews/attempts/${encodeURIComponent(aid)}/reset/`,
  ];

  async function tryResetAttempt(aid) {
    let lastErr = null;
    for (const fn of resetEndpoints) {
      const url = fn(aid);
      try {
        const headers = Object.assign({ 'Content-Type': 'application/json' }, authHeaders());
        const res = await fetch(url, { method: 'POST', headers, credentials: 'same-origin' });
        if (!res.ok) {
          lastErr = `(${res.status}) ${res.statusText} @ ${url}`;
          log('reset failed', url, res.status);
          continue;
        }
        const data = await res.json().catch(()=>null);
        return data || { ok: true };
      } catch (e) {
        lastErr = String(e);
        log('reset error', e, url);
        continue;
      }
    }
    throw new Error(lastErr || 'Reset failed');
  }

  // table click delegation
  attemptsContainer.addEventListener('click', async function (ev) {
    const viewBtn = ev.target.closest && ev.target.closest('.view-answers-btn');
    if (viewBtn) {
      const aid = viewBtn.dataset.attemptId;
      // try to read raw attempt from row dataset
      const row = viewBtn.closest('tr');
      let raw = null;
      try { raw = row && row.dataset && row.dataset.attemptRaw ? JSON.parse(row.dataset.attemptRaw) : null; } catch(e){ raw = null; }
      if (raw && (raw.answers || raw.data || raw.question_snapshot)) {
        const content = `<pre style="white-space:pre-wrap">${escapeHtml(JSON.stringify(raw.answers || raw.data || raw.question_snapshot || raw, null, 2))}</pre>`;
        showModalWithContent('Answers — ' + (raw.candidate_name || raw.candidate || aid || ''), content);
        return;
      }
      // fallback: fetch single attempt details from API
      const candidates = [
        (id) => `/api/interviews/attempts/${encodeURIComponent(id)}/`,
        (id) => `/interviews/attempts/${encodeURIComponent(id)}/`,
        (id) => `/api/quiz/attempts/${encodeURIComponent(id)}/`,
      ];
      let got = null;
      for (const fn of candidates) {
        try {
          const url = fn(aid);
          const headers = Object.assign({ 'Content-Type': 'application/json' }, authHeaders());
          const res = await fetch(url, { method: 'GET', headers, credentials: 'same-origin' });
          if (!res.ok) continue;
          const data = await res.json().catch(()=>null);
          if (data) { got = data; break; }
        } catch(e){ continue; }
      }
      if (got) {
        const content = `<pre style="white-space:pre-wrap">${escapeHtml(JSON.stringify(got.answers || got.data || got, null, 2))}</pre>`;
        showModalWithContent('Answers — ' + aid, content);
      } else {
        alert('Unable to fetch attempt details');
      }
      return;
    }

    const openBtn = ev.target.closest && ev.target.closest('.open-attempt-btn');
    if (openBtn) {
      const aid = openBtn.dataset.attemptId;
      // navigate to review page with attempt param (lets your frontend handle attempt-specific UI)
      const baseParams = new URLSearchParams(window.location.search);
      if (interviewId) baseParams.set('interview', interviewId);
      baseParams.set('attempt', aid);
      window.location.search = baseParams.toString();
      return;
    }

    const resetBtn = ev.target.closest && ev.target.closest('.reset-attempt-btn');
    if (resetBtn) {
      const aid = resetBtn.dataset.attemptId;
      if (!confirm('Reset / delete this attempt? This cannot be undone.')) return;
      try {
        setInfo('Resetting attempt…');
        await tryResetAttempt(aid);
        setInfo('Attempt reset. Refreshing list…');
        await reload();
      } catch (err) {
        alert('Reset failed: ' + (err && err.message ? err.message : String(err)));
        setInfo('');
        log('reset error', err);
      }
      return;
    }
  });

  async function reload() {
    if (!targetId) {
      attemptsContainer.innerHTML = `<tr><td colspan="6" class="text-danger">No interview or job id provided in URL</td></tr>`;
      return;
    }
    clearTableAndShowLoading();
    setInfo('Loading attempts for ' + targetId + ' …');
    try {
      const attempts = await tryFetchAttempts(targetId);
      // normalize to array
      const arr = Array.isArray(attempts) ? attempts : [];
      if (!arr.length) {
        attemptsContainer.innerHTML = `<tr><td colspan="6" class="small-muted">No attempts found.</td></tr>`;
        setInfo('No attempts');
        return;
      }
      // render rows
      attemptsContainer.innerHTML = '';
      arr.forEach(a => {
        const r = buildRow(a);
        attemptsContainer.appendChild(r);
      });
      setInfo('Loaded ' + arr.length + ' attempts');
    } catch (e) {
      attemptsContainer.innerHTML = `<tr><td colspan="6" class="text-danger">Failed to load attempts: ${escapeHtml(String(e.message || e))}</td></tr>`;
      setInfo('Load failed');
      log('load attempts error', e);
    }
  }

  // init
  document.addEventListener('DOMContentLoaded', function () {
    reload();
  });

})();
