# interviews/admin.py
from django.contrib import admin
from django.utils.html import format_html, escape
from django.urls import reverse
from django.conf import settings
from django.apps import apps

# import models dynamically (works even if some models/fields differ)
Interview = apps.get_model('interviews', 'Interview')
InterviewQuestion = apps.get_model('interviews', 'InterviewQuestion')
InterviewAttempt = apps.get_model('interviews', 'InterviewAttempt')
InterviewInvite = apps.get_model('interviews', 'InterviewInvite')


def model_has_field(model, name):
    try:
        return any(f.name == name for f in model._meta.get_fields())
    except Exception:
        return False


def safe_list(*names):
    # return only those names that are either model fields or valid attributes
    def _safe(model):
        out = []
        for n in names:
            if not n:
                continue
            if model_has_field(model, n):
                out.append(n)
            else:
                # allow if admin method exists (we'll add as attr on ModelAdmin later)
                out.append(n) if hasattr(n, '__call__') else None
        return out
    return _safe


# ---------------- InterviewAdmin ----------------
@admin.register(Interview)
class InterviewAdmin(admin.ModelAdmin):
    # Choose sensible defaults but only include existing fields
    _cand = Interview
    list_display = []
    for f in ('id', 'title', 'job', 'is_active', 'scheduled_at', 'duration_minutes', 'created_by'):
        if model_has_field(Interview, f):
            list_display.append(f)

    list_filter = tuple([f for f in ('is_active', 'mode', 'created_by') if model_has_field(Interview, f)])
    search_fields = tuple([f for f in ('title', 'description', 'job__title', 'job__id') if True])
    readonly_fields = tuple([f for f in ('created_at', 'updated_at') if model_has_field(Interview, f)])
    raw_id_fields = tuple([f for f in ('job',) if model_has_field(Interview, f)])
    inlines = []

    fieldsets = (
        (None, {
            'fields': tuple(x for x in ('title', 'description', 'job', 'is_active', 'mode', 'duration_minutes', 'scheduled_at', 'passing_percent') if model_has_field(Interview, x))
        }),
    )

    actions = []

    def job_link(self, obj):
        if getattr(obj, 'job', None):
            try:
                url = reverse('admin:resumes_job_change', args=(obj.job.pk,))
                return format_html('<a href="{}">{}</a>', url, obj.job)
            except Exception:
                return str(obj.job)
        return '-'
    job_link.short_description = 'Job'

    # only add custom actions if relevant fields/methods exist
    def action_mark_inactive(self, request, queryset):
        if model_has_field(Interview, 'is_active'):
            updated = queryset.update(is_active=False)
            self.message_user(request, f"{updated} interview(s) marked inactive.")
    action_mark_inactive.short_description = "Mark selected inactive"

    def action_mark_active(self, request, queryset):
        if model_has_field(Interview, 'is_active'):
            updated = queryset.update(is_active=True)
            self.message_user(request, f"{updated} interview(s) marked active.")
    action_mark_active.short_description = "Mark selected active"

    actions = ['action_mark_inactive', 'action_mark_active']


# ---------------- InterviewQuestionAdmin ----------------
@admin.register(InterviewQuestion)
class InterviewQuestionAdmin(admin.ModelAdmin):
    list_display = []
    for f in ('id', 'prompt', 'interview', 'kind', 'status', 'created_by', 'created_at'):
        if model_has_field(InterviewQuestion, f):
            list_display.append(f)

    list_filter = tuple([f for f in ('kind', 'status', 'created_by') if model_has_field(InterviewQuestion, f)])
    search_fields = tuple(['prompt', 'text', 'choices'])  # search_fields don't crash if incorrect
    readonly_fields = tuple([f for f in ('created_at', 'updated_at') if model_has_field(InterviewQuestion, f)])
    autocomplete_fields = tuple([f for f in ('interview',) if model_has_field(InterviewQuestion, f)])

    actions = []
    if model_has_field(InterviewQuestion, 'status'):
        def publish_selected(self, request, queryset):
            queryset.update(status='published')
            self.message_user(request, f"{queryset.count()} published.")
        publish_selected.short_description = "Publish selected"
        actions.append('publish_selected')

    # helper to avoid SystemCheck: ensure list_display names exist
    # (we already filtered above)


# ---------------- InterviewAttemptAdmin ----------------
@admin.register(InterviewAttempt)
class InterviewAttemptAdmin(admin.ModelAdmin):
    list_display = []
    for f in ('id', 'interview', 'candidate', 'started_at', 'finished_at', 'score', 'passed', 'flagged'):
        if model_has_field(InterviewAttempt, f):
            list_display.append(f)

    list_filter = tuple([f for f in ('passed', 'flagged') if model_has_field(InterviewAttempt, f)])
    search_fields = tuple(['candidate__username', 'candidate__email', 'interview__title'])
    readonly_fields = tuple([f for f in ('answers', 'question_snapshot', 'started_at', 'finished_at', 'last_saved_at') if model_has_field(InterviewAttempt, f)])
    ordering = ('-started_at',) if model_has_field(InterviewAttempt, 'started_at') else ()

    # pretty display for JSON answers if present
    def answers_display(self, obj):
        try:
            val = getattr(obj, 'answers', None)
            return format_html('<pre style="white-space:pre-wrap">{}</pre>', escape(val if val is not None else ''))
        except Exception:
            return '-'
    # only register as readonly field if model has 'answers'
    if model_has_field(InterviewAttempt, 'answers'):
        readonly_fields = tuple(list(readonly_fields) + ['answers_display'])


# ---------------- InterviewInviteAdmin ----------------
@admin.register(InterviewInvite)
class InterviewInviteAdmin(admin.ModelAdmin):
    list_display = []
    for f in ('id', 'interview', 'candidate', 'scheduled_at', 'status', 'sent_at'):
        if model_has_field(InterviewInvite, f):
            list_display.append(f)

    list_filter = tuple([f for f in ('status',) if model_has_field(InterviewInvite, f)])
    search_fields = tuple(['candidate__username', 'candidate__email', 'interview__title'])
    readonly_fields = tuple([f for f in ('sent_at', 'created_at', 'updated_at') if model_has_field(InterviewInvite, f)])

    def send_notification(self, request, queryset):
        # try to import your celery task; ignore if missing
        try:
            from .tasks import send_invite_notification
            for inv in queryset:
                try:
                    send_invite_notification.delay(inv.id)
                except Exception:
                    pass
            self.message_user(request, f"Queued notifications for {queryset.count()} invites.")
        except Exception:
            self.message_user(request, "Task not configured (send_invite_notification not found).")
    send_notification.short_description = "Send invite notifications (async)"

    actions = ['send_notification']

