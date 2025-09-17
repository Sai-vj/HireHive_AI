from celery import shared_task
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.conf import settings
from django.utils.html import strip_tags
from django.utils import timezone
from .models import Shortlist
from resumes.models import Resume
from resumes.utils.ats import compute_embedding

@shared_task(bind=True)
def send_shortlist_email(self, shortlist_id, candidate_email, context):
    from django.core.mail import send_mail
    from django.template.loader import render_to_string
    from django.utils.html import strip_tags
    try:
        html_message = render_to_string('shortlist.html', context)
        plain = strip_tags(html_message)
        send_mail(f"You've been shortlisted", plain, 'no-reply@example.com', [candidate_email], html_message=html_message, fail_silently=False)
        # update DB if needed
        try:
            s = Shortlist.objects.get(id=shortlist_id)
            s.email_sent = True
            s.email_sent_at = timezone.now()
            s.save(update_fields=['email_sent', 'email_sent_at'])
        except Shortlist.DoesNotExist:
            pass
        return {"status": "sent"}
    except Exception as exc:
        # retry a couple times
        raise self.retry(exc=exc, countdown=30, max_retries=3)
    
      

@shared_task(bind=True, name="resumes.compute_and_store_embedding")
def compute_and_store_embedding(self, resume_id):
    """
    Compute embedding for a resume and save to resume.embedding (JSON field).
    Safe: swallows exceptions and logs them.
    """
    try:
        r = Resume.objects.get(id=resume_id)
    except Resume.DoesNotExist:
        return {"ok": False, "reason": "not found", "resume_id": resume_id}

    # decide where to pull text from
    text = getattr(r, 'extracted_text', None) or getattr(r, 'text', None) or (r.skills or '')
    if not text and getattr(r, 'file', None):
        # optional: try extracting file text here (import your extractor)
        from resumes.utils.pdf_extract import extract_text_from_filefield
        try:
            text = extract_text_from_filefield(r.file)[:20000]
        except Exception as e:
            text = ''

    if not text:
        return {"ok": False, "reason": "no text", "resume_id": resume_id}

    try:
        emb = compute_embedding(text)  # should return list[float] or None
        if emb:
            r.embedding = emb
            r.save(update_fields=['embedding'])
            return {"ok": True, "resume_id": resume_id}
        else:
            return {"ok": False, "reason": "compute returned None", "resume_id": resume_id}
    except Exception as e:
        # log in console (or use logger)
        print("compute_and_store_embedding failed:", e)
        return {"ok": False, "reason": str(e), "resume_id": resume_id}


        
        

