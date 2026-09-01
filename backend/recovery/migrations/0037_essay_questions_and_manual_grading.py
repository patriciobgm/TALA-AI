from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("recovery", "0036_backfill_diagnostic_learning_prerequisites"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name="question",
            name="question_type",
            field=models.CharField(choices=[("mcq", "Multiple choice"), ("tf", "True/False"), ("short", "Identification"), ("essay", "Short essay")], max_length=8),
        ),
        migrations.AlterField(model_name="question", name="correct_answer", field=models.TextField()),
        migrations.AddField(model_name="question", name="character_limit", field=models.PositiveSmallIntegerField(default=500)),
        migrations.AddField(model_name="assessmentattempt", name="grading_status", field=models.CharField(choices=[("auto_scored", "Automatically scored"), ("pending_review", "Awaiting teacher review"), ("teacher_scored", "Teacher scored")], default="auto_scored", max_length=16)),
        migrations.AddField(model_name="assessmentattempt", name="reviewed_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="assessmentattempt", name="reviewed_by", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="reviewed_assessment_attempts", to=settings.AUTH_USER_MODEL)),
        migrations.AlterField(model_name="studentanswer", name="answer", field=models.TextField()),
        migrations.AlterField(model_name="studentanswer", name="is_correct", field=models.BooleanField(blank=True, default=None, null=True)),
        migrations.AddField(model_name="studentanswer", name="feedback", field=models.TextField(blank=True)),
        migrations.AddField(model_name="studentanswer", name="score", field=models.DecimalField(blank=True, decimal_places=2, max_digits=5, null=True)),
    ]
