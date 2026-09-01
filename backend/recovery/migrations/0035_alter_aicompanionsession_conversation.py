import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("recovery", "0034_aicompanionsession_aihelprequest_and_more"),
    ]

    operations = [
        migrations.AlterField(
            model_name="aicompanionsession",
            name="conversation",
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="companion_sessions", to="recovery.aiconversation"),
        ),
    ]
