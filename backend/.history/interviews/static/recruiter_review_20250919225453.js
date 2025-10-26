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
  const interviewId = urlParams.get("interview");
  if (interviewId) loadAttempts(interviewId);
});
