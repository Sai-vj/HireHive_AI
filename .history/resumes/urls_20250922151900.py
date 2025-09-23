# resumes/urls.py  (web routes)
from django.urls import path, include
from django.shortcuts import render
from . import views

urlpatterns = [
    # resume actions (web)
    path('upload/', views.upload_resume, name='resume-upload'),
    path('my-resumes/', views.my_resumes, name='my-resumes'),
    path('my-resumes/<int:resume_id>/delete/', views.delete_resume, name='delete-resume'),

    # jobs (web)
    path('jobs/', views.job_list, name='job-list'),
    path('jobs/<int:job_id>/match/', views.match_resumes, name='match_resumes'),
    path('jobs/<int:pk>/', views.JobDetailView.as_view(), name='job-detail'),

    # apply + recommend
    path('apply/', views.apply_for_job, name='apply_for_job'),
    path('<int:resume_id>/recommend/', views.recommended_jobs, name="recommended_jobs"),

    # shortlist
    path('shortlist/', views.shortlist_resume, name='shortlist_resume'),
    path('my-shortlists/', views.my_shortlists, name='my-shortlists'),
    path('shortlist/export/', views.shortlist_export_csv, name='shortlist-export'),

    # applications (web)
    path('my-applications/', views.my_applications, name="my-applications"),
    path('recruiter/applications/', views.recruiter_applications, name="recruiter-applications"),
    path('recruiter/job/<int:job_id>/applications/', views.recruiter_applications, name='recruiter-job-applications'),

    # recruiter job actions
    path('recruiter/job/<int:job_id>/delete/', views.recruiter_delete_job, name='recruiter-delete-job'),
    path('recruiter/job/<int:job_id>/', views.recruiter_update_job, name='recruiter-update-job'),

    # dashboards (use view functions, not lambdas — safer)
    path('dashboard/recruiter/', views.recruiter_dashboard, name='recruiter_dashboard'),
    path('dashboard/candidate/', views.candidate_dashboard, name='candidate_dashboard'),
]
