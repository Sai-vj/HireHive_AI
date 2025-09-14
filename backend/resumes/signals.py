# resumes/signals.py
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.core.cache import cache
from .models import Job, Resume

@receiver(post_save, sender=Job)
@receiver(post_delete, sender=Job)
def clear_job_cache_on_job_change(sender, instance, **kwargs):
    cache.delete(f"job_matches_{instance.id}")

@receiver(post_save, sender=Resume)
@receiver(post_delete, sender=Resume)
def clear_all_job_caches_on_resume_change(sender, instance, **kwargs):
    # simplest route: delete all job caches currently in use.
    # if you have many jobs, consider iterating jobs and deleting each key.
    # Here we clear all job caches by scanning job ids (cheap for small datasets).
    from .models import Job
    for job in Job.objects.all().values_list('id', flat=True):
        cache.delete(f"job_matches_{job}")
