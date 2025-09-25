# interviews/views.py
from django.shortcuts import get_object_or_404, render, redirect
from django.utils import timezone
from django.apps import apps
from django.db import transaction
from datetime import timedelta
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
# import models & serializers from this app
from .models import Interview, InterviewQuestion, InterviewAttempt, InterviewInvite
from .serializers import (
    InterviewSerializer,
    InterviewCreateUpdateSerializer,
    InterviewCreateSerializer,
    InterviewQuestionSerializer,
    InterviewQuestionReviewSerializer,
    InterviewAttemptSerializer,
    InterviewInviteSerializer,
)

# tasks (optional)
from .tasks import generate_questions_task, send_invite_notification

# dynamic Job model (if using resumes app)
Job = apps.get_model('resumes', 'Job')
User = get_user_model()


# ----------------- Helpers -----------------
def is_recruiter(user):
    try:
        return getattr(user, 'is_staff', False) or getattr(user, 'is_recruiter', False) or getattr(getattr(user, 'profile', None), 'role', '') == 'recruiter'
    except Exception:
        return False
    
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def recruiter_create_interview_for_job(request, job_pk):
    """
    POST /api/interviews/recruiter/<job_pk>/create/
    Body example (JSON):
    {
      "title": "Onsite Interview - Backend",
      "description": "Round 1 technical",
      "scheduled_at": "2025-09-25T10:00:00Z",
      "duration_minutes": 45,
      "mode": "online",
      "is_active": true,
      "passing_percent": 60
    }
    """
    if not is_recruiter(request.user):
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    job = get_object_or_404(Job, pk=job_pk)

    data = request.data.copy()
    data['job'] = job.pk

    serializer = InterviewCreateSerializer(data=data, context={'request': request})
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    # If Interview model has created_by field, set it; otherwise just save.
    field_names = [f.name for f in Interview._meta.get_fields()]
    if 'created_by' in field_names:
        instance = serializer.save(created_by=request.user)
    else:
        instance = serializer.save()

    out = InterviewCreateSerializer(instance, context={'request': request})
    return Response(out.data, status=status.HTTP_201_CREATED)



# ----------------- Recruiter: create / list interviews -----------------
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def recruiter_create_list_interviews(request):
    if not is_recruiter(request.user):
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    if request.method == 'GET':
        qs = Interview.objects.filter(created_by=request.user) if hasattr(Interview, 'created_by') else Interview.objects.all()
        serializer = InterviewSerializer(qs, many=True, context={'request': request})
        return Response(serializer.data)

    serializer = InterviewCreateUpdateSerializer(data=request.data, context={'request': request})
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    fk_field = None
    model_field_names = [f.name for f in Interview._meta.get_fields()]
    if 'created_by' in model_field_names:
        fk_field = 'created_by'
    elif 'recruiter' in model_field_names:
        fk_field = 'recruiter'
    if not fk_field:
        for f in Interview._meta.get_fields():
            if getattr(f, 'related_model', None) and f.related_model == request.user.__class__:
                fk_field = f.name
                break

    save_kwargs = {fk_field: request.user} if fk_field else {}
    instance = serializer.save(**save_kwargs) if save_kwargs else serializer.save()
    out = InterviewSerializer(instance, context={'request': request})
    return Response(out.data, status=status.HTTP_201_CREATED)


# ----------------- Recruiter: retrieve / update / delete interview -----------------
@api_view(['GET', 'PATCH', 'PUT', 'DELETE'])
@permission_classes([IsAuthenticated])
def recruiter_retrieve_update_delete_interview(request, pk):
    if not is_recruiter(request.user):
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    lookup = {'pk': pk}
    if hasattr(Interview, 'created_by'):
        lookup['created_by'] = request.user

    interview = get_object_or_404(Interview, **lookup)

    if request.method == 'GET':
        return Response(InterviewSerializer(interview, context={'request': request}).data)

    if request.method in ('PUT', 'PATCH'):
        partial = (request.method == 'PATCH')
        serializer = InterviewCreateUpdateSerializer(interview, data=request.data, partial=partial, context={'request': request})
        serializer.is_valid(raise_exception=True)
        interview = serializer.save()
        return Response(InterviewSerializer(interview, context={'request': request}).data)

    interview.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ----------------- Recruiter: add/list questions for interview -----------------
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def recruiter_add_questions(request, pk):
    if not is_recruiter(request.user):
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
    interview = get_object_or_404(Interview, pk=pk, created_by=request.user)
    if request.method == 'GET':
        qs = InterviewQuestion.objects.filter(interview=interview).order_by('-id')
        serializer = InterviewQuestionSerializer(qs, many=True, context={'request': request})
        return Response(serializer.data)

    many = isinstance(request.data, list)
    serializer = InterviewQuestionSerializer(data=request.data, many=many, context={'request': request, 'interview': interview})
    serializer.is_valid(raise_exception=True)
    saved = serializer.save()
    out = InterviewQuestionSerializer(saved, many=many, context={'request': request})
    return Response(out.data, status=status.HTTP_201_CREATED)


