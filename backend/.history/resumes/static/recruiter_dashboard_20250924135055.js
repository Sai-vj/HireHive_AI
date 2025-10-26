// static/recruiter_dashboard_patched.js
// Consolidated, defensive recruiter dashboard script
// - Safe bootstrap modal usage (avoids "backdrop" / undefined errors)
// - Robust API fetch with token support and retries to multiple endpoints
// - Creates fallback modals if HTML missing (add job, invite, attempts)
// - Attach UI behaviors: load jobs, create/edit/delete, matches, applications, shortlist, invites

(function () {
  'use strict';

  /* ---------------- Config ---------------- */
  const API_ROOT = '/api';
  const JOBS_ENDPOINT = `${API_ROOT}/resumes/jobs/`;
  const TOKEN_KEY = 'recruiter_token_v1';

  // Interview invite endpoint by job (adjust if your backend differs)
  const INTERVIEWS_INVITE_BY_JOB = (jobId) => `${API_ROOT}/interviews/recruiter/${encodeURIComponent(jobId)}/invite/`;

  /* ---------------- helpers ---------------- */
  function log(...args) { console.debug('[Rdash]', ...args); }
  function errlog(...args) { console.error('[Rdash]', ...args); }

  function qs(sel, root = document) { try { return root.querySelector(sel); } catch (e) { return null; } }
  function qsa(sel, root = document) { try { return Array.from(root.querySelectorAll(sel)); } catch (e) { return []; } }

  function savedToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
  function setSavedToken(t) { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }
  function authHeaders() {
    const t = savedToken();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }

  function showToast(msg, type = 'info', ms = 3500) {
    const container = document.getElementById('toastContainer') || document.body;
    const el = document.createElement('div');
    el.className = 'rdash-toast';
    el.style = 'padding:10px 14px;border-radius:8px;margin-bottom:8px;box-shadow:0 1px 4px rgba(0,0,0,0.06);max-width:360px;';
    el.innerHTML = `<div style="background:${
      type === 'error' ? '#fde2e2' : type === 'success' ? '#e7f7ef' : '#fff9db'
    };border:1px solid #eee;padding:8px;border-radius:6px;color:#111">${msg}</div>`;
    container.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch(e){} }, ms);
  }

  function escapeHtml(s = '') {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"'`]/g, (m) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#x60;' }[m])
    );
  }

  /* ---------------- Safe bootstrap modal helpers ---------------- */
  // robust safeShowBootstrapModal (Bootstrap-first; fallback to plain DOM)
  function safeShowBootstrapModal(modalEl, options = {}) {
    if (!modalEl) return null;
    try { if (!document.body.contains(modalEl)) document.body.appendChild(modalEl); } catch (e) {}
    try {
      if (!modalEl.classList.contains('modal')) modalEl.classList.add('modal');
      modalEl.setAttribute('tabindex', modalEl.getAttribute('tabindex') || '-1');
      modalEl.setAttribute('role', modalEl.getAttribute('role') || 'dialog');
      if (!modalEl.getAttribute('aria-hidden')) modalEl.setAttribute('aria-hidden', 'true');
    } catch (e) {}

    function plainShow() {
      try {
        modalEl.style.display = 'block';
        modalEl.classList.remove('d-none');
        modalEl.classList.add('show');
        modalEl.setAttribute('aria-modal', 'true');
        modalEl.setAttribute('aria-hidden', 'false');
        if (!document.querySelector('.modal-backdrop.custom-rdash-backdrop')) {
          const bd = document.createElement('div');
          bd.className = 'modal-backdrop fade show custom-rdash-backdrop';
          document.body.appendChild(bd);
        }
        document.body.style.overflow = 'hidden';
        try {
          const focusable = modalEl.querySelector('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
          if (focusable) focusable.focus(); else modalEl.focus();
        } catch (e) {}
      } catch (e) { console.warn('plainShow failed', e); }
      return null;
    }

    if (window.RDASH_FORCE_NO_BOOTSTRAP) return plainShow();
    try {
      if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        let inst = null;
        try {
          if (typeof bootstrap.Modal.getOrCreateInstance === 'function') {
            inst = bootstrap.Modal.getOrCreateInstance(modalEl, Object.assign({ backdrop: 'static' }, options));
          } else {
            try { inst = bootstrap.Modal.getInstance(modalEl); } catch (e) { inst = null; }
            if (!inst) inst = new bootstrap.Modal(modalEl, Object.assign({ backdrop: 'static' }, options));
          }
        } catch (createErr) {
          console.warn('bootstrap instance creation error, falling back to plainShow:', createErr);
          return plainShow();
        }
        try {
          requestAnimationFrame(() => {
            try {
              if (inst && typeof inst.show === 'function') {
                try { inst.show(); return; }
                catch (errShow) { console.warn('inst.show() failed, fallback', errShow); plainShow(); return; }
              }
              plainShow();
            } catch (frameErr) { console.warn('raf error', frameErr); plainShow(); }
          });
          return inst;
        } catch (showErr) { console.warn('show wrapper failed', showErr); return plainShow(); }
      }
    } catch (outerErr) { console.warn('bootstrap outer failed', outerErr); return plainShow(); }
    return plainShow();
  }

  function safeHideBootstrapModal(modalEl) {
    if (!modalEl) return;
    try {
      if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
        try {
          const inst = bootstrap.Modal.getInstance(modalEl);
          if (inst && typeof inst.hide === 'function') {
            inst.hide();
            document.querySelectorAll('.modal-backdrop.custom-rdash-backdrop').forEach(el => el.remove());
            document.body.style.overflow = '';
            return;
          }
        } catch (e) { console.warn('bootstrap hide attempt failed', e); }
      }
    } catch (e) { console.warn('bootstrap hide wrapper failed', e); }
    try {
      modalEl.style.display = 'none';
      modalEl.classList.remove('show');
      modalEl.classList.add('d-none');
      modalEl.setAttribute('aria-hidden', 'true');
      modalEl.removeAttribute('aria-modal');
    } catch (e) {}
    document.querySelectorAll('.modal-backdrop.custom-rdash-backdrop').forEach(el => el.remove());
    document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
    document.body.style.overflow = '';
  }

  /* ---------------- API fetch wrappers ---------------- */
  async function apiFetch(path, opts = {}) {
    opts = Object.assign({}, opts);
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}, authHeaders());
    log('apiFetch', path, opts.method || 'GET');
    try {
      const r = await fetch(path, opts);
      if (r.status === 401 || r.status === 403) {
        localStorage.removeItem(TOKEN_KEY);
        showToast('Not authorized — paste a valid token and retry', 'error', 4000);
        return { ok: false, status: r.status, data: null };
      }
      const text = await r.text().catch(() => null);
      let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
      return { ok: r.ok, status: r.status, data, text };
    } catch (e) { errlog('apiFetch error', e); return { ok: false, status: 0, error: true, exception: String(e) }; }
  }

  /* ---------------- DOM / fallback modal creation ---------------- */
  function ensureToastContainer() {
    let c = document.getElementById('toastContainer');
    if (!c) {
      c = document.createElement('div');
      c.id = 'toastContainer';
      c.style = 'position:fixed;right:18px;top:18px;z-index:12000;width:320px;max-width:calc(100% - 40px);';
      document.body.appendChild(c);
    }
    return c;
  }

  function createFallbackAddJobModal() {
    if (document.getElementById('addJobModal')) return document.getElementById('addJobModal');
    const modal = document.createElement('div');
    modal.id = 'addJobModal';
    modal.className = 'modal fade d-none';
    modal.style = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,0.35);z-index:99999';
    modal.innerHTML = `
      <div class="modal-dialog" style="max-width:720px">
        <div class="modal-content p-3">
          <div class="modal-header"><h5 class="modal-title">Create job</h5><button type="button" class="btn-close" aria-label="Close"></button></div>
          <form id="addJobForm">
            <div class="modal-body">
              <div class="mb-2"><label class="form-label">Title</label><input id="jobTitle" required class="form-control" /></div>
              <div class="mb-2"><label class="form-label">Company</label><input id="jobCompany" class="form-control" /></div>
              <div class="mb-2"><label class="form-label">Skills</label><input id="jobSkills" class="form-control" /></div>
              <div class="mb-2"><label class="form-label">Experience (yrs)</label><input id="jobExperience" type="number" class="form-control" value="0" /></div>
              <div class="mb-2"><label class="form-label">Vacancies</label><input id="jobVacancies" type="number" class="form-control" value="1" /></div>
              <div class="mb-2"><label class="form-label">Description</label><textarea id="jobDescription" class="form-control" rows="4"></textarea></div>
            </div>
            <div class="modal-footer"><button type="button" class="btn btn-outline-secondary cancel-btn">Cancel</button><button type="submit" class="btn btn-primary">Create</button></div>
          </form>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('.btn-close')?.addEventListener('click', () => safeHideBootstrapModal(modal));
    modal.querySelector('.cancel-btn')?.addEventListener('click', () => safeHideBootstrapModal(modal));
    return modal;
  }
  
  // --- MANY FUNCTIONS CONTINUE HERE ---
