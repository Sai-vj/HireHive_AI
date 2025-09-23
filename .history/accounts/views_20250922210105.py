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

from .models import UserProfile  # your profile model (OneToOne with User)

User = get_user_model()


# --------- HTML views (templates) ----------
from django.shortcuts import render, redirect
from django.contrib.auth import authenticate, login
from django.contrib import messages

def login_view(request):
    if request.method == 'POST':
        username = request.POST.get('username', '').strip()
        password = request.POST.get('password', '')
        next_url = request.POST.get('next') or request.GET.get('next')
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            messages.success(request, 'Login successful')
            # redirect to next param if present, else home (or role redirect)
            return redirect(next_url or 'home')
        else:
            messages.error(request, 'Invalid username or password')
            return redirect('login')
    # GET
    return render(request, 'login.html')




def register_view(request):
    if request.method == 'POST':
        username = request.POST.get('username', '').strip()
        email = request.POST.get('email', '').strip()
        pwd1 = request.POST.get('password1')
        pwd2 = request.POST.get('password2')
        role = request.POST.get('role') or 'candidate'

        if pwd1 != pwd2:
            messages.error(request, 'Passwords do not match')
            return redirect('register')

        if User.objects.filter(username=username).exists():
            messages.error(request, 'Username taken')
            return redirect('register')

        user = User.objects.create_user(username=username, email=email, password=pwd1)

        # create profile if not auto-created via signals
        profile, created = UserProfile.objects.get_or_create(user=user)
        profile.role = role
        profile.save()

        messages.success(request, 'Account created. Please login.')
        return redirect('login')

    return render(request, 'register.html')


def logout_view(request):
    logout(request)
    return redirect('home')


@login_required
def role_redirect(request):
    role_name = getattr(getattr(request.user, 'profile', None), 'role', '') or ''
    if role_name == 'recruiter':
        return redirect('recruiter_dashboard')
    return redirect('candidate_dashboard')


from django.contrib.auth.decorators import login_required

@login_required
def candidate_dashboard(request):
    # ensure template path is templates/resumes/candidate_dashboard.html
    return render(request, "candidate_dashboard.html", {})

@login_required
def recruiter_dashboard(request):
    # extra guard: if not recruiter, redirect to candidate dashboard
    if not getattr(getattr(request.user, 'profile', None), 'role', '') == 'recruiter':
        return redirect('candidate_dashboard')
    return render(request, "recruiter_dashboard.html", {})



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



# accounts/views.py (append)

import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from django.conf import settings

# Helper to set cookie kwargs (tweak in production)
def _cookie_kwargs():
    kwargs = {
        "httponly": True,
        "samesite": "Lax",   # change to 'Strict' if you want stricter policy
        # "secure": True,    # enable in production with HTTPS
        "path": "/",
    }
    return kwargs

@csrf_exempt
@require_POST
def token_cookie_obtain(request):
    """
    POST JSON { username, password } -> sets HttpOnly cookies: access, refresh
    Returns JSON { ok: true } or errors.
    """
    try:
        data = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        return JsonResponse({"detail": "Invalid JSON"}, status=400)

    username = data.get("username")
    password = data.get("password")
    if not username or not password:
        return JsonResponse({"detail": "username/password required"}, status=400)

    serializer = TokenObtainPairSerializer(data={"username": username, "password": password})
    if not serializer.is_valid():
        return JsonResponse(serializer.errors, status=401)

    token_data = serializer.validated_data
    access = token_data.get("access")
    refresh = token_data.get("refresh")

    resp = JsonResponse({"ok": True})
    ck = _cookie_kwargs()
    resp.set_cookie("access", access, **ck)
    resp.set_cookie("refresh", refresh, **ck)
    return resp


@csrf_exempt
@require_POST
def token_refresh_cookie(request):
    """
    POST can accept JSON { refresh: <token> } or use refresh cookie.
    Sets new access cookie.
    """
    try:
        data = json.loads(request.body.decode("utf-8") or "{}")
    except Exception:
        data = {}

    refresh = data.get("refresh") or request.COOKIES.get("refresh")
    if not refresh:
        return JsonResponse({"detail": "refresh token required"}, status=400)

    try:
        rt = RefreshToken(refresh)
        new_access = str(rt.access_token)
    except Exception:
        return JsonResponse({"detail": "invalid refresh token"}, status=401)

    resp = JsonResponse({"ok": True})
    ck = _cookie_kwargs()
    resp.set_cookie("access", new_access, **ck)
    return resp


@csrf_exempt
@require_POST
def token_cookie_logout(request):
    """
    Clear access and refresh cookies.
    """
    resp = JsonResponse({"ok": True})
    resp.delete_cookie("access", path="/")
    resp.delete_cookie("refresh", path="/")
    return resp

def _cookie_kwargs():
    return {
      "httponly": True,
      "samesite": "Lax",
      "secure": False,   # dev only
      "path": "/",
    }


from django.http import JsonResponse
from django.contrib.auth.decorators import login_required

@login_required
def profile_json(request):
    user = request.user
    role = getattr(getattr(user, 'profile', None), 'role', None)
    return JsonResponse({
        "username": user.username,
        "email": user.email,
        "role": role or "candidate"
    })


