# rquiz/serializers.py
from rest_framework import serializers
from .models import Quiz, QuizAttempt

class QuizQuestionSerializer(serializers.Serializer):
    id = serializers.CharField()
    type = serializers.CharField()
    question = serializers.CharField()
    choices = serializers.DictField(child=serializers.CharField(), required=False)
    difficulty = serializers.CharField(required=False)
    topic = serializers.CharField(required=False)

class QuizSerializer(serializers.ModelSerializer):
    questions = serializers.SerializerMethodField()

    class Meta:
        model = Quiz
        fields = ['id', 'job', 'skills', 'questions_count', 'time_limit_seconds', 'passing_percent', 'auto_generated', 'generated_at', 'questions']

    def get_questions(self, obj):
        # Return stored questions but remove 'answer' key for candidate view
        qs = obj.questions_json or []
        # hide answer key for normal GET
        filtered = []
        for q in qs:
            qcopy = q.copy()
            qcopy.pop('answer', None)
            filtered.append(qcopy)
        return filtered

class QuizAdminSerializer(serializers.ModelSerializer):
    # full serializer used for recruiter/admin to see answers
    class Meta:
        model = Quiz
        fields = ['id', 'job', 'skills', 'questions_count', 'time_limit_seconds', 'passing_percent', 'auto_generated', 'generated_at', 'questions_json']

class QuizAttemptSerializer(serializers.ModelSerializer):
    class Meta:
        model = QuizAttempt
        fields = ['id', 'quiz', 'candidate', 'resume', 'started_at', 'finished_at', 'answers', 'score', 'passed']
        read_only_fields = ['score', 'passed', 'started_at', 'finished_at', 'candidate']