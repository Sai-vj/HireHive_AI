from django.db import models
from django.db import models
from django.contrib.auth.models import User



class Resume(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, default=1)
    file = models.FileField(upload_to='resumes/')
    skills = models.TextField(blank=True, null=True)       # extracted skills
    experience = models.TextField(blank=True, null=True)   # extracted experience
    uploaded_at = models.DateTimeField(auto_now_add=True)
   


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





