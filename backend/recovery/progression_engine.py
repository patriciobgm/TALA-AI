from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from .models import (
    Competency,
    CompetencyResult,
    LearnerCompetencyState,
    LearningGap,
    RecoveryPlan,
    SubjectEnrollment,
)


class ProgressionDenied(Exception):
    pass


def approved_offering_for(student, subject, assessment=None):
    enrollments = SubjectEnrollment.objects.filter(
        student=student,
        status=SubjectEnrollment.Status.APPROVED,
        offering__subject=subject,
        offering__is_active=True,
    ).select_related("offering")
    if assessment is not None and assessment.subject_offerings.exists():
        enrollments = enrollments.filter(offering__in=assessment.subject_offerings.all())
    return enrollments.order_by("-reviewed_at", "-id").first().offering if enrollments.exists() else None


def _ordered_competencies(offering):
    return list(
        Competency.objects.filter(subject=offering.subject, is_active=True)
        .select_related("topic")
        .prefetch_related("prerequisites", "topic__prerequisites")
        .order_by("topic__sequence_order", "sequence_order", "id")
    )


def _prerequisite_ids(competency, ordered):
    explicit = set(competency.prerequisites.values_list("id", flat=True))
    if competency.topic_id:
        explicit.update(
            Competency.objects.filter(topic__in=competency.topic.prerequisites.all(), is_active=True).values_list("id", flat=True)
        )
    if explicit:
        return explicit
    position = next((index for index, item in enumerate(ordered) if item.id == competency.id), 0)
    return {ordered[position - 1].id} if position > 0 else set()


@transaction.atomic
def initialize_enrollment_progression(enrollment):
    ordered = _ordered_competencies(enrollment.offering)
    for competency in ordered:
        prerequisite_ids = _prerequisite_ids(competency, ordered)
        prerequisite_mastered = not prerequisite_ids or not LearnerCompetencyState.objects.filter(
            student=enrollment.student,
            offering=enrollment.offering,
            competency_id__in=prerequisite_ids,
        ).exclude(status=LearnerCompetencyState.Status.MASTERED).exists()
        LearnerCompetencyState.objects.get_or_create(
            student=enrollment.student,
            offering=enrollment.offering,
            competency=competency,
            defaults={
                "status": LearnerCompetencyState.Status.AVAILABLE if prerequisite_mastered else LearnerCompetencyState.Status.LOCKED,
                "unlocked_at": timezone.now() if prerequisite_mastered else None,
                "decision_reason": "Required prerequisites are satisfied." if prerequisite_mastered else "Master the required earlier competency first.",
            },
        )
    refresh_progression(enrollment.student, enrollment.offering)


@transaction.atomic
def refresh_progression(student, offering):
    ordered = _ordered_competencies(offering)
    states = {
        row.competency_id: row
        for row in LearnerCompetencyState.objects.select_for_update().filter(student=student, offering=offering)
    }
    for competency in ordered:
        state = states.get(competency.id)
        if state is None:
            state = LearnerCompetencyState.objects.create(student=student, offering=offering, competency=competency)
            states[competency.id] = state
        if state.status == LearnerCompetencyState.Status.MASTERED:
            continue
        prerequisite_ids = _prerequisite_ids(competency, ordered)
        can_unlock = all(
            states.get(item_id) and states[item_id].status == LearnerCompetencyState.Status.MASTERED
            for item_id in prerequisite_ids
        )
        next_status = LearnerCompetencyState.Status.AVAILABLE if can_unlock else LearnerCompetencyState.Status.LOCKED
        if state.latest_score is not None and can_unlock:
            next_status = LearnerCompetencyState.Status.IN_PROGRESS
        state.status = next_status
        state.unlocked_at = state.unlocked_at or (timezone.now() if can_unlock else None)
        state.decision_reason = "Required prerequisites are satisfied." if can_unlock else "Master the required earlier competency first."
        state.save(update_fields=["status", "unlocked_at", "decision_reason", "updated_at"])
    return list(states.values())


def assert_competency_access(student, offering, competency):
    if not SubjectEnrollment.objects.filter(student=student, offering=offering, status=SubjectEnrollment.Status.APPROVED).exists():
        raise ProgressionDenied("You must be enrolled in this subject before accessing its learning activities.")
    state = LearnerCompetencyState.objects.filter(student=student, offering=offering, competency=competency).first()
    if not state:
        enrollment = SubjectEnrollment.objects.get(student=student, offering=offering, status=SubjectEnrollment.Status.APPROVED)
        initialize_enrollment_progression(enrollment)
        state = LearnerCompetencyState.objects.get(student=student, offering=offering, competency=competency)
    if state.status == LearnerCompetencyState.Status.LOCKED:
        raise ProgressionDenied(state.decision_reason or "Master the required earlier competency before continuing.")
    return state


