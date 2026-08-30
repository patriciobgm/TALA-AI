from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("recovery", "0015_curriculum_consent_and_module_quizzes"),
    ]

    operations = [
        migrations.AddField(
            model_name="contentimport",
            name="archived_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="contentimport",
            name="archived_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="archived_content_imports", to=settings.AUTH_USER_MODEL),
        ),
    ]
