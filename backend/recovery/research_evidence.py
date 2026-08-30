import hashlib
import json
from collections import defaultdict
from statistics import mean

from django.db.models import Count, Q
from django.utils import timezone

from .models import (
    AIMessage,
    AIMessageEvaluation,
    LearnerCompetencyEvidence,
    LearningAssignmentProgress,
    LearningAssignmentQuizAttempt,
    LearningRecommendationDecision,
    RecoveryActivity,
    RecoveryPlan,
    RemedialExamConsent,
    ResearchEvaluationSnapshot,
    UsabilityEvaluation,
)


ALGORITHM_VERSION = "evidence-rank-v1"


def _round(value, digits=2):
    return round(float(value), digits) if value is not None else None


def _rate(numerator, denominator):
    return _round((numerator / denominator) * 100) if denominator else None


def build_evidence_package(period_start=None, period_end=None):
    evidence = LearnerCompetencyEvidence.objects.select_related("student", "competency__subject")
    if period_start:
        evidence = evidence.filter(occurred_at__gte=period_start)
    if period_end:
        evidence = evidence.filter(occurred_at__lte=period_end)

    score_pairs = defaultdict(lambda: {"diagnostic": [], "mastery": []})
    for row in evidence.filter(evidence_type__in=[LearnerCompetencyEvidence.EvidenceType.DIAGNOSTIC, LearnerCompetencyEvidence.EvidenceType.MASTERY], score__isnull=False).order_by("occurred_at", "id"):
        score_pairs[(row.student_id, row.competency_id)][row.evidence_type].append(float(row.score))

    competency_rows = defaultdict(list)
    paired_improvements = []
    for (student_id, competency_id), scores in score_pairs.items():
        if not scores["diagnostic"] or not scores["mastery"]:
            continue
        baseline = scores["diagnostic"][0]
        mastery = scores["mastery"][-1]
        delta = mastery - baseline
        paired_improvements.append(delta)
        competency_rows[competency_id].append((baseline, mastery, delta))

    competency_labels = {
        row.competency_id: {
            "competency_id": row.competency_id,
            "competency_code": row.competency.code,
            "competency": row.competency.title,
            "subject": row.competency.subject.name,
        }
        for row in evidence
    }
    improvement_by_competency = []
    for competency_id, rows in competency_rows.items():
        improvement_by_competency.append({
            **competency_labels.get(competency_id, {"competency_id": competency_id}),
            "paired_learners": len(rows),
            "diagnostic_average": _round(mean(item[0] for item in rows)),
            "mastery_average": _round(mean(item[1] for item in rows)),
            "average_improvement": _round(mean(item[2] for item in rows)),
        })
    improvement_by_competency.sort(key=lambda row: (row.get("subject", ""), row.get("competency_code", "")))

    plans = RecoveryPlan.objects.prefetch_related("activities")
    if period_start:
        plans = plans.filter(created_at__gte=period_start)
    if period_end:
        plans = plans.filter(created_at__lte=period_end)
    plan_durations = []
    assigned_activities = completed_activities = overdue_activities = 0
    now = timezone.now()
    for plan in plans:
        activities = list(plan.activities.all())
        assigned_activities += len(activities)
        completed = [item for item in activities if item.completed_at]
        completed_activities += len(completed)
        overdue_activities += sum(1 for item in activities if not item.completed_at and item.due_at and item.due_at < now)
        if activities and len(completed) == len(activities):
            plan_durations.append((max(item.completed_at for item in completed) - plan.created_at).total_seconds() / 3600)

    decisions = LearningRecommendationDecision.objects.all()
    if period_start:
        decisions = decisions.filter(created_at__gte=period_start)
    if period_end:
        decisions = decisions.filter(created_at__lte=period_end)
    decision_counts = {row["decision"]: row["count"] for row in decisions.values("decision").annotate(count=Count("id"))}
    accepted = decision_counts.get(LearningRecommendationDecision.Decision.ACCEPTED, 0)
    dismissed = decision_counts.get(LearningRecommendationDecision.Decision.DISMISSED, 0)

    activities = RecoveryActivity.objects.select_related("plan")
    if period_start:
        activities = activities.filter(plan__created_at__gte=period_start)
    if period_end:
        activities = activities.filter(plan__created_at__lte=period_end)
    outcome_groups = {
        "recommended": {"assigned": 0, "completed": 0, "scores": []},
        "manual": {"assigned": 0, "completed": 0, "scores": []},
    }
    for activity in activities.prefetch_related("attempts"):
        group = "recommended" if activity.recommendation_metadata.get("algorithm_version") else "manual"
        outcome_groups[group]["assigned"] += 1
        outcome_groups[group]["completed"] += int(bool(activity.completed_at))
        scores = [float(attempt.score) for attempt in activity.attempts.all() if attempt.score is not None]
        outcome_groups[group]["scores"].extend(scores)
    recommendation_outcomes = {}
    for key, row in outcome_groups.items():
        recommendation_outcomes[key] = {
            "assigned": row["assigned"],
            "completed": row["completed"],
            "completion_rate": _rate(row["completed"], row["assigned"]),
            "average_practice_score": _round(mean(row["scores"])) if row["scores"] else None,
            "scored_attempts": len(row["scores"]),
        }

    assistant_messages = AIMessage.objects.filter(role=AIMessage.Role.ASSISTANT)
    if period_start:
        assistant_messages = assistant_messages.filter(created_at__gte=period_start)
    if period_end:
        assistant_messages = assistant_messages.filter(created_at__lte=period_end)
    evaluated_messages = AIMessageEvaluation.objects.filter(message__in=assistant_messages)
    evaluated_count = evaluated_messages.count()
    accurate_count = evaluated_messages.filter(grounding_accurate=True).count()
    hallucination_count = evaluated_messages.filter(hallucination_detected=True).count()
    leakage_count = evaluated_messages.filter(incorrect_answer_leakage=True).count()
    grounded_system_count = assistant_messages.filter(grounding_status="grounded").count()

    usability = UsabilityEvaluation.objects.all()
    if period_start:
        usability = usability.filter(recorded_at__gte=period_start)
    if period_end:
        usability = usability.filter(recorded_at__lte=period_end)
    usability_rows = []
    for role in [UsabilityEvaluation.ParticipantRole.STUDENT, UsabilityEvaluation.ParticipantRole.TEACHER]:
        rows = list(usability.filter(participant_role=role))
        durations = [row.duration_seconds for row in rows if row.duration_seconds is not None]
        sus_scores = [float(row.sus_score) for row in rows if row.sus_score is not None]
        completed = sum(row.outcome == UsabilityEvaluation.Outcome.COMPLETED for row in rows)
        usability_rows.append({
            "role": role,
            "sessions": len(rows),
            "task_completion_rate": _rate(completed, len(rows)),
            "average_duration_seconds": _round(mean(durations)) if durations else None,
            "average_errors": _round(mean(row.error_count for row in rows)) if rows else None,
            "average_sus_score": _round(mean(sus_scores)) if sus_scores else None,
        })

    consents = RemedialExamConsent.objects.all()
    if period_start:
        consents = consents.filter(requested_at__gte=period_start)
    if period_end:
        consents = consents.filter(requested_at__lte=period_end)
    consent_counts = {row["status"]: row["count"] for row in consents.values("status").annotate(count=Count("id"))}
    approved = consent_counts.get(RemedialExamConsent.Status.APPROVED, 0)
    requested = consent_counts.get(RemedialExamConsent.Status.REQUESTED, 0)

    progress = LearningAssignmentProgress.objects.all()
    quizzes = LearningAssignmentQuizAttempt.objects.all()
    if period_start:
        progress = progress.filter(assignment__created_at__gte=period_start)
        quizzes = quizzes.filter(submitted_at__gte=period_start)
    if period_end:
        progress = progress.filter(assignment__created_at__lte=period_end)
        quizzes = quizzes.filter(submitted_at__lte=period_end)

    metrics = {
        "diagnostic_to_mastery": {
            "paired_learners": len(paired_improvements),
            "average_improvement": _round(mean(paired_improvements)) if paired_improvements else None,
            "improved_count": sum(value > 0 for value in paired_improvements),
            "by_competency": improvement_by_competency,
        },
        "recovery_adherence": {
            "plans": plans.count(),
            "assigned_activities": assigned_activities,
            "completed_activities": completed_activities,
            "completion_rate": _rate(completed_activities, assigned_activities),
            "overdue_activities": overdue_activities,
            "completed_plan_average_hours": _round(mean(plan_durations)) if plan_durations else None,
        },
        "recommendations": {
            "algorithm_version": ALGORITHM_VERSION,
            "reviewed": accepted + dismissed,
            "accepted": accepted,
            "dismissed": dismissed,
            "acceptance_rate": _rate(accepted, accepted + dismissed),
            "dismissal_rate": _rate(dismissed, accepted + dismissed),
            "override_rate": _rate(dismissed, accepted + dismissed),
            "outcomes": recommendation_outcomes,
        },
        "tala_quality": {
            "assistant_messages": assistant_messages.count(),
            "system_grounded": grounded_system_count,
            "system_grounding_rate": _rate(grounded_system_count, assistant_messages.count()),
            "human_evaluated": evaluated_count,
            "grounding_accuracy": _rate(accurate_count, evaluated_count),
            "hallucination_rate": _rate(hallucination_count, evaluated_count),
            "incorrect_answer_leakage_rate": _rate(leakage_count, evaluated_count),
        },
        "usability": usability_rows,
        "consent_and_eligibility": {
            "total_requests": consents.count(),
            "statuses": consent_counts,
            "approval_rate": _rate(approved, consents.exclude(status=RemedialExamConsent.Status.REQUESTED).count()),
            "awaiting_response": requested,
        },
        "learning_materials": {
            "opened": progress.filter(opened_at__isnull=False).count(),
            "completed": progress.filter(completed_at__isnull=False).count(),
            "quiz_attempts": quizzes.count(),
            "quiz_pass_rate": _rate(quizzes.filter(passed=True).count(), quizzes.count()),
        },
    }
    record_counts = {
        "competency_evidence": evidence.count(),
        "recovery_plans": plans.count(),
        "recovery_activities": activities.count(),
        "recommendation_decisions": decisions.count(),
        "assistant_messages": assistant_messages.count(),
        "ai_human_evaluations": evaluated_count,
        "usability_evaluations": usability.count(),
        "consent_records": consents.count(),
    }
    return {"generated_at": timezone.now().isoformat(), "algorithm_version": ALGORITHM_VERSION, "period_start": period_start.isoformat() if period_start else None, "period_end": period_end.isoformat() if period_end else None, "metrics": metrics, "record_counts": record_counts}


def freeze_evidence_package(*, name, dataset_version, frozen_by, notes="", period_start=None, period_end=None):
    package = build_evidence_package(period_start, period_end)
    checksum_payload = {
        "name": name,
        "dataset_version": dataset_version,
        "algorithm_version": package["algorithm_version"],
        "period_start": package["period_start"],
        "period_end": package["period_end"],
        "metrics": package["metrics"],
        "record_counts": package["record_counts"],
    }
    checksum = hashlib.sha256(json.dumps(checksum_payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return ResearchEvaluationSnapshot.objects.create(
        name=name,
        algorithm_version=package["algorithm_version"],
        dataset_version=dataset_version,
        period_start=period_start,
        period_end=period_end,
        metrics=package["metrics"],
        record_counts=package["record_counts"],
        checksum_sha256=checksum,
        notes=notes,
        frozen_by=frozen_by,
    )
