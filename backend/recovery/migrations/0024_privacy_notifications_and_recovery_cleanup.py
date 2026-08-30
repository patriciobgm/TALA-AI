from django.db import migrations, models


def reconcile_mastered_recovery_plans(apps, schema_editor):
    CompetencyResult = apps.get_model("recovery", "CompetencyResult")
    RecoveryPlan = apps.get_model("recovery", "RecoveryPlan")

    for plan in RecoveryPlan.objects.filter(status="active").order_by("id"):
        latest_result = (
            CompetencyResult.objects.filter(
                attempt__student_id=plan.student_id,
                competency_id=plan.competency_id,
                attempt__submitted_at__isnull=False,
            )
            .select_related("attempt")
            .order_by("-attempt__submitted_at", "-id")
            .first()
        )
        if not latest_result or latest_result.status != "mastered":
            continue

        has_completed_plan = RecoveryPlan.objects.filter(
            student_id=plan.student_id,
            competency_id=plan.competency_id,
            status="completed",
        ).exists()
        has_attempts = plan.activities.filter(attempts__isnull=False).exists()
        if has_completed_plan and not has_attempts:
            plan.delete()
            continue

        plan.status = "completed"
        plan.save(update_fields=["status"])
        plan.activities.filter(resource_id__isnull=True, completed_at__isnull=True).update(
            completed_at=latest_result.attempt.submitted_at
        )


class Migration(migrations.Migration):
    dependencies = [("recovery", "0023_content_review_notification_deep_links")]

    operations = [
        migrations.AlterField(
            model_name="notification",
            name="kind",
            field=models.CharField(
                choices=[
                    ("plan_assigned", "Recovery plan assigned"),
                    ("activity_due", "Activity due"),
                    ("activity_overdue", "Activity overdue"),
                    ("plan_progress", "Recovery plan progress"),
                    ("assessment_result", "Assessment result"),
                    ("intervention", "Teacher intervention"),
                    ("content_review", "Content awaiting review"),
                    ("content_published", "Learning content published"),
                    ("learning_assigned", "Learning material assigned"),
                    ("privacy_request", "Privacy request"),
                ],
                max_length=32,
            ),
        ),
        migrations.RunPython(reconcile_mastered_recovery_plans, migrations.RunPython.noop),
    ]
