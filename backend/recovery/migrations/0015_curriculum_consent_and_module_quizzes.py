from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def assign_existing_subjects_to_senior_high(apps, schema_editor):
    Subject = apps.get_model("recovery", "Subject")
    Subject.objects.filter(grade_levels=[]).update(grade_levels=[11, 12])


class Migration(migrations.Migration):
    dependencies = [("recovery", "0014_learning_video_progress")]

    operations = [
        migrations.AlterField(model_name="assessment", name="kind", field=models.CharField(choices=[("pre", "Pre-assessment"), ("post", "Post-assessment"), ("remedial", "Remedial exam")], max_length=8)),
        migrations.AddField(model_name="subject", name="grade_levels", field=models.JSONField(default=list)),
        migrations.RunPython(assign_existing_subjects_to_senior_high, migrations.RunPython.noop),
        migrations.CreateModel(
            name="LearningAssignmentQuizAttempt",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("answers", models.JSONField(default=dict)),
                ("score", models.DecimalField(decimal_places=2, max_digits=5)),
                ("passed", models.BooleanField(default=False)),
                ("submitted_at", models.DateTimeField(auto_now_add=True)),
                ("assignment", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="quiz_attempts", to="recovery.learningassignment")),
                ("student", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="learning_quiz_attempts", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-submitted_at", "-id"]},
        ),
        migrations.CreateModel(
            name="RemedialExamConsent",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("guardian_name", models.CharField(max_length=150)),
                ("guardian_relationship", models.CharField(max_length=80)),
                ("guardian_email", models.EmailField(blank=True, max_length=254)),
                ("status", models.CharField(choices=[("requested", "Awaiting parent/guardian"), ("approved", "Approved"), ("declined", "Declined"), ("revoked", "Revoked")], default="requested", max_length=16)),
                ("method", models.CharField(choices=[("digital", "Digital response"), ("paper", "Verified paper form")], default="digital", max_length=16)),
                ("policy_reference", models.CharField(default="DepEd DO 010, s. 2026", max_length=180)),
                ("consent_text", models.TextField()),
                ("requested_at", models.DateTimeField(auto_now_add=True)),
                ("responded_at", models.DateTimeField(blank=True, null=True)),
                ("evidence_file", models.FileField(blank=True, upload_to="remedial-consents/%Y/%m/")),
                ("response_ip", models.GenericIPAddressField(blank=True, null=True)),
                ("response_user_agent", models.CharField(blank=True, max_length=300)),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                ("notes", models.TextField(blank=True)),
                ("assessment", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="remedial_consents", to="recovery.assessment")),
                ("guardian", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="remedial_consents", to="recovery.guardiancontact")),
                ("requested_by", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="requested_remedial_consents", to=settings.AUTH_USER_MODEL)),
                ("student", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="remedial_exam_consents", to=settings.AUTH_USER_MODEL)),
                ("verified_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="verified_remedial_consents", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-requested_at", "-id"]},
        ),
        migrations.AddConstraint(model_name="remedialexamconsent", constraint=models.UniqueConstraint(fields=("assessment", "student"), name="unique_remedial_exam_consent")),
    ]
