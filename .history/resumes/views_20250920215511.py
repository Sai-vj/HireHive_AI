from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from resumes.models import Shortlist, Resume, Job,Application
from .serializers import ResumeUploadSerializer, JobSerializer, ShortlistSerializer,ApplicationSerializer
from resumes.utils.pdf_extract import extract_text_from_filefield
from resumes.utils.ats import score_resume_for_job, normalize_text
from .utils.ats import compute_embedding
from django.http import JsonResponse,HttpResponse
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from django.core.mail import send_mail
from django.template.loader import render_to_string
from resumes.utils.scoring import  _skills_pct, _tfidf_pct
from resumes.utils.scoring import score_resume_for_job,_safe_cosine_similarity
from django.conf import settings
from django.utils.html import strip_tags
from .utils.ats import score_resume_for_job, normalize_text
from .utils.pdf_extract import extract_text_from_filefield  
from django.utils import timezone
from .tasks import compute_and_store_embedding
from rest_framework import generics
from quiz.models import Quiz,QuizAttempt
from interviews.models import InterviewInvite
from django.contrib.auth.decorators import login_required

import numpy as np
from resumes.utils.ats import score_resume_for_job, compute_embedding,_ensure_model
from .tasks import send_shortlist_email
import csv
from django.core.cache import cache
from django.http import HttpResponse
from django.utils import timezone
import traceback
import json
import logging

# ---- paste this near top of recompute_resume_embeddings.py (below imports) ----
def _get_resume_text(r):
    """
    Return text for a Resume instance r.
    Tries common fields (extracted_text, text, content, skills) then file fields.
    """
    # try common fields first
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

    # fallback: try file fields (common names: file, resume_file, upload)
    try:
        file_field = None
        for name in ('file', 'resume_file', 'upload'):
            if getattr(r, name, None):
                file_field = getattr(r, name)
                break
        if file_field:
            from resumes.utils.pdf_extract import extract_text_from_filefield
            text = extract_text_from_filefield(file_field)
            if text:
                return text.strip()
    except Exception:
        pass

    return ""
# --------------------------------------------------------------------------------

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def recruiter_applications(request):
    # optional: check recruiter permission
    job_id = request.GET.get('job_id')
    qs = Application.objects.select_related('candidate','resume','job').all()
    if job_id:
        qs = qs.filter(job__id=job_id)
    # maybe filter by recruiter/company if jobs belong to recruiter
    # qs = qs.filter(job__posted_by=request.user)  # if applicable

    from .serializers import ApplicationSerializer
    serializer = ApplicationSerializer(qs, many=True, context={'request': request})
    return Response(serializer.data)



logger = logging.getLogger(__name__)

def is_recruiter(user):
    try:
        role = None
        if hasattr(user, 'profile'):
            role = getattr(user.profile, 'role', None)
        if role:
            return str(role).lower() == 'recruiter'
    except Exception:
        pass
    return bool(getattr(user, 'is_staff', False))


def extract_skills(text):
    if not text:
        return ""
    # very naive: return comma separated top words (for now)
    words = [w.lower().strip(',.()') for w in text.split() if len(w) > 2]
    freq = {}
    for w in words:
        freq[w] = freq.get(w,0) + 1
    top = sorted(freq.items(), key=lambda kv: kv[1], reverse=True)[:10]
    return ", ".join([p[0] for p in top])

def extract_experience(text):
    # naive: search for "years" keyword
    import re
    m = re.search(r'(\d+)\s+years?', text.lower())
    if m:
        return int(m.group(1))
    return 0

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_resumes(request):
    """
    Return resumes uploaded by the authenticated user.
    """
    qs = Resume.objects.filter(user=request.user).order_by('-uploaded_at')
    serializer = ResumeUploadSerializer(qs, many=True, context={'request': request})
    return Response(serializer.data)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_resume(request, resume_id):
    """
    Delete a resume if it belongs to the authenticated user.
    """
    try:
        r = Resume.objects.get(id=resume_id)
    except Resume.DoesNotExist:
        return Response({"error": "Resume not found"}, status=404)


    if r.user != request.user and not is_recruiter(request.user):
        return Response({"error": "Not allowed"}, status=403)



    # optional: delete the file from storage
    try:
        if r.file:
            r.file.delete(save=False)
    except Exception:
        pass

    r.delete()
    return Response({"message": "Deleted"}, status=200)







