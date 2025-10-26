# resumes/admin.py
from django.contrib import admin
from .models import Job, Resume, Application, Shortlist

def _safe_list_display(model, preferred):
    """
    Return list of preferred fields that actually exist on model.
    If none of preferred exist, fall back to first 5 model fields.
    """
    model_fields = [f.name for f in model._meta.fields]
    out = [f for f in preferred if f in model_fields]
    if out:
        return tuple(out)
    return tuple(model_fields[:5])

@admin.register(Job)
class JobAdmin(admin.ModelAdmin):
    # prefer common names, will only keep those that exist on Job model
    list_display = _safe_list_display(Job, [
        'id', 'title', 'company', 'experience_required', 'created_by', 'posted_at', 'created_at'
    ])
    search_fields = ('title', 'company')
    # keep only filters that exist
    list_filter = tuple(f for f in ('company', 'experience_required') if f in [x.name for x in Job._meta.fields])

@admin.register(Resume)
class ResumeAdmin(admin.ModelAdmin):
    list_display = _safe_list_display(Resume, ['id', 'user', 'file', 'uploaded_at'])

@admin.register(Application)
class ApplicationAdmin(admin.ModelAdmin):
    list_display = _safe_list_display(Application, ['id', 'job', 'resume', 'status', 'applied_at'])

@admin.register(Shortlist)
class ShortlistAdmin(admin.ModelAdmin):
    list_display = _safe_list_display(Shortlist, ['id', 'job', 'resume', 'shortlisted_by', 'created_at'])
