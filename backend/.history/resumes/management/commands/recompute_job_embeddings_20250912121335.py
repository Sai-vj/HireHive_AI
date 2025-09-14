# resumes/management/commands/recompute_job_embeddings.py
from django.core.management.base import BaseCommand
from resumes.models import Resume  
from resumes.models import Job         
import sys

class Command(BaseCommand):
    help = "Compute & store embeddings for all jobs"

    def add_arguments(self, parser):
        parser.add_argument('--force', action='store_true', help='Overwrite existing embeddings')

    def handle(self, *args, **options):
        force = options.get('force', False)

        # lazy import of your embedding util (same as in match endpoint)
        try:
            from resumes.utils.ats import _ensure_model, compute_job_embedding_text
        except Exception:
            # fallback: import compute util directly if you have it elsewhere
            from resumes.utils.ats import _ensure_model
            def compute_job_embedding_text(text, model):
                # expects model.encode(text, convert_to_numpy=True).tolist()
                emb = None
                try:
                    emb = model.encode(text, convert_to_numpy=True).tolist()
                except Exception as e:
                    print("embedding compute failed:", e)
                return emb

        model = _ensure_model()
        if model is None:
            self.stdout.write(self.style.ERROR("No model available (ensure _ensure_model() works)."))
            return

        jobs = Job.objects.all()
        count = 0
        for job in jobs:
            # create text to embed
            job_text = " ".join(filter(None, [
                getattr(job,'title','') or '',
                getattr(job,'description','') or '',
                getattr(job,'skills_required','') or '',
            ])).strip()

            if not job_text:
                continue

            if job.embedding is not None and not force:
                # skip if already present
                continue

            try:
                emb = compute_job_embedding_text(job_text, model)
                if emb:
                    job.embedding = emb
                    job.save(update_fields=['embedding'])
                    count += 1
                    self.stdout.write(self.style.SUCCESS(f"Updated job {job.id}"))
                else:
                    self.stdout.write(self.style.WARNING(f"Embedding failed for job {job.id}"))
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Error for job {job.id}: {e}"))

        self.stdout.write(self.style.SUCCESS(f"Done. Updated {count} jobs."))
