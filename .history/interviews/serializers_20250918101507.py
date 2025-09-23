# interviews/serializers.py
from rest_framework import serializers
from django.apps import apps
from .models import Interview, InterviewQuestion, InterviewAttempt

# load Job model dynamically to avoid import cycles
Job = apps.get_model('resumes', 'Job')


# ------------------- Interview Question -------------------
class InterviewQuestionSerializer(serializers.ModelSerializer):
    interview = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = InterviewQuestion
        fields = [
            'id',
            'interview',
            'question_text',
            'question_type',
            'choices',
            'answer',
            'difficulty',
            'topic'
        ]

    def create(self, validated_data):
        # If view passed interview via kwargs (serializer.save(interview=...))
        interview = self.context.get('interview') or self._kwargs.get('context', {}).get('interview') or self.initial_data.get('interview')
        # Sometimes view calls serializer.save(interview=interview) -> will be in kwargs of save()
        # The DRF Serializer.save() will forward kwargs to create(); so accept interview here:
        interview_kw = self.context.get('passed_interview')  # fallback placeholder

        # Accept interview passed directly as kwarg to save()
        interview = getattr(self, '_passed_interview', None) or self.context.get('interview') or interview

        # If interview is still None, try to get from validated_data (not ideal)
        if not interview and 'interview' in validated_data:
            interview = validated_data.pop('interview')

        # Create normally
        return InterviewQuestion.objects.create(interview=interview, **validated_data)




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