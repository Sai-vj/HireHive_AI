from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from interviews.models import Interview, InterviewQuestion

# adjust these lengths based on your DB column sizes (safe defaults)
MAX_GEN_BY_LEN = 16
MAX_QTEXT_LEN = 2000
MAX_TOPIC_LEN = 64

def safe_trunc(s, n):
    if s is None:
        return None
    s = str(s)
    return s if len(s) <= n else s[:n]


class Command(BaseCommand):
    help = "Seed sample questions for a given Interview ID"

    def add_arguments(self, parser):
        parser.add_argument("interview_id", type=int, help="Interview ID to seed questions")
        parser.add_argument("--count", type=int, default=3, help="Number of sample questions to create (default: 3)")

    def handle(self, *args, **options):
        interview_id = options["interview_id"]
        count = options.get("count", 3)

        try:
            interview = Interview.objects.get(pk=interview_id)
        except Interview.DoesNotExist:
            raise CommandError(f"Interview with id={interview_id} does not exist")

        # sample pool (will cycle if count > len(samples))
        pool = [
            ("Explain Python decorators with an example.", "text"),
            ("Which data structure in Python gives O(1) average lookup?", "mcq"),
            ("What is the difference between list and tuple in Python?", "text"),
            ("Which of the following is immutable in Python?", "mcq"),
            ("Describe how Python's garbage collection works.", "text"),
        ]

        created = 0
        now = timezone.now()
        for i in range(count):
            text, qtype = pool[i % len(pool)]
            q_text = safe_trunc(text, MAX_QTEXT_LEN)
            q_type = qtype

            # create reasonable MCQ choices
            choices = None
            answer = None
            if q_type == "mcq":
                choices = {"A": "List", "B": "Tuple", "C": "Dict", "D": "Set"}
                answer = "A"

            try:
                q = InterviewQuestion.objects.create(
                    interview=interview,
                    question_text=q_text,
                    question_type=q_type,
                    choices=choices,
                    answer=answer,
                    difficulty="medium",
                    topic=safe_trunc("python", MAX_TOPIC_LEN),
                    generated_by=safe_trunc("seed", MAX_GEN_BY_LEN),
                    status="published",
                    created_at=now,
                    updated_at=now,
                )
                created += 1
            except Exception as e:
                # continue but show a helpful message
                self.stdout.write(self.style.WARNING(f"Failed to create question #{i+1}: {e}"))
                continue

        self.stdout.write(self.style.SUCCESS(f"✅ Created {created} sample question(s) for interview {interview_id}"))
