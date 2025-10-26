<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Recruiter Review</title>
  <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet"/>
</head>
<body class="p-3 bg-light">
  <div class="container">
    <h3>Interview Review</h3>
    <table id="reviewTable" class="table table-bordered">
      <thead>
        <tr>
          <th>Candidate</th>
          <th>Attempts</th>
          <th>Score</th>
          <th>Status</th>
          <th>Started</th>
          <th>Finished</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  </div>

  <!-- Modal for answers -->
  <div class="modal fade" id="answersModal" tabindex="-1">
    <div class="modal-dialog modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title">Candidate Answers</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body" id="answersContent">Loading…</div>
      </div>
    </div>
  </div>

  <script type="module" src="/static/recruiter_review.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
