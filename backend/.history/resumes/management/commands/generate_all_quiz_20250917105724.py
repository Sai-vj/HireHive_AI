from django.core.management.base import BaseCommand
from quiz.llm import generate_quiz_questions
from re.models import Job
from quiz.models import Quiz
from django.utils import timezone

class Command(BaseCommand):
    help = 'Generate quizzes for all jobs without quiz'

    def add_arguments(self, parser):
        parser.add_argument('--count', type=int, default=5)

    def handle(self, *args, **options):
        count = options['count']
        for job in Job.objects.all():
            quiz, created = Quiz.objects.get_or_create(job=job)
            # if you only want when missing:
            if created or not quiz.questions_json:
                qlist = generate_quiz_questions(job.title, job.skills_required or '', count=count)
                quiz.questions_json = qlist
                quiz.generated_at = timezone.now()
                quiz.auto_generated = True
                quiz.save()
                self.stdout.write(self.style.SUCCESS(f'Generated for job {job.id}'))
            else:
                self.stdout.write(f'skipped job {job.id} (already has quiz)')