from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("recovery", "0047_alter_notificationpreference_email_enabled_and_more"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="AssessmentQuestionImport",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("source_file", models.FileField(upload_to="assessment-question-imports/%Y/%m/")),
                ("answer_key_file", models.FileField(blank=True, null=True, upload_to="assessment-question-imports/%Y/%m/")),
                ("original_filename", models.CharField(max_length=255)),
                ("answer_key_original_filename", models.CharField(blank=True, max_length=255)),
                ("source_checksum_sha256", models.CharField(max_length=64)),
                ("answer_key_checksum_sha256", models.CharField(blank=True, max_length=64)),
                ("configuration", models.JSONField(blank=True, default=dict)),
                ("status", models.CharField(choices=[("processing", "Processing"), ("ready", "Ready for review"), ("applied", "Applied to assessment"), ("failed", "Needs attention")], default="processing", max_length=16)),
                ("proposed_questions", models.JSONField(blank=True, default=list)),
                ("analysis_metadata", models.JSONField(blank=True, default=dict)),
                ("error_message", models.TextField(blank=True)),
                ("applied_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("applied_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="applied_assessment_question_imports", to=settings.AUTH_USER_MODEL)),
                ("assessment", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="question_imports", to="recovery.assessment")),
                ("uploaded_by", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="assessment_question_imports", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at", "-id"]},
        ),
    ]
