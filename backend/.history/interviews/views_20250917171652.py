# interviews/views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from .models import Interview, InterviewQuestion, InterviewAttempt
from .serializers import InterviewSerializer, InterviewCreateUpdateSerializer, InterviewAttemptSerializer, InterviewQuestionSerializer
from django.utils import timezone

# reuse your existing helper
def is_recruiter(user):
    try:
        return user.profile.role == 'recruiter'
    except Exception:
        return False

class RecruiterOnlyPermission(IsAuthenticated):
    def has_permission(self, request, view):
        ok = super().has_permission(request, view)
        return ok and is_recruiter(request.user)


class InterviewViewSet(viewsets.ModelViewSet):
    queryset = Interview.objects.all().select_related('created_by')
    serializer_class = InterviewSerializer
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action in ('create','update','partial_update'):
            return InterviewCreateUpdateSerializer
        return InterviewSerializer

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def get_queryset(self):
        qs = super().get_queryset()
        # recruiters see all, candidates see active only or related to them
        if is_recruiter(self.request.user):
            return qs
        # candidate: only active interviews or those linked to their jobs? adjust logic
        return qs.filter(is_active=True)

    # recruiter-only endpoints
    @action(detail=True, methods=['post'], permission_classes=[RecruiterOnlyPermission])
    def generate_questions(self, request, pk=None):
        interview = self.get_object()
        # call your LLM generator here — placeholder
        # questions = generate_interview_questions(interview.title, skills=..., count=5)
        # for now return empty
        return Response({"detail":"stub - integrate LLM here"}, status=200)

    @action(detail=True, methods=['get'], permission_classes=[IsAuthenticated])
    def attempts(self, request, pk=None):
        interview = self.get_object()
        qs = InterviewAttempt.objects.filter(interview=interview)
        # recruiter should see all, candidate only their own
        if not is_recruiter(request.user):
            qs = qs.filter(candidate=request.user)
        serializer = InterviewAttemptSerializer(qs, many=True)
        return Response(serializer.data)


# view to create attempt / submit attempt
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def start_attempt(request, interview_id):
    interview = get_object_or_404(Interview, pk=interview_id)
    # optionally check eligibility
    attempt = InterviewAttempt.objects.create(interview=interview, candidate=request.user, started_at=timezone.now())
    serializer = InterviewAttemptSerializer(attempt)
    return Response(serializer.data, status=201)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def submit_attempt(request, attempt_id):
    attempt = get_object_or_404(InterviewAttempt, pk=attempt_id)
    # only candidate or recruiter can submit/evaluate
    if request.user != attempt.candidate and not is_recruiter(request.user):
        return Response({'detail':'Forbidden'}, status=403)
    answers = request.data.get('answers')
    recording_url = request.data.get('recording_url')  # optional
    attempt.answers = answers or attempt.answers
    attempt.recording_url = recording_url or attempt.recording_url
    attempt.finished_at = timezone.now()
    # TODO: evaluate scoring (call AI) or simple scoring for mcq
    # Placeholder simple scoring for MCQs:
    total = 0
    correct = 0
    for q in attempt.interview.questions.all():
        total += 1
        qid = str(q.id)
        given = (answers or {}).get(qid)
        if q.type == 'mcq' and given and q.answer and str(given).strip().upper() == str(q.answer).strip().upper():
            correct += 1
    if total:
        score_percent = (correct/total) * 100
    else:
        score_percent = 0.0
    attempt.score = round(score_percent, 2)
    attempt.passed = attempt.score >= (attempt.interview.passing_percent or 0)
    attempt.evaluated_at = timezone.now()
    attempt.save()
    serializer = InterviewAttemptSerializer(attempt)
    return Response(serializer.data)