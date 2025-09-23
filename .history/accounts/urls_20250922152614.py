# accounts/urls.py
from django.urls import path
from django.contrib.auth import views as auth_views
from . import views
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

urlpatterns = [
    # Template pages
    path('register/', views.register_view, name='register'),
    path('login/', auth_views.LoginView.as_view(template_name='login.html'), name='login')
    path('logout/', views.logout_view, name='logout'),
    path('role-redirect/', views.role_redirect, name='role_redirect'),

    # Password reset (Django built-in; templates in templates/registration/)
    path('password_reset/', auth_views.PasswordResetView.as_view(template_name='registration/password_reset_form.html'), name='password_reset'),
    path('password_reset/done/', auth_views.PasswordResetDoneView.as_view(template_name='registration/password_reset_done.html'), name='password_reset_done'),
    path('reset/<uidb64>/<token>/', auth_views.PasswordResetConfirmView.as_view(template_name='registration/password_reset_confirm.html'), name='password_reset_confirm'),
    path('reset/done/', auth_views.PasswordResetCompleteView.as_view(template_name='registration/password_reset_complete.html'), name='password_reset_complete'),

    # API endpoints
    path('register-api/', views.register_api, name='api_register'),
    path('token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('profile-api/', views.profile_api, name='profile'),

    # Dashboards
    path('candidate-dashboard/', views.candidate_dashboard, name='candidate_dashboard'),
    path('recruiter-dashboard/', views.recruiter_dashboard, name='recruiter_dashboard'),
    path('dashboard/', views.dashboard_api, name='dashboard_api'),
]
