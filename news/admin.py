from django.contrib import admin
from .models import News

@admin.register(News)
class NewsAdmin(admin.ModelAdmin):
    list_display = ('title', 'author', 'published_at', 'is_published')
    list_filter = ('is_published', 'published_at', 'author')
    search_fields = ('title', 'summary', 'content')
    prepopulated_fields = {"slug": ("title",)}
    readonly_fields = ('created_at', 'updated_at')
    date_hierarchy = 'published_at'
