from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from recovery.models import AcademicClass, Assessment, AssessmentAttempt, Competency, CompetencyResult, LearningResource, Question, RecoveryActivity, RecoveryPlan, StudentAnswer, Subject, UserProfile
from recovery.services import calculate_competency_results, create_recovery_plan

class Command(BaseCommand):
    help = "Create an idempotent academic-recovery dataset for local development."

    def handle(self, *args, **options):
        User = get_user_model()
        academic_class, _ = AcademicClass.objects.get_or_create(name="Rizal", grade_level=11, school_year="2026-2027")
        teacher, _ = User.objects.get_or_create(username="teacher@tala.edu.ph", defaults={"email": "teacher@tala.edu.ph", "first_name": "Elena", "last_name": "Cruz"})
        teacher.set_password("demo-password"); teacher.save()
        teacher_profile, _ = UserProfile.objects.get_or_create(user=teacher, defaults={"role": UserProfile.Role.TEACHER})
        teacher_profile.role = UserProfile.Role.TEACHER; teacher_profile.is_active = True; teacher_profile.save()
        teacher_profile.assigned_classes.add(academic_class)
        administrator, _ = User.objects.get_or_create(username="admin@tala.edu.ph", defaults={"email": "admin@tala.edu.ph", "first_name": "System", "last_name": "Administrator", "is_staff": True})
        administrator.set_password("demo-password"); administrator.is_staff = True; administrator.save()
        admin_profile, _ = UserProfile.objects.get_or_create(user=administrator, defaults={"role": UserProfile.Role.ADMIN})
        admin_profile.role = UserProfile.Role.ADMIN; admin_profile.is_active = True; admin_profile.save()
        student, _ = User.objects.get_or_create(username="student@tala.edu.ph", defaults={"email": "student@tala.edu.ph", "first_name": "Maria", "last_name": "Santos"})
        student.set_password("demo-password"); student.save()
        student_profile, _ = UserProfile.objects.get_or_create(user=student, defaults={"role": UserProfile.Role.STUDENT})
        student_profile.role = UserProfile.Role.STUDENT; student_profile.academic_class = academic_class; student_profile.is_active = True; student_profile.save()

        subject, _ = Subject.objects.get_or_create(code="GM", defaults={"name": "General Mathematics"})
        teacher_profile.assigned_subjects.add(subject)
        competency_data = [
            ("GM-01", "Represent fractions with unlike denominators"),
            ("GM-02", "Find the least common denominator"),
            ("GM-03", "Add fractions with unlike denominators"),
            ("GM-04", "Simplify a resulting fraction"),
        ]
        competencies = []
        for code, title in competency_data:
            competency, _ = Competency.objects.update_or_create(subject=subject, code=code, defaults={"title": title, "mastery_threshold": 75})
            competencies.append(competency)

        resource_data = [
            ("Understanding denominators", "A denominator tells how many equal parts make one whole. Fractions must describe equal-sized parts before their numerators can be combined.", "lesson", competencies[2]),
            ("Finding the least common denominator", "List multiples of both denominators and select the smallest shared value. For 3 and 4, the least common denominator is 12.", "example", competencies[2]),
            ("Adding unlike fractions practice", "Find the least common denominator, rewrite each fraction as an equivalent fraction, add the numerators, and simplify the result.", "exercise", competencies[2]),
            ("Simplifying a resulting fraction", "Divide the numerator and denominator by their greatest common factor. For example, 6/8 becomes 3/4 after dividing both by 2.", "lesson", competencies[3]),
        ]
        for title, content, kind, mapped_competency in resource_data:
            resource, _ = LearningResource.objects.update_or_create(title=title, defaults={"resource_type": kind, "difficulty": "foundation", "content": content, "is_approved": True})
            resource.competencies.set([mapped_competency])

        assessment, _ = Assessment.objects.update_or_create(title="Fractions diagnostic assessment", defaults={"subject": subject, "kind": Assessment.Kind.PRE, "is_active": True, "created_by": teacher})
        assessment.assigned_classes.add(academic_class)
        questions = [
            (competencies[0], "Which fraction has a denominator of 4?", ["1/3", "1/4", "4/1", "3/1"], "1/4"),
            (competencies[1], "What is the least common denominator of 3 and 4?", ["7", "8", "12", "24"], "12"),
            (competencies[2], "What is 1/3 + 1/4?", ["2/7", "7/12", "1/7", "5/12"], "7/12"),
            (competencies[3], "Is 6/8 equivalent to 3/4?", ["True", "False"], "True"),
        ]
        for index, (competency, prompt, choices, correct) in enumerate(questions, start=1):
            Question.objects.update_or_create(assessment=assessment, competency=competency, prompt=prompt, defaults={"question_type": Question.QuestionType.TRUE_FALSE if len(choices) == 2 else Question.QuestionType.MULTIPLE_CHOICE, "options": choices, "correct_answer": correct})

        post_assessment, _ = Assessment.objects.update_or_create(title="Fractions mastery assessment", defaults={"subject": subject, "kind": Assessment.Kind.POST, "is_active": True, "created_by": teacher})
        post_assessment.assigned_classes.add(academic_class)
        post_questions = [
            (competencies[2], "What is 2/3 + 1/4?", ["3/7", "11/12", "3/12", "8/12"], "11/12"),
            (competencies[2], "What is 1/2 + 2/5?", ["3/7", "9/10", "3/10", "7/10"], "9/10"),
            (competencies[3], "What is 8/12 in simplest form?", ["4/6", "2/3", "3/4", "1/2"], "2/3"),
            (competencies[3], "Is 10/15 equivalent to 2/3?", ["True", "False"], "True"),
        ]
        for competency, prompt, choices, correct in post_questions:
            Question.objects.update_or_create(assessment=post_assessment, competency=competency, prompt=prompt, defaults={"question_type": Question.QuestionType.TRUE_FALSE if len(choices) == 2 else Question.QuestionType.MULTIPLE_CHOICE, "options": choices, "correct_answer": correct})

        if not AssessmentAttempt.objects.filter(assessment=assessment, student=student, submitted_at__isnull=False).exists():
            attempt = AssessmentAttempt.objects.create(assessment=assessment, student=student, submitted_at=timezone.now(), score=50)
            submitted_answers = ["1/4", "12", "2/7", "False"]
            for question, answer in zip(assessment.questions.order_by("id"), submitted_answers):
                StudentAnswer.objects.create(attempt=attempt, question=question, answer=answer, is_correct=answer.casefold() == question.correct_answer.casefold())
            results = calculate_competency_results(attempt)
            for result in results:
                if result.status == "remediation":
                    create_recovery_plan(student, result)
        for result in CompetencyResult.objects.filter(attempt__assessment=assessment, attempt__student=student, status=CompetencyResult.Status.REMEDIATION).select_related("competency"):
            plan, _ = RecoveryPlan.objects.get_or_create(student=student, competency=result.competency, status="active", defaults={"baseline_score": result.score})
            if not plan.activities.filter(completed_at__isnull=False).exists():
                plan.activities.all().delete()
                mapped_resources = list(result.competency.resources.filter(is_approved=True).order_by("difficulty", "id")[:3])
                for position, resource in enumerate(mapped_resources, start=1):
                    RecoveryActivity.objects.create(plan=plan, resource=resource, title=resource.title, position=position)
                RecoveryActivity.objects.create(plan=plan, title="Mastery check", position=len(mapped_resources) + 1)
        self.stdout.write(self.style.SUCCESS("Demo data ready: admin, teacher, and student @tala.edu.ph / demo-password"))
