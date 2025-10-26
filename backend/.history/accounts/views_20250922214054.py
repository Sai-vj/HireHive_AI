# accounts/views.py
from django.shortcuts import render, redirect
from django.contrib import messages
from django.contrib.auth import get_user_model, logout
from django.contrib.auth.decorators import login_required
from django.utils import timezone

# DRF imports for API endpoints
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from News.models
from .models import UserProfile  # your profile model (OneToOne with User)

User = get_user_model()

def login_view(request):
    # Render the login template — JS handles authentication via /accounts/token/
    return render(request, 'login.html')


def home_view(request):
    latest_news = News.objects.all()[:3]
    user_info = None
    # optional: check JWT via request.headers / cookie
    return render(request, "home.html", {"latest_news": latest_news, "user_info": user_info})
















# --------- API views (DRF) ----------
@api_view(['POST'])
@permission_classes([AllowAny])
def register_api(request):
    """
    API register endpoint (for token/mobile clients).
    JSON body: { username, email, password, role }
    """
    username = request.data.get('username')
    email = request.data.get('email')
    password = request.data.get('password')
    role = request.data.get('role', 'candidate')

    if not (username and email and password):
        return Response({"detail": "Missing fields"}, status=status.HTTP_400_BAD_REQUEST)

    if User.objects.filter(username=username).exists():
        return Response({"detail": "Username already taken"}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.create_user(username=username, email=email, password=password)

    # ensure profile exists
    profile, created = UserProfile.objects.get_or_create(user=user)
    profile.role = role
    profile.save()

    return Response({"detail": "Registered successfully"}, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def profile_api(request):
    user = request.user
    role = getattr(getattr(user, 'profile', None), 'role', None)
    return Response({
        "username": user.username,
        "email": user.email,
        "role": role
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_api(request):
    user = request.user
    role = getattr(getattr(user, 'profile', None), 'role', None)
    payload = {
        "username": user.username,
        "email": user.email,
        "role": role or "candidate",
        "summary": {"profile_complete": 0, "applications": 0}
    }
    return Response(payload)