# ----------------- Candidate: list public/scheduled interviews -----------------
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_public_interviews(request):
    qs = Interview.objects.filter(is_active=True).order_by('-scheduled_at')
    serializer = InterviewSerializer(qs, many=True, context={'request': request})
    return Response(serializer.data)


# ----------------- Candidate: get interview detail -----------------
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_interview_detail(request, pk):
    interview = get_object_or_404(Interview, pk=pk)
    serializer = InterviewSerializer(interview, context={'request': request})
    return Response(serializer.data)


# ----------------- Candidate: start an attempt (API) -----------------
import logging
from datetime import timedelta
# ... other imports at top of file

logger = logging.getLogger(__name__)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def start_interview_attempt(request, pk):
    """
    Start (or resume) an interview attempt.
    - POST /api/interviews/start/<pk>/
    - Optional body: {"invite": <invite_id>}
    Returns: { ok, attempt_id, created, duration_minutes, questions: [...] }
    """
    interview = get_object_or_404(Interview, pk=pk)

    # duration fallback
    duration = getattr(interview, 'duration_minutes', None) or 60

    # resolve invite if provided
    invite_id = None
    try:
        invite_id = request.data.get('invite')
    except Exception:
        invite_id = None

    invite_obj = None
    if invite_id:
        try:
            invite_obj = InterviewInvite.objects.get(pk=invite_id)
            if not invite_obj.interview or invite_obj.interview.id != interview.id:
                invite_obj = None
            elif invite_obj.candidate and invite_obj.candidate != request.user:
                invite_obj = None
        except InterviewInvite.DoesNotExist:
            invite_obj = None

    # scheduled start/end resolution
    scheduled_start = None
    if invite_obj and getattr(invite_obj, 'scheduled_at', None):
        scheduled_start = invite_obj.scheduled_at

    for fname in ('scheduled_at', 'start_time', 'scheduled_start', 'starts_at'):
        if not scheduled_start and hasattr(interview, fname):
            scheduled_start = getattr(interview, fname) or scheduled_start

    scheduled_end = None
    for fname in ('end_time', 'scheduled_end', 'ends_at'):
        if hasattr(interview, fname):
            scheduled_end = getattr(interview, fname) or scheduled_end

    if not scheduled_end and scheduled_start:
        try:
            scheduled_end = scheduled_start + timedelta(minutes=int(duration))
        except Exception:
            scheduled_end = None

    now = timezone.now()

    # dev bypass
    if request.user.is_staff and request.GET.get('force') == '1':
        scheduled_start = None

    if scheduled_start and now < scheduled_start:
        return Response({'detail': 'Cannot start before scheduled time', 'scheduled_start': scheduled_start.isoformat()}, status=status.HTTP_403_FORBIDDEN)
    if scheduled_end and now > scheduled_end:
        return Response({'detail': 'Interview window closed'}, status=status.HTTP_400_BAD_REQUEST)

    # create/get attempt safely
    try:
        with transaction.atomic():
            attempt, created = InterviewAttempt.objects.get_or_create(
                interview=interview,
                candidate=request.user,
                defaults={'started_at': timezone.now(), 'answers': {}}
            )
    except InterviewAttempt.MultipleObjectsReturned:
        attempt = InterviewAttempt.objects.filter(interview=interview, candidate=request.user).order_by('-started_at').first()
        created = False

    # select questions: prefer published if field exists, else all
    try:
        qs = InterviewQuestion.objects.filter(interview=interview)
        if hasattr(InterviewQuestion, 'status'):
            qs_pub = qs.filter(status__in=['published', 'live'])
            if qs_pub.exists():
                qs = qs_pub
        total_q = qs.count()
        select_n = min(25, total_q) if total_q else 0
        # sample random if many, else order by id desc
        questions = list(qs.order_by('?')[:select_n]) if select_n > 0 else []
    except Exception as e:
        logger.exception("Question selection failed: %s", e)
        questions = []

    # build JSON-safe snapshot
    questions_out = []
    for q in questions:
        qitem = {
            "id": getattr(q, 'id', None),
            "prompt": getattr(q, 'prompt', getattr(q, 'text', '')),
            "kind": getattr(q, 'kind', getattr(q, 'question_type', 'mcq')),
        }
        # choices if available (avoid leaking correct answer field name)
        try:
            choices = getattr(q, 'choices', None)
            if choices:
                qitem['choices'] = choices
        except Exception:
            pass
        questions_out.append(qitem)

    # try to persist snapshot on attempt if field exists
    try:
        if hasattr(attempt, 'question_snapshot'):
            attempt.question_snapshot = questions_out
            attempt.started_at = timezone.now()
            attempt.save(update_fields=['question_snapshot', 'started_at'])
    except Exception:
        try:
            attempt.started_at = timezone.now()
            attempt.save(update_fields=['started_at'])
        except Exception:
            pass

    out = {
        'ok': True,
        'attempt_id': attempt.id,
        'created': bool(created),
        'duration_minutes': duration,
        'questions': questions_out,
    }
    return Response(out, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)












