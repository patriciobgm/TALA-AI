from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from datetime import timedelta

from recovery.models import AcademicClass, ActivityAttempt, Assessment, AssessmentAttempt, Competency, CompetencyResult, EmployeeProfile, GuardianContact, LearningResource, PracticeQuestion, Question, RecoveryActivity, RecoveryPlan, StudentAnswer, StudentProfile, Subject, UserProfile
from recovery.services import calculate_competency_results, create_recovery_plan
from recovery.resource_index import index_learning_resource
from recovery.learning_intelligence import rank_learning_resources

class Command(BaseCommand):
    help = "Create an idempotent academic-recovery dataset for local development."

    def handle(self, *args, **options):
        User = get_user_model()
        academic_class, _ = AcademicClass.objects.get_or_create(name="Rizal", grade_level=11, school_year="2026-2027")
        bonifacio_class, _ = AcademicClass.objects.get_or_create(name="Bonifacio", grade_level=11, school_year="2026-2027")
        mabini_class, _ = AcademicClass.objects.get_or_create(name="Mabini", grade_level=12, school_year="2026-2027")
        teacher, _ = User.objects.get_or_create(username="teacher@tala.edu.ph", defaults={"email": "teacher@tala.edu.ph", "first_name": "Elena", "last_name": "Cruz"})
        teacher.set_password("demo-password"); teacher.save()
        teacher_profile, _ = UserProfile.objects.get_or_create(user=teacher, defaults={"role": UserProfile.Role.TEACHER})
        teacher_profile.role = UserProfile.Role.TEACHER; teacher_profile.is_active = True; teacher_profile.save()
        teacher_profile.assigned_classes.add(academic_class)
        administrator, _ = User.objects.get_or_create(username="admin@tala.edu.ph", defaults={"email": "admin@tala.edu.ph", "first_name": "System", "last_name": "Administrator", "is_staff": True})
        administrator.set_password("demo-password"); administrator.is_staff = True; administrator.save()
        admin_profile, _ = UserProfile.objects.get_or_create(user=administrator, defaults={"role": UserProfile.Role.ADMIN})
        admin_profile.role = UserProfile.Role.ADMIN; admin_profile.is_active = True; admin_profile.save()
        superadmin = User.objects.filter(username="superadmin@tala.edu.ph").first()
        legacy_superadmin = User.objects.filter(username="superadmin").first()
        superadmin = superadmin or legacy_superadmin
        if not superadmin:
            superadmin = User(username="superadmin@tala.edu.ph")
        superadmin.username = "superadmin@tala.edu.ph"; superadmin.email = "superadmin@tala.edu.ph"
        superadmin.first_name = "TALA"; superadmin.last_name = "Super Administrator"
        superadmin.is_staff = True; superadmin.is_superuser = True; superadmin.is_active = True
        superadmin.set_password("demo-password"); superadmin.save()
        superadmin_profile, _ = UserProfile.objects.get_or_create(user=superadmin, defaults={"role": UserProfile.Role.ADMIN})
        superadmin_profile.role = UserProfile.Role.ADMIN; superadmin_profile.is_active = True; superadmin_profile.save()
        student, _ = User.objects.get_or_create(username="student@tala.edu.ph", defaults={"email": "student@tala.edu.ph", "first_name": "Maria", "last_name": "Santos"})
        student.set_password("demo-password"); student.save()
        student_profile, _ = UserProfile.objects.get_or_create(user=student, defaults={"role": UserProfile.Role.STUDENT})
        student_profile.role = UserProfile.Role.STUDENT; student_profile.academic_class = academic_class; student_profile.is_active = True; student_profile.save()

        subject_catalog = {
            "GM": ("General Mathematics", [
                ("GM-01", "Represent fractions with unlike denominators"),
                ("GM-02", "Find the least common denominator"),
                ("GM-03", "Add fractions with unlike denominators"),
                ("GM-04", "Simplify a resulting fraction"),
            ]),
            "EAPP": ("English for Academic and Professional Purposes", [
                ("EAPP-01", "Distinguish academic language from everyday language"),
                ("EAPP-02", "Summarize the main ideas of an academic text"),
                ("EAPP-03", "Write a clear thesis statement"),
                ("EAPP-04", "Use evidence and citation in an academic paragraph"),
            ]),
            "ELS": ("Earth and Life Science", [
                ("ELS-01", "Explain the origin and structure of Earth"),
                ("ELS-02", "Classify rocks using the rock cycle"),
                ("ELS-03", "Relate plate movement to geologic hazards"),
                ("ELS-04", "Describe cellular processes that sustain life"),
            ]),
            "OC": ("Oral Communication in Context", [
                ("OC-01", "Identify the elements of the communication process"),
                ("OC-02", "Apply strategies that prevent communication breakdown"),
                ("OC-03", "Use appropriate speech context and style"),
                ("OC-04", "Deliver an organized informative speech"),
            ]),
            "PD": ("Personal Development", [
                ("PD-01", "Evaluate personal strengths and areas for growth"),
                ("PD-02", "Explain how thoughts and emotions influence behavior"),
                ("PD-03", "Apply healthy stress-management strategies"),
                ("PD-04", "Develop a realistic personal career plan"),
            ]),
        }
        subjects = {}
        for code, (name, competency_rows) in subject_catalog.items():
            current_subject, _ = Subject.objects.update_or_create(code=code, defaults={"name": name, "grade_level": 11, "is_active": True})
            subjects[code] = current_subject
            for competency_code, competency_title in competency_rows:
                Competency.objects.update_or_create(subject=current_subject, code=competency_code, defaults={"title": competency_title, "mastery_threshold": 75, "is_active": True})
        subject = subjects["GM"]
        teacher_profile.assigned_subjects.set([subjects["GM"], subjects["EAPP"]])
        additional_teachers = [
            ("ramon.mendoza@tala.edu.ph", "Ramon", "Mendoza", [academic_class, bonifacio_class], [subjects["ELS"], subjects["OC"]]),
            ("liza.navarro@tala.edu.ph", "Liza", "Navarro", [mabini_class], [subjects["PD"], subjects["GM"]]),
        ]
        for email, first_name, last_name, assigned_classes, assigned_subjects in additional_teachers:
            additional_teacher, _ = User.objects.get_or_create(username=email, defaults={"email": email, "first_name": first_name, "last_name": last_name})
            additional_teacher.email = email; additional_teacher.first_name = first_name; additional_teacher.last_name = last_name
            additional_teacher.set_password("demo-password"); additional_teacher.save()
            profile, _ = UserProfile.objects.get_or_create(user=additional_teacher, defaults={"role": UserProfile.Role.TEACHER})
            profile.role = UserProfile.Role.TEACHER; profile.is_active = True; profile.save()
            profile.assigned_classes.set(assigned_classes); profile.assigned_subjects.set(assigned_subjects)
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
            ("Understanding denominators", "A denominator tells how many equal parts make one whole. Fractions must describe equal-sized parts before their numerators can be combined.", "lesson", competencies[2], "Why must fractions have equal-sized parts before their numerators are added?", ["The denominators describe the same-sized parts", "The numerators must be zero", "Every denominator must be 10"], "The denominators describe the same-sized parts", "A common denominator makes each fraction describe parts of the same size."),
            ("Finding the least common denominator", "List multiples of both denominators and select the smallest shared value. For 3 and 4, the least common denominator is 12.", "example", competencies[2], "What is the least common denominator of 3 and 4?", ["7", "8", "12", "24"], "12", "Twelve is the smallest number divisible by both 3 and 4."),
            ("Adding unlike fractions practice", "Find the least common denominator, rewrite each fraction as an equivalent fraction, add the numerators, and simplify the result.", "exercise", competencies[2], "What is 1/3 + 1/4?", ["2/7", "7/12", "1/7", "5/12"], "7/12", "Rewrite 1/3 as 4/12 and 1/4 as 3/12, then add the numerators."),
            ("Simplifying a resulting fraction", "Divide the numerator and denominator by their greatest common factor. For example, 6/8 becomes 3/4 after dividing both by 2.", "lesson", competencies[3], "What is 6/8 in simplest form?", ["2/4", "3/4", "4/6", "6/4"], "3/4", "The greatest common factor of 6 and 8 is 2. Divide both by 2."),
        ]
        for title, content, kind, mapped_competency, prompt, choices, correct, explanation in resource_data:
            resource, _ = LearningResource.objects.update_or_create(title=title, defaults={"resource_type": kind, "difficulty": "foundation", "content": content, "is_approved": True})
            resource.competencies.set([mapped_competency])
            index_learning_resource(resource)
            PracticeQuestion.objects.update_or_create(resource=resource, position=1, defaults={"prompt": prompt, "question_type": PracticeQuestion.QuestionType.MULTIPLE_CHOICE, "options": choices, "correct_answer": correct, "explanation": explanation})

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
        post_assessment.assigned_classes.set([academic_class, bonifacio_class, mabini_class])
        post_questions = [
            (competencies[2], "What is 2/3 + 1/4?", ["3/7", "11/12", "3/12", "8/12"], "11/12"),
            (competencies[2], "What is 1/2 + 2/5?", ["3/7", "9/10", "3/10", "7/10"], "9/10"),
            (competencies[3], "What is 8/12 in simplest form?", ["4/6", "2/3", "3/4", "1/2"], "2/3"),
            (competencies[3], "Is 10/15 equivalent to 2/3?", ["True", "False"], "True"),
        ]
        for competency, prompt, choices, correct in post_questions:
            Question.objects.update_or_create(assessment=post_assessment, competency=competency, prompt=prompt, defaults={"question_type": Question.QuestionType.TRUE_FALSE if len(choices) == 2 else Question.QuestionType.MULTIPLE_CHOICE, "options": choices, "correct_answer": correct})

        remedial_assessment, _ = Assessment.objects.update_or_create(title="Fractions remedial exam", defaults={"subject": subject, "kind": Assessment.Kind.REMEDIAL, "instructions": "Complete this exam only after the recovery plan and verified parent/legal-guardian consent.", "is_active": True, "created_by": teacher})
        remedial_assessment.assigned_classes.set([academic_class, bonifacio_class, mabini_class])
        for competency, prompt, choices, correct in post_questions:
            remedial_prompt = f"Remedial: {prompt}"
            Question.objects.update_or_create(assessment=remedial_assessment, competency=competency, prompt=remedial_prompt, defaults={"question_type": Question.QuestionType.TRUE_FALSE if len(choices) == 2 else Question.QuestionType.MULTIPLE_CHOICE, "options": choices, "correct_answer": correct})

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
            plan = create_recovery_plan(student, result)
            if not plan or plan.status != "active":
                continue
            if not plan.activities.filter(completed_at__isnull=False).exists():
                plan.activities.all().delete()
                recommendations = rank_learning_resources(student, result.competency, limit=3)
                for position, recommendation in enumerate(recommendations, start=1):
                    resource = recommendation["resource"]
                    RecoveryActivity.objects.create(plan=plan, resource=resource, title=resource.title, position=position, due_at=timezone.now() + timedelta(days=position * 2), recommendation_reason=recommendation["reason"], recommendation_metadata={"score": recommendation["score"], "confidence": recommendation["confidence"], **recommendation["signals"]})
                RecoveryActivity.objects.create(plan=plan, title="Mastery check", position=len(recommendations) + 1, due_at=timezone.now() + timedelta(days=(len(recommendations) + 1) * 2))
            for activity in plan.activities.filter(due_at__isnull=True):
                activity.due_at = timezone.now() + timedelta(days=activity.position * 2)
                activity.save(update_fields=["due_at"])

        additional_students = [
            ("juan.delacruz@tala.edu.ph", "Juan", "Dela Cruz", [True, True, True, False], 0),
            ("ana.reyes@tala.edu.ph", "Ana", "Reyes", [True, True, True, True], 0),
            ("paolo.garcia@tala.edu.ph", "Paolo", "Garcia", [True, True, False, True], 1),
            ("sofia.mendoza@tala.edu.ph", "Sofia", "Mendoza", [True, True, False, False], 2),
            ("carlo.ramos@tala.edu.ph", "Carlo", "Ramos", [True, False, False, False], 0),
            ("bea.navarro@tala.edu.ph", "Bea", "Navarro", [False, True, False, False], 3),
            ("miguel.torres@tala.edu.ph", "Miguel", "Torres", [True, True, True, True], 0),
            ("nina.flores@tala.edu.ph", "Nina", "Flores", [True, True, False, False], 4),
            ("luis.villanueva@tala.edu.ph", "Luis", "Villanueva", [True, True, False, True], 3),
        ]
        diagnostic_questions = list(assessment.questions.order_by("id"))
        for index, (email, first_name, last_name, correct_pattern, completed_resource_count) in enumerate(additional_students, start=1):
            demo_student, _ = User.objects.get_or_create(username=email, defaults={"email": email, "first_name": first_name, "last_name": last_name})
            demo_student.email = email; demo_student.first_name = first_name; demo_student.last_name = last_name
            demo_student.set_password("demo-password"); demo_student.save()
            profile, _ = UserProfile.objects.get_or_create(user=demo_student, defaults={"role": UserProfile.Role.STUDENT})
            profile.role = UserProfile.Role.STUDENT; profile.academic_class = academic_class; profile.is_active = True; profile.save()
            if AssessmentAttempt.objects.filter(assessment=assessment, student=demo_student, submitted_at__isnull=False).exists():
                continue
            attempt = AssessmentAttempt.objects.create(
                assessment=assessment,
                student=demo_student,
                submitted_at=timezone.now() - timedelta(days=10 - index),
                score=round(sum(correct_pattern) / len(correct_pattern) * 100),
            )
            for question, is_correct in zip(diagnostic_questions, correct_pattern):
                wrong_answer = next((option for option in question.options if option.casefold() != question.correct_answer.casefold()), "Incorrect")
                answer = question.correct_answer if is_correct else wrong_answer
                StudentAnswer.objects.create(attempt=attempt, question=question, answer=answer, is_correct=is_correct)
            for result in calculate_competency_results(attempt):
                if result.status == CompetencyResult.Status.REMEDIATION:
                    create_recovery_plan(demo_student, result)
            resource_activities = RecoveryActivity.objects.filter(plan__student=demo_student, resource__isnull=False).select_related("resource").order_by("plan__competency__code", "position")
            for activity in list(resource_activities[:completed_resource_count]):
                completed_at = timezone.now() - timedelta(days=1)
                answers = {str(question.id): question.correct_answer for question in activity.resource.practice_questions.all()}
                ActivityAttempt.objects.get_or_create(activity=activity, student=demo_student, defaults={"answers": answers, "score": 100, "completed_at": completed_at})
                activity.completed_at = completed_at; activity.save(update_fields=["completed_at"])

        # Spread the additional learners across the seeded classes for assignment and permission testing.
        for email, target_class in {
            "paolo.garcia@tala.edu.ph": bonifacio_class,
            "sofia.mendoza@tala.edu.ph": bonifacio_class,
            "carlo.ramos@tala.edu.ph": bonifacio_class,
            "bea.navarro@tala.edu.ph": mabini_class,
            "miguel.torres@tala.edu.ph": mabini_class,
            "nina.flores@tala.edu.ph": mabini_class,
            "luis.villanueva@tala.edu.ph": mabini_class,
        }.items():
            UserProfile.objects.filter(user__username=email).update(academic_class=target_class)

        for index, profile in enumerate(UserProfile.objects.filter(role=UserProfile.Role.STUDENT).order_by("user_id"), start=1):
            StudentProfile.objects.update_or_create(profile=profile, defaults={"student_number": f"2026-{index:04d}", "learner_reference_number": f"100000000{index:03d}"})
            GuardianContact.objects.update_or_create(profile=profile, name=f"Parent of {profile.user.first_name or 'Learner'}", defaults={"relationship": "Parent", "phone": f"0917000{index:04d}", "email": f"guardian{index}@example.com", "receives_progress_updates": True})
        for index, profile in enumerate(UserProfile.objects.exclude(role=UserProfile.Role.STUDENT).order_by("user_id"), start=1):
            EmployeeProfile.objects.update_or_create(profile=profile, defaults={"employee_id": f"EMP-2026-{index:03d}"})
        self.stdout.write(self.style.SUCCESS("Demo data ready: 2 administrators (including 1 superadministrator), 3 teachers, 10 students, 3 classes, 5 subjects, and 20 competencies. Shared password: demo-password"))
