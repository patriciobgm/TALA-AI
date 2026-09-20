import json

from django.core.management.base import BaseCommand
from django.db.models import Count, F, Q

from recovery.models import Assessment, LearningGap, Question, RecoveryPlan, StudentProfile, SubjectEnrollment, UserProfile


class Command(BaseCommand):
    help = "Audit deterministic academic records for missing links, invalid assessments, and duplicate active state."

    def add_arguments(self, parser):
        parser.add_argument("--fix", action="store_true", help="Apply only safe, deterministic profile backfills.")
        parser.add_argument("--json", action="store_true", help="Emit machine-readable JSON.")

    def handle(self, *args, **options):
        issues = []

        def record(code, severity, count, detail):
            issues.append({"code": code, "severity": severity, "count": count, "detail": detail})

        missing_student_profiles = UserProfile.objects.filter(role=UserProfile.Role.STUDENT, student_details__isnull=True).count()
        record("student_profile_missing", "error", missing_student_profiles, "Learner accounts without a StudentProfile.")

        missing_cluster = StudentProfile.objects.filter(cluster_record__isnull=True)
        missing_cluster_count = missing_cluster.count()
        fixed = 0
        if options["fix"]:
            for profile in missing_cluster.select_related("profile__academic_class__cluster"):
                section_cluster = profile.profile.academic_class.cluster if profile.profile.academic_class else None
                if section_cluster:
                    profile.cluster_record = section_cluster
                    profile.cluster = StudentProfile.Cluster.TECH_PRO if section_cluster.code == "TECH-PRO" else StudentProfile.Cluster.ACADEMICS
                    profile.save(update_fields=["cluster_record", "cluster"])
                    fixed += 1
        record("student_cluster_missing", "warning", max(missing_cluster_count - fixed, 0), f"Learners without a persisted cluster. Safely fixed: {fixed}.")

        invalid_enrollments = SubjectEnrollment.objects.filter(status__in=[SubjectEnrollment.Status.PENDING, SubjectEnrollment.Status.APPROVED], offering__is_active=False).count()
        record("active_enrollment_in_inactive_offering", "error", invalid_enrollments, "Current enrollment records attached to inactive offerings.")

        empty_assessments = Assessment.objects.filter(is_active=True).annotate(question_total=Count("questions")).filter(question_total=0).count()
        record("active_assessment_without_questions", "error", empty_assessments, "Published assessments with no questions.")
        invalid_questions = Question.objects.exclude(competency__subject_id=F("assessment__subject_id")).count()
        record("question_subject_mismatch", "error", invalid_questions, "Questions whose competency belongs to another subject.")
        invalid_objective = Question.objects.filter(question_type__in=[Question.QuestionType.MULTIPLE_CHOICE, Question.QuestionType.TRUE_FALSE]).filter(Q(correct_answer="") | Q(options=[])).count()
        record("objective_question_invalid", "error", invalid_objective, "Objective questions without options or a correct answer.")

        duplicate_plans = RecoveryPlan.objects.filter(status="active").values("student_id", "competency_id").annotate(total=Count("id")).filter(total__gt=1).count()
        record("duplicate_active_recovery_plan", "error", duplicate_plans, "Learner/competency pairs with more than one active plan.")
        unsupported_gaps = LearningGap.objects.filter(trigger_result__isnull=True, status__in=[LearningGap.Status.OPEN, LearningGap.Status.MONITORING]).count()
        record("learning_gap_without_trigger", "warning", unsupported_gaps, "Open gaps without a linked competency result.")

        summary = {"ok": not any(item["severity"] == "error" and item["count"] for item in issues), "issues": issues, "error_count": sum(item["count"] for item in issues if item["severity"] == "error"), "warning_count": sum(item["count"] for item in issues if item["severity"] == "warning"), "fixed_count": fixed}
        if options["json"]:
            self.stdout.write(json.dumps(summary, indent=2))
        else:
            for item in issues:
                style = self.style.ERROR if item["severity"] == "error" and item["count"] else self.style.WARNING if item["count"] else self.style.SUCCESS
                self.stdout.write(style(f"{item['code']}: {item['count']} — {item['detail']}"))
            self.stdout.write((self.style.SUCCESS if summary["ok"] else self.style.ERROR)(f"Integrity audit complete: {summary['error_count']} errors, {summary['warning_count']} warnings, {fixed} fixed."))
