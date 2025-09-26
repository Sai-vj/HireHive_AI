# resumes/utils/ats.py  — free-Render friendly (no heavy deps)

import re
from typing import Iterable, Dict

STOPWORDS = {
    'and','or','the','a','an','of','in','on','for','to','with','by','as',
    'is','are','be','this','that','from','at','it','you','your','we','our'
}

def _norm(s: str) -> str:
    if not s: return ""
    s = str(s).lower()
    s = re.sub(r'[^a-z0-9\+\# ]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()

def _tokens(s: str):
    return [t for t in _norm(s).split() if len(t) > 1 and t not in STOPWORDS]

def _set(s: str): return set(_tokens(s))

def experience_score(job_years, resume_years) -> float:
    try: j = int(job_years or 0)
    except: j = 0
    try: r = float(resume_years or 0)
    except: r = 0.0
    if j <= 0: return 1.0
    if r >= j: return 1.0
    return max(0.0, r / j)

def keyword_overlap_score(job_text: str, resume_text: str,
                          boost_keywords: Iterable[str] = None) -> float:
    J, R = _set(job_text), _set(resume_text)
    if not J: return 0.0
    base = len(J & R) / len(J)
    boost = 0.0
    if boost_keywords:
        B = {_norm(x) for x in boost_keywords if x}
        if B:
            boost = min(0.5, len(B & R) / len(B) * 0.5)
    return min(1.0, base + boost)

def combine_scores(tfidf_like, kw, exp, weights: Dict[str,float] = None) -> float:
    w = {'sim':0.6, 'kw':0.3, 'exp':0.1}
    if weights: w.update(weights)
    total = w['sim']*tfidf_like + w['kw']*kw + w['exp']*exp
    return round(max(0.0, min(1.0, total)) * 100, 2)

def _tfidf_like(job_text: str, resume_text: str) -> float:
    # very light “similarity”: Jaccard on token multiset bigrams + unigrams
    J = _tokens(job_text); R = _tokens(resume_text)
    if not J or not R: return 0.0
    def grams(xs):
        uni = xs
        bi  = [f"{xs[i]}_{xs[i+1]}" for i in range(len(xs)-1)]
        return set(uni) | set(bi)
    A, B = grams(J), grams(R)
    inter = len(A & B); union = len(A | B) or 1
    return inter / union

def score_resume_for_job(job_text: str,
                         resume_text: str,
                         resume_experience=None,
                         job_experience_required=None,
                         boost_keywords: Iterable[str] = None,
                         weights: Dict[str,float] = None,
                         debug: bool = False):
    sim = _tfidf_like(job_text, resume_text)
    kw  = keyword_overlap_score(job_text, resume_text, boost_keywords)
    exp = experience_score(job_experience_required, resume_experience)
    final = combine_scores(sim, kw, exp, weights)
    if debug:
        return {'sim': round(sim,4), 'keyword': round(kw,4), 'experience': round(exp,4), 'final_percent': final}
    return final

# Backward-compat stubs (old imports)
def compute_embedding(text: str): return []
def _ensure_model(): return None
