from django.urls import path
from django.shortcuts import render
from .views import upload_resume, job_list ,match_resumes,shortlist_resume,my_shortlists,my_resumes,delete_resume,shortlist_export_csv

urlpatterns = [
    path('upload/', upload_resume, name='resume-upload'),
    path('jobs/', job_list, name='job-list'),
    path('jobs/<int:job_id>/match/', match_resumes, name='match_resumes'),
    path('shortlist/', shortlist_resume, name='shortlist_resume'),
    path('dashboard/recruiter/', lambda req: render(req, 'recruiter_dashboard.html'), name='recruiter-dashboard'),
    path('my-shortlists/', my_shortlists, name='my-shortlists'),
    path('dashboard/candidate/', lambda req: render(req, 'candidate_dashboard.html'), name='candidate-dashboard'),
    path('my-resumes/', my_resumes, name='my-resumes'),
    path('my-resumes/<int:resume_id>/', delete_resume, name='delete-resume'),
    path('shortlist/export/', shortlist_export_csv, name='shortlist-export'),
]
