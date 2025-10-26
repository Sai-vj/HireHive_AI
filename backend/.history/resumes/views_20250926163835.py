from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status, generics, viewsets, permissions
from django.shortcuts import get_object_or_404, render
from django.http import JsonResponse, HttpResponse
from django.utils import timezone
from django.db import transaction, IntegrityError
from django.contrib.auth.decorators import login_required
# resumes/views.py (keep as-is)
from resumes.utils.ats import score_resume_for_job  # (remove compute_embedding, _ensure_model)





import json, csv, logging


from resumes.models import Shortlist, Resume, Job, Application
from .serializers import (
    ResumeUploadSerializer, JobSerializer, ShortlistSerializer,
    ApplicationSerializer
)
from resumes.utils.pdf_extract import extract_text_from_filefield

from .tasks import compute_and_store_embedding, send_shortlist_email
from quiz.models import Quiz, QuizAttempt
from interviews.models import InterviewInvite, Interview


from django.core.cache import cache
# ---- Lightweight TF-IDF (no sklearn) ----
import math, re
from collections import Counter

_word_re = re.compile(r"[A-Za-z0-9_]+")

def _tok(s: str):
    return [w.lower() for w in _word_re.findall(s or "")]

def _idf_stats(docs):
    N = len(docs); df = Counter()
    for d in docs:
        for t in set(d):
            df[t] += 1
    idf = {t: math.log((N + 1) / (df[t] + 1)) + 1.0 for t in df}
    vocab = {t:i for i,t in enumerate(idf)}
    return idf, vocab

def _tfidf_vec(tokens, idf, vocab):
    if not tokens or not vocab: return []
    tf = Counter(tokens)
    vec = [0.0]*len(vocab)
    L = float(len(tokens)) or 1.0
    for t,c in tf.items():
        i = vocab.get(t)
        if i is not None:
            vec[i] = (c/L) * idf.get(t, 0.0)
    return vec

def _cos(a, b):
    if not a or not b: return 0.0
    num = sum(x*y for x,y in zip(a,b))
    da = math.sqrt(sum(x*x for x in a))
    db = math.sqrt(sum(y*y for y in b))
    return (num/(da*db)) if da and db else 0.0

def simple_tfidf_similarity(a_text: str, b_text: str) -> float:
    docs = [_tok(a_text), _tok(b_text)]
    idf, vocab = _idf_stats(docs)
    va = _tfidf_vec(docs[0], idf, vocab)
    vb = _tfidf_vec(docs[1], idf, vocab)
    return _cos(va, vb)  # 0..1


logger = logging.getLogger(__name__)
CACHE_TTL = 60 * 5


# -------------------- Helpers --------------------
def is_recruiter(user):
    """Safe check: returns True if profile.role == 'recruiter' (case-ins) or user.is_staff."""
    try:
        if not user:
            return False
        role = getattr(getattr(user, 'profile', None), 'role', None)
        if role and str(role).strip().lower() == 'recruiter':
            return True
    except Exception:
        pass
    try:
        return bool(getattr(user, 'is_staff', False))
    except Exception:
        return False


def _get_resume_text(r):
    """Return text for a Resume instance r. Tries common fields then file fields."""
    for field_name in ('extracted_text', 'text', 'content', 'skills'):
        try:
            val = getattr(r, field_name, None)
        except Exception:
            val = None
        if val:
            try:
                if hasattr(val, 'read'):
                    data = val.read()
                    if isinstance(data, bytes):
                        return data.decode('utf-8', 'ignore').strip()
                    return str(data).strip()
                return str(val).strip()
            except Exception:
                try:
                    return str(val)
                except Exception:
                    pass

    try:
        file_field = None
        for name in ('file', 'resume_file', 'upload'):
            if getattr(r, name, None):
                file_field = getattr(r, name)
                break
        if file_field:
            text = extract_text_from_filefield(file_field)
            if text:
                return text.strip()
    except Exception:
        pass

    return ""


