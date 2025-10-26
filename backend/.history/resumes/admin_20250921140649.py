from django.contrib import admin
from .models import Job, Resume, Application, Shortlist  # unga models name

@admin.register(Job)
class JobAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'company', 'experience_required', 'created_by', 'created_at')
    search_fields = ('title', 'company')
    list_filter = ('company', 'experience_required')

@admin.register(Resume)
class ResumeAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'file', 'uploaded_at')

@admin.register(Application)
class ApplicationAdmin(admin.ModelAdmin):
    list_display = ('id', 'job', 'resume', 'status', 'applied_at')

@admin.register(Shortlist)
class ShortlistAdmin(admin.ModelAdmin):
    list_display = ('id', 'job', 'resume', 'shortlisted_by', 'created_at')
