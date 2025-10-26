# interviews/urls.py
from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import InterviewViewSet, start_attempt, submit_attempt

router = DefaultRouter()
router.register(r'interviews', InterviewViewSet, basename='interview')

urlpatterns = [
    path('api/', include(router.urls)),
    # simpler endpoints
    path('interviews/<int:interview_id>/start/', start_attempt, name='interview-start'),
    path('apinterview-attempts/<int:attempt_id>/submit/', submit_attempt, name='interview-submit'),
]