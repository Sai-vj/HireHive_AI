from django.contrib.auth.models import User
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework import status

@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    username = request.data.get('username')
    email = request.data.get('email')
    password = request.data.get('password')
    role = request.data.get('role', 'student')

    if not (username and email and password):
        return Response({"detail": "Missing fields"}, status=400)
    if User.objects.filter(username=username).exists():
        return Response({"detail": "Username taken"}, status=400)

    user = User.objects.create_user(username=username, email=email, password=password)
    user.profile.role = role
    user.profile.save()
    return Response({"detail": "Registered"}, status=status.HTTP_201_CREATED)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def profile(request):
    user = request.user
    return Response({
        "username": user.username,
        "email": user.email,
        "role": user.profile.role
    })
    
# core/views.py  (or accounts/views.py)
from django.shortcuts import render
from django.contrib.auth.decorators import login_required

def login_view(request):
    return render(request,"login.html")

def register_view(request)


