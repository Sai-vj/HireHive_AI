from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from . import views

urlpatterns = [
    # HTML pages
    path('register_/', views.register_view, name='register_page'),
    path('login/', views.login_view, name='login_page'),

    # API endpoints
    path('register/', views.register, name='api_register'),
    path('token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('profile/', views.profile, name='profile'),

    # Dashboards
    path('candidate-dashboard/', views.candidate_dashboard, name='candidate_dashboard'),
    path('recruiter-dashboard/', views.recruiter_dashboard, name='recruiter_dashboard'),
    path('api/dashboard/',views.dashboard_api,name)
]