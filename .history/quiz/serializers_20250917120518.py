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

from rest_framework import serializers
from .models import QuizAttempt

class QuizAttemptSerializer(serializers.ModelSerializer):
    total = serializers.SerializerMethodField()
    correct = serializers.SerializerMethodField()

    class Meta:
        model = QuizAttempt
        fields = [
            'id',
            'quiz',
            'candidate',
            'started_at',
            'finished_at',
            'score',
            'passed',
            'answers',
            'total',    # added
            'correct',  # added
        ]
        read_only_fields = ['id', 'score', 'passed', 'started_at', 'finished_at', 'candidate', 'total', 'correct']

    def get_total(self, obj):
        try:
            return len(obj.quiz.questions_json or [])
        except Exception:
            return 0

    def get_correct(self, obj):
        quiz = getattr(obj, 'quiz', None)
        if not quiz:
            return 0
        correct = 0
        answers = obj.answers or {}
        # support both numeric/string IDs
        for q in (quiz.questions_json or []):
            qid = str(q.get('id') or q.get('qid') or '')
            if not qid:
                continue
            selected = answers.get(qid) or answers.get(int(qid)) if qid.isdigit() else answers.get(qid)
            if selected is None:
                # maybe client used index keys like "1","2"... also check those
                selected = answers.get(str(qid))
            if selected and str(selected).strip().upper() == str(q.get('answer') or '').strip().upper():
                correct += 1
        return correct