# quiz/llm.py
"""
Robust quiz generator using OpenAI (ChatCompletion).
- Loads OPENAI_API_KEY from environment (or .env via python-dotenv).
- Returns a Python list of MCQ dicts:
  [{ "id":"q1", "type":"mcq", "question":"...", "choices":{"A":"..","B":"..","C":"..","D":".."}, "answer":"A", "difficulty":"easy", "topic":"..." }, ...]
- Falls back to a deterministic local generator when OpenAI isn't available.
"""

import os
import json
import time
import random
from typing import List, Dict, Any, Optional

# Try to load .env automatically if present
try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    # python-dotenv not installed or not needed; ignore
    pass

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY") or os.environ.get("OPENAI_KEY")
OPENAI_ENABLED = False
openai = None

if OPENAI_API_KEY:
    try:
        # Use openai official package
        import openai as _openai
        _openai.api_key = OPENAI_API_KEY
        openai = _openai
        OPENAI_ENABLED = True
        print("DEBUG: OpenAI client available.")
    except Exception as e:
        print("DEBUG: Failed to import OpenAI:", e)
        OPENAI_ENABLED = False
else:
    print("DEBUG: OPENAI_API_KEY not found; using fallback generator.")

# Simple in-process cache to avoid repeated calls for same job_id
_SIMPLE_CACHE: Dict[str, List[Dict[str, Any]]] = {}

# Prompt template — instruct model to return ONLY JSON array
PROMPT_TEMPLATE = """
You are an assistant that produces multiple-choice technical hiring questions for a job role.
Output MUST be valid JSON: a JSON array with exactly {count} question objects like:
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
 - Each question must have exactly 4 choices labeled "A","B","C","D" and one correct answer (one of those letters).
 - Keep question text <= 2 sentences and choices short.
 - Return only the JSON array (no explanation, no extra text).
"""

def _extract_json_from_text(text: Optional[str]) -> Optional[Any]:
    """Try parse text into JSON; if fails, attempt to find first JSON array substring."""
    if not text:
        return None
    text = text.strip()
    try:
        return json.loads(text)
    except Exception:
        import re
        m = re.search(r'(\[.*\])', text, re.S)
        if m:
            try:
                return json.loads(m.group(1))
            except Exception:
                return None
    return None

def _validate_and_normalize_questions(candidate: List[Dict[str, Any]], count: int) -> List[Dict[str, Any]]:
    """
    Ensure returned items are proper MCQ objects and produce exactly `count` items.
    If candidate has fewer items, fallback to generating more from deterministic generator.
    """
    out = []
    for i, q in enumerate(candidate or []):
        if not isinstance(q, dict):
            continue
        # minimal validation
        question = str(q.get("question") or q.get("q") or "").strip()
        choices = q.get("choices") or q.get("options") or {}
        # Normalise choice keys & values
        if isinstance(choices, dict):
            # keep only first 4 keys if more
            # transform values to strings
            normalized = {}
            for k, v in choices.items():
                if len(normalized) >= 4:
                    break
                kk = str(k).strip()
                # Accept keys like 0,1,A,B -> map numeric keys to A..D if needed
                if kk.isdigit():
                    # convert 0->A, 1->B etc
                    idx = int(kk)
                    if 0 <= idx < 4:
                        kk = ["A","B","C","D"][idx]
                if kk.upper() in ("A","B","C","D"):
                    normalized[kk.upper()] = str(v or "")
            # ensure we have 4 keys A-D (may be missing)
            # if less than 4, skip normalization failure
            if len(normalized) == 4:
                choices = {k: normalized[k] for k in ("A","B","C","D")}
            else:
                # try to map in order to A-D
                vals = [str(v) for v in list(choices.values())[:4]]
                if len(vals) == 4:
                    choices = {k: vals[idx] for idx,k in enumerate(("A","B","C","D"))}
                else:
                    continue
        else:
            continue

        ans = str(q.get("answer") or q.get("correct") or "").strip()
        if ans and ans not in ("A","B","C","D"):
            # if answer given as text, attempt to find matching key
            found_key = None
            for k,v in choices.items():
                if str(v).strip().lower() == ans.lower():
                    found_key = k
                    break
            if found_key:
                ans = found_key
            else:
                # if numeric
                if ans.isdigit():
                    idx = int(ans)
                    if 0 <= idx < 4:
                        ans = ["A","B","C","D"][idx]
        if ans not in ("A","B","C","D"):
            # invalid answer key -> skip
            continue

        out.append({
            "id": q.get("id") or f"q{i+1}",
            "type": "mcq",
            "question": question,
            "choices": choices,
            "answer": ans,
            "difficulty": q.get("difficulty") or "medium",
            "topic": q.get("topic") or ""
        })
        if len(out) >= count:
            break

    # If fewer than required, pad from deterministic fallback
    if len(out) < count:
        pad = _fallback_questions("", "", count - len(out), job_id=None, seed=None)
        out.extend(pad[:(count - len(out))])
    return out[:count]

