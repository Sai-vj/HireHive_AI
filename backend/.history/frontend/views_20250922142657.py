# in your main app views.py
from django.shortcuts import render
from django.utils import timezone
from news.models import News

def home(request):
    latest_news = News.objects.filter(published_at__lte=timezone.now()).order_by('-published_at')[:3]
    return render(request, 'home.html', {'latest_news': latest_news, 'year': timezone.now().year})
