from django.db import migrations


def backfill_diagnostic_prerequisites(apps, schema_editor):
    Assessment = apps.get_model("recovery", "Assessment")
    LearningAssignment = apps.get_model("recovery", "LearningAssignment")
    for assessment in Assessment.objects.filter(kind="pre").prefetch_related("assigned_classes", "prerequisite_assignments"):
        if assessment.prerequisite_assignments.exists():
            continue
        class_ids = list(assessment.assigned_classes.values_list("id", flat=True))
        if not class_ids:
            continue
        assignments = (
            LearningAssignment.objects.filter(
                is_active=True,
                resource__is_approved=True,
                resource__competencies__subject_id=assessment.subject_id,
                assigned_classes__id__in=class_ids,
            )
            .exclude(resource__purpose__in=["recovery", "enrichment"])
            .distinct()
        )
        assessment.prerequisite_assignments.set(assignments)


class Migration(migrations.Migration):

    dependencies = [("recovery", "0035_alter_aicompanionsession_conversation")]

    operations = [migrations.RunPython(backfill_diagnostic_prerequisites, migrations.RunPython.noop)]
