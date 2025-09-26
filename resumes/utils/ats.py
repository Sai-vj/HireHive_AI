# resumes/utils/ats.py  — lightweight, no-ML, no-NLTK

import os, re, math
from typing import Iterable, Dict, List
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# --- simple tokenization ---
STOPWORDS = {
    'and','or','the','a','an','of','in','on','for','to','with','by','as',
    'is','are','be','this','that','from','at','it','you','your','we','our'
}

def normalize_text(text: str) -> str:
    if not text:
        return ""
    text = str(text).lower()
    text = re.sub(r'[^a-z0-9\+\#]+', ' ', text)  # keep + and #
    return re.sub(r'\s+', ' ', text).strip()

def tokenize(text: str) -> List[str]:
    s = normalize_text(text)
    return [t for t in s.split() if len(t) > 1 and t not in STOPWORDS]

def get_keyword_set(text: str) -> set:
    return set(tokenize(text))

def experience_score(job_exp, resume_exp) -> float:
    try: j = int(job_exp or 0)
    except: j = 0
    try: r = float(resume_exp or 0)
    except: r = 0.0
    if j <= 0: return 1.0
    if r >= j: return 1.0
    return max(0.0, r / j)

def keyword_overlap_score(job_text: str, resume_text: str, boost_keywords: Iterable[str] = None) -> float:
    J = get_keyword_set(job_text); R = get_keyword_set(resume_text)
    if not J: return 0.0
    base = len(J & R) / len(J)
    boost = 0.0
    if boost_keywords:
        B = {normalize_text(x) for x in boost_keywords if x}
        if B:
            boost = min(0.5, len(B & R) / len(B) * 0.5)
    return min(1.0, base + boost)

def tfidf_cosine_score(job_text: str, resume_text: str) -> float:
    jt = normalize_text(job_text or ""); rt = normalize_text(resume_text or "")
    if not jt or not rt: return keyword_overlap_score(jt, rt)
    try:
        vec = TfidfVectorizer(ngram_range=(1,2), max_features=2000)
        X = vec.fit_transform([jt, rt])
        sim = cosine_similarity(X[0:1], X[1:2])[0][0]
        return 0.0 if math.isnan(sim) else float(sim)
    except Exception:
        return keyword_overlap_score(jt, rt)

def combine_scores(tfidf_s, kw_s, exp_s, weights: Dict[str, float] = None) -> float:
    w = {'tfidf':0.6, 'keyword':0.3, 'experience':0.1}
    if weights: w.update(weights)
    total = w['tfidf']*tfidf_s + w['keyword']*kw_s + w['experience']*exp_s
    return round(max(0.0, min(1.0, total)) * 100, 2)

def score_resume_for_job(job_text: str,
                         resume_text: str,
                         resume_experience=None,
                         job_experience_required=None,
                         boost_keywords: Iterable[str] = None,
                         weights: Dict[str, float] = None,
                         debug: bool = False):
    tfidf_s = tfidf_cosine_score(job_text, resume_text)
    kw_s = keyword_overlap_score(job_text, resume_text, boost_keywords=boost_keywords)
    exp_s = experience_score(job_experience_required, resume_experience)
    final = combine_scores(tfidf_s, kw_s, exp_s, weights=weights)
    if debug:
        return {'tfidf': round(tfidf_s,4), 'keyword': round(kw_s,4), 'experience': round(exp_s,4), 'final_percent': final}
    return final

# compatibility stubs for old imports
def compute_embedding(text: str):
    return []  # no-ML mode
def _ensure_model():
    return None
