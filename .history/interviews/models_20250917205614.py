from django.db import models
from django.conf import settings


from resumes.models import Job


class Interview(models.Model):
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(default=30)
    mode = models.CharField(max_length=50, choices=[('online','Online'),('offline','Offline')], default='online')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='created_interviews')
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(null=Truedefault=True)
    passing_percent = models.PositiveIntegerField(default=60)

    # 🔑 Link to Job
    job = models.ForeignKey(Job, null=True, blank=True, on_delete=models.SET_NULL, related_name="interviews")
    


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