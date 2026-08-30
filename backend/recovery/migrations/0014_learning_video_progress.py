from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("recovery", "0013_learning_assignments")]

    operations = [
        migrations.AddField(model_name="learningassignmentprogress", name="duration_seconds", field=models.PositiveIntegerField(default=0)),
        migrations.AddField(model_name="learningassignmentprogress", name="last_viewed_at", field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name="learningassignmentprogress", name="playback_position_seconds", field=models.PositiveIntegerField(default=0)),
    ]
