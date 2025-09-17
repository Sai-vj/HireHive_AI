# interviews/migrations/0002_add_job_field.py
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):

    dependencies = [
        ('interviews', '0001_initial'),  # adjust if your last migration name different
        ('resumes', '0001_initial'),     # only if your Job model in resumes app; adjust dependency if needed
    ]

    operations = [
        migrations.AddField(
            model_name='interview',
            name='job',
            field=models.ForeignKey(
                null=True,
                blank=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='interviews',
                to='resumes.job',
            ),
        ),
    ]