@api_view(['GET'])
@permission_classes([IsAuthenticated])
def shortlist_export_csv(request):
    """
    Export shortlisted rows as CSV.
    Optional query params: job_id (filter), delimiter (default comma)
    """
    job_id = request.GET.get('job_id')
    delimiter = request.GET.get('delimiter', ',')
    qs = Shortlist.objects.select_related('job', 'resume', 'shortlisted_by').all()
    if job_id:
        qs = qs.filter(job__id=job_id)

    # response
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="shortlist_{timezone.now().strftime("%Y%m%d_%H%M%S")}.csv"'

    writer = csv.writer(response, delimiter=delimiter)
    # header
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


# add this function
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_shortlists(request):
    """
    Returns shortlist entries for the logged-in user (candidate).
    """
    qs = Shortlist.objects.filter(resume__user=request.user).select_related('job','resume','shortlisted_by')
    serializer = ShortlistSerializer(qs, many=True)
    return Response(serializer.data)



@api_view(['POST'])
@permission_classes([IsAuthenticated])
def upload_resume(request):
    file = request.FILES.get('file')
    if not file:
        return JsonResponse({"error": "No file uploaded"}, status=400)

    # create DB row first
    resume = Resume.objects.create(user=request.user, file=file)

    # extract text (safe)
    try:
        text = extract_text_from_filefield(resume.file) or ''
    except Exception as e:
        print("extract_text_from_filefield error:", e)
        text = ''

    # fill metadata
    resume.skills = extract_skills(text)
    resume.experience = extract_experience(text)
    resume.extracted_text = text[:50000]
    resume.save(update_fields=['skills', 'experience', 'extracted_text'])

    # --- preferred: enqueue Celery task to compute embedding (non-blocking) ---
    try:
        compute_and_store_embedding.delay(resume.id)
    except Exception as e:
        # if Celery not available, fallback to sync compute (safe)
        print("Celery enqueue failed, falling back to sync compute:", e)
        try:
            emb = compute_embedding(resume.extracted_text or (resume.skills or ""))
            if emb:
                resume.embedding = emb
                resume.save(update_fields=['embedding'])
        except Exception as e2:
            print("Sync embedding compute failed:", e2)

    serializer = ResumeUploadSerializer(resume, context={'request': request})
    return Response(serializer.data, status=status.HTTP_201_CREATED)

#----------------------------job list-------------------------------#
    
@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def job_list(request):
    if request.method == 'GET':
        if is_recruiter(request.user):
            # 🔑 recruiter sees only their jobs
            jobs = Job.objects.filter(created_by=request.user).order_by('-posted_at')
        else:
            # 🔑 candidates see only active jobs (filter as per your needs)
            jobs = Job.objects.all().order_by('-posted_at')
        serializer = JobSerializer(jobs, many=True, context={'request': request})
        return Response(serializer.data)

    # POST -> create job (RECRUITER only)
        elif request.method == 'POST':
            if not is_recruiter(request.user):
        return Response({"error": "Only recruiters can post jobs."}, status=403)

    serializer = JobSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)





    
    






import numpy as np

