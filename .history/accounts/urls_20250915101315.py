# accounts/urls.py
from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from . import views

urlpatterns = [
    # HTML pages (frontend)
    path('register/', views.register_view, name='register_page'),             # renders register.html
    path('login/', views.login_view, name='login_page'),                      # renders login.html

    # API / auth endpoints - give them distinct api paths so they don't collide
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # profile API
    path('api/profile/', views.profile, name='profile'),

    # dashboard templates (if you render html from Django)
    path('candidate-dashboard/', resumes.views.candidate_dashboard, name='candidate_dashboard'),
    path('recruiter-dashboard/', views.recruiter_dashboard, name='recruiter_dashboard'),
]