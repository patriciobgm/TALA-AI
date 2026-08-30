from django.db import migrations


def add_content_review_deep_links(apps, schema_editor):
    Notification = apps.get_model("recovery", "Notification")
    for notification in Notification.objects.filter(kind="content_review", action_url="/imports"):
        parts = notification.deduplication_key.split(":")
        if len(parts) >= 2 and parts[0] == "content-import" and parts[1].isdigit():
            notification.action_url = f"/imports/{parts[1]}"
            notification.save(update_fields=["action_url"])


class Migration(migrations.Migration):
    dependencies = [("recovery", "0022_derive_teacher_classes_from_subject_grades")]

    operations = [migrations.RunPython(add_content_review_deep_links, migrations.RunPython.noop)]
