from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from interviews.models import Interview, InterviewQuestion


class Command(BaseCommand):
    help = "Seed sample questions for a given Interview ID"

    def add_arguments(self, parser):
        parser.add_argument("interview_id", type=int, help="Interview ID to seed questions")

    def handle(self, *args, **options):
        interview_id = options["interview_id"]

        try:
            interview = Interview.objects.get(pk=interview_id)
        except Interview.DoesNotExist:
            raise CommandError(f"Interview with id={interview_id} does not exist")

        samples = [
            ("Explain Python decorators with example.", "text"),
            ("Which data structure in Python gives O(1) average lookup?", "mcq"),
            ("What is the difference between list and tuple in Python?", "text"),
        ]

        created = 0
        for t, typ in samples:
            q = InterviewQuestion.objects.create(
                interview=interview,
                question_text=t,
                question_type=typ,
                choices={"A": "List", "B": "Tuple", "C": "Dict", "D": "Set"} if typ == "mcq" else None,
                answer="A" if typ == "mcq" else None,
                difficulty="medium",
                topic="python",
                generated_by="seed_command",
                status="published",
                created_at=timezone.now(),
                updated_at=timezone.now(),
            )
            created += 1

        self.stdout.write(self.style.SUCCESS(f"✅ Created {created} questions for interview {interview_id}"))
