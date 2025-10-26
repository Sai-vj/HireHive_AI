from django.db import models
from django.db import models
from django.contrib.auth.models import User
from django.conf import settings
from django.utils import timezone



class Resume(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, default=1)
    file = models.FileField(upload_to='resumes/')
    skills = models.TextField(blank=True, null=True)       
    experience = models.TextField(blank=True, null=True)   
    uploaded_at = models.DateTimeField(auto_now_add=True)
    embedding = models.JSONField(null=True, blank=True, help_text="Optional stored embedding (list of floats)")
    extracted_text=models.TextField(null=True,blank=True,help_text="Raw extracted text from file (optional)")
    embedding_model_version=models.CharField(max_length=64,null=True,blank=True)
   


    def __str__(self):
        return f"{self.user.username} Resume"


class Job(models.Model):
    title = models.CharField(max_length=200)
    description = models.TextField()
    skills_required = models.TextField()
    experience_required = models.IntegerField(default=0) 
    company = models.CharField(max_length=200, blank=True, null=True)
    location = models.CharField(max_length=200, blank=True, null=True)
    posted_at = models.DateTimeField(auto_now_add=True)
    embedding = models.JSONField(null=True, blank=True)
    embedding_model_version=models.CharField(max_length=64,null=True,blank=True)
    created_by=models.ForeignKey(settings.AUTH_USER_MODEL)

    def __str__(self):
        return self.title




class Shortlist(models.Model):
    job = models.ForeignKey('Job', on_delete=models.CASCADE, related_name='shortlisted_resumes')
    resume = models.ForeignKey('Resume', on_delete=models.CASCADE)
    shortlisted_by = models.ForeignKey(User, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    email_sent = models.BooleanField(default=False)
    email_sent = models.BooleanField(default=False)
    email_sent_at = models.DateTimeField(null=True, blank=True)


    class Meta:
        unique_together = ('job', 'resume')
        
        




from django.db import models
from django.contrib.auth.models import User

class Application(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('shortlisted', 'Shortlisted'),
        ('rejected', 'Rejected'),
        ('interview', 'Interview'),
        ('hired', 'Hired'),
    ]

    job = models.ForeignKey('Job', on_delete=models.CASCADE, related_name='applications')
    resume = models.ForeignKey('Resume', on_delete=models.CASCADE, related_name='applications')
    candidate = models.ForeignKey(User, on_delete=models.CASCADE, related_name='applications')
    candidate_name=models.CharField(max_length=255,blank=True,null=True)
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default='pending')
    applied_at = models.DateTimeField(auto_now_add=True)
    score_snapshot = models.FloatField(null=True, blank=True)
    message = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, null=True, blank=True)



    class Meta:
        unique_together = ('job', 'resume')  # prevents duplicate applications
        ordering = ['-applied_at']

    def __str__(self):
        return f"Application {self.id} | job={self.job_id} | resume={self.resume_id} | candidate={self.candidate_id}"
        
        








