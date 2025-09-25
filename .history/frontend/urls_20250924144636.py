# frontend/urls.py
from django.urls import path
from .views import home,contact_

urlpatterns = [
    path('', home, name='home'),
    path('contact/', contact, name='contact'), 
]
