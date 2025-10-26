# interviews/views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.apps import apps
from djan

from quiz.models import Question

from .models import Interview, InterviewQuestion, InterviewAttempt
from .serializers import (
    InterviewSerializer,
    InterviewCreateUpdateSerializer,
    InterviewQuestionSerializer,
    InterviewAttemptSerializer,
)

# dynamic Job load (if you need it in views)
Job = apps.get_model('resumes', 'Job')


# views.py (snippet)
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404

from .models import Interview, InterviewQuestion, InterviewAttempt
from .serializers import InterviewSerializer, InterviewCreateUpdateSerializer

def is_recruiter(user):
    try:
        return user.profile.role == 'recruiter'
    except Exception:
        return False

@api_view(['GET','POST'])
@permission_classes([IsAuthenticated])
def recruiter_create_list_interviews(request):
    if not is_recruiter(request.user):
        return Response({"detail":"Forbidden"}, status=403)

    if request.method == 'GET':
        qs = Interview.objects.filter(created_by=request.user) if hasattr(Interview, 'created_by') else Interview.objects.filter(recruiter=request.user)
        serializer = InterviewSerializer(qs, many=True)
        return Response(serializer.data)

    # POST: use create/update serializer and explicitly set the FK to the recruiter user
    serializer = InterviewCreateUpdateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)

    # determine which FK name exists on the model
    fk_field = None
    model_field_names = [f.name for f in Interview._meta.get_fields()]
    for candidate in ('created_by'):
        if candidate in model_field_names:
            # if it's created_by_id in fields list, real field name likely 'created_by'
            fk_field = candidate if candidate != 'created_by_id' else 'created_by'
            break
    # Fallback: try to find a ForeignKey to user model
    if not fk_field:
        for f in Interview._meta.get_fields():
            if getattr(f, 'related_model', None) and f.related_model.__name__ == request.user.__class__.__name__:
                fk_field = f.name
                break

    if not fk_field:
        # if still not found, fail early (prevents DB integrity error)
        return Response({"detail":"Interview model has no FK to user (created_by/recruiter). Check model."}, status=500)

    # Save with correct FK name
    save_kwargs = { fk_field: request.user }
    instance = serializer.save(**save_kwargs)

    # Return full serialized data
    return Response(InterviewSerializer(instance).data, status=201)


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
# interviews/views.py
@api_view(['GET','POST'])
@permission_classes([IsAuthenticated])
def recruiter_add_questions(request, pk):
    if not is_recruiter(request.user):
        return Response({"detail":"Forbidden"}, status=403)

    interview = get_object_or_404(Interview, pk=pk, created_by=request.user)

    if request.method == 'GET':
        qs = InterviewQuestion.objects.filter(interview=interview).order_by('-id')
        serializer = InterviewQuestionSerializer(qs, many=True)
        return Response(serializer.data)

    # POST
    many = isinstance(request.data, list)
    # pass interview in context so serializer uses it for create()
    serializer = InterviewQuestionSerializer(data=request.data, many=many, context={'request': request, 'interview': interview})
    serializer.is_valid(raise_exception=True)

    # IMPORTANT: do NOT pass interview as kwarg here to avoid double-passing
    saved = serializer.save()   # create() will use context['interview']
    # saved will be a model instance or list of instances

    # return created objects
    if many:
        # serializer.data reflects created objects only after re-serializing them
        out_serializer = InterviewQuestionSerializer(saved, many=True)
        return Response(out_serializer.data, status=status.HTTP_201_CREATED)
    else:
        out_serializer = InterviewQuestionSerializer(saved)
        return Response(out_serializer.data, status=status.HTTP_201_CREATED)


    


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
    # only recruiter allowed
    if not is_recruiter(request.user):
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    # fetch interview instance and ensure ownership
    interview = get_object_or_404(Interview, pk=pk, created_by=request.user)

    # list attempts for that interview (use interview_id to avoid any lookup confusion)
    attempts = InterviewAttempt.objects.filter(interview_id=interview.id).order_by('-finished_at')

    serializer = InterviewAttemptSerializer(attempts, many=True)
    return Response(serializer.data)


from .tasks import generate_questions_task
from rest_framework import status

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def generate_questions_view(request, pk):
    # recruiter only
    if not is_recruiter(request.user):
        return Response({"detail":"Forbidden"}, status=status.HTTP_403_FORBIDDEN)
    interview = get_object_or_404(Interview, pk=pk, created_by=request.user)

    params = request.data.get('params', {})  # optional: topics, level
    n_questions = int(request.data.get('n_questions', 5))
    auto_publish = bool(request.data.get('auto_publish', False))

    # enqueue
    task = generate_questions_task.delay(interview.id, request.user.id, params, n_questions, auto_publish)
    return Response({"detail":"Generation started", "task_id": task.id}, status=status.HTTP_202_ACCEPTED)



from django.db import transaction
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from .models import Interview, InterviewQuestion
from .serializers import InterviewQuestionSerializer, InterviewQuestionReviewSerializer

# single question edit / approve endpoint
@api_view(['GET','PATCH'])
@permission_classes([IsAuthenticated])
def recruiter_question_detail(request, interview_pk, q_pk):
    # ensure recruiter
    if not is_recruiter(request.user):
        return Response({"detail":"Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    interview = get_object_or_404(Interview, pk=interview_pk, created_by=request.user)
    question = get_object_or_404(InterviewQuestion, pk=q_pk, interview=interview)

    if request.method == 'GET':
        serializer = InterviewQuestionSerializer(question)
        return Response(serializer.data)

    # PATCH: update fields + possibly change status
    serializer = InterviewQuestionReviewSerializer(question, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    # mark who edited/approved (optional)
    if serializer.validated_data.get('status') == 'published' and question.created_by is None:
        question.created_by = request.user
        question.save(update_fields=['created_by'])
    return Response(InterviewQuestionSerializer(question).data)


# bulk approve/reject endpoint
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def recruiter_review_bulk(request, pk):
    """
    Body example:
    {
      "approve": [10, 11],
      "reject": [12],
      "publish": true   # optional: if true set status 'published', else 'pending_review' (default)
    }
    """
    if not is_recruiter(request.user):
        return Response({"detail":"Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    interview = get_object_or_404(Interview, pk=pk, created_by=request.user)

    approve_ids = request.data.get('approve', []) or []
    reject_ids = request.data.get('reject', []) or []
    publish = bool(request.data.get('publish', True))

    results = {"approved": [], "rejected": [], "skipped": []}

    with transaction.atomic():
        # Approve loop
        if approve_ids:
            qs = InterviewQuestion.objects.filter(pk__in=approve_ids, interview=interview)
            for q in qs:
                q.status = 'published' if publish else 'pending_review'
                q.created_by = request.user
                q.save(update_fields=['status','created_by','updated_at'])

                results['approved'].append(q.id)

        if reject_ids:
            qs2 = InterviewQuestion.objects.filter(pk__in=reject_ids, interview=interview)
            for q in qs2:
                q.status = 'rejected'
                q.save(update_fields=['status','updated_at'])
                results['rejected'].append(q.id)

    # note: any ids not found are ignored; you could return them as skipped if needed
    return Response(results, status=status.HTTP_200_OK)


from django.shortcuts import render


@login_required
def recruiter_questions_page(request, pk):
    interview = get_object_or_404(Interview, pk=pk, created_by=request.user)
    questions = interview.questions.all().order_by('-id')
    return render(request, "interviews/recruiter_questions.html", {
        "interview": interview,
        "questions": questions,
    })



