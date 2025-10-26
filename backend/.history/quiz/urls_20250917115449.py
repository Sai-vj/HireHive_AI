from django.urls import path
from . import views
from .views import upload_resume

urlpatterns = [
    # Resume
    path('upload/', upload_resume, name='upload_resume'),

    # Quiz generate & fetch
    path('<int:job_id>/generate/', views.generate_quiz_for_job, name='generate_quiz'),
    path('<int:job_id>/', views.get_quiz_for_job, name='get_quiz'),

    # Quiz attempts
    path('<int:job_id>/attempt/', views.submit_quiz_attempt, name='submit_quiz_attempt'),
    path('<int:job_id>/attempts/', views.list_quiz_attempts, name='quiz_attempts'),

    # Recruiter reset attempts
    path('<int:job_id>/reset/<int:candidate_id>/', views.recruiter_reset_attempts, name='quiz_reset_attempts'),
]