def assert_assessment_access(student, assessment, target_competency_id=None):
    offering = approved_offering_for(student, assessment.subject, assessment)
    if not offering:
        raise ProgressionDenied("You are not enrolled in this subject offering.")
    if assessment.kind != assessment.Kind.PRE:
        competency_ids = [int(target_competency_id)] if target_competency_id else list(assessment.questions.values_list("competency_id", flat=True).distinct())
        accessible = []
        for competency_id in competency_ids:
            competency = Competency.objects.get(pk=competency_id)
            try:
                assert_competency_access(student, offering, competency)
                accessible.append(competency_id)
            except ProgressionDenied:
                if target_competency_id:
                    raise
        if not accessible:
            raise ProgressionDenied("Master the required earlier competency first.")
    return offering


def accessible_assessment_competency_ids(student, assessment, offering):
    """Return the assessment competencies the learner may currently access.

    Diagnostics establish the baseline and therefore include every competency.
    Later assessments are narrowed server-side so a bundled exam cannot expose a
    locked next competency merely because the client omitted a target filter.
    """
    competency_ids = list(assessment.questions.values_list("competency_id", flat=True).distinct())
    if assessment.kind == assessment.Kind.PRE:
        return competency_ids
    states = {
        row.competency_id: row.status
        for row in LearnerCompetencyState.objects.filter(
            student=student,
            offering=offering,
            competency_id__in=competency_ids,
        )
    }
    accessible = {
        competency_id
        for competency_id in competency_ids
        if states.get(competency_id) in {
            LearnerCompetencyState.Status.AVAILABLE,
            LearnerCompetencyState.Status.IN_PROGRESS,
            LearnerCompetencyState.Status.MASTERED,
        }
    }
    # A diagnostic may identify more than one gap at once. A later bundled
    # reassessment may cover those diagnosed gaps even while curriculum access
    # to the next competency remains locked. The plan must be active and all of
    # its learning activities must already be complete.
    candidate_plans = RecoveryPlan.objects.filter(
        student=student,
        offering=offering,
        status="active",
        competency_id__in=competency_ids,
    )
    incomplete_plan_ids = candidate_plans.filter(
        activities__resource__isnull=False,
        activities__completed_at__isnull=True,
    ).values_list("id", flat=True)
    reassessment_ready = candidate_plans.exclude(id__in=incomplete_plan_ids).values_list("competency_id", flat=True)
    accessible.update(reassessment_ready)
    return list(accessible)


@transaction.atomic
def apply_competency_result(student, result, offering):
    state, _ = LearnerCompetencyState.objects.select_for_update().get_or_create(
        student=student,
        offering=offering,
        competency=result.competency,
    )
    state.latest_score = result.score
    state.best_score = max(Decimal(state.best_score or 0), Decimal(result.score))
    if result.status == CompetencyResult.Status.MASTERED:
        state.status = LearnerCompetencyState.Status.MASTERED
        state.mastered_at = result.attempt.submitted_at or timezone.now()
        state.unlocked_at = state.unlocked_at or state.mastered_at
        state.decision_reason = f"Mastery threshold of {result.competency.mastery_threshold}% was met."
        LearningGap.objects.filter(
            student=student,
            competency=result.competency,
            status__in=[LearningGap.Status.OPEN, LearningGap.Status.MONITORING],
        ).update(status=LearningGap.Status.RESOLVED, resolved_by_result=result, resolved_at=state.mastered_at, current_score=result.score, classification=result.status)
        gap = None
    else:
        state.status = LearnerCompetencyState.Status.IN_PROGRESS
        state.unlocked_at = state.unlocked_at or timezone.now()
        state.decision_reason = "Mastery has not yet been demonstrated; remediation and reassessment are required."
        priority = LearningGap.Priority.HIGH if result.status == CompetencyResult.Status.REMEDIATION else LearningGap.Priority.MEDIUM
        gap = LearningGap.objects.select_for_update().filter(
            student=student,
            competency=result.competency,
            status__in=[LearningGap.Status.OPEN, LearningGap.Status.MONITORING],
        ).first()
        if gap is None:
            gap = LearningGap.objects.create(
                student=student,
                offering=offering,
                competency=result.competency,
                trigger_result=result,
                current_score=result.score,
                classification=result.status,
                priority=priority,
            )
        else:
            gap.offering = offering
            gap.trigger_result = result
            gap.current_score = result.score
            gap.classification = result.status
            gap.priority = priority
            gap.status = LearningGap.Status.OPEN
            gap.resolved_at = None
            gap.resolved_by_result = None
            gap.save(update_fields=["offering", "trigger_result", "current_score", "classification", "priority", "status", "resolved_at", "resolved_by_result", "updated_at"])
    state.save(update_fields=["latest_score", "best_score", "status", "unlocked_at", "mastered_at", "decision_reason", "updated_at"])
    refresh_progression(student, offering)
    return gap, state
