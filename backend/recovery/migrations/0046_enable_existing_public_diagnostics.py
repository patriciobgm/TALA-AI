import uuid

from django.db import migrations


def enable_existing_diagnostics(apps, schema_editor):
    Assessment = apps.get_model("recovery", "Assessment")
    diagnostics = (
        Assessment.objects.filter(kind="pre", is_active=True, questions__isnull=False)
        .exclude(questions__question_type="essay")
        .distinct()
    )
    for assessment in diagnostics.iterator():
        if not assessment.public_access_code:
            code = f"DIA-{uuid.uuid4().hex[:8].upper()}"
            while Assessment.objects.filter(public_access_code=code).exists():
                code = f"DIA-{uuid.uuid4().hex[:8].upper()}"
            assessment.public_access_code = code
        assessment.public_access_enabled = True
        assessment.save(update_fields=["public_access_code", "public_access_enabled"])


def keep_public_configuration(apps, schema_editor):
    # Public access is an intentional teacher-managed setting and is not
    # disabled automatically if this data migration is reversed.
    pass


class Migration(migrations.Migration):
    dependencies = [("recovery", "0045_assessment_public_access_code_and_more")]

    operations = [migrations.RunPython(enable_existing_diagnostics, keep_public_configuration)]
