# interviews/urls.py
from django.urls import path
from . import views

urlpatterns = [
    # Recruiter
    path("recruiter/", views.recruiter_create_list_interviews, name="recruiter_create_list_interviews"),
    path("recruiter/<int:pk>/", views.recruiter_retrieve_update_delete_interview, name="recruiter_retrieve_update_delete_interview"),
    path("recruiter/<int:pk>/questions/", views.recruiter_add_questions, name="recruiter_add_questions"),
    path("recruiter/<int:interview_pk>/questions/<int:q_pk>/", views.recruiter_question_detail, name="recruiter_question_detail"),
    path("recruiter/<int:pk>/questions/review/", views.recruiter_review_bulk, name="recruiter_review_bulk"),
    path("recruiter/<int:pk>/attempts/", views.recruiter_list_attempts, name="recruiter_list_attempts"),
    path("recruiter/<int:pk>/generate_questions/", views.generate_questions_view, name="generate_questions_view"),
    path("recruiter/job/<int:job_pk>/create/", views.recruiter_create_interview_for_job, name="recruiter_create_interview_for_job"),
    path("recruiter/<int:job_pk>/invite/", views.recruiter_invite_candidate_by_job, name="recruiter_invite_candidate_by_job"),

    # Candidate (API)
    path("candidate/", views.list_public_interviews, name="list_public_interviews"),
    path("candidate/<int:pk>/", views.get_interview_detail, name="get_interview_detail"),
    path("candidate/<int:pk>/start/", views.start_interview_attempt, name="start_interview_attempt"),
    path("candidate/attempts/<int:attempt_id>/submit/", views.submit_interview_attempt, name="submit_interview_attempt"),

    # Candidate invites
    path("candidate/invites/", views.candidate_invites, name="candidate_invites"),
    path("candidate/invites/<int:invite_id>/respond/", views.candidate_invite_respond, name="candidate_invite_respond"),

    # Optional HTMX / fragments
    path("fragments/invite_row/<int:invite_id>/", views.invite_row_fragment, name="invite_row_fragment"),
    path("fragments/invite_modal/<int:pk>/", views.interview_invite_modal, name="interview_invite_modal"),
    path('page/candidate/<int:pk>/', views.candidate_interview_page, name='candidate_interview_page'),
    path("recruiter/review/", views.recruiter_review_page, name="recruiter_review_page"),
    path("interviews/candidate/attempts/<int:attempt_id>/reset/", views.reset_attempt, name="reset_attempt"),

]
