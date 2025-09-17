import os, json, random, re

OPENAI_ENABLED = False
OPENAI_KEY = os.environ.get('OPENAI_API_KEY')

try:
    if OPENAI_KEY:
        import openai
        openai.api_key = OPENAI_KEY
        OPENAI_ENABLED = True
except Exception:
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
 - Each question must have 4 choices labeled A,B,C,D and one correct answer.
 - Keep Q length <= 2 sentences and choices short.
Return only the JSON array.
"""

def generate_quiz_questions(job_title, skills, count=5, max_retries=2):
    """
    Returns Python list of question dicts.
    If OpenAI key present, call API; otherwise return fallback.
    """
    prompt = PROMPT_TEMPLATE.format(title=job_title, skills=skills or '', count=count)

    if OPENAI_ENABLED:
        for attempt in range(max_retries):
            try:
                resp = openai.ChatCompletion.create(
                    model="gpt-3.5-turbo",  # or gpt-4o-mini if you want
                    messages=[
                        {"role": "system", "content": "You are a JSON generator."},
                        {"role": "user", "content": prompt}
                    ],
                    max_tokens=1000,
                    temperature=0.2,
                )
                text = resp.choices[0].message.content.strip()

                try:
                    return json.loads(text)
                except Exception:
                    m = re.search(r'(\[.*\])', text, re.S)
                    if m:
                        return json.loads(m.group(1))
            except Exception as e:
                print(f"OpenAI attempt {attempt+1} failed:", e)

    # fallback questions
    sample_questions = [
        ("What is a common use of the 'map' function in programming?",
         {"A": "Mutating objects", "B": "Applying a function to each item", "C": "Sorting arrays", "D": "Managing threads"},
         "B", "easy", "programming.basics"),
        ("Which HTML tag is used for the largest heading?",
         {"A": "<h6>", "B": "<h3>", "C": "<h1>", "D": "<header>"},
         "C", "easy", "html.tags"),
        ("In JavaScript, which method converts JSON string to object?",
         {"A": "JSON.stringify", "B": "JSON.parse", "C": "JSON.toObject", "D": "JSON.load"},
         "B", "easy", "js.json"),
        ("Which CSS property controls element layout flow?",
         {"A": "display", "B": "font-size", "C": "color", "D": "box-shadow"},
         "A", "easy", "css.layout"),
        ("Which React hook is used for state in functional components?",
         {"A": "useState", "B": "useEffect", "C": "useMemo", "D": "useRef"},
         "A", "easy", "react.hooks"),
    ]

    fallback = []
    for i in range(count):
        q, choices, ans, diff, topic = sample_questions[i % len(sample_questions)]
        fallback.append({
            "id": f"q{i+1}",
            "type": "mcq",
            "question": q,
            "choices": choices,
            "answer": ans,
            "difficulty": diff,
            "topic": topic
        })
    return fallback