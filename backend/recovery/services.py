from collections import defaultdict
from datetime import timedelta
from django.db import transaction
from django.utils import timezone
from .models import CompetencyResult, Notification, RecoveryActivity, RecoveryPlan
from .learning_intelligence import rank_learning_resources
from .notifications import notify

DEVELOPING_THRESHOLD = 50


def sync_recovery_activity_completion(student, assignment, completed_at):
    """Reuse material completion recorded after the diagnostic that created a plan."""
    if not completed_at:
        return 0
    activities = RecoveryActivity.objects.filter(
        plan__student=student,
        plan__status="active",
        resource=assignment.resource,
        completed_at__isnull=True,
    ).select_related("plan__trigger_attempt")
    completed_ids = []
    for activity in activities:
        trigger_time = activity.plan.trigger_attempt.submitted_at if activity.plan.trigger_attempt_id else activity.plan.created_at
        if trigger_time and completed_at >= trigger_time:
            completed_ids.append(activity.id)
    if completed_ids:
        RecoveryActivity.objects.filter(id__in=completed_ids).update(completed_at=completed_at)
    return len(completed_ids)

def classify_mastery(score: float, mastery_threshold: int = 75) -> str:
    """Deterministic classification used by scoring and plan generation."""
    if score >= mastery_threshold:
        return CompetencyResult.Status.MASTERED
    if score >= DEVELOPING_THRESHOLD:
        return CompetencyResult.Status.DEVELOPING
    return CompetencyResult.Status.REMEDIATION

@transaction.atomic
def calculate_competency_results(attempt):
    grouped = defaultdict(list)
    for answer in attempt.answers.select_related("question__competency"):
        answer_score = answer.score
        if answer_score is None and answer.is_correct is not None:
            answer_score = 100 if answer.is_correct else 0
        if answer_score is None:
            raise ValueError("Every answer must be scored before competency results are calculated.")
        grouped[answer.question.competency].append(float(answer_score))
    results = []
    for competency, answers in grouped.items():
        score = round(sum(answers) / len(answers), 2)
        result, _ = CompetencyResult.objects.update_or_create(
            attempt=attempt, competency=competency,
            defaults={"score": score, "status": classify_mastery(score, competency.mastery_threshold)},
        )
        results.append(result)
    return results

@transaction.atomic
def create_recovery_plan(student, result, *, support_level="full"):
    latest_result = (
        CompetencyResult.objects.filter(
            attempt__student=student,
            competency=result.competency,
            attempt__submitted_at__isnull=False,
        )
        .select_related("attempt")
        .order_by("-attempt__submitted_at", "-id")
        .first()
    )
    if latest_result and latest_result.pk != result.pk and latest_result.status == CompetencyResult.Status.MASTERED:
        completed_plan = (
            RecoveryPlan.objects.filter(
                student=student,
                competency=result.competency,
                status="completed",
            )
            .order_by("-created_at")
            .first()
        )
        mastered_at = latest_result.attempt.submitted_at or timezone.now()
        for stale_plan in RecoveryPlan.objects.filter(
            student=student,
            competency=result.competency,
            status="active",
        ):
            if completed_plan and not stale_plan.activities.filter(attempts__isnull=False).exists():
                stale_plan.delete()
                continue
            stale_plan.status = "completed"
            stale_plan.save(update_fields=["status"])
            stale_plan.activities.filter(resource__isnull=True, completed_at__isnull=True).update(completed_at=mastered_at)
            completed_plan = completed_plan or stale_plan
        return completed_plan

    existing_active = RecoveryPlan.objects.filter(
        student=student, competency=result.competency, status="active"
    ).first()
    if existing_active:
        return existing_active

    plan, created = RecoveryPlan.objects.get_or_create(
        student=student, competency=result.competency, status="active",
        defaults={"baseline_score": result.score, "trigger_status": result.status, "trigger_attempt": result.attempt},
    )
    if created:
        recommendation_limit = 2 if support_level == "guided" else 3
        recommendations = rank_learning_resources(student, result.competency, limit=recommendation_limit)
        for position, recommendation in enumerate(recommendations, start=1):
            resource = recommendation["resource"]
            RecoveryActivity.objects.create(
                plan=plan,
                resource=resource,
                title=resource.title,
                position=position,
                due_at=timezone.now() + timedelta(days=position * 2),
                recommendation_reason=recommendation["reason"],
                recommendation_metadata={"score": recommendation["score"], "confidence": recommendation["confidence"], **recommendation["signals"]},
            )
        RecoveryActivity.objects.create(plan=plan, title="Mastery check", position=len(recommendations) + 1, due_at=timezone.now() + timedelta(days=(len(recommendations) + 1) * 2))
        notify(recipient=student, kind=Notification.Kind.PLAN_ASSIGNED, title="Recovery plan ready", message=f"Your recovery plan for {result.competency.title} is ready. Start with the first activity.", action_url="/recovery", deduplication_key=f"plan:{plan.id}:assigned")
    return plan
