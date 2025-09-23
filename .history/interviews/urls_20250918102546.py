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
path('candidate/attempts/<int:attempt_id>/submit/', views.submit_interview_attempt),
]