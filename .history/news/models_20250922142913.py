from django.db import models
from django.conf import settings
from django.utils.text import slugify
from django.urls import reverse

class News(models.Model):
    title = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, unique=True, blank=True)
    summary = models.TextField(blank=True)            # short teaser shown in home/news list
    content = models.TextField()                      # full article
    image = models.ImageField(upload_to='news/', null=True, blank=True)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    published_at = models.DateTimeField(null=True, blank=True)
    is_published = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('-published_at', '-created_at')
        verbose_name = 'News'
        verbose_name_plural = 'News'

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        # auto-generate slug if empty
        if not self.slug:
            base = slugify(self.title)[:200]
            slug = base
            counter = 1
            while News.objects.filter(slug=slug).exists():
                slug = f"{base}-{counter}"
                counter += 1
            self.slug = slug
        super().save(*args, **kwargs)

    def get_absolute_url(self):
        return reverse('news_detail', kwargs={'slug': self.slug})
