// recruiter_review.js (module)
// place in static/js/ and import in template with {% static 'js/recruiter_review.js' %}
import { apiFetchSimple } from "./utils.js"; // ensure this path is correct relative to this file

async function loadAttempts(interviewId) {
  const tableBody = document.querySelector("#reviewBody"); // matches template
  if (!tableBody) return;

  tableBody.innerHTML = `<tr><td colspan="6">Loading...</td></tr>`;

  let res;
  try {
    res = await apiFetchSimple(`/api/interviews/recruiter/${interviewId}/attempts/`, { method: "GET" });
  } catch (err) {
    console.error("Network error loading attempts:", err);
    tableBody.innerHTML = `<tr><td colspan="6">Network error while loading attempts</td></tr>`;
    return;
  }

  // normalize response shape: allow res to be Response-like or custom {ok,data}
  const ok = !!(res && (res.ok === true || res.status === 200 || Array.isArray(res.data)));
  const data = Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);

  if (!ok) {
    console.warn("Unexpected attempts response:", res);
    tableBody.innerHTML = `<tr><td colspan="6">Failed to load attempts</td></tr>`;
    return;
  }

  if (data.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6">No attempts yet</td></tr>`;
    return;
  }

  tableBody.innerHTML = "";
  data.forEach(a => {
    const tr = document.createElement("tr");

    // columns
    const tdCandidate = document.createElement("td");
    tdCandidate.textContent = a.candidate_name || a.candidate || "—";

    const tdScore = document.createElement("td");
    tdScore.textContent = (a.score == null) ? "—" : `${a.score}%`;

    const tdStatus = document.createElement("td");
    tdStatus.innerHTML = a.passed
      ? '<span class="text-success fw-bold">Passed</span>'
      : '<span class="text-danger fw-bold">Failed</span>';

    const tdStarted = document.createElement("td");
    tdStarted.textContent = a.started_at ? new Date(a.started_at).toLocaleString() : "—";

    const tdFinished = document.createElement("td");
    tdFinished.textContent = a.finished_at ? new Date(a.finished_at).toLocaleString() : "—";

    const tdActions = document.createElement("td");

    // View button (attach JSON safely via dataset)
    const viewBtn = document.createElement("button");
    viewBtn.className = "btn btn-sm btn-outline-primary me-2";
    viewBtn.type = "button";
    viewBtn.textContent = "View";
    // store answers as JSON string in dataset (safe)
    viewBtn.dataset.answers = JSON.stringify(a.answers || {});
    viewBtn.addEventListener("click", () => {
      const raw = viewBtn.dataset.answers || "{}";
      let answersObj = {};
      try { answersObj = JSON.parse(raw); } catch (e) { answersObj = { error: "Invalid answers" }; }
      // pretty print into modal; use textContent to avoid XSS
      const content = document.getElementById("answersContent");
      if (content) content.textContent = JSON.stringify(answersObj, null, 2);
      // show bootstrap modal (assumes bootstrap loaded)
      if (typeof bootstrap !== "undefined" && bootstrap.Modal) {
        new bootstrap.Modal(document.getElementById("answersModal")).show();
      } else {
        alert("Bootstrap modal not available. Answers:\n\n" + JSON.stringify(answersObj, null, 2));
      }
    });

    // Reset button
    const resetBtn = document.createElement("button");
    resetBtn.className = "btn btn-sm btn-outline-danger";
    resetBtn.type = "button";
    resetBtn.textContent = "Reset";
    resetBtn.dataset.attemptId = a.id;
    resetBtn.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to reset this attempt?")) return;
      try {
        const delRes = await apiFetchSimple(`/api/interviews/candidate/attempts/${a.id}/reset/`, { method: "POST" });
        const success = !!(delRes && (delRes.ok === true || delRes.status === 200));
        if (success) {
          alert("Attempt reset successfully!");
          loadAttempts(interviewId);
        } else {
          alert("Reset failed: " + (delRes?.data?.detail || delRes?.status || "unknown"));
        }
      } catch (err) {
        console.error("Reset error:", err);
        alert("Reset failed due to network error");
      }
    });

    tdActions.appendChild(viewBtn);
    tdActions.appendChild(resetBtn);

    tr.appendChild(tdCandidate);
    tr.appendChild(tdScore);
    tr.appendChild(tdStatus);
    tr.appendChild(tdStarted);
    tr.appendChild(tdFinished);
    tr.appendChild(tdActions);

    tableBody.appendChild(tr);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // prefer server-side set data attribute: <table data-interview-id="{{ id }}">...
  const params = new URLSearchParams(window.location.search);
  const interviewId = params.get("interview") || document.querySelector("#reviewTable")?.dataset?.interviewId;
  if (interviewId) {
    loadAttempts(interviewId);
  } else {
    const tb = document.querySelector("#reviewBody");
    if (tb) tb.innerHTML = `<tr><td colspan="6">No interview id provided</td></tr>`;
  }
});
