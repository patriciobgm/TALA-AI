import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("recovery", "0025_backfill_privacy_request_notifications")]

    operations = [
        migrations.AlterField(
            model_name="aiconversation",
            name="plan",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="ai_conversations", to="recovery.recoveryplan"),
        ),
        migrations.AddField(
            model_name="aiconversation",
            name="learning_assignment",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="ai_conversations", to="recovery.learningassignment"),
        ),
        migrations.AddConstraint(
            model_name="aiconversation",
            constraint=models.CheckConstraint(
                condition=(models.Q(plan__isnull=False, learning_assignment__isnull=True) | models.Q(plan__isnull=True, learning_assignment__isnull=False)),
                name="ai_conversation_has_one_learning_context",
            ),
        ),
        migrations.AddConstraint(
            model_name="aiconversation",
            constraint=models.UniqueConstraint(condition=models.Q(("plan__isnull", False)), fields=("student", "plan"), name="unique_student_plan_ai_conversation"),
        ),
        migrations.AddConstraint(
            model_name="aiconversation",
            constraint=models.UniqueConstraint(condition=models.Q(("learning_assignment__isnull", False)), fields=("student", "learning_assignment"), name="unique_student_assignment_ai_conversation"),
        ),
    ]
