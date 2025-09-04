import re
import docx
import PyPDF2

def extract_text_from_pdf(file_path):
    text = ""
    with open(file_path, 'rb') as f:
        reader = PyPDF2.PdfReader(f)
        for page in reader.pages:
            text += page.extract_text() + "\n"
    return text

def extract_text_from_docx(file_path):
    text = ""
    doc = docx.Document(file_path)
    for para in doc.paragraphs:
        text += para.text + "\n"
    return text

def extract_skills(text):
    skills_db = ["Python", "Java", "C++", "Django", "Flask", "React", "Node.js", "SQL", "AWS", "Machine Learning"]
    found = [skill for skill in skills_db if skill.lower() in text.lower()]
    return found

def parse_resume(file_path):
    if file_path.endswith(".pdf"):
        text = extract_text_from_pdf(file_path)
    elif file_path.endswith(".docx"):
        text = extract_text_from_docx(file_path)
    else:
        return {"error": "Unsupported file format"}

    skills = extract_skills(text)

    return {
        "text": text[:500],   # sample text
        "skills": skills
    }

def match_jobs(user_skills, jobs):
    matches = []
    for job in jobs:
        required = [s.strip().lower() for s in job.skills_required.split(",")]
        user = [s.strip().lower() for s in user_skills]

        overlap = set(required) & set(user)
        match_percent = (len(overlap) / len(required)) * 100 if required else 0

        matches.append({
            "job": job,
            "match": round(match_percent, 2),
            "matched_skills": list(overlap)
        })
    return sorted(matches, key=lambda x: x["match"], reverse=True)
