# interviews/tasks.py (REPLACE existing generate + send_invite implementations with this)

import json
import logging
from celery import shared_task
from django.utils import timezone
from django.conf import settings
from django.db import transaction
from jsonschema import validate, ValidationError as JSONSchemaValidationError
import openai
from .models import Interview, InterviewQuestion, InterviewInvite

logger = logging.getLogger(__name__)

openai.api_key = getattr(settings, 'OPENAI_API_KEY', None)

QUESTION_LIST_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "required": ["question_text", "question_type"],
        "properties": {
            "question_text": {"type": "string"},
            "question_type": {"type": "string", "enum": ["mcq", "text"]},
            "choices": {"type": ["object", "null"]},
            "answer": {"type": ["string", "null"]},
            "difficulty": {"type": "string", "enum": ["easy","medium","hard"]},
            "topic": {"type": ["string", "null"]},
            "confidence": {"type": ["number", "null"]}
        }
    }
}

def build_prompt(interview, params=None, n_questions=5):
    role = getattr(interview.job, 'title', 'General')
    level = (params or {}).get('level', 'mid')
    topics = (params or {}).get('topics', []) or []
    topics_txt = ", ".join(topics) if topics else "a mix of relevant topics"
    prompt = (
        f"Generate {n_questions} interview questions for role='{role}', level='{level}', topics='{topics_txt}'.\n"
        "Return JSON array ONLY. Each item must have keys:\n"
        "- question_text (string)\n"
        "- question_type (one of 'mcq' or 'text')\n"
        "- choices (object or null) for mcq like {\"A\":\"opt1\",\"B\":\"opt2\",\"C\":\"opt3\",\"D\":\"opt4\"}\n"
        "- answer (correct letter for mcq OR sample text)\n"
        "- difficulty ('easy'/'medium'/'hard')\n"
        "- topic (string)\n"
        "- confidence (float 0-1, optional)\n\n"
        "Respond ONLY with a JSON array (no explanation)."
    )
    return prompt



from openai import OpenAI

client = OpenAI(api_key=settings.OPENAI_API_KEY)

def call_openai(prompt, model=None, max_tokens=800):
    model = model or getattr(settings, "OPENAI_MODEL", "gpt-4o-mini")
    resp = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=max_tokens,
        temperature=0.2,
    )
    return resp.choices[0].message.content


def parse_ai_json(ai_text):
    ai_text = (ai_text or '').strip()
    # try direct load
    try:
        return json.loads(ai_text)
    except Exception:
        # try to recover substring between first '[' and last ']'
        start = ai_text.find('[')
        end = ai_text.rfind(']')
        if start != -1 and end != -1 and end > start:
            snippet = ai_text[start:end+1]
            try:
                return json.loads(snippet)
            except Exception as e:
                logger.debug("Recovered JSON snippet parsing failed: %s", e)
    raise ValueError("Could not parse AI response as JSON; raw response start: %.200s" % ai_text)

