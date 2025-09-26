# resumes/utils/ats.py
# Improved ATS scoring: TF-IDF + keyword overlap + experience check
# Minimal external deps: sklearn (already used in project). No NLTK required.

import re
import math
from collections import Counter
from typing import Dict, Iterable, List

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
# at top
import nltk
from nltk.corpus import stopwords
import re
import math
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from fuzzywuzzy import fuzz
from nltk.stem import WordNetLemmatizer
from nltk.tokenize import word_tokenize
# --- at top of file ---
import os, re, math
ML_ENABLED = os.getenv("ML_ENABLED", "0").lower() in ("1", "true", "yes")

SentenceTransformer = None
try:
    if ML_ENABLED:
        from sentence_transformers import SentenceTransformer  # optional
except Exception:
    SentenceTransformer = None
    ML_ENABLED = False

_model = None

def _ensure_model():
    """Load ST model only if ML_ENABLED and package exists; else None."""
    global _model
    if not ML_ENABLED or SentenceTransformer is None:
        return None
    if _model is None:
        _model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    return _model

def compute_embedding(text: str):
    """Return embedding or empty list when ML disabled."""
    model = _ensure_model()
    if model is None:
        return []  # fallback – keep shape but lightweight
    return model.encode([text])[0].tolist()

def _cosine(a, b):
    if not a or not b: return 0.0
    import numpy as np
    a = np.array(a); b = np.array(b)
    denom = (np.linalg.norm(a) * np.linalg.norm(b))
    return float(np.dot(a, b) / denom) if denom else 0.0

def score_resume_for_job(resume_text: str, job_desc: str) -> float:
    """If ML available → cosine of embeddings; else simple keyword overlap %."""
    if ML_ENABLED and SentenceTransformer is not None:
        er = compute_embedding(resume_text)
        ej = compute_embedding(job_desc)
        return round(100 * _cosine(er, ej), 2)

    # --- lightweight fallback ---
    tok = lambda s: set(re.findall(r"[a-zA-Z]+", s.lower()))
    R, J = tok(resume_text), tok(job_desc)
    return round(100 * (len(R & J) / len(J))) if J else 0.0





# small stopword list to remove very common tokens
STOPWORDS = {
    'and','or','the','a','an','of','in','on','for','to','with','by','as',
    'is','are','be','this','that','from','at','it','you','your','we','our'
}