CACHE_TTL = 60 * 5  # 5 minutes

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def match_resumes(request, job_id):
    """
    Hybrid matching:
     - prefer stored resume.embedding (if present) + precomputed job embedding (if model available)
     - fallback to project scorer (score_resume_for_job) when embedding not usable
     - fallback to TF-IDF if score small and resume text present
     - compute skills overlap %
     - return embedding_pct, tfidf_pct, skills_pct and final combined score
     - supports pagination: ?page=1&page_size=20
    """

    # --- get job ----------------------------------------
    try:
        job = Job.objects.get(id=job_id)
    except Job.DoesNotExist:
        return Response({"error": "Job not found"}, status=404)

    # --- gather resumes --------------------------------
    resumes = Resume.objects.select_related('user').all()

    # build job text
    job_text = " ".join(filter(None, [
        getattr(job, 'title', ''), getattr(job, 'description', ''), getattr(job, 'skills_required', '')
    ])).strip()
    if not job_text:
        return Response({"job_title": job.title, "matched_resumes": [], "total": 0})

    # --- optional model for vector embeddings ----------
    model = None
    try:
        from resumes.utils.ats import _ensure_model, tfidf_similarity_pct
        # score_resume_for_job optional function used below
        from resumes.utils.scoring import score_resume_for_job
        model = _ensure_model()  # returns model or None
    except Exception:
        # try alternative import locations if you used different names
        try:
            from resumes.utils.ats import _ensure_model, tfidf_similarity_pct
            from resumes.utils.scoring import score_resume_for_job
            model = _ensure_model()
        except Exception as e:
            model = None

    # precompute job embedding if model available
    job_emb = None
    if model is not None:
        try:
            job_emb = model.encode(job_text, convert_to_numpy=True)
        except Exception:
            job_emb = None

    results = []

    # loop resumes
    for r in resumes:
        # get resume text
        resume_text = _get_resume_text(r)
        if not resume_text and getattr(r, 'file', None):
            # extract_text_from_filefield should exist in utils/pdf_extract.py
            try:
                from resumes.utils.pdf_extract import extract_text_from_filefield
                resume_text = extract_text_from_filefield(r.file) or""
            except Exception as e:
                logger.exception("extract_text_from_filefield error for resume %s: %s", getattr(r, 'id', None), e)
                resume_text = ''
                
                
                
                

        resume_text_local = (resume_text or '').strip()
        job_text_local = job_text

        embedding_pct = None
        tfidf_pct = None
        skills_pct = 0.0
        score_val = 0.0

        # compute skills overlap %
        job_skills = set([s.strip() for s in (job.skills_required or '').lower().split(',') if s.strip()])
        resume_skills = set([s.strip() for s in (r.skills or '').lower().split(',') if s.strip()])
        if job_skills:
            skills_pct = (len(job_skills & resume_skills) / float(len(job_skills))) * 100.0
        else:
            skills_pct = 0.0

        used_embedding_path = False
        # 1) Try stored embedding comparison (fast)
        try:
            if job_emb is not None and getattr(r, 'embedding', None):
                re = np.array(r.embedding)
                je = job_emb
                denom = (np.linalg.norm(je) * np.linalg.norm(re))
                sim = float(np.dot(je, re) / denom) if denom > 0 else 0.0
                embedding_pct = sim * 100.0
                score_val = embedding_pct
                used_embedding_path = True
        except Exception as e:
            logger.exception("resume embedding compare failed for %s: %s", getattr(r, 'id', None), e)
            embedding_pct = None
            used_embedding_path = False
            score_val = 0.0

        # 2) If not using embedding path, try project scorer (score_resume_for_job)
        if not used_embedding_path:
            try:
                raw_score = 0.0
                if 'score_resume_for_job' in globals():
                    raw_score = score_resume_for_job(job_text_local, resume_text_local,
                                                    job_skills=job.skills_required, resume_skills=r.skills)
                # if dict returned, look for 'score'
                if isinstance(raw_score, dict):
                    raw_score = raw_score.get('score', 0.0)
                try:
                    score_val = float(str(raw_score).strip().rstrip('%'))
                except Exception:
                    score_val = 0.0
            except Exception as e:
                logger.exception("score_resume_for_job error for resume %s: %s", getattr(r, 'id', None), e)
                score_val = 0.0

        # 3) If score too small and resume text exists -> TF-IDF fallback
        try:
            if (not score_val or score_val < 1.0) and resume_text_local:
                # try utility tfidf_similarity_pct first (if available)
                try:
                    if 'tfidf_similarity_pct' in globals():
                        tfidf_pct = tfidf_similarity_pct(job_text_local, resume_text_local)
                    else:
                        # local fallback using sklearn
                        vec = TfidfVectorizer(stop_words='english').fit([job_text_local, resume_text_local])
                        job_v = vec.transform([job_text_local])
                        res_v = vec.transform([resume_text_local])
                        sim = cosine_similarity(job_v, res_v)[0][0]
                        tfidf_pct = float(sim) * 100.0
                except Exception:
                    # sklearn fallback again
                    vec = TfidfVectorizer(stop_words='english').fit([job_text_local, resume_text_local])
                    job_v = vec.transform([job_text_local])
                    res_v = vec.transform([resume_text_local])
                    sim = cosine_similarity(job_v, res_v)[0][0]
                    tfidf_pct = float(sim) * 100.0

                if tfidf_pct and tfidf_pct > score_val + 0.1:
                    score_val = tfidf_pct
        except Exception as e:
            logger.exception("TFIDF fallback error for resume %s: %s", getattr(r, 'id', None), e)

        # normalize & combine scores into final_score with weights
        try:
            embedding_val = embedding_pct or 0.0
            tfidf_val = tfidf_pct or 0.0
            skills_val = skills_pct or 0.0

            # if we have a real embedding, prefer it; otherwise rely on tfidf heavier
            if embedding_pct:
                final_score = 0.6 * embedding_val + 0.2 * tfidf_val + 0.2 * skills_val
            else:
                # no embedding available: use tfidf heavier
                final_score = 0.8 * tfidf_val + 0.2 * skills_val

            final_score = float(final_score)
        except Exception:
            final_score = 0.0

        final_score = max(0.0, min(100.0, round(final_score, 2)))

        # record result
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

    # caching: store sorted results (useful if job is static)
    results_sorted = sorted(results, key=lambda x: float(x.get('score', 0)), reverse=True)
    cache_key = f"job_matches_{job.id}"
    cache.set(cache_key, results_sorted, 60 * 5)  # 5 minutes

    # pagination
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
    """
    GET: list shortlists (optional job_id query param)
    POST: create shortlist or resend email (recruiter only)
    DELETE: remove shortlist by id
    Robust parsing: accepts JSON even if content-type wrong.
    Protects against Celery/email errors so API won't 500.
    """
    try:
        # GET -> list shortlisted
        if request.method == 'GET':
            job_id = request.GET.get('job_id')
            qs = Shortlist.objects.select_related('job', 'resume', 'shortlisted_by').all()
            if job_id:
                qs = qs.filter(job__id=job_id)
            serializer = ShortlistSerializer(qs, many=True)
            return Response(serializer.data)

        # POST -> create or resend
        if request.method == 'POST':
            # only recruiters can create/resend
            if not is_recruiter(request.user):
                return Response({"error": "Only recruiters can shortlist candidates."}, status=403)

            # parse payload robustly
            data = {}
            try:
                data = request.data or {}
            except Exception:
                data = {}

            if not data:
                try:
                    body = request.body.decode('utf-8') if getattr(request, 'body', None) else ''
                    if body:
                        data = json.loads(body)
                except Exception:
                    data = {}

            # debug log (optional)
            print("shortlist POST payload:", data)

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

            # If already existed
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
                        except Exception as e:
                            print("Celery enqueue error (resend):", e)
                        return Response({"message": "Already shortlisted — email resend queued"}, status=200)
                    else:
                        return Response({"error": "Candidate has no email"}, status=400)
                else:
                    serializer = ShortlistSerializer(shortlist)
                    return Response({"detail": "Already shortlisted", "shortlist": serializer.data}, status=409)

            # Created new shortlist -> enqueue email task (but continue even if task fails)
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
                    print("Celery enqueue error (create):", e)

            serializer = ShortlistSerializer(shortlist)
            return Response(serializer.data, status=201)

        # DELETE -> remove by id
        if request.method == 'DELETE':
            # support request.data or raw json body
            payload = {}
            try:
                payload = request.data or {}
            except Exception:
                payload = {}

            if not payload:
                try:
                    body = request.body.decode('utf-8') if getattr(request, 'body', None) else ''
                    if body:
                        payload = json.loads(body)
                except Exception:
                    payload = {}

            sid = payload.get('id')
            if not sid:
                return Response({"error": "id required"}, status=400)
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
        import traceback
        print("Unhandled error in shortlist_resume:", outer_e)
        traceback.print_exc()
        return Response({"error": "Server error"}, status=500)

