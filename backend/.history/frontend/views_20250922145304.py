# frontend/views.py
from django.shortcuts import render
from django.utils import timezone
from news.models import News

def home(request):
    latest_news = News.objects.filter(is_published=True, published_at__lte=timezone.now()).order_by('-published_at')[:3]
    return render(request, 'home.html', {'latest_news': latest_news, 'year': timezone.now().year})

def contact(request):
    # simple contact page; later add form handling if needed
    return render(request, 'contact.html', {'year': timezone.now().year})
