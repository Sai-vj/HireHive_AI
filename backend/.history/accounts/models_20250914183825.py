from django.db import models

from django.conf import settings



class UserProfile(models.Model):
    ROLE_CHOICES = (('student','Student'), ('recruiter','Recruiter'))
    user = models.OneToOneField(settings.AUTH_USER_MODEL,on_delete=models)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='student')

    def __str__(self):
        return f"{self.user.username} ({self.role})"