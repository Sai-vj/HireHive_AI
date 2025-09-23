from django.urls import path, include
from django.shortcuts import render
from rest_framework.routers import DefaultRouter
from . import views
from .views import (
    upload_resume, job_list, match_resumes, shortlist_resume,
    my_shortlists, my_resumes, delete_resume, shortlist_export_csv,
    ApplicationViewSet
)

router = DefaultRouter()
router.register(r'applications', ApplicationViewSet, basename='applications')

urlpatterns = [
    # resume actions
    path('upload/', upload_resume, name='resume-upload'),
    path('my-resumes/', my_resumes, name='my-resumes'),
    path('my-resumes/<int:resume_id>/', delete_resume, name='delete-resume'),

    # jobs
    path('jobs/', job_list, name='job-list'),
    path('jobs/<int:job_id>/match/', match_resumes, name='match_resumes'),
    path('jobs/<int:pk>/', views.JobDetailView.as_view(), name='job-detail'),

    # apply + recommend
    path('apply/', views.apply_for_job, name='apply_for_job'),
    path('<int:resume_id>/recommend/', views.recommended_jobs, name="recommended_jobs"),

    # shortlist
    path('shortlist/', shortlist_resume, name='shortlist_resume'),
    path('my-shortlists/', my_shortlists, name='my-shortlists'),
    path('shortlist/export/', shortlist_export_csv, name='shortlist-export'),

    # applications
    path('my-applications/', views.my_applications, name="my-applications"),
    path('recruiter/applications/', views.recruiter_applications, name="recruiter-applications"),
    path('recruiter/job/<int:job_id>/applications/', views.recruiter__applications, name='recruiter-job-applications'),

    # recruiter job actions
    path('recruiter/job/<int:job_id>/delete/', views.recruiter_delete_job, name='recruiter-delete-job'),
    path('recruiter/job/<int:job_id>/', views.recruiter_update_job, name='recruiter-update-job'),

    # dashboards
    path('dashboard/recruiter/', lambda req: render(req, 'recruiter_dashboard.html'), name='recruiter-dashboard'),
    path('dashboard/candidate/', lambda req: render(req, 'candidate_dashboard.html'), name='candidate-dashboard'),

    # DRF router
    path('', include(router.urls)),
]
