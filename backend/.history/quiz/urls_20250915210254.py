from django.urls import path
from .views import upload_resume
from .

urlpatterns = [
    path('upload/', upload_resume, name='upload_resume'),
    path('quiz/generate/<int:job_id>/', views.generate_quiz_for_job, name='generate_quiz'),
    path('quiz/<int:job_id>/', views.get_quiz_for_job, name='get_quiz'),
    path('quiz/<int:job_id>/attempt/', views.submit_quiz_attempt, name='submit_quiz_attempt'),
]
