# interviews/serializers.py
from rest_framework import serializers
from django.apps import apps
from .models import Interview, InterviewQuestion, InterviewAttempt

# load Job model dynamically to avoid import cycles
Job = apps.get_model('resumes', 'Job')


# ------------------- Interview Question -------------------
class InterviewQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = InterviewQuestion
        fields = [
            'id',
            'question_text',
            'question_type',
            'choices',
            'answer',
            'difficulty',
            'topic'
        ]


# ------------------- Interview -------------------
class InterviewSerializer(serializers.ModelSerializer):
    questions = InterviewQuestionSerializer(many=True, read_only=True)
    created_by = serializers.StringRelatedField(read_only=True)
    job = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Interview
        fields = [
            'id',
            'job',
            'title',
            'description',
            'scheduled_at',
            'duration_minutes',
            'mode',
            'created_by',
            'created_at',
            'is_active',
            'passing_percent',
            'questions',
        ]

    def get_job(self, obj):
        """Return minimal job info"""
        if not obj.job:
            return None
        return {
            'id': obj.job.id,
            'title': getattr(obj.job, 'title', ''),
            'company': getattr(obj.job, 'company', '')
        }


# ------------------- Interview Create/Update -------------------
class InterviewCreateUpdateSerializer(serializers.ModelSerializer):
    job = serializers.PrimaryKeyRelatedField(
        queryset=Job.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = Interview
        fields = [
            'id',
            'job',
            'title',
            'description',
            'scheduled_at',
            'duration_minutes',
            'mode',
            'is_active',
            'passing_percent',
        ]


# ------------------- Interview Attempt -------------------
class InterviewAttemptSerializer(serializers.ModelSerializer):
    class Meta:
        model = InterviewAttempt
        fields = [
            'id',
            'interview',
            'candidate',
            'started_at',
            'finished_at',
            'answers',
            'score',
            'passed',
        ]
        read_only_fields = [
            'score',
            'passed',
            'candidate',
            'started_at',
            'finished_at',
        ]