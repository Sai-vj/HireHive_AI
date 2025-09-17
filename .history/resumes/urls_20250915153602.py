from django.urls import path
from django.shortcuts import render
from .views import upload_resume, job_list ,match_resumes,shortlist_resume,my_shortlists,my_resumes,delete_resume,shortlist_export_csv
from . import views 
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ApplicationViewSet

router = DefaultRouter()
router.register(r'applications', ApplicationViewSet, basename='applications')

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
    path("<int:resume_id>/recommend/", views.recommended_jobs, name="recommended_jobs"),
    path('apply/',views.apply_for_job,name='apply_for_job'),
    path('', include(router.urls)),
    path('applications/<int:pk>/',views.my_applications,name="my_applications"),
    
    path('jobs/', views.JobListView.as_view(), name='job-list'),
    path('jobs/<int:pk>/', views.JobDetailView.as_view(), name='job-detail')
    
    path('candidate')
]