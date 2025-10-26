# quiz/views.py
from django.shortcuts import get_object_or_404, render
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone

from .models import Job, Resume, Quiz, QuizAttempt
from .serializers import QuizSerializer, QuizAdminSerializer, QuizAttemptSerializer
from .forms import ResumeForm
from .utils import parse_resume, match_jobs
from .llm import generate_quiz_questions


def is_recruiter(user):
    try:
        return user.profile.role == "recruiter"
    except Exception:
        return False


# ---------- QUIZ APIs ----------

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def generate_quiz_for_job(request, job_id):
    """Recruiter generates quiz for a job using LLM."""
    if not is_recruiter(request.user):
        return Response({"detail": "Forbidden"}, status=403)

    job = get_object_or_404(Job, pk=job_id)
    count = int(request.data.get("questions_count") or 5)
    skills = request.data.get("skills") or job.skills_required or ""

    # generate via LLM
    questions = generate_quiz_questions(job.title, skills, count=count)
    if not questions:
        return Response({"detail": "Quiz generation failed"}, status=500)

    quiz, created = Quiz.objects.get_or_create(
        job=job,
        defaults={
            "skills": skills,
            "questions_count": count,
            "questions_json": questions,
            "generated_at": timezone.now(),
            "auto_generated": True,
        },
    )
    if not created:
        quiz.skills = skills
        quiz.questions_count = count
        quiz.questions_json = questions
        quiz.generated_at = timezone.now()
        quiz.auto_generated = True
        quiz.save()

    serializer = QuizAdminSerializer(quiz)
    return Response(serializer.data, status=201 if created else 200)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_quiz_for_job(request, job_id):
    job = get_object_or_404(Job, pk=job_id)
    quiz = getattr(job, "quiz", None)
    if not quiz:
        return Response({"detail": "No quiz for this job"}, status=404)
    return Response(QuizSerializer(quiz, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def submit_quiz_attempt(request, job_id):
    """Candidate submits quiz attempt."""
    job = get_object_or_404(Job, pk=job_id)
    quiz = getattr(job, "quiz", None)
    if not quiz:
        return Response({"detail": "No quiz for this job"}, status=404)

    MAX_ATTEMPTS = 3
    existing = QuizAttempt.objects.filter(quiz=quiz, candidate=request.user).count()
    if existing >= MAX_ATTEMPTS:
        return Response({"detail": f"Maximum {MAX_ATTEMPTS} attempts reached"}, status=403)

    answers = request.data.get("answers") or {}
    resume_id = request.data.get("resume_id")

    attempt = QuizAttempt.objects.create(
        quiz=quiz,
        candidate=request.user,
        resume_id=resume_id or None,
    )

    correct, total = 0, 0
    qmap = {str(q.get("id")): q for q in quiz.questions_json or []}
    total = len(qmap)

    for qid, q in qmap.items():
        selected = (answers.get(qid) or "").strip().upper()
        correct_answer = (q.get("answer") or "").strip().upper()
        if selected and selected == correct_answer:
            correct += 1

    score_percent = (correct / total * 100) if total else 0.0
    passed = score_percent >= (quiz.passing_percent or 0)

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
        "total": total,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_quiz_attempts(request, job_id):
    """Candidate fetch attempt history."""
    job = get_object_or_404(Job, pk=job_id)
    quiz = getattr(job, "quiz", None)
    if not quiz:
        return Response({"detail": "No quiz"}, status=404)

    attempts = QuizAttempt.objects.filter(quiz=quiz, candidate=request.user).order_by("-finished_at")
    return Response(QuizAttemptSerializer(attempts, many=True).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def recruiter_reset_attempts(request, job_id, candidate_id):
    """Recruiter resets candidate attempts for a job."""
    if not is_recruiter(request.user):
        return Response({"detail": "Forbidden"}, status=403)

    job = get_object_or_404(Job, pk=job_id)
    QuizAttempt.objects.filter(quiz__job=job, candidate__id=candidate_id).delete()
    return Response({"detail": "Attempts reset"}, status=200)


# ---------- RESUME + JOB MATCHING ----------

def upload_resume(request):
    if request.method == "POST":
        form = ResumeForm(request.POST, request.FILES)
        if form.is_valid():
            resume = form.save()
            parsed = parse_resume(resume.file.path)
            resume.skills = ", ".join(parsed["skills"])
            resume.save()
            return render(request, "success.html", {"skills": parsed["skills"]})
    else:
        form = ResumeForm()
    return render(request, "upload_resume.html", {"form": form})


def job_matches(request, resume_id):
    resume = get_object_or_404(Resume, id=resume_id)
    jobs = Job.objects.all()
    skills = resume.skills.split(", ") if resume.skills else []
    matches = match_jobs(skills, jobs)
    return render(request, "job_matches.html", {"resume": resume, "matches": matches})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def recruiter_view_candidates(request, job_id):
    if not is_recruiter(request.user):
        return Response({"detail": "Forbidden"}, status=403)

    job = get_object_or_404(Job, pk=job_id)
    quiz = getattr(job, "quiz", None)
    if not quiz:
        return Response({"detail": "No quiz for this job"}, status=404)

    attempts = QuizAttempt.objects.filter(quiz=quiz).select_related("candidate").order_by("-finished_at")

    data = []
    for a in attempts:
        data.append({
            "candidate_id": a.candidate.id,
            "candidate_username": a.candidate.username,
            "score": a.score,
            "passed": a.passed,
            "attempt_id": a.id,
            "finished_at": a.finished_at,
        })
    return Response({"results": data})


