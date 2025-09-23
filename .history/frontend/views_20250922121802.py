from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required

def home_page(request):
    return render(request, "frontend/home.html")

def contact_page(request):
    return render(request, "frontend/contact.html")

def news_list(request):
    return render(request, "frontend/news_list.html")

def news_detail(request, pk):
    return render(request, "frontend/news_detail.html")

@login_required
def go_to_dashboard(request):
    if request.user.is_staff:
        return redirect("/recruiter/dashboard/")
    return redirect("/resumes/dashboard/candidate/")


def jobs_page(request):
    return render(request, "frontend/jobs_list.html")

def job_detail_page(request, pk):
    return render(request, "frontend/job_detail.html", {"job_id": pk})

