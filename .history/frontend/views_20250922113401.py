from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required

def home_page(request):
    return render(request, "home.html")

def contact_page(request):
    return render(request, "contact.html")

def news_list(request):
    return render(request, "news_list.html")

def news_detail(request, pk):
    return render(request, "news_detail.html")

@login_required
def go_to_dashboard(request):
    if request.user.is_staff:
        return redirect("/recruiter/dashboard/")
    return redirect("/resumes/dashboard/candidate/")
