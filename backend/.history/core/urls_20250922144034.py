from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.urls import path, include
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from django.views.generic import TemplateView
from interviews import views as interviews_views
from frontend.views import home

urlpatterns = [
    path('admin/', admin.site.urls),

    # Auth APIs
    path('api/auth/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # Apps
    path('api/accounts/', include('accounts.urls')),
    path('api/quiz/', include('quiz.urls')),
    path('api/interviews/', include('interviews.urls')),
    path('api/resumes/', include('resumes.urls')),

    path('api/news/', include('news.urls')),
    path('', home, name='home'),

    # Login/Register pages
    path('login/', TemplateView.as_view(template_name="login.html"), name="login"),
    path('register/', TemplateView.as_view(template_name="register.html"), name="register"),

    # Candidate interview page
    path('interviews/candidate/<int:pk>/', interviews_views.candidate_interview_page, name='candidate_interview_page'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
