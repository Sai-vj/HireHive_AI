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
    status = serializers.SerializerMethodField()   # NEW

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
            'status',    # NEW
            'answers',
            'total',    # added
            'correct',  # added
        ]
        read_only_fields = ['id', 'score', 'passed', 'started_at', 'finished_at', 'candidate', 'total', 'correct', 'status']

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
        for q in (quiz.questions_json or []):
            qid = str(q.get('id') or q.get('qid') or '')
            if not qid:
                continue
            # try different key forms
            selected = answers.get(qid)
            if selected is None and qid.isdigit():
                selected = answers.get(int(qid))
            if selected is None:
                selected = answers.get(str(qid))
            # normalize to string for comparison
            if selected is not None and str(selected).strip().upper() == str(q.get('answer') or '').strip().upper():
                correct += 1
        return correct

    def get_status(self, obj):
        # Return a string status so frontend can use it directly
        try:
            if getattr(obj, 'passed', None) is True:
                return 'passed'
            if getattr(obj, 'passed', None) is False:
                return 'failed'
            # fallback: derive from score & total
            total = self.get_total(obj) or 0
            score = getattr(obj, 'score', None)
            if score is None:
                return None
            PASS_PERCENT = getattr(settings, 'QUIZ_PASS_PERCENT', 50)
            try:
                # if score stored as percent (0-100) or as correct count
                if 0 <= score <= 100:
                    return 'passed' if score >= PASS_PERCENT else 'failed'
                # else if score is count-of-correct
                if total > 0:
                    perc = (score / total) * 100
                    return 'passed' if perc >= PASS_PERCENT else 'failed'
            except Exception:
                return None
        except Exception:
            return None
