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