# resumes/views.py
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def recommended_jobs(request, resume_id):
    """
    Recommend top jobs for a candidate's resume.
    """
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
        job_text = " ".join(filter(None, [
            getattr(job, 'title', ''), getattr(job, 'description', ''), getattr(job, 'skills_required', '')
        ])).strip()

        if not job_text:
            continue

        score_val = 0.0
        try:
            raw_score = score_resume_for_job(job_text, resume_text,
                                             job_skills=job.skills_required, resume_skills=resume.skills)
            if isinstance(raw_score, dict):
                raw_score = raw_score.get('score', 0.0)
            score_val = float(str(raw_score).strip().rstrip('%') or 0.0)
        except Exception as e:
            print(f"recommended_jobs scoring error for job {job.id}: {e}")
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


from django.db import transaction, IntegrityError
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

# ensure Application and serializer are imported

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def apply_for_job(request):
    try:
        quiz = job.quiz
    # check if candidate has any passed attempt
        passed = QuizAttempt.objects.filter(quiz=quiz, candidate=request.user, passed=True).exists()
        if not passed:
            return Response({"error":"quiz_required", "message":"Complete job quiz before applying", "quiz_url": f"/api/resumes/quiz/{job.id}/"}, status=400)
    except Quiz.DoesNotExist:
        pass
    
   
    
    """
    Candidate applies to a job using one of their resumes.
    Expects JSON: { "job_id": <int>, "resume_id": <int>, "message": "<optional>" }
    """
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

    try:
        resume = Resume.objects.get(id=resume_id)
    except Resume.DoesNotExist:
        return Response({"error": "Resume not found"}, status=404)

    # ensure candidate owns the resume
    if getattr(resume, 'user', None) != request.user:
        return Response({"error": "Resume does not belong to you"}, status=403)

    # compute score snapshot best-effort
    score_snapshot = None
    try:
        job_text = " ".join(filter(None, [getattr(job, 'title', ''), getattr(job, 'description', ''), getattr(job, 'skills_required', '')]))
        resume_text = getattr(resume, 'extracted_text', None) or getattr(resume, 'skills', '') or ''
        raw = score_resume_for_job(job_text, resume_text, job_skills=getattr(job, 'skills_required', ''), resume_skills=getattr(resume, 'skills', ''))
        if isinstance(raw, dict):
            raw = raw.get('score', 0.0)
        # parse to float and handle percent/fraction
        try:
            tmp = float(str(raw).strip().rstrip('%'))
            if tmp <= 1.0:
                tmp = tmp * 100.0
            score_snapshot = max(0.0, min(100.0, round(tmp, 2)))
        except Exception:
            score_snapshot = None
    except Exception:
        score_snapshot = None

    # create application atomically
    try:
        with transaction.atomic():
            app, created = Application.objects.get_or_create(
                job=job,
                resume=resume,
                defaults={
                    'candidate': request.user,
                    'score_snapshot': score_snapshot,
                    'message': message,   # use notes field if your model uses 'notes' or store message elsewhere
                }
            )
    except IntegrityError:
        # race-condition: someone created simultaneously
        try:
            app = Application.objects.get(job=job, resume=resume)
            created = False
        except Application.DoesNotExist:
            return Response({"error": "Could not create application (integrity error)"}, status=500)

    if not created:
        serializer = ApplicationSerializer(app, context={'request': request})
        return Response({"detail": "Already applied", "application": serializer.data}, status=409)

    # freshly created
    serializer = ApplicationSerializer(app, context={'request': request})
    return Response(serializer.data, status=201)


