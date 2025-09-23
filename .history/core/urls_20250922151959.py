# project_root/urls.py
from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.urls import path, include
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from interviews import views as interviews_views
from frontend.views import home

urlpatterns = [
    path('admin/', admin.site.urls),

    # API auth tokens
    path('api/auth/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    # API apps (keeps API separate)
    path('api/accounts/', include('accounts.urls')),   # <-- contains API endpoints too (register-api, token etc.)
    path('api/quiz/', include('quiz.urls')),
    path('api/interviews/', include('interviews.urls')),
    path('api/resumes/', include('resumes.urls')),
    path('api/news/', include('news.urls')),
    

    # Web pages (frontend)
    path('', include('frontend.urls')),                # home at /
    path('accounts/', include('accounts.urls')),       # <-- IMPORTANT: web auth + password-reset templates served here

    # Candidate interview page (kept)
    path('interviews/candidate/<int:pk>/', interviews_views.candidate_interview_page, name='candidate_interview_page'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
