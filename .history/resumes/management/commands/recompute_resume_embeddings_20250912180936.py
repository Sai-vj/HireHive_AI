from django.core.management.base import BaseCommand
from resumes.models import Resume
from resumes.utils.pdf_extract import extract_text_from_filefield
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("all-MiniLM-L6-v2")

def _get_resume_text(r):
    for field_name in ('extracted_text', 'text', 'content', 'skills'):
        val = getattr(r, field_name, None)
        if val:
            return str(val).strip()
    try:
        if getattr(r, 'file', None):
            return extract_text_from_filefield(r.file)
    except Exception:
        pass
    return ""


class Command(BaseCommand):
    help = "Recompute embeddings for all resumes"

    def handle(self, *args, **options):
        count = 0
        updated = 0

        for r in Resume.objects.all():
            count += 1
            try:
                resume_text = _get_resume_text(r)
                if not resume_text:
                    print(f"Skipped resume {getattr(r, 'id', None)} (no text)")
                    continue

                emb = model.encode(resume_text, convert_to_numpy=True).tolist()
                r.embedding = emb
                r.save(update_fields=["embedding"])
                updated += 1
                print(f"Updated resume {getattr(r, 'id', None)}")

            except Exception as e:
                print(f"Failed for resume {getattr(r, 'id', None)}: {e}")

        print(f"Done. Updated {updated} resumes out of {count}.")
