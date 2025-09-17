import re
import PyPDF2

def extract_text_from_pdf(pdf_file):
    reader = PyPDF2.PdfReader(pdf_file)
    text = ""
    for page in reader.pages:
        text += page.extract_text() or ""
    return text

def extract_skills(text):
    skills_list = [
        "Python", "Java", "C++", "Django", "Flask", "SQL", "MySQL",
        "PostgreSQL", "HTML", "CSS", "JavaScript", "React", "Node.js",
        "Machine Learning", "AI", "Data Science", "AWS", "Docker", "Git"
    ]
    found_skills = []
    for skill in skills_list:
        if re.search(rf"\b{skill}\b", text, re.IGNORECASE):
            found_skills.append(skill)
    return ", ".join(found_skills)

def extract_experience(text):
    # simple regex for job title + years
    exp_pattern = r"(?:\b(?:Intern|Engineer|Developer|Manager|Analyst|Consultant|Specialist|Lead|Architect)\b.*?(?:\d+\+?\s?(?:years|yrs)))"
    matches = re.findall(exp_pattern, text, flags=re.IGNORECASE)
    return "; ".join(matches) if matches else None

# resumes/utils/ats.py
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import re

# simple clean
def normalize_text(s: str) -> str:
    if not s:
        return ""
    s = s.lower()
    # keep letters, numbers, spaces
    s = re.sub(r'[^a-z0-9\s]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def simple_keyword_overlap(job_text: str, resume_text: str) -> float:
    """Fallback simple Jaccard-like overlap (0..100)."""
    j = set(normalize_text(job_text).split())
    r = set(normalize_text(resume_text).split())
    if not j or not r:
        return 0.0
    inter = j.intersection(r)
    union = j.union(r)
    score = len(inter) / len(union)
    return round(score * 100, 2)

def tfidf_cosine_score(job_text: str, resume_text: str) -> float:
    """Return similarity score (0..100) using TF-IDF + cosine similarity."""
    job_norm = normalize_text(job_text)
    res_norm = normalize_text(resume_text)
    if not job_norm or not res_norm:
        return 0.0
    try:
        vect = TfidfVectorizer(stop_words='english', ngram_range=(1,2))
        X = vect.fit_transform([job_norm, res_norm])
        sim = cosine_similarity(X[0:1], X[1:2])[0][0]
        return round(float(sim) * 100, 2)
    except Exception:
        # any error fallback to simple overlap
        return simple_keyword_overlap(job_text, resume_text)

def score_resume_for_job(job_text: str, resume_text: str) -> float:
    """
    Primary scoring function. Try TFIDF first; fallback to overlap.
    Returns 0..100.
    """
    score = tfidf_cosine_score(job_text, resume_text)
    # Optionally combine metrics, or boost if exact skill matches found
    return score
