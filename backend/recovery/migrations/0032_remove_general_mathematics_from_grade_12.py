from django.db import migrations


def remove_grade_12_general_mathematics(apps, schema_editor):
    Subject = apps.get_model("recovery", "Subject")
    AcademicClass = apps.get_model("recovery", "AcademicClass")
    Assessment = apps.get_model("recovery", "Assessment")
    AssessmentAttempt = apps.get_model("recovery", "AssessmentAttempt")
    AssessmentEligibility = apps.get_model("recovery", "AssessmentEligibility")
    EnrollmentRequest = apps.get_model("recovery", "EnrollmentRequest")
    LearnerCompetencyEvidence = apps.get_model("recovery", "LearnerCompetencyEvidence")
    LearningAssignment = apps.get_model("recovery", "LearningAssignment")
    LearningAssignmentProgress = apps.get_model("recovery", "LearningAssignmentProgress")
    LearningAssignmentQuizAttempt = apps.get_model("recovery", "LearningAssignmentQuizAttempt")
    RecoveryPlan = apps.get_model("recovery", "RecoveryPlan")
    RemedialExamConsent = apps.get_model("recovery", "RemedialExamConsent")
    UserProfile = apps.get_model("recovery", "UserProfile")

    mathematics = Subject.objects.filter(code="GM", grade_level=11).first()
    if not mathematics:
        return
    grade_12_classes = AcademicClass.objects.filter(grade_level=12)
    grade_12_students = UserProfile.objects.filter(role="student", student_details__grade_level=12).values_list("user_id", flat=True)

    for assessment in Assessment.objects.filter(subject=mathematics, assigned_classes__in=grade_12_classes).distinct():
        assessment.assigned_classes.remove(*grade_12_classes)
    for assignment in LearningAssignment.objects.filter(resource__competencies__subject=mathematics, assigned_classes__in=grade_12_classes).distinct():
        assignment.assigned_classes.remove(*grade_12_classes)

    AssessmentAttempt.objects.filter(student_id__in=grade_12_students, assessment__subject=mathematics).delete()
    AssessmentEligibility.objects.filter(student_id__in=grade_12_students, assessment__subject=mathematics).delete()
    RemedialExamConsent.objects.filter(student_id__in=grade_12_students, assessment__subject=mathematics).delete()
    RecoveryPlan.objects.filter(student_id__in=grade_12_students, competency__subject=mathematics).delete()
    LearnerCompetencyEvidence.objects.filter(student_id__in=grade_12_students, competency__subject=mathematics).delete()
    LearningAssignmentProgress.objects.filter(student_id__in=grade_12_students, assignment__resource__competencies__subject=mathematics).delete()
    LearningAssignmentQuizAttempt.objects.filter(student_id__in=grade_12_students, assignment__resource__competencies__subject=mathematics).delete()
    EnrollmentRequest.objects.filter(student_id__in=grade_12_students, subject=mathematics).delete()


class Migration(migrations.Migration):
    dependencies = [("recovery", "0031_remove_enrollmentrequest_unique_pending_class_enrollment_and_more")]
    operations = [migrations.RunPython(remove_grade_12_general_mathematics, migrations.RunPython.noop)]