from rest_framework import viewsets, permissions
from .models import Application
from .serializers import ApplicationSerializer

class ApplicationViewSet(viewsets.ModelViewSet):
    queryset = Application.objects.all()
    serializer_class = ApplicationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        qs = super().get_queryset()
        job_id = self.request.query_params.get('job_id')
        if job_id:
            qs = qs.filter(job_id=job_id)
        return qs
    
    # views.py (Django REST Framework)
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from .models import Application
from .serializers import ApplicationSerializer

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def my_applications(request):
    qs = Application.objects.filter(candidate=request.user).select_related('job','resume').order_by('-applied_at')
    serializer = ApplicationSerializer(qs, many=True, context={'request': request})
    return Response(serializer.data)


from rest_framework import generics
from .models import Job
from .serializers import JobSerializer

class JobListView(generics.ListCreateAPIView):
    queryset = Job.objects.all()
    serializer_class = JobSerializer

class JobDetailView(generics.RetrieveAPIView):
    queryset = Job.objects.all()
    serializer_class = JobSerializer


# views.py
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404, render
from rest_framework import status
from .models import Job

def is_recruiter(user):
    try:
        return user.profile.role == 'recruiter'
    except Exception:
        return False

@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def recruiter_delete_job(request, job_id):
    if not is_recruiter(request.user):
        return Response({"detail":"Forbidden"}, status=403)
    job = get_object_or_404(Job, pk=job_id)
    # Option A: hard delete
    job.delete()
    # Option B: soft delete -> job.is_active = False; job.save()
    return Response({"detail":"Job deleted"}, status=200)


