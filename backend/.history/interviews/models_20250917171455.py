# interviews/models.py
from django.db import models
from django.conf import settings
from django.utils import timezone
from django.contrib.postgres.fields import JSONField  # if using Postgres; else use models.JSONField in Django 3.1+

User = settings.AUTH_USER_MODEL

class Interview(models.Model):
    MODE_CHOICES = (
        ('live', 'Live (recruiter)'),
        ('ai', 'AI (automated)'),
    )

    job = models.ForeignKey('yourapp.Job', null=True, blank=True, on_delete=models.SET_NULL)  # adjust app label
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.IntegerField(default=30)
    mode = models.CharField(max_length=16, choices=MODE_CHOICES, default='ai')
    created_by = models.ForeignKey(User, related_name='created_interviews', on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(default=timezone.now)
    is_active = models.BooleanField(default=True)

    passing_percent = models.FloatField(default=50.0)

    def __str__(self):
        return f"{self.title} ({self.job})"


class InterviewQuestion(models.Model):
    QUESTION_TYPE = (
        ('mcq', 'Multiple Choice'),
        ('text', 'Text / open'),
        ('audio', 'Audio answer'),
    )
    interview = models.ForeignKey(Interview, related_name='questions', on_delete=models.CASCADE)
    order = models.IntegerField(default=0)
    type = models.CharField(max_length=8, choices=QUESTION_TYPE, default='mcq')
    prompt = models.CharField(max_length=600)
    choices = models.JSONField(null=True, blank=True)  # {"A":"..","B":"..","C":"..","D":".."}
    answer = models.CharField(max_length=8, null=True, blank=True)  # for mcq store "A" etc.
    max_score = models.FloatField(default=1.0)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"Q{self.order} - {self.prompt[:40]}"


class InterviewAttempt(models.Model):
    interview = models.ForeignKey(Interview, related_name='attempts', on_delete=models.CASCADE)
    candidate = models.ForeignKey(User, related_name='interview_attempts', on_delete=models.CASCADE)
    started_at = models.DateTimeField(default=timezone.now)
    finished_at = models.DateTimeField(null=True, blank=True)
    # answers: { "q1": "A", "q2": "some text", "q3": {"audio_url": "..."} }
    answers = models.JSONField(null=True, blank=True)
    score = models.FloatField(null=True, blank=True)
    passed = models.BooleanField(default=False)
    recording_url = models.URLField(null=True, blank=True)   # optional: whole interview recording
    transcript = models.TextField(null=True, blank=True)     # optional: aggregated transcript
    evaluated_at = models.DateTimeField(null=True, blank=True)
    evaluator_notes = models.TextField(null=True, blank=True)

    class Meta:
        ordering = ['-finished_at', '-started_at']

    def __str__(self):
        return f"Attempt {self.id} by {self.candidate}"