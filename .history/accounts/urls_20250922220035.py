# accounts/urls.py
from django.urls import path
from . import views

urlpatterns = [
    path("login/", views.login_view, name="login"),
    path("logout/", views.logout_view, name="logout"),
    path("register/", views.register_view, name="register"),

    path("candidate-dashboard/", views.candidate_dashboard, name="candidate_dashboard"),
    path("recruiter-dashboard/", views.recruiter_dashboard, name="recruiter_dashboard"),

    # APIs
    path("profile-api/", views.profile_api, name="profile_api"),
    path("dashboard/", views.dashboard_api, name="dashboard_api"),
]
