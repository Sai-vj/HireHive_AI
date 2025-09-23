from django.urls import path
from . import views

urlpatterns = [
   path('recruiter/interviews/', views.recruiter_create_list_interviews),
path('recruiter/interviews/<int:pk>/',views. recruiter_retrieve_update_delete_interview),
path('recruiter/interviews/<int:pk>/questions/', views.recruiter_add_questions),
path('recruiter/interviews/<int:pk>/attempts/', views.recruiter_list_attempts),
path('candidate/interviews/', views.list_public_interviews),
path('candidate/interviews/<int:pk>/', views.get_interview_detail),
path('candidate/interviews/<int:pk>/start/', views.start_interview_attempt),
path('candidate/attempts/<int:attempt_id>/submit/', submit_interview_attempt),
]