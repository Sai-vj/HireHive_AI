from django.urls import path
from . import views

urlpatterns = [
path('recruiter/', views.recruiter_create_list_interviews),
path('recruiter/<int:pk>/',views. recruiter_retrieve_update_delete_interview),
path('recruiter/<int:pk>/questions/', views.recruiter_add_questions),

path('recruiter/<int:pk>/attempts/', views.recruiter_list_attempts),
path('candidate/', views.list_public_interviews),
path('candidate/<int:pk>/', views.get_interview_detail),
path('candidate/<int:pk>/start/', views.start_interview_attempt),
path('candidate/attempts<int:attempt_id>/submit/', views.submit_interview_attempt),
path('recruiter/<int:pk>/generate_questions/', views.generate_questions_view),
path('recruiter/job/<int:job_pk>/create/',views.recruiter_create_interview_for_job,name="recruiter_create_interview_for_job"),
# single question detail/edit
path('recruiter/<int:interview_pk>/questions/<int:q_pk>/', views.recruiter_question_detail, name='recruiter_question_detail'),
# bulk review
path('recruiter/<int:pk>/questions/review/', views.recruiter_review_bulk, name='recruiter_review_bulk'),
path('recruiter/<int:job_pk>/invite/', views.recruiter_invite_candidate_by_job, name='recruiter_invite_candidate'),
path('candidate/invites/', views.candidate_invites, name='candidate_invites'),
path('candidate/invites/<int:invite_id>/respond/', views.candidate_invite_respond, name='candidate_invite_respond'),





]