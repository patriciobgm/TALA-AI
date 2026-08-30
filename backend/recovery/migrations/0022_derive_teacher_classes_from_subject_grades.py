from django.db import migrations


def derive_teacher_classes(apps, schema_editor):
    UserProfile = apps.get_model("recovery", "UserProfile")
    AcademicClass = apps.get_model("recovery", "AcademicClass")
    for profile in UserProfile.objects.filter(role="teacher").prefetch_related("assigned_subjects"):
        grade_levels = list(profile.assigned_subjects.filter(is_active=True).values_list("grade_level", flat=True).distinct())
        profile.assigned_classes.set(AcademicClass.objects.filter(is_active=True, grade_level__in=grade_levels))


class Migration(migrations.Migration):
    dependencies = [("recovery", "0021_systemconfiguration_consent_expiry_days_and_more")]

    operations = [migrations.RunPython(derive_teacher_classes, migrations.RunPython.noop)]
