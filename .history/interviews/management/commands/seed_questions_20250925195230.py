from django.core.management.base import BaseCommand
from django.utils import timezone
from interviews.models import Interview, InterviewQuestion
import json

class Command(BaseCommand):
    help = "Seed interview questions for a job interview"

    def add_arguments(self, parser):
        parser.add_argument('interview_id', type=int, help="Interview ID")
        parser.add_argument('count', type=int, nargs='?', default=5, help="Number of questions to generate")

    def handle(self, *args, **opts):
        iv = Interview.objects.get(pk=opts['interview_id'])
        count = opts['count']

        created = []
        for i in range(1, count+1):
            kwargs = {
                'interview': iv,
                'status': 'published'
            }

            # prompt
            if hasattr(InterviewQuestion, '_meta') and 'prompt' in {f.name for f in InterviewQuestion._meta.get_fields()}:
                kwargs['prompt'] = f"Sample Question {i}: What is {i}+{i}?"
            elif 'text' in {f.name for f in InterviewQuestion._meta.get_fields()}:
                kwargs['text'] = f"Sample Question {i}: What is {i}+{i}?"
            else:
                kwargs['question_text'] = f"Sample Question {i}: What is {i}+{i}?"

            # kind
            if 'kind' in {f.name for f in InterviewQuestion._meta.get_fields()}:
                kwargs['kind'] = 'mcq'
            elif 'question_type' in {f.name for f in InterviewQuestion._meta.get_fields()}:
                kwargs['question_type'] = 'mcq'

            # simple choices + answer
            if 'choices' in {f.name for f in InterviewQuestion._meta.get_fields()}:
                kwargs['choices'] = json.dumps([str(i), str(i*2), str(i+3)])
            if 'answer' in {f.name for f in InterviewQuestion._meta.get_fields()}:
                kwargs['answer'] = str(i*2)

            obj = InterviewQuestion.objects.create(**kwargs)
            created.append(obj.id)

        self.stdout.write(self.style.SUCCESS(
            f"Created {len(created)} questions for interview {iv.id}: {created}"
        ))
