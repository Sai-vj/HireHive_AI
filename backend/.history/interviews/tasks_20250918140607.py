# interviews/tasks.py
import os
import json
from celery import shared_task
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.conf import settings
from .models import Interview, InterviewQuestion
from .serializers import InterviewQuestionSerializer
import openai
from jsonschema import validate, ValidationError as JSONSchemaValidationError

openai.api_key = settings.OPENAI_API_KEY

# JSON schema for expected AI output (array of question objects)
QUESTION_LIST_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "required": ["question_text", "question_type"],
        "properties": {
            "question_text": {"type": "string"},
            "question_type": {"type": "string", "enum": ["mcq", "text"]},
            "choices": {"type": ["object", "null"]},  # for MCQ: {"A":"..","B":".."}
            "answer": {"type": ["string", "null"]},
            "difficulty": {"type": "string", "enum": ["easy","medium","hard"]},
            "topic": {"type": ["string", "null"]},
            "confidence": {"type": ["number", "null"]}
        }
    }
}

def build_prompt(interview, params=None, n_questions=5):
    role = getattr(interview.job, 'title', 'General')
    level = params.get('level', 'mid') if params else 'mid'
    topics = params.get('topics', []) if params else []

    topics_txt = ", ".join(topics) if topics else "a mix of relevant topics"
    prompt = f"""
Generate {n_questions} interview questions for role='{role}', level='{level}', topics='{topics_txt}'.
Return JSON array ONLY. Each item must have keys:
- question_text (string)
- question_type (one of 'mcq' or 'text')
- choices (object or null) for mcq like {{"A":"opt1","B":"opt2","C":"opt3","D":"opt4"}}
- answer (correct letter for mcq OR sample text)
- difficulty ('easy'/'medium'/'hard')
- topic (string)
- confidence (float 0-1, optional)

Respond ONLY with JSON array (no explanation).
"""
    return prompt

def call_openai(prompt, model=None, max_tokens=800):
    model = model or settings.OPENAI_MODEL
    resp = openai.ChatCompletion.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=max_tokens,
        temperature=0.2,
    )
    # assume assistant reply in content
    return resp['choices'][0]['message']['content']

def parse_ai_json(ai_text):
    # try to extract JSON block (robustness)
    ai_text = ai_text.strip()
    # attempt direct json loads
    try:
        return json.loads(ai_text)
    except Exception:
        # try to recover by finding first '[' and last ']'
        start = ai_text.find('[')
        end = ai_text.rfind(']')
        if start != -1 and end != -1 and end > start:
            snippet = ai_text[start:end+1]
            return json.loads(snippet)
    raise ValueError("Could not parse AI response as JSON")

@shared_task(bind=True, autoretry_for=(Exception,), retry_backoff=True, max_retries=2)
def generate_questions_task(self, interview_id, user_id=None, params=None, n_questions=5, auto_publish=False):
    """Generate questions for interview, save as pending_review by default."""
    interview = Interview.objects.get(pk=interview_id)
    prompt = build_prompt(interview, params=params or {}, n_questions=n_questions)
    ai_text = call_openai(prompt)
    try:
        data = parse_ai_json(ai_text)
    except Exception as e:
        # log & raise to retry
        raise

    # validate schema
    try:
        validate(instance=data, schema=QUESTION_LIST_SCHEMA)
    except JSONSchemaValidationError as e:
        raise

    objs = []
    for item in data:
        q = InterviewQuestion(
            interview=interview,
            question_text=item.get('question_text'),
            question_type=item.get('question_type', 'text'),
            choices=item.get('choices'),
            answer=item.get('answer'),
            difficulty=item.get('difficulty', 'medium'),
            topic=item.get('topic'),
            generated_by='ai',
            ai_prompt=prompt,
            ai_model=settings.OPENAI_MODEL,
            ai_confidence=item.get('confidence'),
            status='published' if auto_publish else 'pending_review',
            created_at=timezone.now(),  # safe even if field auto_now_add exists; DB will accept explicit value
            updated_at=timezone.now(),
        )
        objs.append(q)
    # bulk create
    InterviewQuestion.objects.bulk_create(objs)
    # return number created for visibility
    return {"created": len(objs)}


# interviews/tasks.py
from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
from .models import InterviewInvite
import requests

@shared_task
def send_invite_notification(invite_id):
    invite = InterviewInvite.objects.get(pk=invite_id)
    candidate = invite.candidate
    subject = f"Interview Invite: {invite.interview.title}"
    body = (
        f"Hi {candidate},\n\n"
        f"You have been invited for an interview: {invite.interview.title}\n"
        f"Scheduled at: {invite.scheduled_at}\n\nMessage:\n{invite.message}\n\n"
        f"Open your dashboard: {settings.SITE_URL}/candidate/dashboard/\n"
    )
    # send email
    if candidate.email:
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [candidate.email], fail_silently=True)
    # optional: SMS via Twilio if you have phone field and keys
    if getattr(candidate, 'phone', None) and getattr(settings, 'TWILIO_ACCOUNT_SID', None):
        twilio_sid = settings.TWILIO_ACCOUNT_SID
        twilio_token = settings.TWILIO_AUTH_TOKEN
        from_no = settings.TWILIO_FROM
        try:
            requests.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{twilio_sid}/Messages.json",
                data={'From': from_no, 'To': candidate.phone, 'Body': body},
                auth=(twilio_sid, twilio_token)
            )
        except Exception:
            pass
    invite.sent_at = timezone.now()
    invite.save(update_fields=['sent_at'])
    return True


