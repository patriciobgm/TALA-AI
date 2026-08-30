from django.db import migrations, models


def copy_subject_grade(apps, schema_editor):
    Subject = apps.get_model("recovery", "Subject")
    for subject in Subject.objects.all():
        levels = subject.grade_levels or []
        subject.grade_level = 12 if levels == [12] else 11
        subject.save(update_fields=["grade_level"])


class Migration(migrations.Migration):
    dependencies = [("recovery", "0016_contentimport_archiving")]

    operations = [
        migrations.AddField(model_name="subject", name="grade_level", field=models.PositiveSmallIntegerField(default=11)),
        migrations.RunPython(copy_subject_grade, migrations.RunPython.noop),
        migrations.RemoveField(model_name="subject", name="grade_levels"),
    ]
