# interviews/migrations/00XX_add_missing_interview_fields.py
from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings

class Migration(migrations.Migration):

    dependencies = [
        ('interviews', '0002_previous_migration'),  # <- replace with your last migration
        # optionally depend on resumes app if Job model is there:
        # ('resumes','000Y_some_migration'),
    ]

    operations = [
        migrations.AddField(
            model_name='interview',
            name='duration_minutes',
            field=models.PositiveIntegerField(default=30),
        ),
        migrations.AddField(
            model_name='interview',
            name='mode',
            field=models.CharField(default='online', max_length=50),
        ),
        migrations.AddField(
            model_name='interview',
            name='is_active',
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name='interview',
            name='passing_percent',
            field=models.PositiveIntegerField(default=60),
        ),
        migrations.AddField(
            model_name='interview',
            name='job',
            field=models.ForeignKey(
                related_name='interviews',
                null=True,
                blank=True,
                to='resumes.job',  # <-- adjust if your job app label is different
                on_delete=django.db.models.deletion.SET_NULL
            ),
        ),
    ]