from django.urls import path
from . import views
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

urlpatterns = [
    # Template login (only renders HTML, JS handles JWT login)
    path('login/', views.login_view, name='login'),

    # JWT endpoints
    path('token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # API endpoints
    path('register/', views.register_view, name='register'),   # keep if template signup needed
    path('register-api/', views.register_api, name='api_register'),
    path('profile-api/', views.profile_api, name='profile'),
    path('dashboard/', views.dashboard_api, name='dashboard_api'),

    # Password reset (keep if using Django’s built-in reset flow)
    path('password_reset/', views.password_reset_view, name='password_reset'),
    path('password_reset/done/', views.password_reset_done_view, name='password_reset_done'),
    path('reset/<uidb64>/<token>/', views.password_reset_confirm_view, name='password_reset_confirm'),
    path('reset/done/', views.password_reset_complete_view, name='password_reset_complete'),
]
