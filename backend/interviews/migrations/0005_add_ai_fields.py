# interviews/migrations/0005_add_ai_fields.py
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ('interviews', '0004_alter_interview_passing_percent'),
        # if your last migration name differs, change above to the last one shown in showmigrations
    ]

    operations = [
        # AI metadata fields
        migrations.AddField(
            model_name='interviewquestion',
            name='generated_by',
            field=models.CharField(default='human', max_length=10, choices=[('human', 'Human'), ('ai', 'AI')]),
        ),
        migrations.AddField(
            model_name='interviewquestion',
            name='ai_prompt',
            field=models.TextField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='interviewquestion',
            name='ai_model',
            field=models.CharField(blank=True, max_length=100, null=True),
        ),
        migrations.AddField(
            model_name='interviewquestion',
            name='ai_confidence',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='interviewquestion',
            name='status',
            field=models.CharField(default='published', max_length=20, choices=[('published', 'Published'), ('pending_review', 'Pending Review'), ('rejected', 'Rejected'), ('draft', 'Draft')]),
        ),

        # text_hash
        migrations.AddField(
            model_name='interviewquestion',
            name='text_hash',
            field=models.CharField(blank=True, db_index=True, max_length=64, null=True),
        ),

        # created_at / updated_at — use timezone.now as default to backfill existing rows
        migrations.AddField(
            model_name='interviewquestion',
            name='created_at',
            field=models.DateTimeField(default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='interviewquestion',
            name='updated_at',
            field=models.DateTimeField(default=django.utils.timezone.now),
            preserve_default=False,
        ),

        # created_by FK (nullable)
        migrations.AddField(
            model_name='interviewquestion',
            name='created_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_questions', to=settings.AUTH_USER_MODEL),
        ),
    ]