def normalize_text(text: str) -> str:
    """Lowercase, remove non-alphanum (keep + and # for things like c++ or c#),
       collapse whitespace. Returns cleaned string."""
    if not text:
        return ""
    text = str(text).lower()
    # keep plus (# and + often appear in skill names like c++, c#)
    text = re.sub(r'[^a-z0-9\+\#]+', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def tokenize(text: str) -> List[str]:
    """Simple tokenizer removing stopwords and short tokens."""
    s = normalize_text(text)
    tokens = [t for t in s.split() if len(t) > 1 and t not in STOPWORDS]
    return tokens

def get_keyword_set(text: str) -> set:
    """Return a set of normalized keyword tokens."""
    return set(tokenize(text))

def experience_score(job_experience_req, resume_experience):
    """
    job_experience_req: int or string convertible to int (years)
    resume_experience: int/float or string
    returns a 0..1 score
    """
    try:
        j = int(job_experience_req or 0)
    except Exception:
        j = 0
    try:
        r = float(resume_experience or 0)
    except Exception:
        r = 0.0

    if j <= 0:
        return 1.0  # job doesn't require experience -> full score
    # if candidate has >= required -> full score
    if r >= j:
        return 1.0
    # if candidate has some experience, partial credit (linear)
    return max(0.0, r / j)

def keyword_overlap_score(job_text: str, resume_text: str, boost_keywords: Iterable[str] = None):
    """
    Returns 0..1 score based on overlap between job keywords and resume keywords.
    boost_keywords: iterable of keywords that get extra weight (e.g. required skills)
    """
    job_set = get_keyword_set(job_text)
    resume_set = get_keyword_set(resume_text)
    if not job_set:
        return 0.0
    common = job_set.intersection(resume_set)
    base_score = len(common) / max(1, len(job_set))

    # boost presence of any boost_keywords
    boost = 0.0
    if boost_keywords:
        bset = set([normalize_text(x) for x in boost_keywords if x])
        if bset:
            matched = bset.intersection(resume_set)
            # each matched boost counts; cap boost contribution
            boost = min(0.5, (len(matched) / max(1, len(bset))) * 0.5)

    return min(1.0, base_score + boost)

def tfidf_cosine_score(job_text: str, resume_text: str):
    """
    Compute TF-IDF cosine similarity between job_text and resume_text.
    Returns 0..1.
    """
    texts = [normalize_text(job_text or ""), normalize_text(resume_text or "")]
    # If resume or job text too short, fallback to token overlap
    if len(texts[0].split()) < 1 or len(texts[1].split()) < 1:
        # fallback: simple overlap proportion
        return keyword_overlap_score(job_text, resume_text)

    vectorizer = TfidfVectorizer(ngram_range=(1,2), max_features=2000)
    try:
        vecs = vectorizer.fit_transform(texts)
        sim = cosine_similarity(vecs[0:1], vecs[1:2])[0][0]
        if math.isnan(sim):
            return 0.0
        # cosine similarity already 0..1
        return float(sim)
    except Exception:
        # safe fallback
        return keyword_overlap_score(job_text, resume_text)

def combine_scores(tfidf_s, kw_s, exp_s, weights: Dict[str, float] = None):
    """
    Combine component scores into final 0..100 percentage.
    weights: dict with keys 'tfidf','keyword','experience' e.g. {'tfidf':0.6,'keyword':0.3,'experience':0.1}
    """
    if weights is None:
        weights = {'tfidf': 0.6, 'keyword': 0.3, 'experience': 0.1}
    total = (weights.get('tfidf',0) * tfidf_s +
             weights.get('keyword',0) * kw_s +
             weights.get('experience',0) * exp_s)
    # clamp and convert 0..100
    total = max(0.0, min(1.0, total))
    return round(total * 100, 2)

def score_resume_for_job(job_text: str,
                         resume_text: str,
                         resume_experience=None,
                         job_experience_required=None,
                         boost_keywords: Iterable[str] = None,
                         weights: Dict[str, float] = None,
                         debug: bool = False) -> float:
    """
    Main function to call from views:
      score = score_resume_for_job(job_text, resume_text,
                                   resume_experience=r.experience,
                                   job_experience_required=job.experience_required,
                                   boost_keywords=['django','rest api'],
                                   weights={'tfidf':0.6,'keyword':0.3,'experience':0.1})

    Returns a float 0..100.
    """
    jt = job_text or ""
    rt = resume_text or ""

    # TF-IDF similarity
    tfidf_s = tfidf_cosine_score(jt, rt)

    # Keyword overlap (0..1)
    kw_s = keyword_overlap_score(jt, rt, boost_keywords=boost_keywords)

    # Experience match (0..1)
    exp_s = experience_score(job_experience_required, resume_experience)

    final = combine_scores(tfidf_s, kw_s, exp_s, weights=weights)

    if debug:
        return {
            'tfidf': round(tfidf_s, 4),
            'keyword': round(kw_s, 4),
            'experience': round(exp_s, 4),
            'final_percent': final
        }
    return final

# resumes/utils/ats.py


lemmatizer = WordNetLemmatizer()

def normalize_text(text):
    if not text:
        return ""
    text = str(text).lower()
    text = re.sub(r'[\r\n]+', ' ', text)
    text = re.sub(r'[^a-z0-9,. ]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    # basic lemmatize
    tokens = word_tokenize(text)
    toks = [lemmatizer.lemmatize(t) for t in tokens]
    return ' '.join(toks)

def _skill_overlap_score(job_skills_str, resume_skills_str):
    if not job_skills_str:
        return 0.0
    js = [s.strip().lower() for s in re.split(r',|;', job_skills_str) if s.strip()]
    rs = [s.strip().lower() for s in re.split(r',|;', resume_skills_str) if s.strip()]
    if not js:
        return 0.0
    found = 0
    for skill in js:
        # direct substring or fuzzy ratio threshold
        matched = any(skill in r or fuzz.partial_ratio(skill, r) >= 80 for r in rs)
        if matched:
            found += 1
    return found / len(js)

def score_resume_for_job(job_text, resume_text, job_skills=None, resume_skills=None):
    """
    Return score in 0-100 (int).
    - job_text/resume_text: free text (title+desc+skills)
    - job_skills/resume_skills: optional comma separated skill strings for higher weight
    """
    # normalize
    a = normalize_text(job_text or "")
    b = normalize_text(resume_text or "")

    # if both empty -> 0
    if not a and not b:
        return 0

    # TF-IDF vectorizer with 1-2grams to capture phrases
    try:
        vec = TfidfVectorizer(ngram_range=(1,2), min_df=1)
        X = vec.fit_transform([a, b])
        sim = cosine_similarity(X[0:1], X[1:2])[0][0]  # 0..1
    except Exception:
        sim = 0.0

    # skill overlap (strong signal)
    skill_score = 0.0
    if job_skills is not None or resume_skills is not None:
        js = job_skills or job_skills
        rs = resume_skills or resume_skills
        skill_score = _skill_overlap_score(job_skills or '', resume_skills or '')

    # combine: weight skill higher (0.6) + sim (0.4). tune as you wish.
    combined = (0.6 * skill_score) + (0.4 * sim)

    # handle case where skills not provided: fallback to TF-IDF
    if (not job_skills) and (not resume_skills):
        combined = sim

    score_pct = int(round(max(0.0, min(1.0, combined)) * 100))
    return score_pct

# don't call nltk.download() unconditionally. Instead:
try:
    _ = stopwords.words('english')
except LookupError:
    # try to download quietly
    try:
        nltk.download('stopwords', quiet=True)
        nltk.download('punkt', quiet=True)
        nltk.download('wordnet', quiet=True)
    except Exception as e:
        # log, but don't crash; fallback to simple stopword set
        print("Warning: NLTK corpora not available:", e)
        stopwords = set(["the","and","is","in","to","for","of","a"])
        
        
   
   # resumes/utils/ats.py
"""
Hybrid ATS scoring:
 - Primary: combine skill overlap + embedding similarity (sentence-transformers)
 - Fallbacks: your old scoring or TF-IDF cosine similarity
 - Provides helper to compute/store resume embeddings.
"""

import logging
from typing import Optional
import math

log = logging.getLogger(__name__)

# Try to import sentence-transformers lazily (fast startup even if not installed)
_MODEL = None
_MODEL_NAME = "all-MiniLM-L6-v2"

def _ensure_model():
    global _MODEL
    if _MODEL is not None:
        return _MODEL
    try:
        from sentence_transformers import SentenceTransformer, util
    except Exception as e:
        log.warning("sentence-transformers not available: %s", e)
        _MODEL = None
        return None
    _MODEL = SentenceTransformer(_MODEL_NAME)
    # keep util available via module import when needed
    _MODEL.util = util
    return _MODEL


# simple normalizer
def normalize_text(s):
    if not s:
        return ""
    return " ".join(s.strip().lower().split())

def _skill_list_from_string(s):
    if not s:
        return set()
    return set([x.strip().lower() for x in s.split(",") if x.strip()])

# compute embedding (tensor or numpy) for text, returns list(float)
def compute_embedding(text):
    m = _ensure_model()
    if not m:
        return None
    emb = m.encode(text, convert_to_numpy=True)
    # convert to Python list for easy DB storage
    return emb.tolist()

# embedding similarity (0..100)
def embedding_similarity_pct(job_text, resume_text):
    m = _ensure_model()
    if not m:
        return 0.0
    try:
        je = m.encode(job_text, convert_to_numpy=True)
        re = m.encode(resume_text, convert_to_numpy=True)
        # use util.cos_sim if available for tensors; for numpy fallback use dot/norm
        try:
            # util.cos_sim returns a tensor, convert to float
            from sentence_transformers import util
            sim = util.cos_sim(je, re).item()
        except Exception:
            # numpy fallback
            import numpy as np
            denom = (np.linalg.norm(je) * np.linalg.norm(re))
            sim = float(np.dot(je, re) / denom) if denom > 0 else 0.0
        return float(sim) * 100.0
    except Exception as e:
        log.exception("embedding_similarity_pct error: %s", e)
        return 0.0

# TF-IDF fallback similarity (0..100)
def tfidf_similarity_pct(a, b):
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity
        vec = TfidfVectorizer(stop_words='english').fit([a, b])
        A = vec.transform([a])
        B = vec.transform([b])
        sim = cosine_similarity(A, B)[0][0]
        return float(sim) * 100.0
    except Exception as e:
        log.exception("tfidf_similarity_pct error: %s", e)
        return 0.0

# main function (drop-in)
def score_resume_for_job(job_text: str,
                         resume_text: str,
                         job_skills: Optional[str] = None,
                         resume_skills: Optional[str] = None) -> float:
    """
    Returns numeric score in 0..100 (float).
    Strategy:
      - compute skill overlap % (if job_skills provided)
      - compute embedding similarity (if available)
      - combine: combined = 0.55*skill_overlap + 0.45*embed_sim  (tunable)
      - fallback: use TF-IDF similarity if embed missing
    """
    try:
        job_text_norm = normalize_text(job_text or "")
        resume_text_norm = normalize_text(resume_text or "")
        # skill overlap
        js = _skill_list_from_string(job_skills or "")
        rs = _skill_list_from_string(resume_skills or "")
        skill_pct = 0.0
        if js:
            skill_pct = (len(js & rs) / len(js)) * 100.0

        # embedding similarity preferred
        emb_pct = embedding_similarity_pct(job_text_norm, resume_text_norm) if job_text_norm and resume_text_norm else 0.0

        if emb_pct <= 0.0:
            # fallback to TF-IDF
            emb_pct = tfidf_similarity_pct(job_text_norm, resume_text_norm) if job_text_norm and resume_text_norm else 0.0

        # combine: give skill overlap slightly more weight
        combined = 0.55 * skill_pct + 0.45 * emb_pct

        # clamp & round
        combined = max(0.0, min(100.0, combined))
        return round(combined, 2)
    except Exception as e:
        log.exception("score_resume_for_job failed: %s", e)
        return 0.0
# resumes/utils/ats.py (only the compute helper needed for view)
from sentence_transformers import SentenceTransformer
_model = None
def _get_model():
    global _model
    if _model is None:
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model

def compute_embedding(text):
    m = _get_model()
    if not text:
        return None
    try:
        emb = m.encode(text, convert_to_numpy=True)
        return emb.tolist()
    except Exception:
        return None

