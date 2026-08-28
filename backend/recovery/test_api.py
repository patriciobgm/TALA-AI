import json
import tempfile

from django.core.management import call_command
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from docx import Document
from io import BytesIO
from urllib.parse import urlsplit
from rest_framework.test import APITestCase
from .account_security import _totp
from .models import AcademicClass, Assessment, Competency, ContentImport, LearningResource, RecoveryPlan, Subject, UserProfile

class RecoveryApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", verbosity=0)

    def authenticate(self, username="student@tala.edu.ph", password="demo-password"):
        response = self.client.post("/api/auth/login/", {"username": username, "password": password}, format="json")
        self.assertEqual(response.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        return response.data

    def correct_practice_answers(self, activity):
        return {str(question.id): question.correct_answer for question in activity.resource.practice_questions.all()}

    def test_login_includes_role_context(self):
        data = self.authenticate()
        self.assertEqual(data["user"]["role"], "student")
        self.assertEqual(data["user"]["class_name"], "Grade 11 – Rizal")

    def test_demo_dataset_has_multiple_teacher_and_student_scenarios(self):
        self.assertEqual(UserProfile.objects.filter(role=UserProfile.Role.TEACHER).count(), 3)
        self.assertEqual(UserProfile.objects.filter(role=UserProfile.Role.STUDENT).count(), 10)
        self.assertTrue(RecoveryPlan.objects.filter(student__username="nina.flores@tala.edu.ph", activities__completed_at__isnull=False).exists())
        self.assertEqual(Subject.objects.count(), 5)
        self.assertEqual(Competency.objects.count(), 20)
        self.assertEqual(AcademicClass.objects.count(), 3)

    def test_seeded_superadmin_is_reserved_for_django_admin(self):
        response = self.client.post("/api/auth/login/", {"username": "superadmin@tala.edu.ph", "password": "demo-password"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Django Admin", str(response.data))
        self.assertTrue(self.client.login(username="superadmin@tala.edu.ph", password="demo-password"))

    def test_admin_can_manage_curriculum_classes_and_assignments(self):
        self.authenticate("admin@tala.edu.ph")
        subject = self.client.post("/api/subjects/", {"name": "Media and Information Literacy", "code": "MIL", "is_active": True}, format="json")
        self.assertEqual(subject.status_code, 201, subject.data)
        competency = self.client.post("/api/competencies/", {"subject": subject.data["id"], "code": "MIL-01", "title": "Evaluate information sources", "mastery_threshold": 80, "is_active": True}, format="json")
        self.assertEqual(competency.status_code, 201, competency.data)
        academic_class = self.client.post("/api/classes/", {"name": "Luna", "grade_level": 12, "school_year": "2026-2027", "is_active": True}, format="json")
        self.assertEqual(academic_class.status_code, 201, academic_class.data)
        user = self.client.post("/api/users/", {"name": "Test Learner", "email": "test.learner@tala.edu.ph", "role": "student", "password": "defensible-password-42", "academic_class": academic_class.data["id"], "is_active": True}, format="json")
        self.assertEqual(user.status_code, 201, user.data)
        updated = self.client.patch(f"/api/users/{user.data['id']}/", {"is_active": False}, format="json")
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(updated.data["status"], "Inactive")

    def test_profile_password_and_mfa_workflow(self):
        self.authenticate("teacher@tala.edu.ph")
        profile = self.client.patch("/api/auth/profile/", {"name": "Elena Test Cruz"}, format="json")
        self.assertEqual(profile.status_code, 200, profile.data)
        setup = self.client.post("/api/auth/mfa/setup/", {}, format="json")
        self.assertEqual(setup.status_code, 200, setup.data)
        confirmed = self.client.post("/api/auth/mfa/confirm/", {"otp": _totp(setup.data["secret"])}, format="json")
        self.assertEqual(confirmed.status_code, 200, confirmed.data)
        self.assertEqual(len(confirmed.data["recovery_codes"]), 8)
        self.client.credentials()
        requires_mfa = self.client.post("/api/auth/login/", {"username": "teacher@tala.edu.ph", "password": "demo-password"}, format="json")
        self.assertEqual(requires_mfa.status_code, 400)
        signed_in = self.client.post("/api/auth/login/", {"username": "teacher@tala.edu.ph", "password": "demo-password", "otp": _totp(setup.data["secret"])}, format="json")
        self.assertEqual(signed_in.status_code, 200, signed_in.data)

    def test_student_dashboard_uses_persisted_plans(self):
        self.authenticate()
        response = self.client.get("/api/dashboard/student/")
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(len(response.data["plans"]), 1)
        self.assertGreaterEqual(len(response.data["attempts"]), 1)

    def test_activities_must_be_completed_in_order(self):
        self.authenticate()
        plan = RecoveryPlan.objects.filter(activities__resource__isnull=False).distinct().first()
        activities = list(plan.activities.order_by("position"))
        blocked = self.client.post(f"/api/recovery-plans/{plan.id}/activities/{activities[1].id}/complete/", {"answers": {}}, format="json")
        self.assertEqual(blocked.status_code, 409)
        completed = self.client.post(f"/api/recovery-plans/{plan.id}/activities/{activities[0].id}/complete/", {"answers": self.correct_practice_answers(activities[0])}, format="json")
        self.assertEqual(completed.status_code, 200)
        self.assertTrue(completed.data["passed"])
        self.assertEqual(completed.data["feedback"][0]["student_answer"], completed.data["feedback"][0]["correct_answer"])
        self.assertEqual(completed.data["activity"]["review"]["feedback"][0]["correct_answer"], completed.data["feedback"][0]["correct_answer"])

    def test_locked_mastery_assessment_explains_remaining_work(self):
        self.authenticate()
        post_assessment = Assessment.objects.get(kind=Assessment.Kind.POST)
        response = self.client.get("/api/assessments/")
        self.assertEqual(response.status_code, 200)
        serialized = next(item for item in response.data["results"] if item["id"] == post_assessment.id)
        self.assertFalse(serialized["available"])
        self.assertGreater(serialized["remaining_activities"], 0)
        self.assertIn("remaining recovery", serialized["availability_reason"])
        plans = self.client.get("/api/recovery-plans/").data["results"]
        linked_plan = next(item for item in plans if item["competency"] in post_assessment.questions.values_list("competency_id", flat=True))
        self.assertEqual(linked_plan["mastery_assessment"]["id"], post_assessment.id)
        self.assertFalse(linked_plan["mastery_assessment"]["available"])
        expected_for_competency = RecoveryPlan.objects.get(pk=linked_plan["id"]).activities.filter(resource__isnull=False, completed_at__isnull=True).count()
        self.assertEqual(linked_plan["mastery_assessment"]["remaining_activities"], expected_for_competency)
        self.assertLessEqual(linked_plan["mastery_assessment"]["remaining_activities"], serialized["remaining_activities"])

    def test_wrong_practice_answer_does_not_complete_activity(self):
        self.authenticate()
        plan = RecoveryPlan.objects.filter(activities__resource__isnull=False).distinct().first()
        activity = plan.activities.filter(resource__isnull=False).order_by("position").first()
        question = activity.resource.practice_questions.first()
        response = self.client.post(f"/api/recovery-plans/{plan.id}/activities/{activity.id}/complete/", {"answers": {str(question.id): "definitely incorrect"}}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["passed"])
        activity.refresh_from_db()
        self.assertIsNone(activity.completed_at)

    def test_student_cannot_access_teacher_dashboard(self):
        self.authenticate()
        response = self.client.get("/api/dashboard/teacher/learners/")
        self.assertEqual(response.status_code, 403)

    def test_teacher_can_access_learner_dashboard(self):
        self.authenticate("teacher@tala.edu.ph")
        response = self.client.get("/api/dashboard/teacher/learners/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["name"], "Maria Santos")

    def test_teacher_can_load_content_import_dependencies(self):
        self.authenticate("teacher@tala.edu.ph")
        for path in ["/api/content-imports/", "/api/subjects/", "/api/competencies/", "/api/classes/"]:
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200, path)
        classes = self.client.get("/api/classes/").data["results"]
        self.assertEqual(classes[0]["label"], "Grade 11 – Rizal")

    def test_complete_recovery_and_submit_mastery_assessment(self):
        self.authenticate()
        plans_response = self.client.get("/api/recovery-plans/")
        plans = plans_response.data["results"]
        for plan in plans:
            for activity in sorted(plan["activities"], key=lambda item: item["position"]):
                if activity["resource"]:
                    model_activity = RecoveryPlan.objects.get(pk=plan["id"]).activities.get(pk=activity["id"])
                    response = self.client.post(f"/api/recovery-plans/{plan['id']}/activities/{activity['id']}/complete/", {"answers": self.correct_practice_answers(model_activity)}, format="json")
                    self.assertEqual(response.status_code, 200)
        post_assessment = Assessment.objects.get(kind=Assessment.Kind.POST)
        start = self.client.get(f"/api/assessments/{post_assessment.id}/start/")
        self.assertEqual(start.status_code, 200)
        answers = [{"question_id": question.id, "answer": question.correct_answer} for question in post_assessment.questions.all()]
        submitted = self.client.post(f"/api/assessments/{post_assessment.id}/submit/", {"answers": answers}, format="json")
        self.assertEqual(submitted.status_code, 201)
        self.assertEqual(float(submitted.data["score"]), 100)
        self.assertFalse(RecoveryPlan.objects.filter(student__username="student@tala.edu.ph", status="active").exists())
        self.assertFalse(RecoveryPlan.objects.filter(student__username="student@tala.edu.ph", activities__resource__isnull=True, activities__completed_at__isnull=True).exists())

    def test_mastery_check_can_target_one_recovery_competency(self):
        self.authenticate()
        plan = RecoveryPlan.objects.get(student__username="student@tala.edu.ph", competency__code="GM-03")
        for activity in plan.activities.filter(resource__isnull=False).order_by("position"):
            response = self.client.post(f"/api/recovery-plans/{plan.id}/activities/{activity.id}/complete/", {"answers": self.correct_practice_answers(activity)}, format="json")
            self.assertEqual(response.status_code, 200, response.data)
        assessment = Assessment.objects.get(kind=Assessment.Kind.POST)
        started = self.client.get(f"/api/assessments/{assessment.id}/start/?competency={plan.competency_id}")
        self.assertEqual(started.status_code, 200, started.data)
        questions = started.data["assessment"]["questions"]
        self.assertEqual(len(questions), 2)
        self.assertTrue(all(question["competency"] == plan.competency_id for question in questions))
        answers = [{"question_id": question.id, "answer": question.correct_answer} for question in assessment.questions.filter(competency=plan.competency)]
        submitted = self.client.post(f"/api/assessments/{assessment.id}/submit/", {"competency": plan.competency_id, "answers": answers}, format="json")
        self.assertEqual(submitted.status_code, 201, submitted.data)
        plan.refresh_from_db()
        self.assertEqual(plan.status, "completed")
        self.assertTrue(plan.activities.filter(resource__isnull=True, completed_at__isnull=False).exists())

    def test_teacher_can_import_review_and_publish_docx_exam(self):
        self.authenticate("teacher@tala.edu.ph")
        from .models import AcademicClass, Competency, Subject
        subject = Subject.objects.get(code="GM")
        competency = Competency.objects.get(code="GM-02")
        academic_class = AcademicClass.objects.get(name="Rizal")
        document = Document()
        for line in ["1. What is the least common denominator of 3 and 4?", "A. 7", "B. 8", "C. 12", "D. 24", "Answer: C", "Competency: GM-02"]:
            document.add_paragraph(line)
        buffer = BytesIO(); document.save(buffer)
        upload = SimpleUploadedFile("fractions-exam.docx", buffer.getvalue(), content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        with tempfile.TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            created = self.client.post("/api/content-imports/", {"title": "Imported fractions exam", "kind": "exam", "subject": subject.id, "competency": competency.id, "configuration": json.dumps({"assessment_kind": "pre", "assigned_class_ids": [academic_class.id]}), "source_file": upload}, format="multipart")
            self.assertEqual(created.status_code, 201, created.data)
            self.assertEqual(created.data["status"], ContentImport.Status.NEEDS_REVIEW)
            self.assertEqual(created.data["extracted_payload"]["question_count"], 1)
            self.authenticate("admin@tala.edu.ph")
            published = self.client.post(f"/api/content-imports/{created.data['id']}/publish/", {}, format="json")
            self.assertEqual(published.status_code, 200, published.data)
            assessment = Assessment.objects.get(title="Imported fractions exam")
            self.assertFalse(assessment.is_active)
            self.assertEqual(assessment.questions.get().correct_answer, "12")

    def test_teacher_can_publish_video_learning_material(self):
        self.authenticate("teacher@tala.edu.ph")
        from .models import Competency, Subject
        subject = Subject.objects.get(code="GM")
        competency = Competency.objects.get(code="GM-03")
        upload = SimpleUploadedFile("fraction-demo.mp4", b"small-test-video", content_type="video/mp4")
        with tempfile.TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            created = self.client.post("/api/content-imports/", {"title": "Fraction demonstration", "kind": "video", "subject": subject.id, "competency": competency.id, "configuration": json.dumps({"description": "Teacher demonstration of adding unlike fractions."}), "source_file": upload}, format="multipart")
            self.assertEqual(created.status_code, 201, created.data)
            self.authenticate("admin@tala.edu.ph")
            published = self.client.post(f"/api/content-imports/{created.data['id']}/publish/", {}, format="json")
            self.assertEqual(published.status_code, 200, published.data)
            resource = LearningResource.objects.get(title="Fraction demonstration")
            self.assertEqual(resource.resource_type, LearningResource.ResourceType.VIDEO)
            self.assertTrue(resource.is_approved)
            detail = self.client.get(f"/api/resources/{resource.id}/")
            self.assertEqual(detail.status_code, 200)
            signed_url = urlsplit(detail.data["file_url"])
            self.client.credentials()
            protected_file = self.client.get(f"{signed_url.path}?{signed_url.query}")
            self.assertEqual(protected_file.status_code, 200)

    def test_protected_media_rejects_anonymous_unsigned_requests(self):
        with tempfile.TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            resource = LearningResource.objects.create(
                title="Protected module",
                resource_type=LearningResource.ResourceType.MODULE,
                file=SimpleUploadedFile("protected.pdf", b"private-content", content_type="application/pdf"),
                original_filename="protected.pdf",
                mime_type="application/pdf",
                is_approved=True,
            )
            response = self.client.get(f"/api/resources/{resource.id}/file/")
            self.assertEqual(response.status_code, 403)

    def test_notifications_are_scoped_to_current_user(self):
        self.authenticate()
        response = self.client.get("/api/notifications/")
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(len(response.data["results"]), 1)
        notification_id = response.data["results"][0]["id"]
        marked = self.client.post(f"/api/notifications/{notification_id}/read/")
        self.assertEqual(marked.status_code, 200)
        self.assertTrue(marked.data["is_read"])
