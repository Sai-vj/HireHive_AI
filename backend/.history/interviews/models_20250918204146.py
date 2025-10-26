from django.db import models
from django.conf import settings
from django.db import models
from django.conf import settings
from resumes.models import Job
from django.utils import timezone
import hashlib


from resumes.models import Job


class Interview(models.Model):
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(default=30)
    mode = models.CharField(max_length=50, choices=[('online','Online'),('offline','Offline')], default='online')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,null=True, related_name='created_interviews',)
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(null=True,default=True)
    passing_percent = models.PositiveIntegerField(null=True,default=60)

    # 🔑 Link to Job
    job = models.ForeignKey(Job, null=True, blank=True, on_delete=models.SET_NULL, related_name="interviews")
    





class InterviewQuestion(models.Model):
    GENERATED_BY_CHOICES = [
        ('human', 'Human'),
        ('ai', 'AI'),
    ]
    STATUS_CHOICES = [
        ('published', 'Published'),
        ('pending_review', 'Pending Review'),
        ('rejected', 'Rejected'),
        ('draft', 'Draft'),
    ]

    interview = models.ForeignKey(
        'Interview', on_delete=models.CASCADE, related_name="questions"
    )
    question_text = models.TextField()
    question_type = models.CharField(
        max_length=20,
        choices=[("mcq", "Multiple Choice"), ("text", "Text")],
        default="text",
    )
    choices = models.JSONField(null=True, blank=True)
    answer = models.CharField(max_length=50, null=True, blank=True)
    difficulty = models.CharField(
        max_length=20,
        choices=[("easy", "Easy"), ("medium", "Medium"), ("hard", "Hard")],
        default="easy",
    )
    topic = models.CharField(max_length=100, null=True, blank=True)

    # AI metadata
    generated_by = models.CharField(max_length=10, choices=GENERATED_BY_CHOICES, default='human')
    ai_prompt = models.TextField(null=True, blank=True)
    ai_model = models.CharField(max_length=100, null=True, blank=True)
    ai_confidence = models.FloatField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='published')

    text_hash = models.CharField(max_length=64, null=True, blank=True, db_index=True)

    # use timezone.now as default to backfill existing rows without interactive prompt
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name='created_questions')

    def save(self, *args, **kwargs):
        if self.question_text:
            self.text_hash = hashlib.sha256(self.question_text.strip().encode('utf-8')).hexdigest()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Q[{self.pk}] {self.question_text[:60]}"



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
    
    
    
# interviews/models.py (append)
from django.conf import settings
from django.utils import timezone

class InterviewInvite(models.Model):
    STATUS_CHOICES = [
        ('pending','pending'),
        ('accepted','accepted'),
        ('declined','declined'),
        ('completed','completed'),
    ]

    interview = models.ForeignKey('Interview', on_delete=models.CASCADE, related_name='invites')
    candidate = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='interview_invites')
    scheduled_at = models.DateTimeField(null=True, blank=True)
    message = models.TextField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    reminder_1h_sent = models.BooleanField(default=False)
    reminder_15m_sent = models.BooleanField(default=False)


    def __str__(self):
        return f"Invite {self.pk} -> {self.candidate} for {self.interview}"

