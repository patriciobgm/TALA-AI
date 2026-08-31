from .models import Assessment, AssessmentEligibility, LearningAssignmentProgress


def incomplete_prerequisite_assignments(assessment, student):
    if assessment.kind != Assessment.Kind.PRE:
        return assessment.prerequisite_assignments.none()
    completed_ids = LearningAssignmentProgress.objects.filter(student=student, completed_at__isnull=False).values_list("assignment_id", flat=True)
    return assessment.prerequisite_assignments.filter(is_active=True).exclude(id__in=completed_ids)


def remedial_student_is_eligible(assessment, student):
    if assessment.kind != Assessment.Kind.REMEDIAL:
        return True
    return AssessmentEligibility.objects.filter(assessment=assessment, student=student, status__in=[AssessmentEligibility.Status.ELIGIBLE, AssessmentEligibility.Status.COMPLETED]).exists() or assessment.remedial_consents.filter(student=student).exists()
