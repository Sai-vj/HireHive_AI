from django.db import models
from django.conf import settings

from accounts.signals import User



class Interview(models.Model):
    job = models.ForeignKey("resumes.Job", on_delete=models.CASCADE, related_name="interviews", null=True, blank=True)
    recruiter = models.ForeignKey(User, on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    passing_percent = models.FloatField(default=50)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title


class InterviewQuestion(models.Model):
    interview = models.ForeignKey(
        Interview, on_delete=models.CASCADE, related_name="questions"
    )
    question_text = models.TextField()
    # AI generated MCQ/Subjective
    question_type = models.CharField(
        max_length=20,
        choices=[("mcq", "Multiple Choice"), ("text", "Text")],
        default="text",
    )
    choices = models.JSONField(null=True, blank=True)  # for MCQ {A:"...", B:"...", ...}
    answer = models.CharField(max_length=10, null=True, blank=True)  # Correct answer if MCQ
    difficulty = models.CharField(
        max_length=20,
        choices=[("easy", "Easy"), ("medium", "Medium"), ("hard", "Hard")],
        default="easy",
    )
    topic = models.CharField(max_length=100, null=True, blank=True)

    def __str__(self):
        return f"Q: {self.question_text[:50]}"


class InterviewAttempt(models.Model):
    candidate = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="interview_attempts"
    )
    interview = models.ForeignKey(
        Interview, on_delete=models.CASCADE, related_name="attempts"
    )
    answers = models.JSONField(null=True, blank=True)  # {q1:"A", q2:"text answer"}
    score = models.FloatField(null=True, blank=True)
    passed = models.BooleanField(default=False)
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.candidate} - {self.interview}"