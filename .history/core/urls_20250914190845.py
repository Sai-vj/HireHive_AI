from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.urls import path, include
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from django.views.generic import

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/accounts/', include('accounts.urls')),
    path('api/quiz/', include('quiz.urls')),
    path('api/coding/', include('coding.urls')),
    path('api/interviews/', include('interviews.urls')),
    path('api/resumes/', include('resumes.urls')),
    path('login/',TemplateView.as_view(template_name='login.html'))
    


]
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
