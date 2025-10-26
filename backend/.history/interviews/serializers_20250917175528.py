# interviews/serializers.py
from rest_framework import serializers
from .models import Interview, InterviewQuestion, InterviewAttempt
from django.contrib.auth import get_user_model



# interviews/models.py
from django.db import models
from django.conf import settings

# adjust import to your Job model path
# if Job model is in resumes app:
# from resumes.models import Job

class Interview(models.Model):
    # existing fields...
    # add job FK:
    job = models.ForeignKey(
        'resumes.Job',           # string import avoids circular import
        on_delete=models.CASCADE,
        related_name='interviews',
        null=True,
        blank=True
    )
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.IntegerField(default=30)
    mode = models.CharField(max_length=32, default='live')  # example
    passing_percent = models.FloatField(default=50)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title or f"Interview {self.pk}"

User = get_user_model()

class InterviewQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = InterviewQuestion
        fields = ['id','order','type','prompt','choices','answer','max_score']


class InterviewSerializer(serializers.ModelSerializer):
    questions = InterviewQuestionSerializer(many=True, read_only=True)
    created_by = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = Interview
        fields = ['id','title','description','scheduled_at','duration_minutes','mode','created_by','created_at','is_active','passing_percent','questions']


class InterviewCreateUpdateSerializer(serializers.ModelSerializer):
    # for creating/updating interview including nested questions (optional)
    class Meta:
        model = Interview
        fields = ['id','job','title','description','scheduled_at','duration_minutes','mode','is_active','passing_percent']


class InterviewAttemptSerializer(serializers.ModelSerializer):
    class Meta:
        model = InterviewAttempt
        fields = ['id','interview','candidate','started_at','finished_at','answers','score','passed','recording_url','transcript','evaluated_at','evaluator_notes']
        read_only_fields = ['score','passed','evaluated_at','candidate']