# interviews/views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from django.utils import timezone

from .models import Interview, InterviewQuestion, InterviewAttempt
from .serializers import (
    InterviewSerializer,
    InterviewCreateUpdateSerializer,
    InterviewQuestionSerializer,
    InterviewAttemptSerializer,
)

def is_recruiter(user):
    try:
        return getattr(user, 'profile', None) and user.profile.role == 'recruiter'
    except Exception:
        return False

# recruiter: list/create
@api_view(['GET','POST'])
@permission_classes([IsAuthenticated])
def recruiter_create_list_interviews(request):
    if not is_recruiter(request.user):
        return Response({"detail":"Forbidden"}, status=403)

    if request.method == 'GET':
        qs = Interview.objects.filter(created_by=request.user).order_by('-created_at')
        serializer = InterviewSerializer(qs, many=True)
        return Response(serializer.data)

    # POST: create -> use create/update serializer and set created_by
    serializer = InterviewCreateUpdateSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save(created_by=request.user)
        return Response(InterviewSerializer(serializer.instance).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# recruiter: retrieve / update / delete
@api_view(['GET','PATCH','PUT','DELETE'])
@permission_classes([IsAuthenticated])
def recruiter_retrieve_update_delete_interview(request, pk):
    if not is_recruiter(request.user):
        return Response({"detail":"Forbidden"}, status=403)

    interview = get_object_or_404(Interview, pk=pk, created_by=request.user)

    if request.method == 'GET':
        return Response(InterviewSerializer(interview).data)

    if request.method in ('PUT','PATCH'):
        partial = (request.method == 'PATCH')
        serializer = InterviewCreateUpdateSerializer(interview, data=request.data, partial=partial)
        if serializer.is_valid():
            serializer.save()  # created_by should remain unchanged
            return Response(InterviewSerializer(serializer.instance).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    if request.method == 'DELETE':
        interview.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# recruiter: add questions in bulk
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def recruiter_add_questions(request, pk):
    if not is_recruiter(request.user):
        return Response({"detail":"Forbidden"}, status=403)

    interview = get_object_or_404(Interview, pk=pk, created_by=request.user)
    questions = request.data.get('questions') or []
    created = []
    for q in questions:
        q['interview'] = interview.id
        serializer = InterviewQuestionSerializer(data=q)
        if serializer.is_valid():
            serializer.save()
            created.append(serializer.data)
        else:
            return Response({"detail":"Invalid question payload", "errors": serializer.errors}, status=400)
    return Response({"created": created}, status=201)


# candidate: list interviews (public or scheduled)
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_public_interviews(request):
    qs = Interview.objects.filter(is_active=True).order_by('-scheduled_at')
    serializer = InterviewSerializer(qs, many=True)
    return Response(serializer.data)


# candidate: get single interview + questions
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_interview_detail(request, pk):
    interview = get_object_or_404(Interview, pk=pk, is_active=True)
    serializer = InterviewSerializer(interview)
    return Response(serializer.data)


# candidate: start attempt
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def start_interview_attempt(request, pk):
    interview = get_object_or_404(Interview, pk=pk, is_active=True)
    attempt = InterviewAttempt.objects.create(
        interview=interview,
        candidate=request.user,
        answers={},
        started_at=timezone.now()
    )
    serializer = InterviewAttemptSerializer(attempt)
    return Response(serializer.data, status=201)


# candidate: submit attempt
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def submit_interview_attempt(request, attempt_id):
    attempt = get_object_or_404(InterviewAttempt, pk=attempt_id, candidate=request.user)
    answers = request.data.get('answers') or {}
    attempt.answers = answers

    # simple scoring
    questions = InterviewQuestion.objects.filter(interview=attempt.interview)
    total = questions.count()
    correct = 0
    qmap = {str(q.id): q for q in questions}
    for qid, qobj in qmap.items():
        submitted = answers.get(qid)
        if submitted is None:
            continue
        if qobj.answer and str(submitted).strip().lower() == str(qobj.answer).strip().lower():
            correct += 1

    score_percent = (correct / total * 100) if total else 0.0
    attempt.score = round(score_percent, 2)
    attempt.passed = attempt.score >= (attempt.interview.passing_percent or 0)
    attempt.finished_at = timezone.now()
    attempt.save()
    return Response(InterviewAttemptSerializer(attempt).data)


# recruiter: list attempts for interview
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def recruiter_list_attempts(request, pk):
    if not is_recruiter(request.user):
        return Response({"detail":"Forbidden"}, status=403)
    interview = get_object_or_404(Interview, pk=pk, created_by=request.user)
    attempts = InterviewAttempt.objects.filter(interview=interview).order_by('-finished_at')
    serializer = InterviewAttemptSerializer(attempts, many=True)
    return Response(serializer.data)