# ----------------- Candidate: submit attempt -----------------
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def submit_interview_attempt(request, attempt_id):
    attempt = get_object_or_404(InterviewAttempt, pk=attempt_id, candidate=request.user)
    answers = request.data.get('answers') or {}
    attempt.answers = answers

    questions = InterviewQuestion.objects.filter(interview=attempt.interview)
    if not questions.exists():
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
    attempt.save(update_fields=['answers', 'score', 'passed', 'finished_at'])
    return Response(InterviewAttemptSerializer(attempt, context={'request': request}).data)


# ----------------- Recruiter: list attempts for interview -----------------
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def recruiter_list_attempts(request, pk):
    if not is_recruiter(request.user):
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
    interview = get_object_or_404(Interview, pk=pk, created_by=request.user)
    attempts = InterviewAttempt.objects.filter(interview=interview).order_by('-finished_at')
    serializer = InterviewAttemptSerializer(attempts, many=True, context={'request': request})
    return Response(serializer.data)


# ----------------- Recruiter: generate questions (async task) -----------------
# in interviews/views.py
from django.conf import settings
from .tasks import generate_questions_task, generate_questions_task as gen_sync  # task is callable

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def generate_questions_view(request, pk):
    if not is_recruiter(request.user):
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
    interview = get_object_or_404(Interview, pk=pk, created_by=request.user)

    n_questions = int(request.data.get('n_questions', 25))
    auto_publish = bool(request.data.get('auto_publish', False))
    params = request.data.get('params', {}) or {}

    # Try to enqueue as Celery task
    try:
        task = generate_questions_task.delay(interview.id, request.user.id, params, n_questions, auto_publish)
        return Response({"detail": "Generation started", "task_id": task.id}, status=status.HTTP_202_ACCEPTED)
    except Exception as e:
        # fallback: call sync if Celery not available (useful for local dev)
        try:
            # call task function synchronously
            result = generate_questions_task(interview.id, request.user.id, params, n_questions, auto_publish)
            return Response({"detail": "Generation completed (sync fallback)", "result": result}, status=status.HTTP_200_OK)
        except Exception as e2:
            return Response({"detail": "Failed to generate questions", "error": str(e2)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)



# ----------------- Recruiter: single question detail & review -----------------
@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def recruiter_question_detail(request, interview_pk, q_pk):
    if not is_recruiter(request.user):
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    interview = get_object_or_404(Interview, pk=interview_pk, created_by=request.user)
    question = get_object_or_404(InterviewQuestion, pk=q_pk, interview=interview)

    if request.method == 'GET':
        serializer = InterviewQuestionSerializer(question, context={'request': request})
        return Response(serializer.data)

    serializer = InterviewQuestionReviewSerializer(question, data=request.data, partial=True, context={'request': request})
    serializer.is_valid(raise_exception=True)
    serializer.save()
    if serializer.validated_data.get('status') == 'published' and not question.created_by:
        question.created_by = request.user
        question.save(update_fields=['created_by'])
    return Response(InterviewQuestionSerializer(question, context={'request': request}).data)


# ----------------- Recruiter: bulk review -----------------
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def recruiter_review_bulk(request, pk):
    if not is_recruiter(request.user):
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    interview = get_object_or_404(Interview, pk=pk, created_by=request.user)
    approve_ids = request.data.get('approve', []) or []
    reject_ids = request.data.get('reject', []) or []
    publish = bool(request.data.get('publish', True))

    results = {"approved": [], "rejected": [], "skipped": []}
    with transaction.atomic():
        if approve_ids:
            qs = InterviewQuestion.objects.filter(pk__in=approve_ids, interview=interview)
            for q in qs:
                q.status = 'published' if publish else 'pending_review'
                q.created_by = request.user
                q.save(update_fields=['status', 'created_by', 'updated_at'])
                results['approved'].append(q.id)
        if reject_ids:
            qs2 = InterviewQuestion.objects.filter(pk__in=reject_ids, interview=interview)
            for q in qs2:
                q.status = 'rejected'
                q.save(update_fields=['status', 'updated_at'])
                results['rejected'].append(q.id)
    return Response(results)


# ----------------- Recruiter: invite candidate for job -----------------
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def recruiter_invite_candidate_by_job(request, job_pk):
    if not is_recruiter(request.user):
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    job = get_object_or_404(Job, pk=job_pk)

    # Normalize/validate candidate_id
    candidate_id_raw = request.data.get('candidate_id')
    if candidate_id_raw in (None, '', []):
        return Response({"candidate_id": ["This field is required."]}, status=status.HTTP_400_BAD_REQUEST)

    try:
        candidate_id = int(candidate_id_raw)
    except (TypeError, ValueError):
        return Response({"candidate_id": ["Invalid candidate id (must be integer)"]}, status=status.HTTP_400_BAD_REQUEST)

    scheduled_at = request.data.get('scheduled_at', None)
    message = request.data.get('message', 'You are invited for an interview')

    # fetch candidate user
    try:
        candidate = get_object_or_404(User, pk=candidate_id)
    except Exception:
        return Response({"candidate_id": ["Candidate not found"]}, status=status.HTTP_404_NOT_FOUND)

    # optional: prevent inviting yourself
    if candidate == request.user:
        return Response({"detail": "Cannot invite yourself"}, status=status.HTTP_400_BAD_REQUEST)

    # find or create an interview for this job (same as before)
    interview = Interview.objects.filter(job=job).order_by('-id').first()
    if interview is None:
        interview = Interview.objects.create(
            job=job,
            title=f"Interview for {job.title}",
            description=f"Auto-created interview for job {job.title}",
            scheduled_at=scheduled_at or None,
            duration_minutes=45,
            created_by=request.user if hasattr(Interview, 'created_by') else None,
            is_active=True,
        )

    invite = InterviewInvite.objects.create(
        interview=interview,
        candidate=candidate,
        scheduled_at=scheduled_at or None,
        message=message,
        sent_at=timezone.now(),
    )
    
    # if request gave resume_id, try that too
    # resume_id = request.data.get('resume_id')
candidate = None
if 'candidate_id' in locals() and candidate_id:
    try:
        candidate = User.objects.get(pk=candidate_id)
    except User.DoesNotExist:
        candidate = None

if not candidate and resume_id:
    Resume = apps.get_model('resumes', 'Resume')
    resume = Resume.objects.filter(pk=resume_id).first()
    if resume:
        candidate = getattr(resume, 'user', None) or getattr(resume, 'candidate', None)
if not candidate:
    return Response({"candidate_id": ["Candidate not found"]}, status=status.HTTP_404_NOT_FOUND)


    # enqueue notification task (best-effort)
    try:
        send_invite_notification.delay(invite.id)
    except Exception:
        logger.exception("Failed to enqueue invite notification")

    serializer = InterviewInviteSerializer(invite, context={'request': request})
    return Response(serializer.data, status=status.HTTP_201_CREATED)



# ----------------- Candidate: list invites -----------------
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def candidate_invites(request):
    # debug info: what server user is
    user_id = getattr(request.user, 'id', None)
    invites_qs = InterviewInvite.objects.filter(candidate=request.user).select_related('interview').order_by('-created_at')
    serializer = InterviewInviteSerializer(invites_qs, many=True, context={'request': request})
    data = serializer.data
    return Response({
        'debug_user_id': user_id,
        'invites_count': invites_qs.count(),
        'invites': data
    })



# ----------------- Candidate: respond to invite -----------------
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def candidate_invite_respond(request, invite_id):
    try:
        invite = InterviewInvite.objects.get(pk=invite_id, candidate=request.user)
    except InterviewInvite.DoesNotExist:
        return Response({"detail": "Invite not found"}, status=status.HTTP_404_NOT_FOUND)

    raw = request.data or {}
    val = None
    for k in ('response', 'action', 'answer', 'reply'):
        if k in raw:
            val = raw.get(k)
            break

    if not val and isinstance(request.data, str):
        val = request.data

    if not val:
        return Response({"detail": "Missing response (use 'response' or 'action')"}, status=status.HTTP_400_BAD_REQUEST)

    val = str(val).strip().lower()
    if val in ('accept', 'accepted', 'yes'):
        invite.status = 'accepted'
        invite.save(update_fields=['status', 'updated_at'])
        return Response({"detail": "accepted"}, status=status.HTTP_200_OK)
    elif val in ('decline', 'declined', 'no'):
        invite.status = 'declined'
        invite.save(update_fields=['status', 'updated_at'])
        return Response({"detail": "declined"}, status=status.HTTP_200_OK)
    else:
        return Response({"detail": "Invalid response value"}, status=status.HTTP_400_BAD_REQUEST)


# ----------------- HTMX fragment for an invite row (optional) -----------------
def invite_row_fragment(request, invite_id):
    invite = get_object_or_404(InterviewInvite, pk=invite_id)
    return render(request, 'interviews/fragments/invite_row.html', {'invite': invite})


# ----------------- HTMX modal for recruiter invite UI (optional) -----------------
@login_required
def interview_invite_modal(request, pk):
    interview = get_object_or_404(Interview, pk=pk, created_by=request.user)
    return render(request, 'interviews/fragments/invite_modal.html', {'interview': interview})


# ----------------- Simple candidate page render -----------------

def candidate_interview_page(request, pk):
    return render(request, "candidate_interview.html", {"interview_id": pk})



# interviews/views.py (update)
def recruiter_review_page(request):
    return render(request, "recruiter_review.html", {
        "initial_job": request.GET.get("job", ""),
        "initial_interview": request.GET.get("interview", ""),
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def reset_attempt(request, attempt_id):
    attempt = get_object_or_404(InterviewAttempt, pk=attempt_id)
    # optional: only recruiter allowed
    if not is_recruiter(request.user):
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    attempt.delete()
    return Response({"detail": "Attempt reset"}, status=status.HTTP_200_OK)


# views.py
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def autosave_attempt(request, attempt_id):
    attempt = get_object_or_404(InterviewAttempt, pk=attempt_id, candidate=request.user)
    payload = request.data or {}
    answers = payload.get('answers') or {}
    attempt.answers = attempt.answers or {}
    # Merge partial answers (client takes precedence)
    attempt.answers.update(answers)
    attempt.last_saved_at = timezone.now()
    # optional: save a 'flag_log' list in attempt.meta for events
    attempt.save(update_fields=['answers', 'last_saved_at'])
    return Response({"ok": True, "saved_at": attempt.last_saved_at})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def attempt_events(request, attempt_id):
    attempt = get_object_or_404(InterviewAttempt, pk=attempt_id, candidate=request.user)
    events = request.data.get('events', []) or []
    # store events in attempt.meta or a related model
    meta = getattr(attempt, 'meta', {}) or {}
    meta.setdefault('events', []).extend(events)
    attempt.meta = meta
    # evaluate: if visibility changes > N times, mark flagged
    vis_count = sum(1 for e in meta['events'] if e['type']=='visibilitychange' and e['info'].get('state')!='visible')
    if vis_count > 3:
        attempt.flagged = True
        # optionally notify recruiter via email/task
    attempt.save()
    return Response({'ok': True})


