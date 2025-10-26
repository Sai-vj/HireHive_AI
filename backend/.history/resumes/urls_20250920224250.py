from django.urls import path, include
from django.shortcuts import render
from .views import (
    upload_resume, job_list, match_resumes, shortlist_resume,
    my_shortlists, my_resumes, delete_resume, shortlist_export_csv,
    recommended_jobs, apply_for_job, my_applications,
    recruiter_job_applications, recruiter_delete_job, recruiter_update_job
)
from rest_framework.routers import DefaultRouter
from .views import ApplicationViewSet

router = DefaultRouter()
router.register(r'applications', ApplicationViewSet, basename='applications')

urlpatterns = [
    path('upload/', upload_resume, name='resume-upload'),
    path('jobs/', job_list, name='job-list'),   # ✅ only this for jobs
    path('jobs/<int:job_id>/match/', match_resumes, name='match_resumes'),

    path('shortlist/', shortlist_resume, name='shortlist_resume'),
    path('shortlist/export/', shortlist_export_csv, name='shortlist-export'),
    path('my-shortlists/', my_shortlists, name='my-shortlists'),

    path('my-resumes/', my_resumes, name='my-resumes'),
    path('my-resumes/<int:resume_id>/', delete_resume, name='delete-resume'),

    path("<int:resume_id>/recommend/", recommended_jobs, name="recommended_jobs"),
    path('apply/', apply_for_job, name='apply_for_job'),
    path('applications/mine/', my_applications, name="my_applications"),  # 👈 small rename (clear)

    # recruiter related
    path('recruiter/job/<int:job_id>/applications/', recruiter_job_applications, name='recruiter-job-applications'),
    path('recruiter/job/<int:job_id>/delete/', recruiter_delete_job, name='recruiter-delete-job'),
    path('recruiter/job/<int:job_id>/', recruiter_update_job, name='recruiter-update-job'),
    

    # dashboards
    path('dashboard/recruiter/', lambda req: render(req, 'recruiter_dashboard.html'), name='recruiter-dashboard'),
    path('dashboard/candidate/', lambda req: render(req, 'candidate_dashboard.html'), name='candidate-dashboard'),

    # router urls (for ApplicationViewSet)
    path('', include(router.urls)),
]
