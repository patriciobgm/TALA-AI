from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from recovery.models import (
    AIConversation,
    AIHelpRequest,
    AIMessageFeedback,
    AssessmentAttempt,
    AssessmentEligibility,
    LearnerCompetencyEvidence,
    LearningAssignmentProgress,
    LearningAssignmentQuizAttempt,
    Notification,
    RecoveryPlan,
    RemedialExamConsent,
    UserProfile,
)


class Command(BaseCommand):
    help = "Clear student learning/assessment history while preserving accounts, curriculum, assessments, and uploaded content."

    def add_arguments(self, parser):
        parser.add_argument("--confirm", action="store_true", help="Required because this operation permanently deletes student learning history.")

    @transaction.atomic
    def handle(self, *args, **options):
        if not options["confirm"]:
            raise CommandError("This permanently deletes student learning history. Run again with --confirm.")
        student_ids = list(get_user_model().objects.filter(tala_profile__role=UserProfile.Role.STUDENT).values_list("id", flat=True))
        counts = {}
        targets = [
            ("AI help requests", AIHelpRequest.objects.filter(student_id__in=student_ids)),
            ("AI feedback", AIMessageFeedback.objects.filter(student_id__in=student_ids)),
            ("AI conversations", AIConversation.objects.filter(student_id__in=student_ids)),
            ("recovery plans", RecoveryPlan.objects.filter(student_id__in=student_ids)),
            ("assessment attempts", AssessmentAttempt.objects.filter(student_id__in=student_ids)),
            ("assessment eligibility", AssessmentEligibility.objects.filter(student_id__in=student_ids)),
            ("remedial consents", RemedialExamConsent.objects.filter(student_id__in=student_ids)),
            ("learning quiz attempts", LearningAssignmentQuizAttempt.objects.filter(student_id__in=student_ids)),
            ("learning progress", LearningAssignmentProgress.objects.filter(student_id__in=student_ids)),
            ("learner evidence", LearnerCompetencyEvidence.objects.filter(student_id__in=student_ids)),
            ("learning notifications", Notification.objects.filter(recipient_id__in=student_ids, kind__in=[Notification.Kind.PLAN_ASSIGNED, Notification.Kind.ACTIVITY_DUE, Notification.Kind.ACTIVITY_OVERDUE, Notification.Kind.PLAN_PROGRESS, Notification.Kind.ASSESSMENT_RESULT, Notification.Kind.INTERVENTION, Notification.Kind.CONTENT_PUBLISHED, Notification.Kind.LEARNING_ASSIGNED])),
        ]
        for label, queryset in targets:
            counts[label] = queryset.count()
            queryset.delete()
        summary = ", ".join(f"{label}: {count}" for label, count in counts.items())
        self.stdout.write(self.style.SUCCESS(f"Reset learning history for {len(student_ids)} students ({summary})."))
