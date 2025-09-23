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


# at top
from .utils import jwt_or_session_login_required

# replace
# @login_required
# def candidate_dashboard(request):
#     return render(...)

@jwt_or_session_login_required()
def candidate_dashboard(request):
    return render(request, "candidate_dashboard.html", {})

@jwt_or_session_login_required()
def recruiter_dashboard(request):
    # optional check role
    if not getattr(getattr(request.user, 'profile', None), 'role', '') == 'recruiter':
        return redirect('candidate_dashboard')
    return render(request, "recruiter_dashboard.html", {})



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


from django.contrib.auth import logout
from django.shortcuts import redirect

def logout_(request):
    logout(request)                # destroys session server-side
    response = redirect('home')    # or login page
    response.delete_cookie('sessionid')  # optional explicit
    return response



# ---------- DASHBOARDS ----------



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


# accounts/views.py

import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from django.contrib.auth import get_user_model
from .models import UserProfile

User = get_user_model()

# ---------- COOKIE AUTH HELPERS ----------
def _cookie_kwargs():
    """ Common cookie settings (dev safe, enable secure=True in prod) """
    return {
        "httponly": True,
        "samesite": "Lax",
        "secure": False,  # True only in production HTTPS
        "path": "/",
    }


@csrf_exempt
@require_POST
def token_cookie_obtain(request):
    """
    Login: POST { "username": "", "password": "" }
    → sets HttpOnly 'access' + 'refresh' cookies.
    """
    try:
        data = json.loads(request.body.decode("utf-8"))
    except Exception:
        return JsonResponse({"detail": "Invalid JSON"}, status=400)

    serializer = TokenObtainPairSerializer(data=data)
    if not serializer.is_valid():
        return JsonResponse({"detail": "Invalid credentials"}, status=401)

    tokens = serializer.validated_data
    access = tokens.get("access")
    refresh = tokens.get("refresh")

    resp = JsonResponse({"ok": True})
    ck = _cookie_kwargs()
    resp.set_cookie("access", access, **ck)
    resp.set_cookie("refresh", refresh, **ck)
    return resp


@csrf_exempt
@require_POST
def token_refresh_cookie(request):
    """
    Refresh token: uses refresh cookie, sets new access cookie.
    """
    refresh = request.COOKIES.get("refresh")
    if not refresh:
        return JsonResponse({"detail": "Refresh token missing"}, status=400)

    try:
        rt = RefreshToken(refresh)
        new_access = str(rt.access_token)
    except Exception:
        return JsonResponse({"detail": "Invalid refresh"}, status=401)

    resp = JsonResponse({"ok": True})
    resp.set_cookie("access", new_access, **_cookie_kwargs())
    return resp


@csrf_exempt
@require_POST
def token_cookie_logout(request):
    """
    Logout: clear cookies.
    """
    resp = JsonResponse({"ok": True})
    resp.delete_cookie("access", path="/")
    resp.delete_cookie("refresh", path="/")
    return resp


# ---------- PROFILE API ----------
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def profile_api(request):
    """Return logged-in user profile (requires cookie JWT)."""
    user = request.user
    role = getattr(getattr(user, "profile", None), "role", None)
    return Response({
        "username": user.username,
        "email": user.email,
        "role": role or "candidate"
    })
