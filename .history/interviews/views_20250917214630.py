# interviews/views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.apps import apps

from .models import Interview, InterviewQuestion, InterviewAttempt
from .serializers import (
    InterviewSerializer,
    InterviewCreateUpdateSerializer,
    InterviewQuestionSerializer,
    InterviewAttemptSerializer,
)

# dynamic Job load (if you need it in views)
Job = apps.get_model('resumes', 'Job')


def is_recruiter(user):
    """Return True if user is a recruiter (adjust to your profile implementation)."""
    try:
        return getattr(user, 'profile', None) and getattr(user.profile, 'role', None) == 'recruiter'
    except Exception:
        return False


# ---------------- recruiter create / list interviews ----------------
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def recruiter_create_list_interviews(request):
    if not is_recruiter(request.user):
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    # list recruiter-created interviews
    if request.method == 'GET':
        qs = Interview.objects.filter(created_by=request.user).order_by('-created_at')
        serializer = InterviewSerializer(qs, many=True)
        return Response(serializer.data)

    # create interview (use create/update serializer so we accept job id)
    serializer = InterviewCreateUpdateSerializer(data=request.data)
    if serializer.is_valid():
        # ensure created_by saved
        interview = serializer.save(created_by=request.user)
        out = InterviewSerializer(interview)
        return Response(out.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# ---------------- recruiter retrieve / update / delete ----------------
@api_view(['GET', 'PATCH', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def recruiter_retrieve_update_delete_interview(request, pk):
    if not is_recruiter(request.user):
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    interview = get_object_or_404(Interview, pk=pk, created_by=request.user)

    if request.method == 'GET':
        return Response(InterviewSerializer(interview).data)

    if request.method in ('PUT', 'PATCH'):
        partial = (request.method == 'PATCH')
        serializer = InterviewCreateUpdateSerializer(interview, data=request.data, partial=partial)
        if serializer.is_valid():
            interview = serializer.save()  # created_by remains same
            return Response(InterviewSerializer(interview).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    # DELETE
    if request.method == 'DELETE':
        interview.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------- recruiter: add questions in bulk ----------------
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def recruiter_add_questions(request, pk):
    if not is_recruiter(request.user):
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    interview = get_object_or_404(Interview, pk=pk, created_by=request.user)

    # Expect payload: { "questions": [ { "question_text": "...", "question_type": "mcq", "choices": {...}, "answer": "A", ... }, ... ] }
    questions = request.data.get('questions') or []
    if not isinstance(questions, list):
        return Response({"detail": "questions must be a list"}, status=status.HTTP_400_BAD_REQUEST)

    created = []
    errors = []
    for idx, q in enumerate(questions):
        # attach interview pk
        payload = dict(q)
        payload['interview'] = interview.id
        serializer = InterviewQuestionSerializer(data=payload)
        if serializer.is_valid():
            qobj = serializer.save()
            created.append(InterviewQuestionSerializer(qobj).data)
        else:
            errors.append({"index": idx, "errors": serializer.errors})
            # continue to collect errors or break early:
            # return Response({"detail":"Invalid question payload", "errors": serializer.errors}, status=400)

    if errors:
        return Response({"created": created, "errors": errors}, status=status.HTTP_207_MULTI_STATUS)
    return Response({"created": created}, status=status.HTTP_201_CREATED)


# ---------------- candidate: list public/scheduled interviews ----------------
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_public_interviews(request):
    # filter as needed (scheduled, is_active, etc.)
    qs = Interview.objects.filter(is_active=True).order_by('-scheduled_at')
    serializer = InterviewSerializer(qs, many=True)
    return Response(serializer.data)


# ---------------- candidate: get interview detail ----------------
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_interview_detail(request, pk):
    interview = get_object_or_404(Interview, pk=pk)
    serializer = InterviewSerializer(interview)
    return Response(serializer.data)


# ---------------- candidate: start an attempt ----------------
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def start_interview_attempt(request, pk):
    interview = get_object_or_404(Interview, pk=pk)
    # optionally check eligibility / schedule
    attempt = InterviewAttempt.objects.create(
        interview=interview,
        candidate=request.user,
        started_at=timezone.now(),
        answers={},  # empty until submission
    )
    return Response(InterviewAttemptSerializer(attempt).data, status=status.HTTP_201_CREATED)


# ---------------- candidate: submit attempt ----------------
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def submit_interview_attempt(request, attempt_id):
    attempt = get_object_or_404(InterviewAttempt, pk=attempt_id, candidate=request.user)
    answers = request.data.get('answers') or {}
    attempt.answers = answers

    # simple scoring: compare submitted answers to question.answer where set
    questions = InterviewQuestion.objects.filter(interview=attempt.interview)
    if not questions.exists():
        # no questions -> 0 score
        attempt.score = 0
        attempt.passed = False
    else:
        total = 0
        correct = 0
        qmap = {str(q.id): q for q in questions}
        for qid, qobj in qmap.items():
            total += 1
            submitted = answers.get(qid)
            if submitted is None:
                continue
            if qobj.answer is not None and str(submitted).strip().lower() == str(qobj.answer).strip().lower():
                correct += 1
        score_percent = (correct / total * 100) if total else 0.0
        attempt.score = round(score_percent, 2)
        attempt.passed = attempt.score >= (attempt.interview.passing_percent or 0)

    attempt.finished_at = timezone.now()
    attempt.save()
    return Response(InterviewAttemptSerializer(attempt).data)





# ---------------- recruiter: list attempts for interview ----------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def recruiter_list_attempts(request, pk):
    if not is_recruiter(request.user):
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
    interview = get_object_or_404(Interview, pk=pk, created_by=request.user)
    attempts = InterviewAttempt.objects.filter(interview=interview).order_by('-finished_at')
    serializer = InterviewAttemptSerializer(attempts, many=True)
    return Response(serializer.data)