@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, max_retries=2)
def generate_questions_task(self, interview_id, user_id=None, params=None, n_questions=5, auto_publish=False):
    """
    Generate questions using OpenAI, validate with JSON Schema, and bulk-create InterviewQuestion.
    Returns {"created": int, "ids": [..], "errors": []}
    """
    try:
        interview = Interview.objects.get(pk=interview_id)
    except Interview.DoesNotExist:
        logger.error("Interview %s not found", interview_id)
        return {"created": 0, "ids": [], "errors": ["interview_not_found"]}

    prompt = build_prompt(interview, params=params or {}, n_questions=n_questions)

    try:
        ai_text = call_openai(prompt)
    except Exception as e:
        logger.exception("OpenAI failure for interview %s: %s", interview_id, e)
        raise

    try:
        data = parse_ai_json(ai_text)
    except Exception as e:
        logger.exception("parse_ai_json failed: %s", e)
        # raise to retry if desired
        raise

    # validate schema
    try:
        validate(instance=data, schema=QUESTION_LIST_SCHEMA)
    except JSONSchemaValidationError as e:
        logger.exception("AI output schema validation failed: %s", e)
        # include raw ai_text for debugging but do NOT store it in DB in prod; here we raise so caller/fallback knows
        raise

    created_ids = []
    objs = []
    now = timezone.now()

    for item in data:
        # defensive extraction with fallbacks
        q_text = item.get('question_text') or item.get('prompt') or ''
        q_type = item.get('question_type') or item.get('kind') or 'text'
        choices = item.get('choices') or None
        answer = item.get('answer') or None
        difficulty = item.get('difficulty') or 'medium'
        topic = item.get('topic') or None
        confidence = item.get('confidence')

        q = InterviewQuestion(
            interview=interview,
            # change these field names if your model uses 'prompt'/'kind' instead
            question_text=q_text,
            question_type=q_type,
            choices=choices,
            answer=answer,
            difficulty=difficulty,
            topic=topic,
            generated_by='ai',
            ai_prompt=prompt[:2000],
            ai_model=getattr(settings, 'OPENAI_MODEL', None),
            ai_confidence=confidence,
            status='published' if auto_publish else 'pending_review',
            created_at=now,
            updated_at=now,
        )
        objs.append(q)

    # bulk create inside transaction
    try:
        with transaction.atomic():
            InterviewQuestion.objects.bulk_create(objs)
            # fetch created ids (best-effort: by filtering generated_by + created_at)
            created_qs = InterviewQuestion.objects.filter(interview=interview, generated_by='ai', created_at=now)
            created_ids = list(created_qs.values_list('id', flat=True))
    except Exception as e:
        logger.exception("bulk_create failed: %s", e)
        raise

    return {"created": len(created_ids), "ids": created_ids}
    

# Consolidated send_invite_notification (single definition)
@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, max_retries=2)
def send_invite_notification(invite_id, reminder_type=None):
    try:
        invite = InterviewInvite.objects.get(pk=invite_id)
    except InterviewInvite.DoesNotExist:
        logger.warning("Invite %s not found for notification", invite_id)
        return False

    candidate = invite.candidate
    subject = f"Interview Invite: {invite.interview.title}"
    if reminder_type == '1h':
        pre = "Reminder: your interview is in 1 hour."
    elif reminder_type == '15m':
        pre = "Reminder: your interview is in 15 minutes."
    else:
        pre = "You have been invited for an interview."

    body = (
        f"Hi {getattr(candidate, 'first_name', candidate)}\n\n"
        f"{pre}\n\n"
        f"Interview: {invite.interview.title}\n"
        f"When: {invite.scheduled_at}\n\n"
        f"Message: {invite.message or ''}\n\n"
        f"Open your dashboard: {getattr(settings, 'SITE_URL', '')}/candidate/dashboard/\n"
    )

    # send email
    try:
        if candidate.email:
            from django.core.mail import send_mail
            send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [candidate.email], fail_silently=True)
    except Exception as e:
        logger.exception("Failed to send invite email: %s", e)

    # optional SMS (Twilio)
    try:
        if getattr(candidate, 'phone', None) and getattr(settings, 'TWILIO_ACCOUNT_SID', None):
            import requests
            twilio_sid = settings.TWILIO_ACCOUNT_SID
            twilio_token = settings.TWILIO_AUTH_TOKEN
            from_no = settings.TWILIO_FROM
            requests.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{twilio_sid}/Messages.json",
                data={'From': from_no, 'To': candidate.phone, 'Body': body},
                auth=(twilio_sid, twilio_token),
                timeout=10
            )
    except Exception:
        logger.exception("Twilio send failed")

    # mark sent_at if not set
    if not invite.sent_at:
        invite.sent_at = timezone.now()
        invite.save(update_fields=['sent_at'])

    return True
