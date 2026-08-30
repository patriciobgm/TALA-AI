from django.db import migrations


def remove_stale_reopened_plans(apps, schema_editor):
    RecoveryPlan = apps.get_model("recovery", "RecoveryPlan")
    CompetencyResult = apps.get_model("recovery", "CompetencyResult")

    active_plans = RecoveryPlan.objects.filter(status="active").prefetch_related(
        "activities__attempts"
    )
    stale_ids = []
    for plan in active_plans:
        if not RecoveryPlan.objects.filter(
            student_id=plan.student_id,
            competency_id=plan.competency_id,
            status="completed",
        ).exists():
            continue
        if any(activity.completed_at or activity.attempts.exists() for activity in plan.activities.all()):
            continue
        latest_result = (
            CompetencyResult.objects.filter(
                attempt__student_id=plan.student_id,
                competency_id=plan.competency_id,
                attempt__submitted_at__isnull=False,
            )
            .order_by("-attempt__submitted_at", "-id")
            .first()
        )
        if latest_result and latest_result.status == "mastered":
            stale_ids.append(plan.id)

    RecoveryPlan.objects.filter(id__in=stale_ids).delete()


class Migration(migrations.Migration):
    dependencies = [("recovery", "0011_aimessagefeedback")]

    operations = [migrations.RunPython(remove_stale_reopened_plans, migrations.RunPython.noop)]