def generate_quiz_questions(job_title: str, skills: str, count: int = 5,
                            job_id: Optional[int] = None, max_retries: int = 2,
                            model: str = "gpt-3.5-turbo") -> List[Dict[str, Any]]:
    """
    Main public function.
    - job_title, skills: used to prompt model (and for fallback uniqueness).
    - count: desired number of questions.
    - job_id: optional integer to make deterministic fallback different per job.
    - Returns list of question dicts.
    """
    cache_key = f"{job_id or job_title}:{count}"
    # return cached if present
    if cache_key in _SIMPLE_CACHE:
        return _SIMPLE_CACHE[cache_key]

    prompt = PROMPT_TEMPLATE.format(title=(job_title or ""), skills=(skills or ""), count=count)

    if OPENAI_ENABLED and openai is not None:
        attempt = 0
        while attempt < max_retries:
            attempt += 1
            try:
                # ChatCompletion API (classic openai library)
                resp = openai.ChatCompletion.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": "You are an assistant that outputs clean JSON arrays of MCQs."},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=1100,
                    temperature=0.2,
                    n=1
                )
                # get text
                text = None
                if resp and getattr(resp, "choices", None):
                    choice0 = resp.choices[0]
                    # new fields: message.content
                    text = getattr(choice0, "message", {}).get("content") if isinstance(getattr(choice0, "message", None), dict) else None
                    if not text:
                        text = getattr(choice0, "text", None)
                if not text:
                    print(f"DEBUG: OpenAI returned no text on attempt {attempt}; resp summary: {str(resp)[:200]}")
                    time.sleep(0.4 * attempt)
                    continue
                parsed = _extract_json_from_text(text)
                if isinstance(parsed, list):
                    validated = _validate_and_normalize_questions(parsed, count)
                    _SIMPLE_CACHE[cache_key] = validated
                    return validated
                else:
                    print("DEBUG: OpenAI returned non-json or unparsable text. Attempt:", attempt)
                    # small backoff and retry
                    time.sleep(0.5 * attempt)
                    continue
            except Exception as e:
                print("DEBUG: OpenAI call error:", e)
                time.sleep(0.6 * attempt)
                continue

    # Fallback (deterministic)
    fallback = _fallback_questions(job_title or "", skills or "", count, job_id=job_id, seed=job_id or job_title)
    _SIMPLE_CACHE[cache_key] = fallback
    return fallback

def _fallback_questions(job_title: str, skills: str, count: int, job_id: Optional[int] = None, seed: Optional[Any] = None) -> List[Dict[str, Any]]:
    """
    Deterministic fallback quiz generator. Uses a seed based on job_id or job_title
    so different jobs produce different question sets.
    """
    base_questions = [
        ("What is a common use of the 'map' function in programming?", {"A":"Mutating objects","B":"Applying function to each item","C":"Sorting arrays","D":"Managing threads"}, "B", "easy", "programming.basics"),
        ("Which HTML tag is used for the largest heading?", {"A":"<h6>","B":"<h3>","C":"<h1>","D":"<header>"}, "C", "easy", "html.tags"),
        ("In JavaScript, which method converts JSON string to object?", {"A":"JSON.stringify","B":"JSON.parse","C":"JSON.toObject","D":"JSON.load"}, "B", "easy", "js.json"),
        ("Which CSS property controls element layout flow?", {"A":"display","B":"font-size","C":"color","D":"box-shadow"}, "A", "easy", "css.layout"),
        ("Which React hook is used for state in functional components?", {"A":"useState","B":"useEffect","C":"useMemo","D":"useRef"}, "A", "easy", "react.hooks"),
        ("What SQL clause filters rows returned by a query?", {"A":"ORDER BY","B":"GROUP BY","C":"WHERE","D":"HAVING"}, "C", "medium", "sql.basic"),
        ("Which HTTP method is typically used to update a resource?", {"A":"GET","B":"POST","C":"PUT","D":"DELETE"}, "C", "easy", "http.methods"),
        ("What's the purpose of database indexes?", {"A":"Encrypt data","B":"Speed up lookups","C":"Store backups","D":"Manage transactions"}, "B", "medium", "db.performance"),
    ]

    seed_val = None
    if seed is not None:
        seed_val = str(seed)
    elif job_id:
        seed_val = str(job_id)
    elif job_title:
        seed_val = job_title
    else:
        seed_val = "fallback"

    rnd = random.Random(seed_val)
    pool = base_questions[:]
    rnd.shuffle(pool)

    out = []
    for i in range(count):
        q_text, choices, ans, diff, topic = pool[i % len(pool)]
        # slightly personalize question with job title (keeps low length)
        q = q_text + ((" — " + job_title) if job_title else "")
        # rotate choices deterministically
        keys = list(choices.keys())
        rnd.shuffle(keys)
        rotated = {}
        for idx, label in enumerate(("A", "B", "C", "D")):
            rotated[label] = choices[keys[idx % len(keys)]]
        correct_text = choices[ans]
        # find key in rotated that matches correct text
        new_ans = next((k for k, v in rotated.items() if v == correct_text), "A")
        out.append({
            "id": f"q{i+1}",
            "type": "mcq",
            "question": q[:200],
            "choices": rotated,
            "answer": new_ans,
            "difficulty": diff,
            "topic": topic
        })
    return out