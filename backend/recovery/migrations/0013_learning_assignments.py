from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [("recovery", "0012_remove_stale_reopened_plans")]

    operations = [
        migrations.CreateModel(
            name="LearningAssignment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("instructions", models.TextField(blank=True)),
                ("due_at", models.DateTimeField(blank=True, null=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("assigned_by", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="created_learning_assignments", to=settings.AUTH_USER_MODEL)),
                ("assigned_classes", models.ManyToManyField(related_name="learning_assignments", to="recovery.academicclass")),
                ("resource", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="assignment", to="recovery.learningresource")),
            ],
            options={"ordering": ["due_at", "-created_at"]},
        ),
        migrations.CreateModel(
            name="LearningAssignmentProgress",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("opened_at", models.DateTimeField(blank=True, null=True)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                ("assignment", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="progress_records", to="recovery.learningassignment")),
                ("student", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="learning_progress", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddConstraint(
            model_name="learningassignmentprogress",
            constraint=models.UniqueConstraint(fields=("assignment", "student"), name="unique_learning_assignment_student"),
        ),
        migrations.AlterField(
            model_name="notification",
            name="kind",
            field=models.CharField(choices=[("plan_assigned", "Recovery plan assigned"), ("activity_due", "Activity due"), ("activity_overdue", "Activity overdue"), ("plan_progress", "Recovery plan progress"), ("assessment_result", "Assessment result"), ("intervention", "Teacher intervention"), ("content_review", "Content awaiting review"), ("content_published", "Learning content published"), ("learning_assigned", "Learning material assigned")], max_length=32),
        ),
    ]
