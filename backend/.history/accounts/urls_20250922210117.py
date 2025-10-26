# accounts/urls.py
from django.urls import path
from django.contrib.auth import views as auth_views
from . import views
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

urlpatterns = [
    # Template login
    path('login/', auth_views.LoginView.as_view(template_name='login.html'), name='login'),
    path('logout/', views.logout_view, name='logout'),

    # Cookie-based token endpoints (for JS frontend)
    path('token/cookie/', views.token_cookie_obtain, name='token_cookie_obtain'),
    path('token/refresh/cookie/', views.token_refresh_cookie, name='token_refresh_cookie'),
    path('token/logout/', views.token_cookie_logout, name='token_cookie_logout'),

    # Normal JWT endpoints (if needed)
    path('token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Other APIs / dashboards
    path('register/', views.register_view, name='register'),
    path('register-api/', views.register_api, name='api_register'),
    path('profile-api/', views.profile_api, name='profile'),
    path('profile-json/', views.profile_json, name='profile_json'),

    path('role-redirect/', views.role_redirect, name='role_redirect'),
    path('candidate-dashboard/', views.candidate_dashboard, name='candidate_dashboard'),
    path('recruiter-dashboard/', views.recruiter_dashboard, name='recruiter_dashboard'),
    path('dashboard/', views.dashboard_api, name='dashboard_api'),

    # Password reset
    path('password_reset/', auth_views.PasswordResetView.as_view(template_name='registration/password_reset_form.html'), name='password_reset'),
    path('password_reset/done/', auth_views.PasswordResetDoneView.as_view(template_name='registration/password_reset_done.html'), name='password_reset_done'),
    path('reset/<uidb64>/<token>/', auth_views.PasswordResetConfirmView.as_view(template_name='registration/password_reset_confirm.html'), name='password_reset_confirm'),
    path('reset/done/', auth_views.PasswordResetCompleteView.as_view(template_name='registration/password_reset_complete.html'), name='password_reset_complete'),
]
