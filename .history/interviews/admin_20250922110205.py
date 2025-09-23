# interviews/admin.py
from glob import escape
from django.contrib import admin
from django.utils.html import format_html
from django.urls import reverse
from django.shortcuts import redirect
from .models import Interview, InterviewQuestion, InterviewAttempt, InterviewInvite

# ---------- Inline: Questions inside Interview ----------
class InterviewQuestionInline(admin.StackedInline):
    model = InterviewQuestion
    extra = 0
    fields = ('prompt', 'kind', 'choices', 'answer', 'status', 'created_by', 'created_at', 'updated_at')
    readonly_fields = ('created_at', 'updated_at')
    show_change_link = True
    autocomplete_fields = getattr(InterviewQuestion, 'autocomplete_fields', [])  # safe

# ---------- InterviewAdmin ----------
@admin.register(Interview)
class InterviewAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'job_link', 'is_active', 'scheduled_at', 'duration_minutes', 'created_by')
    list_filter = ('is_active', 'mode', 'created_by')
    search_fields = ('title', 'description', 'job__title', 'job__id')
    readonly_fields = ('created_at', 'updated_at')
    inlines = [InterviewQuestionInline]
    raw_id_fields = ('job',)  # if you have Job FK
    ordering = ('-scheduled_at',)

    fieldsets = (
        (None, {
            'fields': ('title', 'description', 'job', 'is_active', 'mode', 'duration_minutes', 'scheduled_at', 'passing_percent')
        }),
        ('Advanced', {
            'classes': ('collapse',),
            'fields': ('created_by', 'created_at', 'updated_at'),
        }),
    )

    def get_queryset(self, request):
        qs = super().get_queryset(request)
        # optionally restrict non-recruiters: show all for staff
        return qs

    def job_link(self, obj):
        if getattr(obj, 'job', None):
            try:
                url = reverse('admin:resumes_job_change', args=(obj.job.pk,))
                return format_html('<a href="{}">{}</a>', url, obj.job)
            except Exception:
                return str(obj.job)
        return '-'
    job_link.short_description = 'Job'

    # example admin action to generate questions (calls your task sync fallback)
    actions = ['action_generate_questions', 'mark_inactive', 'mark_active']

    def action_generate_questions(self, request, queryset):
        # simple sync generation placeholder: call your task function here if available
        from .tasks import generate_questions_task
        count = 0
        for interview in queryset:
            try:
                # call sync function; in production prefer enqueueing task
                generate_questions_task(interview.id, request.user.id, {}, 10, True)
                count += 1
            except Exception:
                pass
        self.message_user(request, f"Generation requested for {count} interviews.")
    action_generate_questions.short_description = "Generate questions (sync/task)"

    def mark_inactive(self, request, queryset):
        updated = queryset.update(is_active=False)
        self.message_user(request, f"{updated} interview(s) marked inactive.")
    mark_inactive.short_description = "Mark selected inactive"

    def mark_active(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(request, f"{updated} interview(s) marked active.")
    mark_active.short_description = "Mark selected active"

# ---------- Question admin ----------
@admin.register(InterviewQuestion)
class InterviewQuestionAdmin(admin.ModelAdmin):
    list_display = ('id', 'short_prompt', 'interview_link', 'kind', 'status', 'created_by', 'created_at')
    list_filter = ('kind', 'status', 'created_by')
    search_fields = ('prompt', 'text', 'choices')
    readonly_fields = ('created_at', 'updated_at')
    autocomplete_fields = ('interview',)

    def short_prompt(self, obj):
        return (obj.prompt or str(obj.id))[:80]
    short_prompt.short_description = 'Question'

    def interview_link(self, obj):
        if obj.interview_id:
            try:
                url = reverse('admin:interviews_interview_change', args=(obj.interview_id,))
                return format_html('<a href="{}">{}</a>', url, obj.interview)
            except Exception:
                return str(obj.interview)
        return '-'
    interview_link.short_description = 'Interview'

    actions = ['publish_selected', 'reject_selected']
    def publish_selected(self, request, queryset):
        updated = queryset.update(status='published')
        self.message_user(request, f"{updated} question(s) published.")
    publish_selected.short_description = "Publish selected questions"

    def reject_selected(self, request, queryset):
        updated = queryset.update(status='rejected')
        self.message_user(request, f"{updated} question(s) rejected.")
    reject_selected.short_description = "Reject selected questions"

# ---------- Attempt admin ----------
@admin.register(InterviewAttempt)
class InterviewAttemptAdmin(admin.ModelAdmin):
    list_display = ('id', 'interview', 'candidate', 'started_at', 'finished_at', 'score', 'passed', 'flagged')
    list_filter = ('passed', 'flagged')
    search_fields = ('candidate__username', 'candidate__email', 'interview__title')
    readonly_fields = ('answers', 'question_snapshot', 'started_at', 'finished_at', 'last_saved_at')
    ordering = ('-started_at',)

    # optionally show pretty answers JSON
    def answers_display(self, obj):
        return format_html('<pre style="white-space:pre-wrap">{}</pre>', escape(obj.answers))
    # register custom readonly field if you want to display it in change view

# ---------- Invite admin ----------
@admin.register(InterviewInvite)
class InterviewInviteAdmin(admin.ModelAdmin):
    list_display = ('id', 'interview', 'candidate', 'scheduled_at', 'status', 'sent_at')
    list_filter = ('status',)
    search_fields = ('candidate__username', 'candidate__email', 'interview__title')
    readonly_fields = ('sent_at', 'created_at', 'updated_at')

    actions = ['send_notification']

    def send_notification(self, request, queryset):
        # call your send_invite_notification task
        from .tasks import send_invite_notification
        sent = 0
        for inv in queryset:
            try:
                send_invite_notification.delay(inv.id)
                sent += 1
            except Exception:
                pass
        self.message_user(request, f"Queued notifications for {sent} invites.")
    send_notification.short_description = "Send invite notifications (async)"

# ---------- Optional: unregister & re-register user if needed ----------
# from django.contrib.auth import get_user_model
# admin.site.unregister(get_user_model())
# admin.site.register(get_user_model(), CustomUserAdmin)
