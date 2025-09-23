# accounts/urls.py
from django.urls import path
from . import views
from django.contrib.auth import views as auth_views

urlpatterns = [
    path("login/", views.login_view, name="login"),
    path("logout/", views.logout_view, name="logout"),
    path("register/", views.register_view, name="register"),

    path("candidate-dashboard/", views.candidate_dashboard, name="candidate_dashboard"),
    path("recruiter-dashboard/", views.recruiter_dashboard, name="recruiter_dashboard"),

    # APIs
    path("profile-api/", views.profile_api, name="profile_api"),
    path("dashboard/", views.dashboard_api, name="dashboard_api"),
     path('password_reset/', auth_views.PasswordResetView.as_view(template_name='registration/password_reset_form.html'), name='password_reset'),
    path('password_reset/done/', auth_views.PasswordResetDoneView.as_view(template_name='registration/password_reset_done.html'), name='password_reset_done'),
    path('reset/<uidb64>/<token>/', auth_views.PasswordResetConfirmView.as_view(template_name='registration/password_reset_confirm.html'), name='password_reset_confirm'),
    path('reset/done/', auth_views.PasswordResetCompleteView.as_view(template_name='registration/password_reset_complete.html'), name='password_reset_complete'),
    
    
    path('token/cookie/', views.token_cookie_obtain, name='token_cookie_obtain'),
    path('token/refresh/cookie/', views.token_refresh_cookie, name='token_refresh_cookie'),
    path('token/logout/', views.token_cookie_logout, name='token_cookie_logout'),
]
