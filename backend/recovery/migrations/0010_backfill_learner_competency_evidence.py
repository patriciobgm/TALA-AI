from django.db import migrations


def backfill_evidence(apps, schema_editor):
    CompetencyResult = apps.get_model("recovery", "CompetencyResult")
    ActivityAttempt = apps.get_model("recovery", "ActivityAttempt")
    Evidence = apps.get_model("recovery", "LearnerCompetencyEvidence")
    for result in CompetencyResult.objects.select_related("attempt__assessment"):
        attempt = result.attempt
        evidence_type = "diagnostic" if attempt.assessment.kind == "pre" else "mastery"
        Evidence.objects.update_or_create(
            student_id=attempt.student_id,
            competency_id=result.competency_id,
            evidence_type=evidence_type,
            source_type="assessment_attempt",
            source_id=attempt.id,
            defaults={"score": result.score, "summary": f"Assessment result: {result.status}.", "details": {"assessment_id": attempt.assessment_id, "status": result.status}, "occurred_at": attempt.submitted_at},
        )
    for attempt in ActivityAttempt.objects.select_related("activity__plan", "activity__resource").filter(score__isnull=False):
        required_score = attempt.activity.resource.passing_score if attempt.activity.resource_id else 70
        passed = attempt.score >= required_score
        Evidence.objects.update_or_create(
            student_id=attempt.student_id,
            competency_id=attempt.activity.plan.competency_id,
            evidence_type="practice",
            source_type="activity_attempt",
            source_id=attempt.id,
            defaults={"score": attempt.score, "summary": f"Practice for {attempt.activity.title}: {'passed' if passed else 'needs another attempt'}.", "details": {"activity_id": attempt.activity_id, "passed": passed, "required_score": required_score}, "occurred_at": attempt.completed_at or attempt.started_at},
        )


class Migration(migrations.Migration):
    dependencies = [("recovery", "0009_aimessage_grounding_status_aimessage_latency_ms_and_more")]
    operations = [migrations.RunPython(backfill_evidence, migrations.RunPython.noop)]
