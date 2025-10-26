from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import register, profile
from . import views

urlpatterns = [
    path('register/', register, name='register'),
     path('login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token',TokenObtainPairView.as_view(),name='token_obtain')
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('profile/', profile, name='profile'),
    path('candidate-dashboard/', views.candidate_dashboard, name='candidate_dashboard'),
    path('recruiter-dashboard/', views.recruiter_dashboard, name='recruiter_dashboard'),
    path('login/',views.login_view,name='login')
    
    
]
