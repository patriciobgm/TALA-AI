from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("recovery", "0017_subject_single_grade"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="recoveryactivity",
            name="recommendation_metadata",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="recoveryactivity",
            name="recommendation_reason",
            field=models.TextField(blank=True),
        ),
        migrations.CreateModel(
            name="LearningRecommendationDecision",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("decision", models.CharField(choices=[("accepted", "Accepted"), ("dismissed", "Dismissed")], max_length=12)),
                ("score", models.DecimalField(decimal_places=2, max_digits=6)),
                ("rationale", models.JSONField(default=dict)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("competency", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="recommendation_decisions", to="recovery.competency")),
                ("resource", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="recommendation_decisions", to="recovery.learningresource")),
                ("student", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="learning_recommendation_decisions", to=settings.AUTH_USER_MODEL)),
                ("teacher", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="reviewed_learning_recommendations", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at", "-id"]},
        ),
    ]