from .serializers import JobSerializer  # create if not exist

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


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def recruiter_job_applications(request, job_id):
    # require recruiter
    if not is_recruiter(request.user):
        return Response({"detail": "Only recruiters allowed."}, status=status.HTTP_403_FORBIDDEN)

    # ensure job exists
    job = get_object_or_404(Job, pk=job_id)

    # OPTIONAL: enforce that this recruiter owns the job (if jobs have owner field)
    # if hasattr(job, 'posted_by') and job.posted_by != request.user:
    #     return Response({"detail":"Not allowed for this job."}, status=status.HTTP_403_FORBIDDEN)

    # fetch applications belonging to job
    apps_qs = Application.objects.filter(job=job).order_by('-created_at')
    serializer = ApplicationSerializer(apps_qs, many=True, context={'request': request})
    return Response({"applications": serializer.data}, status=status.HTTP_200_OK)



@login_required
def candidate_invites_fragment(request):
    invites = InterviewInvite.objects.filter(candidate=request.user).order_by('-scheduled_at')
    return render(request, 'interviews/fragments/candidate_invites.html', {'invites': invites})


from interviews.models import Interview

def recruiter_dashboard(request):
    jobs = Job.objects.filter(created_by=request.user)

    for job in jobs:
        # get latest interview for this job
        latest_iv = Interview.objects.filter(job=job).order_by('-created_at').first()
        job.default_interview_id = latest_iv.id if latest_iv else None

    return render(request, "resumes/recruiter_dashboard.html", {"jobs": jobs})
