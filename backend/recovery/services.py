from collections import defaultdict
from django.db import transaction
from .models import CompetencyResult, RecoveryActivity, RecoveryPlan

DEVELOPING_THRESHOLD = 50

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
        grouped[answer.question.competency].append(answer.is_correct)
    results = []
    for competency, answers in grouped.items():
        score = round(sum(answers) / len(answers) * 100, 2)
        result, _ = CompetencyResult.objects.update_or_create(
            attempt=attempt, competency=competency,
            defaults={"score": score, "status": classify_mastery(score, competency.mastery_threshold)},
        )
        results.append(result)
    return results

@transaction.atomic
def create_recovery_plan(student, result):
    plan, created = RecoveryPlan.objects.get_or_create(
        student=student, competency=result.competency, status="active",
        defaults={"baseline_score": result.score},
    )
    if created:
        resources = result.competency.resources.filter(is_approved=True).order_by("difficulty", "id")[:3]
        for position, resource in enumerate(resources, start=1):
            RecoveryActivity.objects.create(plan=plan, resource=resource, title=resource.title, position=position)
        RecoveryActivity.objects.create(plan=plan, title="Mastery check", position=len(resources) + 1)
    return plan
