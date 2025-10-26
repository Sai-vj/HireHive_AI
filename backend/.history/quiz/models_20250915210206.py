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
    
    
# rmodels.py  (append or add in quiz app)
from django.db import models
from django.conf import settings
from django.utils import timezone

# import Job model from your app
from .models import Job  # adjust import if Job is in different module

class Quiz(models.Model):
    job = models.OneToOneField(Job, on_delete=models.CASCADE, related_name='quiz')
    skills = models.TextField(blank=True)   # comma-separated skills used to build prompt
    questions_json = models.JSONField(default=list, blank=True)  # stored list of question objects
    questions_count = models.PositiveIntegerField(default=5)
    time_limit_seconds = models.PositiveIntegerField(null=True, blank=True)
    passing_percent = models.FloatField(default=60.0)
    auto_generated = models.BooleanField(default=True)
    generated_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Quiz for {self.job.title} ({self.job.id})"


class QuizAttempt(models.Model):
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name='attempts')
    candidate = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    resume = models.ForeignKey('resumes.Resume', null=True, blank=True, on_delete=models.SET_NULL)  # adjust app label if different
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    answers = models.JSONField(default=dict)   # {question_id: selected_choice}
    score = models.FloatField(null=True, blank=True)
    passed = models.BooleanField(null=True, blank=True)

    class Meta:
        ordering = ['-started_at']
