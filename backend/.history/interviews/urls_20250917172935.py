from django.urls import path
from . import views

urlpatterns = [
    # recruiter
    path('recruiter/interviews/', views.recruiter_create_list_interviews, name='recruiter-interviews'),
    path('recruiter/interview/<int:pk>/', views.recruiter_retrieve_update_delete_interview, name='recruiter-interview-detail'),
    path('recruiter/interview/<int:pk>/questions/', views.recruiter_add_questions, name='recruiter-interview-questions'),

    # candidate
    path('interviews/', views.list_public_interviews, name='list-interviews'),
    path('interview/<int:pk>/', views.get_interview_detail, name='get-interview'),
    path('interview/<int:pk>/start/', views.start_interview_attempt, name='start-interview'),
    path('interview/attempt/<int:attempt_id>/submit/', views.submit_interview_attempt, name='submit-attempt'),

    # recruiter results
    path('recruiter/interview/<int:pk>/attempts/', views.recruiter_list_attempts, name='recruiter-interview-attempts'),
]