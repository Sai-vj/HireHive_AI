from django.contrib import admin
from django import forms
from django.utils import timezone
from .models import Quiz, QuizAttempt, Question

# Optional: nice JSON widget (install django-json-widget if you want)
try:
    from django_json_widget.widgets import JSONEditorWidget
    JSON_WIDGET = JSONEditorWidget
except ImportError:
    JSON_WIDGET = forms.Textarea

# ----- Inline for Question -----
class QuestionInline(admin.TabularInline):
    model = Question
    extra = 1
    fields = ("text", "choices", "correct", "points", "explanation")
    formfield_overrides = {
        # Use nicer JSON widget for choices
        Question._meta.get_field("choices"): {"widget": JSON_WIDGET(attrs={"rows": 4, "cols": 60})}
    }

# ----- Quiz admin -----
class QuizAdminForm(forms.ModelForm):
    class Meta:
        model = Quiz
        fields = "__all__"
        widgets = {
            "questions_json": JSON_WIDGET(attrs={"style": "min-height:250px; font-family:monospace;"}),
        }

class QuizAdmin(admin.ModelAdmin):
    form = QuizAdminForm
    inlines = [QuestionInline]
    list_display = ("id", "job", "questions_count", "passing_percent", "auto_generated", "generated_at")
    search_fields = ("job__title", "skills")
    readonly_fields = ("generated_at",)

    actions = ["regenerate_dummy_questions"]

    def regenerate_dummy_questions(self, request, queryset):
        updated = 0
        for quiz in queryset:
            # create dummy questions
            dummy = []
            for i in range(1, quiz.questions_count + 1):
                dummy.append({
                    "id": f"dummy-{i}",
                    "text": f"Dummy Question {i} for {quiz.job.title}",
                    "choices": {"A": "Option A", "B": "Option B", "C": "Option C", "D": "Option D"},
                    "answer": "A",
                })
            quiz.questions_json = dummy
            quiz.generated_at = timezone.now()
            quiz.auto_generated = True
            quiz.save()
            updated += 1
        self.message_user(request, f"Regenerated {updated} quizzes with dummy questions.")

    regenerate_dummy_questions.short_description = "Regenerate selected quizzes with dummy questions"

# ----- QuizAttempt admin -----
class QuizAttemptAdmin(admin.ModelAdmin):
    list_display = ("id", "quiz", "candidate", "score", "passed", "started_at", "finished_at")
    search_fields = ("quiz__job__title", "candidate__username")
    list_filter = ("passed", "started_at")

# ----- Question admin -----
class QuestionAdmin(admin.ModelAdmin):
    list_display = ("id", "quiz", "text", "correct", "points")
    search_fields = ("text", "quiz__job__title")


admin.site.register(Quiz, QuizAdmin)
admin.site.register(QuizAttempt, QuizAttemptAdmin)
admin.site.register(Question, QuestionAdmin)
