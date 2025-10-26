# interviews/serializers.py
from datetime import datetime, timezone
from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Interview, InterviewQuestion, InterviewAttempt, InterviewInvite

User = get_user_model()


# ----------------- Interview -----------------
class InterviewSerializer(serializers.ModelSerializer):
    job_title = serializers.CharField(source="job.title", read_only=True)
    created_by_name = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = Interview
        fields = [
            "id",
            "title",
            "description",
            "scheduled_at",
            "duration_minutes",
            "mode",
            "is_active",
            "passing_percent",
            "job",
            "job_title",
            "created_by",
            "created_by_name",
            "created_at",
        ]


class InterviewCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Interview
        fields = [
            "title",
            "description",
            "scheduled_at",
            "duration_minutes",
            "mode",
            "is_active",
            "passing_percent",
            "job",
        ]


class InterviewCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Interview
        fields = [
            "id",
            "title",
            "description",
            "scheduled_at",
            "duration_minutes",
            "mode",
            "is_active",
            "passing_percent",
            "job",
        ]


# ----------------- InterviewQuestion -----------------
class InterviewQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = InterviewQuestion
        fields = [
            "id",
            "interview",
            "question_text",
            "question_type",
            "choices",
            "answer",
            "difficulty",
            "topic",
            "generated_by",
            "ai_prompt",
            "ai_model",
            "ai_confidence",
            "status",
            "created_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_by", "created_at", "updated_at"]

    def create(self, validated_data):
        # ensure interview is taken from context
        interview = self.context.get("interview")
        if interview:
            validated_data["interview"] = interview
        if "created_by" not in validated_data and self.context.get("request"):
            validated_data["created_by"] = self.context["request"].user
        return super().create(validated_data)


class InterviewQuestionReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = InterviewQuestion
        fields = ["status", "question_text", "choices", "answer", "difficulty", "topic"]


# ----------------- InterviewAttempt -----------------
class InterviewAttemptSerializer(serializers.ModelSerializer):
    candidate_username = serializers.CharField(source="candidate.username", read_only=True)
    interview_title = serializers.CharField(source="interview.title", read_only=True)

    class Meta:
        model = InterviewAttempt
        fields = [
            "id",
            "candidate",
            "candidate_username",
            "interview",
            "interview_title",
            "answers",
            "score",
            "passed",
            "started_at",
            "finished_at",
        ]
        read_only_fields = ["started_at", "finished_at", "score", "passed"]


# ----------------- InterviewInvite -----------------




class InterviewInviteSerializer(serializers.ModelSerializer):
    candidate_name = serializers.CharField(source="candidate.username", read_only=True)
    interview_title = serializers.CharField(source="interview.title", read_only=True)

    class Meta:
        model = InterviewInvite
        fields = [
            "id",
            "interview",
            "interview_title",
            "candidate",
            "candidate_name",
            "scheduled_at",
            "message",
            "status",
            "sent_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["status", "sent_at", "created_at", "updated_at"]

    def validate_scheduled_at(self, value):
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except Exception:
                raise serializers.ValidationError("Invalid datetime format")
        return value

# interviews/serializers.py (append)
from rest_framework import serializers

class RecruiterAttemptInputSerializer(serializers.Serializer):
    # Accept single attempt or list in view (we'll wrap into list if needed)
    interview_id = serializers.IntegerField(required=False, allow_null=True)
    attempt_id = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    job_id = serializers.IntegerField(required=False, allow_null=True)
    candidate_id = serializers.IntegerField(required=False, allow_null=True)
    resume_id = serializers.IntegerField(required=False, allow_null=True)
    score = serializers.FloatField(required=False, allow_null=True)
    passed = serializers.BooleanField(required=False, allow_null=True)
    started_at = serializers.DateTimeField(required=False, allow_null=True)
    finished_at = serializers.DateTimeField(required=False, allow_null=True)
    answers = serializers.JSONField(required=False, allow_null=True)
    meta = serializers.JSONField(required=False, allow_null=True)


