from django.db import migrations


def backfill_recommendation_rationale(apps, schema_editor):
    RecoveryActivity = apps.get_model("recovery", "RecoveryActivity")
    activities = RecoveryActivity.objects.filter(resource__isnull=False, recommendation_reason="").select_related("plan__competency", "resource")
    for activity in activities.iterator():
        baseline = round(float(activity.plan.baseline_score))
        band = "foundation" if baseline < 50 else "developing" if baseline < activity.plan.competency.mastery_threshold else "mastered"
        activity.recommendation_reason = (
            f"Aligned with {activity.plan.competency.code} · {activity.plan.competency.title}. "
            f"The learner's baseline evidence was {baseline}%, placing support in the {band} band. "
            f"This approved {activity.resource.get_resource_type_display().lower()} provides {activity.resource.difficulty} support before the mastery check."
        )
        activity.recommendation_metadata = {
            "algorithm_version": "evidence-rank-v1-backfill",
            "latest_score": baseline,
            "score_band": band,
            "resource_type": activity.resource.resource_type,
            "difficulty": activity.resource.difficulty,
            "confidence": "medium",
        }
        activity.save(update_fields=["recommendation_reason", "recommendation_metadata"])


class Migration(migrations.Migration):
    dependencies = [("recovery", "0018_learning_recommendations")]

    operations = [migrations.RunPython(backfill_recommendation_rationale, migrations.RunPython.noop)]
