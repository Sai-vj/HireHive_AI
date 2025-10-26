# quiz/llm.py
import os
import json
import random
import time
from 

OPENAI_KEY = os.environ.get('OPENAI_API_KEY')
OPENAI_ENABLED = False
openai = None

if OPENAI_KEY:
    try:
        import openai as _openai
        _openai.api_key = OPENAI_KEY
        openai = _openai
        OPENAI_ENABLED = True
    except Exception as e:
        print("OpenAI import failed:", e)
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
  }},
  ...
]
Job title: {title}
Skills (comma separated): {skills}
Constraints:
 - Provide exactly {count} MCQ questions.
 - Each question must have exactly 4 choices labeled "A","B","C","D" and one correct answer (one of those letters).
 - Keep question length <= 2 sentences and choices short.
 - Avoid referencing the company or real persons.
 - Prefer job-relevant topics based on the skills list.
Return only the JSON array (no additional commentary).
"""

# small helper to try parse JSON
def _extract_json_from_text(text):
    if not text:
        return None
    text = text.strip()
    # try direct parse
    try:
        return json.loads(text)
    except Exception:
        # try to find first JSON array substring
        import re
        m = re.search(r'(\[.*\])', text, re.S)
        if m:
            try:
                return json.loads(m.group(1))
            except Exception:
                pass
    return None

def generate_quiz_questions(job_title, skills, count=5, job_id=None, max_retries=2, model="gpt-3.5-turbo"):
    """
    Returns Python list of question dicts.
    If OpenAI key present, call ChatCompletion; otherwise fallback deterministic generator.
    Pass job_id if available (helps deterministic fallback or caching).
    """
    # Build prompt
    prompt = PROMPT_TEMPLATE.format(title=job_title or '', skills=skills or '', count=count)

    # Try OpenAI ChatCompletion
    if OPENAI_ENABLED and openai is not None:
        attempt = 0
        while attempt < max_retries:
            attempt += 1
            try:
                resp = openai.ChatCompletion.create(
                    model=model,
                    messages=[
                        {"role":"system","content":"You are a helpful assistant that emits clean JSON arrays of MCQs when asked."},
                        {"role":"user","content": prompt}
                    ],
                    max_tokens=1100,
                    temperature=0.2,
                    n=1
                )
                text = resp.choices[0].message.content if resp.choices and resp.choices[0].message else (resp.choices[0].text if resp.choices and hasattr(resp.choices[0], 'text') else None)
                parsed = _extract_json_from_text(text)
                if isinstance(parsed, list):
                    # ensure count matches — if not, trim or pad fallback
                    if len(parsed) >= count:
                        return parsed[:count]
                    # if fewer, try to pad using fallback
                    # continue to fallback lower down
                    fallback = _fallback_questions(job_title, skills, count, job_id)
                    # merge parsed then fallback to reach desired count
                    combined = parsed + fallback[len(parsed):]
                    return combined[:count]
                else:
                    # not parsed: continue retry
                    print("OpenAI returned unparsable JSON; retrying... attempt", attempt)
            except Exception as e:
                print("OpenAI call error (attempt", attempt, "):", e)
                # backoff small
                time.sleep(0.5 * attempt)
                continue

    # Fallback deterministic generator (varies by job_id or job_title)
    return _fallback_questions(job_title, skills, count, job_id)


def _fallback_questions(job_title, skills, count, job_id=None):
    """
    Deterministic fallback that varies with job_id or job_title.
    Not ideal but ensures different jobs get different variations.
    """
    sample_questions = [
        ("What is a common use of the 'map' function in programming?", {"A":"Mutating objects","B":"Applying a function to each item","C":"Sorting arrays","D":"Managing threads"}, "B", "easy", "programming.basics"),
        ("Which HTML tag is used for the largest heading?", {"A":"<h6>","B":"<h3>","C":"<h1>","D":"<header>"}, "C", "easy", "html.tags"),
        ("In JavaScript, which method converts JSON string to object?", {"A":"JSON.stringify","B":"JSON.parse","C":"JSON.toObject","D":"JSON.load"}, "B", "easy", "js.json"),
        ("Which CSS property controls element layout flow?", {"A":"display","B":"font-size","C":"color","D":"box-shadow"}, "A", "easy", "css.layout"),
        ("Which React hook is used for state in functional components?", {"A":"useState","B":"useEffect","C":"useMemo","D":"useRef"}, "A", "easy", "react.hooks"),
        ("What SQL clause filters rows returned by a query?", {"A":"ORDER BY","B":"GROUP BY","C":"WHERE","D":"HAVING"}, "C", "medium", "sql.basic"),
        ("Which HTTP method is typically used to update a resource?", {"A":"GET","B":"POST","C":"PUT","D":"DELETE"}, "C", "easy", "http.methods"),
        ("What's the purpose of indexes in relational databases?", {"A":"Encrypt data","B":"Speed up lookups","C":"Store backups","D":"Manage transactions"}, "B", "medium", "db.performance"),
    ]

    seed = str(job_id or job_title or (job_title + (skills or '')))
    rnd = random.Random(seed)
    pool = sample_questions[:]
    rnd.shuffle(pool)

    out = []
    for i in range(count):
        q, choices, ans, diff, topic = pool[i % len(pool)]
        # inject job title short note to differentiate
        q_text = (q + ((" — " + job_title) if job_title else ""))[:200]
        # rotate choices deterministically
        keys = list(choices.keys())
        rnd.shuffle(keys)
        rotated = {new_k: choices[keys[idx % len(keys)]] for idx,new_k in enumerate(["A","B","C","D"])}
        # find new answer key
        correct_text = choices[ans]
        new_ans = next(k for k,v in rotated.items() if v == correct_text)
        out.append({
            "id": f"q{i+1}",
            "type": "mcq",
            "question": q_text,
            "choices": rotated,
            "answer": new_ans,
            "difficulty": diff,
            "topic": topic
        })
    return out