def extract_skills(text):
    if not text:
        return ""
    words = [w.lower().strip(',.()') for w in text.split() if len(w) > 2]
    freq = {}
    for w in words:
        freq[w] = freq.get(w, 0) + 1
    top = sorted(freq.items(), key=lambda kv: kv[1], reverse=True)[:10]
    return ", ".join([p[0] for p in top])


def extract_experience(text):
    import re
    m = re.search(r"(\d+)\s+years?", (text or '').lower())
    if m:
        try:
            return int(m.group(1))
        except Exception:
            return 0
    return 0


# -------------------- Candidate / Recruiter endpoints --------------------
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_resumes(request):
    qs = Resume.objects.filter(user=request.user).order_by('-uploaded_at')
    serializer = ResumeUploadSerializer(qs, many=True, context={'request': request})
    return Response(serializer.data)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_resume(request, resume_id):
    try:
        r = Resume.objects.get(id=resume_id)
    except Resume.DoesNotExist:
        return Response({"error": "Resume not found"}, status=404)

    if r.user != request.user and not is_recruiter(request.user):
        return Response({"error": "Not allowed"}, status=403)

    try:
        if getattr(r, 'file', None):
            r.file.delete(save=False)
    except Exception:
        logger.exception("Error deleting resume file %s", getattr(r, 'id', None))

    r.delete()
    return Response({"message": "Deleted"}, status=200)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def shortlist_export_csv(request):
    job_id = request.GET.get('job_id')
    delimiter = request.GET.get('delimiter', ',')
    qs = Shortlist.objects.select_related('job', 'resume', 'shortlisted_by').all()
    if job_id:
        qs = qs.filter(job__id=job_id)

    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="shortlist_{timezone.now().strftime("%Y%m%d_%H%M%S")}.csv"'
    writer = csv.writer(response, delimiter=delimiter)
    writer.writerow(['shortlist_id','job_id','job_title','resume_id','candidate_username','candidate_email','resume_url','skills','experience','shortlisted_by','created_at','email_sent','email_sent_at'])

    for s in qs:
        resume_url = request.build_absolute_uri(s.resume.file.url) if s.resume and getattr(s.resume, 'file', None) else ''
        candidate_email = s.resume.user.email if s.resume and getattr(s.resume, 'user', None) else ''
        writer.writerow([
            s.id,
            s.job.id if s.job else '',
            s.job.title if s.job else '',
            s.resume.id if s.resume else '',
            s.resume.user.username if s.resume and getattr(s.resume, 'user', None) else '',
            candidate_email,
            resume_url,
            getattr(s.resume, 'skills', '') or '',
            getattr(s.resume, 'experience', '') or '',
            s.shortlisted_by.username if s.shortlisted_by else '',
            s.created_at.isoformat() if s.created_at else '',
            getattr(s, 'email_sent', False),
            s.email_sent_at.isoformat() if getattr(s, 'email_sent_at', None) else ''
        ])

    return response


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_shortlists(request):
    qs = Shortlist.objects.filter(resume__user=request.user).select_related('job','resume','shortlisted_by')
    serializer = ShortlistSerializer(qs, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def upload_resume(request):
    file = request.FILES.get('file')
    if not file:
        return JsonResponse({"error": "No file uploaded"}, status=400)

    resume = Resume.objects.create(user=request.user, file=file)

    try:
        text = extract_text_from_filefield(resume.file) or ''
    except Exception as e:
        logger.exception("extract_text_from_filefield error: %s", e)
        text = ''

    resume.skills = extract_skills(text)
    resume.experience = extract_experience(text)
    resume.extracted_text = text[:50000]
    resume.save(update_fields=['skills', 'experience', 'extracted_text'])

    try:
       compute_and_store_embedding.delay(resume.id)
    except Exception as e:
        logger.warning("Celery enqueue failed; skipping sync embedding on free tier: %s", e)

    serializer = ResumeUploadSerializer(resume, context={'request': request})
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def job_list(request):
    if request.method == 'GET':
        if is_recruiter(request.user):
            jobs = Job.objects.filter(created_by=request.user).order_by('-posted_at')
        else:
            jobs = Job.objects.all().order_by('-posted_at')
        serializer = JobSerializer(jobs, many=True, context={'request': request})
        return Response(serializer.data)

    elif request.method == 'POST':
        if not is_recruiter(request.user):
            return Response({"error": "Only recruiters can post jobs."}, status=403)
        serializer = JobSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(created_by=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def match_resumes(request, job_id):
    try:
        job = Job.objects.get(id=job_id)
    except Job.DoesNotExist:
        return Response({"error": "Job not found"}, status=404)

    resumes = Resume.objects.select_related('user').all()

    job_text = " ".join(filter(None, [
        getattr(job, 'title', ''),
        getattr(job, 'description', ''),
        getattr(job, 'skills_required', '')
    ])).strip()
    if not job_text:
        return Response({"job_title": job.title, "matched_resumes": [], "total": 0})

    # Embedding model disabled on free tier; will use stored embeddings if present
    model = None
    job_emb = None

    results = []

    for r in resumes:
        resume_text = _get_resume_text(r)
        if not resume_text and getattr(r, 'file', None):
            try:
                resume_text = extract_text_from_filefield(r.file) or ""
            except Exception as e:
                logger.exception("extract_text_from_filefield error for resume %s: %s", getattr(r, 'id', None), e)
                resume_text = ''

        resume_text_local = (resume_text or '').strip()
        job_text_local = job_text

        embedding_pct = None
        tfidf_pct = None
        skills_pct = 0.0
        score_val = 0.0

        # skills overlap %
        job_skills = set([s.strip() for s in (job.skills_required or '').lower().split(',') if s.strip()])
        resume_skills = set([s.strip() for s in (r.skills or '').lower().split(',') if s.strip()])
        if job_skills:
            skills_pct = (len(job_skills & resume_skills) / float(len(job_skills))) * 100.0

        # embedding compare only if both sides exist (rare on free tier)
        used_embedding_path = False
        try:
            if job_emb is not None and getattr(r, 'embedding', None):
        # If you ever enable embeddings again, do pure-python cosine:
                je = list(job_emb) if hasattr(job_emb, '__iter__') else []
                re = list(getattr(r, 'embedding', []) or [])
                import math
                num = sum(a*b for a,b in zip(je, re))
                da = math.sqrt(sum(a*a for a in je)) or 0.0
         db = math.sqrt(sum(b*b for b in re)) or 0.0
        sim = (num/(da*db)) if (da and db) else 0.0
        embedding_pct = sim * 100.0
        score_val = embedding_pct
        used_embedding_path = True
except Exception as e:
    logger.exception("resume embedding compare failed for %s: %s", getattr(r, 'id', None), e)
)

        # primary scorer (lightweight)
        if not used_embedding_path:
            try:
                raw_score = score_resume_for_job(
                    job_text_local, resume_text_local,
                    job_skills=job.skills_required, resume_skills=r.skills
                )
                if isinstance(raw_score, dict):
                    raw_score = raw_score.get('score', 0.0)
                try:
                    score_val = float(str(raw_score).strip().rstrip('%'))
                except Exception:
                    score_val = 0.0
            except Exception as e:
                logger.exception("score_resume_for_job error for resume %s: %s", getattr(r, 'id', None), e)
                score_val = 0.0

        # TF-IDF fallback (dependency-free)
        try:
            if (not score_val or score_val < 1.0) and resume_text_local:
                sim = simple_tfidf_similarity(job_text_local, resume_text_local)  # 0..1
                tfidf_pct = float(sim) * 100.0
                if tfidf_pct and tfidf_pct > (score_val or 0.0) + 0.1:
                    score_val = tfidf_pct
        except Exception as e:
            logger.exception("TFIDF fallback error for resume %s: %s", getattr(r, 'id', None), e)

        # final blend
        try:
            embedding_val = embedding_pct or 0.0
            tfidf_val = tfidf_pct or 0.0
            skills_val = skills_pct or 0.0
            if embedding_pct:
                final_score = 0.6 * embedding_val + 0.2 * tfidf_val + 0.2 * skills_val
            else:
                final_score = 0.8 * tfidf_val + 0.2 * skills_val
            final_score = float(final_score)
        except Exception:
            final_score = 0.0

        final_score = max(0.0, min(100.0, round(final_score, 2)))

        results.append({
            "resume_id": r.id,
            "user": getattr(r.user, 'username', ''),
            "skills": r.skills or '',
            "experience": r.experience or 0,
            "embedding_score": round(embedding_pct, 2) if embedding_pct is not None else None,
            "tfidf_score": round(tfidf_pct, 2) if tfidf_pct is not None else None,
            "skills_score": round(skills_pct, 2),
            "score": final_score,
            "missing_skills": sorted(list(job_skills - resume_skills))
        })

    results_sorted = sorted(results, key=lambda x: float(x.get('score', 0)), reverse=True)
    cache_key = f"job_matches_{job.id}"
    cache.set(cache_key, results_sorted, CACHE_TTL)

    page = int(request.GET.get('page', 1))
    page_size = int(request.GET.get('page_size', 20))
    start = (page - 1) * page_size
    end = start + page_size
    paged = results_sorted[start:end]

    return Response({
        "job_title": job.title,
        "total": len(results_sorted),
        "page": page,
        "page_size": page_size,
        "matched_resumes": paged
    })



@api_view(['GET', 'POST', 'DELETE'])
@permission_classes([IsAuthenticated])
def shortlist_resume(request):
    try:
        if request.method == 'GET':
            job_id = request.GET.get('job_id')
            qs = Shortlist.objects.select_related('job', 'resume', 'shortlisted_by').all()
            if job_id:
                qs = qs.filter(job__id=job_id)
            serializer = ShortlistSerializer(qs, many=True)
            return Response(serializer.data)

        if request.method == 'POST':
            if not is_recruiter(request.user):
                return Response({"error": "Only recruiters can shortlist candidates."}, status=403)

            data = request.data if getattr(request, 'data', None) else {}
            if not data:
                try:
                    body = request.body.decode('utf-8') if getattr(request, 'body', None) else ''
                    if body:
                        data = json.loads(body)
                except Exception:
                    data = {}

            job_id = data.get("job_id")
            resume_id = data.get("resume_id")
            resend = bool(data.get("resend", False))

            if not (job_id and resume_id):
                return Response({"error": "job_id and resume_id required"}, status=400)

            try:
                job = Job.objects.get(id=job_id)
                resume = Resume.objects.get(id=resume_id)
            except (Job.DoesNotExist, Resume.DoesNotExist):
                return Response({"error": "Invalid job or resume"}, status=404)

            shortlist, created = Shortlist.objects.get_or_create(
                job=job, resume=resume, defaults={"shortlisted_by": request.user}
            )

            if not created:
                if resend:
                    candidate_email = getattr(resume.user, 'email', None)
                    if candidate_email:
                        context = {
                            "job_title": job.title,
                            "recruiter": request.user.username,
                            "candidate_name": getattr(resume.user, 'username', '')
                        }
                        try:
                            send_shortlist_email.delay(shortlist.id, candidate_email, context)
                            return Response({"message": "Already shortlisted — email resend queued"}, status=200)
                        except Exception as e:
                            try:
                                send_shortlist_email(shortlist.id, candidate_email, context)
                                return Response({"message":"Already shortlisted — email resent (sync fallback)"}, status=200)
                            except Exception as e2:
                                logger.exception("Failed to resend shortlist email (both celery & sync): %s %s", e, e2)
                                return Response({"error": "Failed to enqueue/resend email"}, status=500)
                    else:
                        return Response({"error": "Candidate has no email"}, status=400)
                else:
                    serializer = ShortlistSerializer(shortlist)
                    return Response({"detail": "Already shortlisted", "shortlist": serializer.data}, status=409)

            candidate_email = getattr(resume.user, 'email', None)
            if candidate_email:
                context = {
                    "job_title": job.title,
                    "recruiter": request.user.username,
                    "candidate_name": getattr(resume.user, 'username', '')
                }
                try:
                    send_shortlist_email.delay(shortlist.id, candidate_email, context)
                except Exception as e:
                    try:
                        send_shortlist_email(shortlist.id, candidate_email, context)
                    except Exception:
                        logger.exception("Could not send shortlist email (celery+sync failed) for shortlist %s", shortlist.id)

            serializer = ShortlistSerializer(shortlist)
            return Response(serializer.data, status=201)

        if request.method == 'DELETE':
            payload = request.data if getattr(request, 'data', None) else {}
            if not payload:
                try:
                    body = request.body.decode('utf-8') if getattr(request, 'body', None) else ''
                    if body:
                        payload = json.loads(body)
                except Exception:
                    payload = {}

            sid = payload.get('id') or request.GET.get('id')
            if not sid:
                return Response({"error": "id required (send JSON body {id:..} or ?id=..)"}, status=400)
            try:
                s = Shortlist.objects.get(id=sid)
            except Shortlist.DoesNotExist:
                return Response({"error": "Shortlist not found"}, status=404)
            if s.shortlisted_by != request.user and not is_recruiter(request.user):
                return Response({"error": "Not allowed"}, status=403)
            s.delete()
            return Response({"message": "Removed"}, status=200)

        return Response({"error": "Method not allowed"}, status=405)

    except Exception as outer_e:
        logger.exception("Unhandled error in shortlist_resume: %s", outer_e)
        return Response({"error": "Server error"}, status=500)
    
    
from rest_framework import generics
from .models import Job
from .serializers import JobSerializer

class JobListView(generics.ListCreateAPIView):
    queryset = Job.objects.all()
    serializer_class = JobSerializer

class JobDetailView(generics.RetrieveAPIView):
    queryset = Job.objects.all()
    serializer_class = JobSerializer


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def recommended_jobs(request, resume_id):
    try:
        resume = Resume.objects.get(id=resume_id, user=request.user)
    except Resume.DoesNotExist:
        return Response({"error": "Resume not found"}, status=404)

    jobs = Job.objects.all()

    resume_text = getattr(resume, 'extracted_text', '') or (resume.skills or '')
    if not resume_text and resume.file:
        try:
            resume_text = extract_text_from_filefield(resume.file)[:20000]
        except Exception:
            resume_text = ''

    if not resume_text:
        return Response({"resume": resume.id, "recommended_jobs": []})

    results = []
    for job in jobs:
        job_text = " ".join(filter(None, [getattr(job, 'title', ''), getattr(job, 'description', ''), getattr(job, 'skills_required', '')])).strip()
        if not job_text:
            continue
        score_val = 0.0
        try:
            raw_score = score_resume_for_job(job_text, resume_text, job_skills=job.skills_required, resume_skills=resume.skills)
            if isinstance(raw_score, dict):
                raw_score = raw_score.get('score', 0.0)
            score_val = float(str(raw_score).strip().rstrip('%') or 0.0)
        except Exception as e:
            logger.exception("recommended_jobs scoring error for job %s: %s", getattr(job, 'id', None), e)
            score_val = 0.0

        if score_val <= 1.0:
            score_val = score_val * 100.0

        results.append({
            "job_id": job.id,
            "title": job.title,
            "company": getattr(job, 'company', ''),
            "skills_required": job.skills_required,
            "score": round(score_val, 2),
        })

    results = sorted(results, key=lambda x: x['score'], reverse=True)
    return Response({"resume": resume.id, "recommended_jobs": results})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def apply_for_job(request):
    data = request.data or {}
    job_id = data.get('job_id')
    resume_id = data.get('resume_id')
    message = data.get('message', '') or ''

    if not job_id or not resume_id:
        return Response({"error": "job_id and resume_id required"}, status=400)

    try:
        job = Job.objects.get(id=job_id)
    except Job.DoesNotExist:
        return Response({"error": "Job not found"}, status=404)

    # If job has quiz, ensure candidate passed it
    try:
        quiz = getattr(job, 'quiz', None)
        if quiz:
            passed = QuizAttempt.objects.filter(quiz=quiz, candidate=request.user, passed=True).exists()
            if not passed:
                return Response({
                    "error":"quiz_required",
                    "message":"Complete job quiz before applying",
                    "quiz_url": f"/api/resumes/quiz/{job.id}/"
                }, status=400)
    except Exception:
        logger.exception("Error checking quiz requirement for job %s", job_id)

    try:
        resume = Resume.objects.get(id=resume_id)
    except Resume.DoesNotExist:
        return Response({"error": "Resume not found"}, status=404)

    if getattr(resume, 'user', None) != request.user:
        return Response({"error": "Resume does not belong to you"}, status=403)

    score_snapshot = None
    try:
        job_text = " ".join(filter(None, [getattr(job, 'title', ''), getattr(job, 'description', ''), getattr(job, 'skills_required', '')]))
        resume_text = getattr(resume, 'extracted_text', None) or getattr(resume, 'skills', '') or ''
        raw = score_resume_for_job(job_text, resume_text, job_skills=getattr(job, 'skills_required', ''), resume_skills=getattr(resume, 'skills', ''))
        if isinstance(raw, dict):
            raw = raw.get('score', 0.0)
        try:
            tmp = float(str(raw).strip().rstrip('%'))
            if tmp <= 1.0:
                tmp = tmp * 100.0
            score_snapshot = max(0.0, min(100.0, round(tmp, 2)))
        except Exception:
            score_snapshot = None
    except Exception:
        score_snapshot = None

    try:
        with transaction.atomic():
            app, created = Application.objects.get_or_create(
                job=job,
                resume=resume,
                defaults={
                    'candidate': request.user,
                    'score_snapshot': score_snapshot,
                    'message': message,
                }
            )
    except IntegrityError:
        try:
            app = Application.objects.get(job=job, resume=resume)
            created = False
        except Application.DoesNotExist:
            return Response({"error": "Could not create application (integrity error)"}, status=500)

    if not created:
        serializer = ApplicationSerializer(app, context={'request': request})
        return Response({"detail": "Already applied", "application": serializer.data}, status=409)

    serializer = ApplicationSerializer(app, context={'request': request})
    return Response(serializer.data, status=201)


class ApplicationViewSet(viewsets.ModelViewSet):
    queryset = Application.objects.all()
    serializer_class = ApplicationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        job_id = self.request.query_params.get('job_id')
        if job_id:
            qs = qs.filter(job_id=job_id)

        user = getattr(self.request, 'user', None)
        if is_recruiter(user):
            try:
                recruiter_jobs = Job.objects.filter(created_by=user).values_list('id', flat=True)
                return qs.filter(job_id__in=list(recruiter_jobs))
            except Exception:
                return qs
        return qs.filter(candidate=user)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_applications(request):
    """
    Return applications for the logged-in candidate, with flattened job title and resume info
    so frontend can show job name without extra lookups.
    """
    qs = Application.objects.filter(candidate=request.user).select_related('job', 'resume').order_by('-applied_at')

    out = []
    for a in qs:
        job = getattr(a, 'job', None)
        resume = getattr(a, 'resume', None)
        out.append({
            "id": a.id,
            "application_id": a.id,
            "job_id": job.id if job else None,
            "job_title": getattr(job, 'title', '') if job else '',
            "company": getattr(job, 'company', '') if job else '',
            "status": getattr(a, 'status', '') or '',
            "applied_at": a.applied_at.isoformat() if getattr(a, 'applied_at', None) else (a.created_at.isoformat() if getattr(a, 'created_at', None) else ''),
            "resume_id": resume.id if resume else None,
            "resume_file": (resume.file.url if getattr(resume, 'file', None) and hasattr(resume.file, 'url') else (getattr(resume, 'file', '') or '')),
            "message": getattr(a, 'message', '') or getattr(a, 'notes', '') or '',
            "score": getattr(a, 'score_snapshot', None) or getattr(a, 'score', None) or ''
        })

    return Response(out, status=200)



@api_view(['GET'])
@permission_classes([IsAuthenticated])
def recruiter_applications(request):
    if not is_recruiter(request.user):
        return Response({"detail":"Only recruiters allowed."}, status=403)
    job_id = request.GET.get('job_id')
    qs = Application.objects.select_related('candidate','resume','job').all()
    try:
        qs = qs.filter(job__created_by=request.user)
    except Exception:
        pass
    if job_id:
        qs = qs.filter(job__id=job_id)
    serializer = ApplicationSerializer(qs, many=True, context={'request': request})
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_quiz_attempts(request):
    qs = QuizAttempt.objects.filter(candidate=request.user).order_by('-started_at')
    # It's expected you have a QuizAttemptSerializer; if not, return minimal shape
    try:
        from .serializers import QuizAttemptSerializer
        serializer = QuizAttemptSerializer(qs, many=True, context={'request': request})
        return Response(serializer.data)
    except Exception:
        data = [
            {"id": a.id, "quiz_id": getattr(a, 'quiz_id', None), "passed": getattr(a, 'passed', None), "score": getattr(a, 'score', None), "started_at": getattr(a, 'started_at', None), "finished_at": getattr(a, 'finished_at', None)}
            for a in qs
        ]
        return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_invites_api(request):
    qs = InterviewInvite.objects.filter(candidate=request.user).order_by('-scheduled_at')
    try:
        from .serializers import InterviewInviteSerializer
        serializer = InterviewInviteSerializer(qs, many=True, context={'request': request})
        return Response(serializer.data)
    except Exception:
        data = [
            {"id": i.id, "job_id": getattr(i, 'job_id', None), "scheduled_at": getattr(i, 'scheduled_at', None), "status": getattr(i, 'status', None)}
            for i in qs
        ]
        return Response(data)


@login_required
def candidate_invites_fragment(request):
    invites = InterviewInvite.objects.filter(candidate=request.user).order_by('-scheduled_at')
    return render(request, 'interviews/fragments/candidate_invites.html', {'invites': invites})


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def recruiter_delete_job(request, job_id):
    if not is_recruiter(request.user):
        return Response({"detail":"Forbidden"}, status=403)
    job = get_object_or_404(Job, pk=job_id)
    job.delete()
    return Response({"detail":"Job deleted"}, status=200)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def recruiter_update_job(request, job_id):
    if not is_recruiter(request.user):
        return Response({"detail":"Forbidden"}, status=403)
    job = get_object_or_404(Job, pk=job_id)
    serializer = JobSerializer(job, data=request.data, partial=True, context={'request':request})
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=400)


from django.contrib.auth.decorators import login_required
from django.shortcuts import redirect

@login_required
def candidate_dashboard(request):
    """
    Simple candidate dashboard: show user's resumes, applications, shortlists.
    """
    resumes = Resume.objects.filter(user=request.user).order_by('-uploaded_at')[:10]
    applications = Application.objects.filter(candidate=request.user).select_related('job').order_by('-applied_at')[:10]
    shortlists = Shortlist.objects.filter(resume__user=request.user).select_related('job','resume').order_by('-created_at')[:10]
    return render(request, "resumes/candidate_dashboard.html", {
        "resumes": resumes,
        "applications": applications,
        "shortlists": shortlists
    })


# protect recruiter dashboard
@login_required
def recruiter_dashboard(request):
    if not is_recruiter(request.user):
        return redirect('candidate_dashboard')
    jobs = Job.objects.filter(created_by=request.user)
    for job in jobs:
        latest_iv = Interview.objects.filter(job=job).order_by('-created_at').first()
        job.default_interview_id = latest_iv.id if latest_iv else None
    return render(request, "resumes/recruiter_dashboard.html", {"jobs": jobs})

