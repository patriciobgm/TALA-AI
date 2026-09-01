from .models import Assessment, AssessmentEligibility, LearningAssignment, LearningAssignmentProgress, LearningResource


def matching_diagnostic_assignments(subject, assigned_classes):
    """Return active, approved class materials that should precede a diagnostic."""
    class_ids = [item.pk for item in assigned_classes]
    if not class_ids:
        return LearningAssignment.objects.none()
    return (
        LearningAssignment.objects.filter(
            is_active=True,
            resource__is_approved=True,
            resource__competencies__subject=subject,
            assigned_classes__id__in=class_ids,
        )
        .exclude(resource__purpose__in=[LearningResource.Purpose.RECOVERY, LearningResource.Purpose.ENRICHMENT])
        .distinct()
    )


def incomplete_prerequisite_assignments(assessment, student):
    if assessment.kind != Assessment.Kind.PRE:
        return assessment.prerequisite_assignments.none()
    completed_ids = LearningAssignmentProgress.objects.filter(student=student, completed_at__isnull=False).values_list("assignment_id", flat=True)
    return assessment.prerequisite_assignments.filter(is_active=True).exclude(id__in=completed_ids)


def remedial_student_is_eligible(assessment, student):
    if assessment.kind != Assessment.Kind.REMEDIAL:
        return True
    return AssessmentEligibility.objects.filter(assessment=assessment, student=student, status__in=[AssessmentEligibility.Status.ELIGIBLE, AssessmentEligibility.Status.COMPLETED]).exists() or assessment.remedial_consents.filter(student=student).exists()
