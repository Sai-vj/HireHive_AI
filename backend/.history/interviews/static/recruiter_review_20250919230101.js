import { apiFetchSimple } from "./utils.js";

async function loadAttempts(interviewId) {
  const res = await apiFetchSimple(`/api/interviews/recruiter/${interviewId}/attempts/`);
  if (!res.ok) {
    alert("Failed to load attempts");
    return;
  }

  const tbody = document.querySelector("#reviewTable tbody");
  tbody.innerHTML = "";
  res.data.forEach(at => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${at.candidate_name || "-"}</td>
      <td>${at.attempts_count ?? 0}</td>
      <td>${at.last_score ?? "-"}</td>
      <td>${at.last_passed ? "✅ Passed" : "❌ Failed"}</td>
      <td>${at.started_at || "-"}</td>
      <td>${at.finished_at || "-"}</td>
      <td>
        <button class="btn btn-sm btn-primary view-answers" data-id="${at.attempt_id}">View</button>
        <button class="btn btn-sm btn-outline-danger reset-btn" data-id="${at.candidate_id}" data-job="${at.job_id}">Reset</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // View answers click
  document.querySelectorAll(".view-answers").forEach(btn => {
    btn.addEventListener("click", async () => {
      const attemptId = btn.dataset.id;
      const res2 = await apiFetchSimple(`/api/interviews/recruiter/attempts/${attemptId}/`);
      document.querySelector("#answersContent").innerHTML =
        `<pre>${JSON.stringify(res2.data?.answers || {}, null, 2)}</pre>`;
      new bootstrap.Modal(document.getElementById("answersModal")).show();
    });
  });

  // Reset attempts click
  document.querySelectorAll(".reset-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Reset this candidate's attempts?")) return;
      const candidateId = btn.dataset.id;
      const jobId = btn.dataset.job;
      const res3 = await apiFetchSimple(`/api/quiz/${jobId}/reset_attempts/${candidateId}/`, { method: "POST" });
      if (res3.ok) {
        alert("Attempts reset");
        loadAttempts(interviewId);
      } else {
        alert("Reset failed");
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const interviewId = urlParams.get("interview");import { apiFetchSimple } from "./utils.js"; // adjust import if needed

async function loadAttempts(interviewId) {
  const tableBody = document.querySelector("#attemptsTable tbody");
  tableBody.innerHTML = `<tr><td colspan="6">Loading...</td></tr>`;

  const res = await apiFetchSimple(`/api/interviews/recruiter/${interviewId}/attempts/`, { method: "GET" });
  if (!res.ok || !Array.isArray(res.data)) {
    tableBody.innerHTML = `<tr><td colspan="6">Failed to load attempts</td></tr>`;
    return;
  }

  if (res.data.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6">No attempts yet</td></tr>`;
    return;
  }

  tableBody.innerHTML = "";
  res.data.forEach(a => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${a.candidate_name || a.candidate || "—"}</td>
      <td>${a.score ?? "—"}%</td>
      <td>${a.passed ? '<span class="text-success fw-bold">Passed</span>' : '<span class="text-danger fw-bold">Failed</span>'}</td>
      <td>${a.started_at ? new Date(a.started_at).toLocaleString() : "—"}</td>
      <td>${a.finished_at ? new Date(a.finished_at).toLocaleString() : "—"}</td>
      <td>
        <button class="btn btn-sm btn-outline-primary view-answers-btn" 
                data-answers='${JSON.stringify(a.answers || {})}'>View</button>
        <button class="btn btn-sm btn-outline-danger reset-btn" 
                data-attempt-id="${a.id}">Reset</button>
      </td>
    `;
    tableBody.appendChild(tr);
  });

  // View Answers
  document.querySelectorAll(".view-answers-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const answers = JSON.parse(btn.dataset.answers || "{}");
      document.getElementById("answersContent").textContent = JSON.stringify(answers, null, 2);
      new bootstrap.Modal(document.getElementById("answersModal")).show();
    });
  });

  // Reset attempt
  document.querySelectorAll(".reset-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const attemptId = btn.dataset.attemptId;
      if (!confirm("Are you sure you want to reset this attempt?")) return;

      const delRes = await apiFetchSimple(`/api/interviews/candidate/attempts/${attemptId}/reset/`, {
        method: "POST"
      });

      if (delRes.ok) {
        alert("Attempt reset successfully!");
        loadAttempts(interviewId);
      } else {
        alert("Reset failed: " + (delRes.data?.detail || delRes.status));
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const interviewId = params.get("interview");
  if (interviewId) {
    loadAttempts(interviewId);
  } else {
    document.querySelector("#attemptsTable tbody").innerHTML = `<tr><td colspan="6">No interview id provided</td></tr>`;
  }
});

  if (interviewId) loadAttempts(interviewId);
});
