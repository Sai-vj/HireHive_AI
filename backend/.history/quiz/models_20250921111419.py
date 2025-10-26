from django.db import models
from django.conf import settings
from django.utils import timezone

# Import the canonical Job model from the resumes app
from resumes.models import Job


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
        # safe access in case job is null for any reason
        title = getattr(self.job, 'title', '—')
        jid = getattr(self.job, 'id', '—')
        return f"Quiz for {title} ({jid})"


class QuizAttempt(models.Model):
    quiz = models.ForeignKey(Quiz, on_delete=models.CASCADE, related_name='attempts')
    candidate = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    resume = models.ForeignKey('resumes.Resume', null=True, blank=True, on_delete=models.SET_NULL)
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    answers = models.JSONField(default=dict)   # {question_id: selected_choice}
    score = models.FloatField(null=True, blank=True)
    passed = models.BooleanField(null=True, blank=True)

    class Meta:
        ordering = ['-started_at']


class Question(models.Model):
    quiz = models.ForeignKey(Quiz, related_name='questions', on_delete=models.CASCADE)
    text = models.TextField()
    choices = models.JSONField()   # {"A":"opt1","B":"opt2", ...}
    correct = models.CharField(max_length=16, null=True, blank=True)  # key like "A"
    points = models.IntegerField(default=1)
    explanation = models.TextField(blank=True, null=True)
