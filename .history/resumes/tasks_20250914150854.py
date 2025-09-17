# resumes/tasks.py
from celery import shared_task
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.conf import settings
from django.utils.html import strip_tags
from django.utils import timezone
from .models import Shortlist

@shared_task(bind=True)
def send_shortlist_email(self, shortlist_id, candidate_email, context):
    from django.core.mail import send_mail
    from django.template.loader import render_to_string
    from django.utils.html import strip_tags
    try:
        html_message = render_to_string('emails/shortlist.html', context)
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
        
        

