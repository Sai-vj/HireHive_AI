from django.shortcuts import render
from .forms import ResumeForm
from .utils import parse_resume

from .models import Job, Resume
from .utils import match_jobs



# quiz/views.py (append imports)
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from .models import Quiz, QuizAttempt, Job
from .serializers import QuizSerializer, QuizAdminSerializer, QuizAttemptSerializer
from .llm import generate_quiz_questions
from django.db import transaction
from django.utils import timezone

def is_recruiter(user):
    try:
        return user.profile.role == 'recruiter'
    except Exception:
        return False

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def generate_quiz_for_job(request, job_id):
    # recruiter only
    if not is_recruiter(request.user):
        return Response({"detail":"Forbidden"}, status=403)
    job = get_object_or_404(Job, pk=job_id)
    count = int(request.data.get('questions_count') or 5)
    skills = request.data.get('skills') or job.skills_required or ''
    # generate questions
    questions = generate_quiz_questions(job.title, skills, count=count)
    # sanitize & minimal validation
    if not isinstance(questions, list) or len(questions) == 0:
        return Response({"detail":"Generation failed"}, status=500)

    quiz, created = Quiz.objects.get_or_create(job=job, defaults={
        'skills': skills,
        'questions_count': count,
        'questions_json': questions,
        'generated_at': timezone.now(),
        'auto_generated': True
    })
    if not created:
        quiz.skills = skills
        quiz.questions_count = count
        quiz.questions_json = questions
        quiz.generated_at = timezone.now()
        quiz.auto_generated = True
        quiz.save()

    serializer = QuizAdminSerializer(quiz)
    return Response(serializer.data, status=201 if created else 200)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_quiz_for_job(request, job_id):
    job = get_object_or_404(Job, pk=job_id)
    try:
        quiz = job.quiz
    except Quiz.DoesNotExist:
        return Response({"detail":"No quiz for this job"}, status=404)
    serializer = QuizSerializer(quiz, context={'request':request})
    return Response(serializer.data)


# add these imports at top if not present
import json, traceback
from django.conf import settings
from .models import Resume

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def submit_quiz_attempt(request, job_id):
    try:
        job = get_object_or_404(Job, pk=job_id)
        try:
            quiz = job.quiz
        except Quiz.DoesNotExist:
            return Response({"detail":"No quiz for this job"}, status=404)

        # parse answers (client may send object or JSON-string)
        answers = request.data.get('answers', {}) or {}
        if isinstance(answers, str):
            try:
                answers = json.loads(answers)
            except Exception:
                # if badly formatted, return 400
                return Response({"detail":"Invalid answers JSON"}, status=400)

        # optional resume validation
        resume_id = request.data.get('resume_id') or None
        resume_obj = None
        if resume_id:
            try:
                resume_id_int = int(resume_id)
                resume_obj = Resume.objects.filter(id=resume_id_int, candidate=request.user).first()
                if not resume_obj:
                    return Response({"detail":"Invalid resume id"}, status=400)
            except (ValueError, TypeError):
                return Response({"detail":"Invalid resume id format"}, status=400)

        # create attempt record
        attempt = QuizAttempt.objects.create(
            quiz=quiz,
            candidate=request.user,
            resume=resume_obj  # use relation, not resume_id field assignment
        )

        # scoring: handle different stored shapes in questions_json
        correct = 0
        total = 0
        qmap = {}
        for q in (quiz.questions_json or []):
            # q might be dict with id numeric or string - unify
            qid = q.get('id') or q.get('qid') or q.get('question_id') or str(total+1)
            qmap[str(qid)] = q
            total += 1

        for qid, q in qmap.items():
            # client may have used "q1" or numeric keys; normalize
            selected = answers.get(qid) or answers.get(str(qid)) or answers.get(int(qid) if qid.isdigit() else qid)
            correct_answer = q.get('answer')
            if selected and correct_answer:
                try:
                    if str(selected).strip().upper() == str(correct_answer).strip().upper():
                        correct += 1
                except Exception:
                    # ignore compare errors
                    pass

        score_percent = (correct / total * 100) if total else 0.0
        passed = score_percent >= (quiz.passing_percent or 0.0)

        attempt.answers = answers
        attempt.score = round(score_percent, 2)
        attempt.passed = passed
        attempt.finished_at = timezone.now()
        attempt.save()

        return Response({
            "attempt_id": attempt.id,
            "score": attempt.score,
            "passed": attempt.passed,
            "correct": correct,
            "total": total
        }, status=201)

    except Exception as e:
        # dev-friendly error return (only while DEBUG)
        tb = traceback.format_exc()
        print(tb)  # prints to runserver console
        if settings.DEBUG:
            return Response({"detail": "Internal error", "error": str(e), "traceback": tb}, status=500)
        else:
            return Response({"detail":"Internal server error"}, status=500)

