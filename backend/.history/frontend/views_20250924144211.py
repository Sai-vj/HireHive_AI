# frontend/views.py
from django.shortcuts import render
from django.utils import timezone
from news.models import News

def home(request):
    latest_news = News.objects.filter(is_published=True, published_at__lte=timezone.now()).order_by('-published_at')[:3]
    return render(request, 'home.html', {'latest_news': latest_news, 'year': timezone.now().year})

from django.shortcuts import render, redirect
from django.contrib import messages
from django.core.mail import send_mail
from django.conf import settings
from .forms import ContactForm

def contact_view(request):
    if request.method == "POST":
        form = ContactForm(request.POST)
        if form.is_valid():
            name = form.cleaned_data['name']
            email = form.cleaned_data['email']
            message = form.cleaned_data['message']

            # send email (configure EMAIL_BACKEND in settings.py)
            send_mail(
                subject=f"Contact from {name}",
                message=f"Message from {name} ({email}):\n\n{message}",
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[settings.DEFAULT_FROM_EMAIL],
                fail_silently=True,
            )

            messages.success(request, "Your message was sent successfully!")
            return redirect('contact')  # use your URL name
    else:
        form = ContactForm()

    return render(request, "contact.html", {"form": form})

