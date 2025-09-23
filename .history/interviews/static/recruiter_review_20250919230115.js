import { apiFetchSimple } from "./utils.js"; // adjust import if needed

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
