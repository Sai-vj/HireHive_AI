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

# quiz/serializers.py
from rest_framework import serializers
from .models import QuizAttempt

class QuizAttemptSerializer(serializers.ModelSerializer):
    total = serializers.SerializerMethodField()
    correct = serializers.SerializerMethodField()

    class Meta:
        model = QuizAttempt
        fields = ['id', 'quiz', 'candidate', 'started_at', 'finished_at',
                   'score', 'passed',  ]
        read_only_fields = ['id', 'score', 'passed', 'started_at', 'finished_at', 'candidate']

    def get_total(self, obj):
        # if you store total anywhere else, adjust. fallback to len(answers) approx.
        # obj.quiz.questions_json expected to be list
        try:
            return len(obj.quiz.questions_json or [])
        except Exception:
            return 0

    def get_correct(self, obj):
        # you may store correct in attempt or compute here; if stored already return it
        # fallback to 0 so UI doesn't break
        return getattr(obj, 'correct_count', None) or 0