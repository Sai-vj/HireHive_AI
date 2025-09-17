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


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def submit_quiz_attempt(request, job_id):
    job = get_object_or_404(Job, pk=job_id)
    try:
        quiz = job.quiz
    except Quiz.DoesNotExist:
        return Response({"detail": "No quiz for this job"}, status=404)

    # ✅ check existing attempts for this candidate
    existing_attempts = QuizAttempt.objects.filter(quiz=quiz, candidate=request.user).count()
    MAX_ATTEMPTS = 3
    if existing_attempts >= MAX_ATTEMPTS:
        return Response(
            {"detail": f"Maximum {MAX_ATTEMPTS} attempts reached"},
            status=403
        )

    # answers from client: expected { "q1":"A", ... }
    answers = request.data.get('answers') or {}
    resume_id = request.data.get('resume_id')  # optional

    # create attempt
    attempt = QuizAttempt.objects.create(
        quiz=quiz,
        candidate=request.user,
        resume_id=resume_id or None
    )

    # scoring
    correct, total = 0, 0
    qmap = {}
    for q in quiz.questions_json or []:
        qid = q.get('id') or q.get('qid') or str(total+1)
        qmap[str(qid)] = q
        total += 1

    for qid, q in qmap.items():
        selected = answers.get(qid) or answers.get(str(qid))
        correct_answer = q.get('answer')
        if selected and correct_answer and str(selected).strip().upper() == str(correct_answer).strip().upper():
            correct += 1

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
    })
def upload_resume(request):
    if request.method == 'POST':
        form = ResumeForm(request.POST, request.FILES)
        if form.is_valid():
            resume = form.save()
            file_path = resume.file.path
            parsed = parse_resume(file_path)
            resume.skills = ", ".join(parsed["skills"])
            resume.save()
            return render(request, 'success.html', {"skills": parsed["skills"]})
    else:
        form = ResumeForm()
    return render(request, 'upload_resume.html', {'form': form})


from .models import Job, Resume
from .utils import match_jobs

def job_matches(request, resume_id):
    resume = Resume.objects.get(id=resume_id)
    jobs = Job.objects.all()
    user_skills = resume.skills.split(", ") if resume.skills else []

    matches = match_jobs(user_skills, jobs)

    return render(request, "job_matches.html", {"resume": resume, "matches": matches})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def list_quiz_attempts(request, job_id):
    job = get_object_or_404(Job, pk=job_id)
    quiz = getattr(job, 'quiz', None)
    if not quiz:
        return Response({"detail": "No quiz found"}, status=404)

    attempts = QuizAttempt.objects.filter(quiz=quiz, candidate=request.user).order_by('-started_at')
    serializer = QuizAttemptSerializer(attempts, many=True)
    return Response(serializer.data)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def quiz_attempts_for_job(request):
    job_id = request.query_params.get('job_id') or request.query_params.get('job')
    qs = QuizAttempt.objects.all()
    if job_id:
        qs = qs.filter(quiz__job_id=job_id)
    # restrict to current user when candidate: 
    qs = qs.filter(candidate=request.user)
    serializer = QuizAttemptSerializer(qs, many=True)
    return Response({'results': serializer.data})

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def recruiter_reset_attempts(request, job_id, candidate_id):
    """
    Recruiter-only: delete attempts or mark reset for candidate for this job.
    """
    # simple recruiter check - replace with your role check
    try:
        if not request.user.profile.role == 'recruiter':
            return Response({"detail":"Forbidden"}, status=403)
    except Exception:
        return Response({"detail":"Forbidden"}, status=403)

    job = get_object_or_404(Job, pk=job_id)
    # remove attempts
    QuizAttempt.objects.filter(quiz__job=job, candidate__id=candidate_id).delete()
    return Response({"detail":"Attempts reset"}, status=200)

