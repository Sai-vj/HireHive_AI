# accounts/views.py
from django.shortcuts import render, redirect
from django.contrib import messages
from django.contrib.auth import get_user_model, logout, authenticate, login
from django.contrib.auth.decorators import login_required

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from .models import UserProfile

User = get_user_model()


# ---------- AUTH VIEWS ----------

def login_view(request):
    if request.method == "POST":
        username = request.POST.get("username")
        password = request.POST.get("password")
        user = authenticate(request, username=username, password=password)
        if user:
            login(request, user)
            messages.success(request, "Login successful")
            return redirect("home")   # always back to home
        else:
            messages.error(request, "Invalid username or password")
            return redirect("login")
    return render(request, "login.html")


def register_view(request):
    if request.method == "POST":
        username = request.POST.get("username").strip()
        email = request.POST.get("email").strip()
        pwd1 = request.POST.get("password1")
        pwd2 = request.POST.get("password2")
        role = request.POST.get("role") or "candidate"

        if pwd1 != pwd2:
            messages.error(request, "Passwords do not match")
            return redirect("register")

        if User.objects.filter(username=username).exists():
            messages.error(request, "Username already exists")
            return redirect("register")

        user = User.objects.create_user(username=username, email=email, password=pwd1)
        profile, _ = UserProfile.objects.get_or_create(user=user)
        profile.role = role
        profile.save()

        messages.success(request, "Account created. Please login.")
        return redirect("login")

    return render(request, "register.html")


def logout_view(request):
    logout(request)
    return redirect("home")


# ---------- DASHBOARDS ----------
@login_required
def candidate_dashboard(request):
    return render(request, "candidate_dashboard.html")


@login_required
def recruiter_dashboard(request):
    if not getattr(request.user.profile, "role", "") == "recruiter":
        return redirect("candidate_dashboard")
    return render(request, "recruiter_dashboard.html")


# ---------- DRF APIs ----------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def profile_api(request):
    user = request.user
    role = getattr(getattr(user, "profile", None), "role", None)
    return Response({"username": user.username, "email": user.email, "role": role})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def dashboard_api(request):
    user = request.user
    role = getattr(getattr(user, "profile", None), "role", None)
    return Response(
        {
            "username": user.username,
            "email": user.email,
            "role": role or "candidate",
            "summary": {"profile_complete": 0, "applications": 0},
        }
    )
