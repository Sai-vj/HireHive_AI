from django.db import models
from django.contrib.auth.models import get_user_model
User=get_user_model

class UserProfile(models.Model):
    ROLE_CHOICES = (
        ('student', 'Student'),
        ('recruiter', 'Recruiter'),
    )
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='profile'
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='student')

    def __str__(self):
        return f"{self.user.username} ({self.role})"