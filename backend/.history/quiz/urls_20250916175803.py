from django.urls import path
from .views import upload_resume
from .import views

urlpatterns = [
    path('upload/', upload_resume, name='upload_resume'),
    path('generate/<int:job_id>/', views.generate_quiz_for_job, name='generate_quiz'),
    path('<int:job_id>/', views.get_quiz_for_job, name='get_quiz'),
    path('<int:job_id>/attempt/', views.submit_quiz_attempt, name='submit_quiz_attempt'),
    path('<int:job_id>/reset_attempts/<int:candidate_id>/', views.recruiter_reset_attempts, name='quiz-reset-attempts')
]
