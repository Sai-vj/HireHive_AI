# interviews/serializers.py
from rest_framework import serializers
from .models import Interview, InterviewQuestion, InterviewAttempt
from django.contrib.auth import get_user_model

User = get_user_model()
from rest_framework import serializers
from .models import Interview, InterviewQuestion, InterviewAttempt

class InterviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = Interview
        fields = ['id', 'title', 'description', 'scheduled_at', 'passing_percent', 'recruiter', 'created_at']
        read_only_fields = ['id', 'recruiter', 'created_at']


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