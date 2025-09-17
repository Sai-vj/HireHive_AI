# resumes/utils/scoring.py
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer


    
    


from typing import Optional, Dict, Any, Iterable
import math
import logging

logger = logging.getLogger(__name__)

# sklearn imports are optional (TF-IDF fallback)
try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
except Exception:
    TfidfVectorizer = None
    cosine_similarity = None

# numpy for embedding math (optional)
try:
    import numpy as np
except Exception:
    np = None


def _safe_cosine_similarity(a: Iterable[float], b: Iterable[float]) -> float:
    """Return cosine similarity in range [0.0, 1.0]. Safe to None/zero lengths."""
    try:
        if np is None:
            # simple python fallback (less efficient)
            a_list = list(a)
            b_list = list(b)
            denom = math.sqrt(sum(x * x for x in a_list)) * math.sqrt(sum(x * x for x in b_list))
            if denom == 0:
                return 0.0
            dot = sum(x * y for x, y in zip(a_list, b_list))
            return max(0.0, min(1.0, float(dot / denom)))
        else:
            a_arr = np.array(a, dtype=float)
            b_arr = np.array(b, dtype=float)
            denom = (np.linalg.norm(a_arr) * np.linalg.norm(b_arr))
            if denom == 0:
                return 0.0
            sim = float(np.dot(a_arr, b_arr) / denom)
            return max(0.0, min(1.0, sim))
    except Exception:
        logger.exception("safe cosine similarity failure")
        return 0.0


def _tfidf_pct(job_text: str, resume_text: str) -> float:
    """Return TF-IDF cosine similarity * 100.0. If sklearn not present, return 0.0."""
    try:
        if not job_text or not resume_text:
            return 0.0
        if TfidfVectorizer is None or cosine_similarity is None:
            return 0.0
        vec = TfidfVectorizer(stop_words='english').fit([job_text, resume_text])
        job_v = vec.transform([job_text])
        res_v = vec.transform([resume_text])
        sim = cosine_similarity(job_v, res_v)[0][0]
        return float(sim * 100.0)
    except Exception:
        logger.exception("TFIDF similarity failed")
        return 0.0


def _skills_pct(job_skills: Optional[str], resume_skills: Optional[str]) -> float:
    """Very small, robust skill overlap score (0..100). Input: CSV-ish strings."""
    try:
        js = set([s.strip().lower() for s in (job_skills or "").split(',') if s.strip()])
        rs = set([s.strip().lower() for s in (resume_skills or "").split(',') if s.strip()])
        if not js:
            return 0.0
        common = js & rs
        pct = (len(common) / len(js)) * 100.0
        return round(float(pct), 2)
    except Exception:
        logger.exception("skills pct failed")
        return 0.0


def score_resume_for_job(job_text: str,
                         resume_text: str,
                         job_skills: Optional[str] = None,
                         resume_skills: Optional[str] = None,
                         model: Optional[Any] = None) -> Dict[str, Any]:
    """
    Score a resume vs job, prefer embeddings if model provided.

    - job_text, resume_text: strings
    - job_skills, resume_skills: comma-separated strings
    - model: optional embedding model (must expose `.encode(text, convert_to_numpy=True)` or `.encode(text)`)

    Returns dict:
      { score, embedding_pct, tfidf_pct, skills_pct, explain }
    """
    # normalize
    job_text_local = (job_text or "").strip()
    resume_text_local = (resume_text or "").strip()

    result = {
        "score": 0.0,
        "embedding_pct": 0.0,
        "tfidf_pct": 0.0,
        "skills_pct": 0.0,
        "explain": {}
    }

    # quick exit if no job text
    if not job_text_local:
        return result

    # 1) Try embedding similarity if model provided
    used_embedding = False
    if model is not None:
        try:
            # support either numpy or python list outputs
            job_emb = None
            try:
                job_emb = model.encode(job_text_local, convert_to_numpy=True)
            except TypeError:
                # some local models may not accept convert_to_numpy
                job_emb = model.encode(job_text_local)
            except Exception:
                # other errors - try plain encode
                try:
                    job_emb = model.encode(job_text_local)
                except Exception:
                    job_emb = None

            # same for resume
            resume_emb = None
            try:
                resume_emb = model.encode(resume_text_local, convert_to_numpy=True)
            except Exception:
                try:
                    resume_emb = model.encode(resume_text_local)
                except Exception:
                    resume_emb = None

            if job_emb is not None and resume_emb is not None:
                sim = _safe_cosine_similarity(job_emb, resume_emb)
                embedding_pct = float(sim * 100.0)
                result["embedding_pct"] = round(embedding_pct, 4)
                used_embedding = True
        except Exception:
            logger.exception("Embedding scoring failed")

    # 2) TF-IDF fallback (or always compute for comparison)
    try:
        tfidf_pct = _tfidf_pct(job_text_local, resume_text_local)
        result["tfidf_pct"] = round(float(tfidf_pct), 4)
    except Exception:
        result["tfidf_pct"] = 0.0

    # 3) Skills overlap
    try:
        skills_pct = _skills_pct(job_skills, resume_skills)
        result["skills_pct"] = float(skills_pct)
    except Exception:
        result["skills_pct"] = 0.0

    # 4) Compose final score:
    # - if embedding used: weight embedding 0.7, skills 0.3 (tweakable)
    # - if not: weight tfidf 0.8, skills 0.2
    try:
        if used_embedding and result["embedding_pct"]:
            final = (0.7 * result["embedding_pct"]) + (0.3 * result["skills_pct"])
        else:
            final = (0.8 * result["tfidf_pct"]) + (0.2 * result["skills_pct"])
        final = max(0.0, min(100.0, float(final)))
        result["score"] = round(final, 2)
    except Exception:
        result["score"] = 0.0

    # add explanation small summary
    result["explain"] = {
        "used_embedding": bool(used_embedding),
        "embedding_pct": result["embedding_pct"],
        "tfidf_pct": result["tfidf_pct"],
        "skills_pct": result["skills_pct"]
    }

    return result

