from django.shortcuts import render, get_object_or_404
from django.utils import timezone
from .models import News

def news_list(request):
    qs = News.objects.filter(is_published=True, published_at__lte=timezone.now()).order_by('-published_at')
    return render(request, 'news_list.html', {'news_list': qs})

def news_detail(request, slug):
    news = get_object_or_404(News, slug=slug, is_published=True, published_at__lte=timezone.now())
    return render(request, 'news_detail.html', {'news': news})
