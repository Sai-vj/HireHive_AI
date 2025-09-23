# quiz/llm.py (patched)
import os
import json
import random
import time
import hashlib
import logging
logger = logging.getLogger(__name__)

OPENAI_ENABLED = False
client = None

# --- Load OpenAI if key present ---
OPENAI_KEY = os.environ.get("OPENAI_API_KEY")
if OPENAI_KEY:
    try:
        from openai import OpenAI
        client = OpenAI(api_key=OPENAI_KEY)
        OPENAI_ENABLED = True
    except Exception as e:
        logger.warning("⚠️ OpenAI init failed: %s", e)
        OPENAI_ENABLED = False


PROMPT_TEMPLATE = """
You are an assistant that produces multiple-choice technical hiring questions for a job role.
Output MUST be valid JSON: an array with exactly {count} question objects like:
[
  {{
    "id": "q1",
    "type": "mcq",
    "question": "One-line question text",
    "choices": {{"A":"..","B":"..","C":"..","D":".."}},
    "answer": "B",
    "difficulty": "easy",
    "topic": "react.props"
  }}
]
Job title: {title}
Skills (comma separated): {skills}
Constraints:
 - Provide exactly {count} MCQ questions.
 - Each question must have 4 choices labeled A,B,C,D and one correct answer.
 - Keep question <= 2 sentences and choices short.
 - Avoid mentioning company names / real persons.
Return ONLY the JSON array (no explanation).
"""


def _extract_json(text: str):
    """Try parsing JSON cleanly from model output."""
    if not text:
        return None
    try:
        return json.loads(text)
    except Exception:
        import re
        # non-greedy and allow whitespace/newlines
        m = re.search(r'(\[.*?\])', text, re.S)
        if m:
            try:
                return json.loads(m.group(1))
            except Exception as e:
                logger.debug("JSON parse from bracketed capture failed: %s\nCaptured:%s", e, m.group(1))
                return None
    return None


def generate_quiz_questions(job_title, skills, count=5, job_id=None, retries=2):
    """
    Generate quiz questions using OpenAI (if available) else fallback.
    Returns list of dicts.
    """
    prompt = PROMPT_TEMPLATE.format(title=job_title or "", skills=skills or "", count=count)

    # --- Use OpenAI ---
    if OPENAI_ENABLED and client is not None:
        for attempt in range(retries):
            try:
                resp = client.chat.completions.create(
                    model="gpt-3.5-turbo",
                    messages=[
                        {"role": "system", "content": "You generate technical MCQs in JSON."},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.2,
                    max_tokens=1100
                )
                text = resp.choices[0].message.content
                parsed = _extract_json(text)
                if isinstance(parsed, list) and len(parsed) > 0:
                    return parsed[:count]
                # log full output to debug if parsing failed
                logger.debug("OpenAI returned unparsable output: %s", text)
            except Exception as e:
                logger.warning("⚠️ OpenAI error (attempt %d): %s", attempt+1, e)
                time.sleep(1)

    # --- Fallback if OpenAI not available ---
    return _fallback_questions(job_title, skills, count, job_id)


def _fallback_questions(job_title, skills, count=5, job_id=None):
    """Fallback deterministic questions (based on job_id / job_title)."""
    base = [
        ("What is a common use of 'map' function?", {"A":"Sorting","B":"Apply fn each item","C":"Thread mgmt","D":"DB query"}, "B", "easy", "programming"),
        ("Largest heading tag in HTML?", {"A":"<h1>","B":"<h6>","C":"<h3>","D":"<header>"}, "A", "easy", "html"),
        ("Convert JSON string to object in JS?", {"A":"JSON.load","B":"JSON.parse","C":"JSON.stringify","D":"JSON.obj"}, "B", "easy", "js"),
        ("CSS property controlling layout flow?", {"A":"display","B":"font-size","C":"shadow","D":"color"}, "A", "easy", "css"),
        ("Which React hook manages state?", {"A":"useState","B":"useMemo","C":"useRef","D":"useEffect"}, "A", "easy", "react"),
        ("Which SQL clause filters rows?", {"A":"ORDER BY","B":"GROUP BY","C":"WHERE","D":"HAVING"}, "C", "medium", "sql"),
        ("Which HTTP method updates resource?", {"A":"GET","B":"POST","C":"PUT","D":"DELETE"}, "C", "easy", "http"),
        ("Indexes in DB used for?", {"A":"Backups","B":"Speed up lookups","C":"Encrypt","D":"Transactions"}, "B", "medium", "db"),
    ]
    # use a stable int seed derived from job_id/title
    seed_source = str(job_id or job_title or "")
    seed = int(hashlib.md5(seed_source.encode('utf-8')).hexdigest()[:8], 16)
    rnd = random.Random(seed)
    base_copy = base[:]  # do not mutate module-level
    rnd.shuffle(base_copy)

    out = []
    for i in range(count):
        q, choices, ans, diff, topic = base_copy[i % len(base_copy)]
        out.append({
            "id": f"q{i+1}",
            "type": "mcq",
            "question": f"{q} ({job_title})" if job_title else q,
            # ensure choices stays a dict with A..D
            "choices": choices,
            "answer": ans,
            "difficulty": diff,
            "topic": topic
        })
    return out
