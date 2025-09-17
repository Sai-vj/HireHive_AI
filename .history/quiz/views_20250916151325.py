from django.shortcuts import render
from .forms import ResumeForm
from .utils import parse_resume

from .models import Job, Resume
from .utils import match_jobs





def upload_resume(request):
    if request.method == 'POST':
        form = ResumeForm(request.POST, request.FILES)
        if form.is_valid():
            resume = form.save()
            file_path = resume.file.path
            parsed = parse_resume(file_path)
            resume.skills = ", ".join(parsed["skills"])
            resume.save()
            return render(request, 'success.html', {"skills": parsed["skills"]})
    else:
        form = ResumeForm()
    return render(request, 'upload_resume.html', {'form': form})


    from .models import Job, Resume
from .utils import match_jobs

def job_matches(request, resume_id):
    resume = Resume.objects.get(id=resume_id)
    jobs = Job.objects.all()
    user_skills = resume.skills.split(", ") if resume.skills else []

    matches = match_jobs(user_skills, jobs)

    return render(request, "job_matches.html", {"resume": resume, "matches": matches})

