from django.db import migrations


def normalize_video_resources(apps, schema_editor):
    LearningResource = apps.get_model("recovery", "LearningResource")
    LearningResource.objects.filter(mime_type__startswith="video/").exclude(resource_type="video").update(resource_type="video")


class Migration(migrations.Migration):
    dependencies = [("recovery", "0029_student_grade_level")]
    operations = [migrations.RunPython(normalize_video_resources, migrations.RunPython.noop)]
