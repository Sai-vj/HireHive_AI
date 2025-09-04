from django.db import models
from django.db import models
from django.contrib.auth.models import User



class Resume(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE,default=1)
    file = models.FileField(upload_to='resumes/')
    skills = models.TextField()
    uploaded_at = models.DateTimeField(auto_now_add=True)


    def __str__(self):
        return f"{self.user.username} Resume"



class Job(models.Model):
    title = models.CharField(max_length=200)
    description = models.TextField()
    skills_required = models.TextField()
    company = models.CharField(max_length=200, blank=True, null=True)
    location = models.CharField(max_length=200, blank=True, null=True)
    posted_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title



