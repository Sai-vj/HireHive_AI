# frontend/urls.py
from django.urls import path
from .views import home,contact_view

urlpatterns = [
    path('', home, name='home'),
    path('contact/', contact_view, name='contact'), 
]
