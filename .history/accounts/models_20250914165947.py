from django.db import models
from django.contrib.auth import get_user_model
from django.conf import settings

User = get_user_model()   # safer than importing User directly

class UserProfile(models.Model):
    ROLE_CHOICES = (('student','Student'), ('recruiter','Recruiter'))
    user = models.OneToOneField(settings.AUTH_USER)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='student')

    def __str__(self):
        return f"{self.user.username} ({self.role})"