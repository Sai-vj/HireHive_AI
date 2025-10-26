from django.db import models

  


class Resume(models.Model):
    name = models.CharField(max_length=200)
    email = models.EmailField()
    phone = models.CharField(max_length=20, blank=True, null=True)
    file = models.FileField(upload_to='resumes/')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    skills = models.TextField(blank=True, null=True)


class Job(models.Model):
    title = models.CharField(max_length=200)
    description = models.TextField()
    skills_required = models.TextField()  # comma separated
    posted_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title
    
    

