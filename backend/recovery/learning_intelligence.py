from decimal import Decimal

from django.db.models import Avg

from .models import ActivityAttempt, LearnerCompetencyEvidence, LearningRecommendationDecision, LearningResource


RECOMMENDATION_ALGORITHM_VERSION = "evidence-rank-v1"


def record_evidence(*, student, competency, evidence_type, source_type, source_id, score, summary, details=None, occurred_at=None):
    defaults = {
        "score": score,
        "summary": summary[:300],
        "details": details or {},
    }
    if occurred_at:
        defaults["occurred_at"] = occurred_at
    evidence, _ = LearnerCompetencyEvidence.objects.update_or_create(
        student=student,
        competency=competency,
        evidence_type=evidence_type,
        source_type=source_type,
        source_id=source_id,
        defaults=defaults,
    )
    return evidence


def learner_competency_context(student, competency):
    evidence = list(LearnerCompetencyEvidence.objects.filter(student=student, competency=competency)[:8])
    practice_attempts = ActivityAttempt.objects.filter(
        student=student,
        activity__plan__competency=competency,
        score__isnull=False,
    ).select_related("activity")[:8]
    average = practice_attempts.aggregate(value=Avg("score"))["value"]
    latest = evidence[0] if evidence else None
    unsuccessful = [item for item in practice_attempts if Decimal(item.score) < Decimal("70")]
    misconceptions = []
    for attempt in unsuccessful[:3]:
        misconceptions.append({
            "activity": attempt.activity.title,
            "score": round(float(attempt.score)),
            "attempted_answers": len(attempt.answers),
        })
    return {
        "baseline_score": round(float(getattr(latest, "score", 0) or 0)) if latest else None,
        "practice_average": round(float(average)) if average is not None else None,
        "practice_attempts": len(practice_attempts),
        "recent_evidence": [
            {"type": item.evidence_type, "score": round(float(item.score)) if item.score is not None else None, "summary": item.summary}
            for item in evidence[:5]
        ],
        "recent_difficulties": misconceptions,
    }


def format_learner_context(context):
    lines = []
    if context["practice_average"] is not None:
        lines.append(f"Recent practice average: {context['practice_average']}% across {context['practice_attempts']} attempts.")
    for item in context["recent_evidence"][:3]:
        score = f" ({item['score']}%)" if item["score"] is not None else ""
        lines.append(f"{item['type'].title()}{score}: {item['summary']}")
    for item in context["recent_difficulties"][:2]:
        lines.append(f"Recent difficulty: {item['activity']} practice scored {item['score']}%.")
    return "\n".join(f"- {line}" for line in lines) or "- No prior evidence is available yet. Start with a brief check for understanding."


def rank_learning_resources(student, competency, *, exclude_resource_ids=None, limit=3):
    """Rank approved competency resources using explainable, deterministic learner evidence."""
    excluded = set(exclude_resource_ids or [])
    excluded.update(
        LearningRecommendationDecision.objects.filter(
            student=student,
            competency=competency,
            decision=LearningRecommendationDecision.Decision.DISMISSED,
        ).values_list("resource_id", flat=True)
    )
    completed_ids = set(
        student.recovery_plans.filter(competency=competency, activities__completed_at__isnull=False)
        .values_list("activities__resource_id", flat=True)
    )
    excluded.update(item for item in completed_ids if item)

    context = learner_competency_context(student, competency)
    recent_scores = [item["score"] for item in context["recent_evidence"] if item["score"] is not None]
    latest_score = recent_scores[0] if recent_scores else context["practice_average"]
    score_band = "foundation" if latest_score is None or latest_score < 50 else "developing" if latest_score < competency.mastery_threshold else "mastered"
    type_weights = {
        "foundation": {"lesson": 18, "example": 15, "module": 11, "video": 9, "exercise": 5},
        "developing": {"exercise": 17, "example": 15, "module": 10, "video": 8, "lesson": 7},
        "mastered": {"exercise": 14, "example": 10, "module": 8, "video": 7, "lesson": 5},
    }
    difficulty_weights = {
        "foundation": {"foundation": 14, "beginner": 14, "easy": 12, "guided": 8, "standard": 5, "intermediate": 3, "advanced": -8},
        "developing": {"guided": 14, "standard": 12, "intermediate": 10, "foundation": 7, "beginner": 6, "easy": 6, "advanced": 1},
        "mastered": {"advanced": 12, "intermediate": 10, "standard": 8, "guided": 5, "foundation": 2, "beginner": 2, "easy": 2},
    }
    attempts = ActivityAttempt.objects.filter(
        student=student,
        activity__plan__competency=competency,
        activity__resource__isnull=False,
        score__isnull=False,
    ).values("activity__resource_id").annotate(average=Avg("score"))
    prior_scores = {item["activity__resource_id"]: round(float(item["average"])) for item in attempts}
    resources = (
        LearningResource.objects.filter(is_approved=True, competencies=competency)
        .exclude(id__in=excluded)
        .prefetch_related("practice_questions")
        .distinct()
    )
    ranked = []
    for resource in resources:
        reasons = [f"Aligned with {competency.code} · {competency.title}."]
        score = 40 + type_weights[score_band].get(resource.resource_type, 4)
        difficulty = resource.difficulty.strip().casefold()
        score += difficulty_weights[score_band].get(difficulty, 3)
        if latest_score is not None:
            reasons.append(f"The latest recorded evidence is {latest_score}%, placing support in the {score_band} band.")
        else:
            reasons.append("No recent score is available, so the ranking starts with foundation support.")
        practice_count = resource.practice_questions.count()
        if practice_count:
            score += min(practice_count, 5) * 2
            reasons.append(f"Includes {practice_count} embedded check{'s' if practice_count != 1 else ''} for understanding.")
        else:
            reasons.append("Provides instruction without an embedded scored check.")
        previous_score = prior_scores.get(resource.id)
        if previous_score is not None:
            score -= 12 if previous_score < resource.passing_score else 5
            reasons.append(f"The learner previously scored {previous_score}% on this material; the ranking reduces repeated exposure.")
        confidence = "high" if latest_score is not None and practice_count else "medium" if latest_score is not None or practice_count else "limited"
        ranked.append({
            "resource": resource,
            "score": round(score, 2),
            "confidence": confidence,
            "reason": " ".join(reasons),
            "signals": {
                "algorithm_version": RECOMMENDATION_ALGORITHM_VERSION,
                "latest_score": latest_score,
                "practice_average": context["practice_average"],
                "practice_attempts": context["practice_attempts"],
                "score_band": score_band,
                "resource_type": resource.resource_type,
                "difficulty": resource.difficulty,
                "embedded_checks": practice_count,
                "previous_resource_score": previous_score,
            },
        })
    return sorted(ranked, key=lambda item: (-item["score"], item["resource"].id))[:limit]
