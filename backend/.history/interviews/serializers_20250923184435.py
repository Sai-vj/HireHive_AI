# interviews/serializers.py
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
from rest_framework import serializers
from django.utils import timezone
from .models import InterviewInvite

class InterviewInviteSerializer(serializers.ModelSerializer):
    candidate_name = serializers.CharField(source="candidate.username", read_only=True)
    interview_title = serializers.CharField(source="interview.title", read_only=True)

    # new display field
    scheduled_at_display = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = InterviewInvite
        fields = [
            "id",
            "interview",
            "interview_title",
            "candidate",
            "candidate_name",
            "scheduled_at",
            "scheduled_at_display",   # add here
            "message",
            "status",
            "sent_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["status", "sent_at", "created_at", "updated_at"]

    def get_scheduled_at_display(self, obj):
        dt = getattr(obj, "scheduled_at", None)
        if not dt:
            return None
        # convert to server local timezone (settings.TIME_ZONE) and format nicely
        try:
            local = timezone.localtime(dt)
            return local.strftime("%Y-%m-%d %H:%M %Z")   # e.g. "2025-09-23 21:10 IST"
        except Exception:
            # fallback to ISO-like string
            return dt.isoformat()

