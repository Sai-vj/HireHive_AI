from django.urls import path
from .views import upload_resume, job_list  # API-based views

urlpatterns = [
    path('upload/', upload_resume, name='resume-upload'),
    path('jobs/', job_list, name='job-list'),
]
