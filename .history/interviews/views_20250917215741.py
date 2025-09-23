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
        return user.profile.role == 'recruiter'
    except Exception:
        return False

def _detect_user_fk_field():
    """
    Return the name of the FK field on Interview that points to the user model.
    Common names: 'created_by', 'recruiter', 'owner'.
    Returns None if none found.
    """
    from django.conf import settings
    user_model_name = settings.AUTH_USER_MODEL.split('.')[-1]  # e.g. 'User'
    for f in Interview._meta.get_fields():
        # look for ForeignKey to User
        related = getattr(f, 'related_model', None)
        if related and related.__name__ == user_model_name:
            return f.name
    # fallbacks
    for candidate in ('created_by','recruiter','owner'):
        if candidate in [fld.name for fld in Interview._meta.get_fields()]:
            return candidate
    return None

USER_FK_FIELD = ''


# Recruiter: list/create interviews
@api_view(['GET','POST'])
@permission_classes([IsAuthenticated])
def recruiter_create_list_interviews(request):
    if not is_recruiter(request.user):
        return Response({"detail":"Forbidden"}, status=403)

    if request.method == 'GET':
        # filter by detected FK
        if USER_FK_FIELD:
            qs = Interview.objects.filter(**{USER_FK_FIELD: request.user}).order_by('-created_at')
        else:
            qs = Interview.objects.none()
        serializer = InterviewSerializer(qs, many=True)
        return Response(serializer.data)

    # POST -> create interview
    serializer = InterviewCreateUpdateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)

    if not USER_FK_FIELD:
        return Response({"detail":"Interview model has no FK linking to user (created_by/recruiter). Check model."}, status=500)

    # Save by setting the correct FK field to current user to avoid IntegrityError
    save_kwargs = { USER_FK_FIELD: request.user }
    instance = serializer.save(**save_kwargs)
    return Response(InterviewSerializer(instance).data, status=201)


# Recruiter: retrieve / update / delete interview
@api_view(['GET','PATCH','PUT','DELETE'])
@permission_classes([IsAuthenticated])
def recruiter_retrieve_update_delete_interview(request, pk):
    if not is_recruiter(request.user):
        return Response({"detail":"Forbidden"}, status=403)

    # ensure recruiter only accesses their own interviews
    if USER_FK_FIELD:
        lookup = { 'pk': pk, USER_FK_FIELD: request.user }
        interview = get_object_or_404(Interview, **lookup)
    else:
        return Response({"detail":"Server misconfigured: no recruiter FK found on Interview."}, status=500)

    if request.method == 'GET':
        return Response(InterviewSerializer(interview).data)

    if request.method in ('PUT','PATCH'):
        partial = (request.method == 'PATCH')
        serializer = InterviewCreateUpdateSerializer(interview, data=request.data, partial=partial)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)
        # do NOT allow changing recruiter via save; set the same FK again
        instance = serializer.save(**{USER_FK_FIELD: request.user})
        return Response(InterviewSerializer(instance).data)

    # DELETE
    interview.delete()
    return Response(status=204)


# Recruiter: add questions in bulk
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def recruiter_add_questions(request, pk):
    if not is_recruiter(request.user):
        return Response({"detail":"Forbidden"}, status=403)
    if not USER_FK_FIELD:
        return Response({"detail":"Server misconfigured: no recruiter FK found on Interview."}, status=500)

    interview = get_object_or_404(Interview, pk=pk, **{USER_FK_FIELD: request.user})
    questions = request.data.get('questions') or []
    created = []
    for q in questions:
        # expected fields: question_text, question_type, choices, answer, difficulty, topic
        q['interview'] = interview.id
        serializer = InterviewQuestionSerializer(data=q)
        if serializer.is_valid():
            serializer.save()
            created.append(serializer.data)
        else:
            return Response({"detail":"Invalid question payload","errors":serializer.errors}, status=400)
    return Response({"created": created}, status=201)


# Candidate: list public interviews
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_public_interviews(request):
    qs = Interview.objects.filter(is_active=True).order_by('-scheduled_at')  # filter active by default
    serializer = InterviewSerializer(qs, many=True)
    return Response(serializer.data)


# Candidate: get single interview + questions
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_interview_detail(request, pk):
    interview = get_object_or_404(Interview, pk=pk, is_active=True)
    return Response(InterviewSerializer(interview).data)


# Candidate: start attempt
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def start_interview_attempt(request, pk):
    interview = get_object_or_404(Interview, pk=pk, is_active=True)
    attempt = InterviewAttempt.objects.create(
        interview=interview,
        candidate=request.user,
        started_at=timezone.now(),
        answers={},
    )
    return Response(InterviewAttemptSerializer(attempt).data, status=201)


# Candidate: submit attempt
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def submit_interview_attempt(request, attempt_id):
    attempt = get_object_or_404(InterviewAttempt, pk=attempt_id, candidate=request.user)
    answers = request.data.get('answers') or {}
    attempt.answers = answers

    # scoring: compare against question.answer where available
    questions = InterviewQuestion.objects.filter(interview=attempt.interview)
    qmap = { str(q.id): q for q in questions }
    total = len(qmap)
    correct = 0
    for qid, qobj in qmap.items():
        submitted = answers.get(qid)
        if submitted is None: continue
        if qobj.answer is not None and str(submitted).strip().lower() == str(qobj.answer).strip().lower():
            correct += 1

    score_percent = (correct / total * 100) if total else 0.0
    attempt.score = round(score_percent, 2)
    attempt.passed = attempt.score >= (attempt.interview.passing_percent or 0)
    attempt.finished_at = timezone.now()
    attempt.save()
    return Response(InterviewAttemptSerializer(attempt).data)


# Recruiter: list attempts for interview
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def recruiter_list_attempts(request, pk):
    if not is_recruiter(request.user):
        return Response({"detail":"Forbidden"}, status=403)
    if not USER_FK_FIELD:
        return Response({"detail":"Server misconfigured: no recruiter FK found on Interview."}, status=500)

    interview = get_object_or_404(Interview, pk=pk, **{USER_FK_FIELD: request.user})
    attempts = InterviewAttempt.objects.filter(interview=interview).order_by('-finished_at')
    serializer = InterviewAttemptSerializer(attempts, many=True)
    return Response(serializer.data)