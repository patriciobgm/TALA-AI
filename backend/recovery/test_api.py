from django.core.management import call_command
from rest_framework.test import APITestCase
from .models import Assessment, RecoveryPlan

class RecoveryApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", verbosity=0)

    def authenticate(self, username="student@tala.edu.ph", password="demo-password"):
        response = self.client.post("/api/auth/login/", {"username": username, "password": password}, format="json")
        self.assertEqual(response.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        return response.data

    def test_login_includes_role_context(self):
        data = self.authenticate()
        self.assertEqual(data["user"]["role"], "student")
        self.assertEqual(data["user"]["class_name"], "Grade 11 – Rizal")

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
        completed = self.client.post(f"/api/recovery-plans/{plan.id}/activities/{activities[0].id}/complete/", {"answers": {}}, format="json")
        self.assertEqual(completed.status_code, 200)

    def test_student_cannot_access_teacher_dashboard(self):
        self.authenticate()
        response = self.client.get("/api/dashboard/teacher/learners/")
        self.assertEqual(response.status_code, 403)

    def test_teacher_can_access_learner_dashboard(self):
        self.authenticate("teacher@tala.edu.ph")
        response = self.client.get("/api/dashboard/teacher/learners/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["name"], "Maria Santos")

    def test_complete_recovery_and_submit_mastery_assessment(self):
        self.authenticate()
        plans_response = self.client.get("/api/recovery-plans/")
        plans = plans_response.data["results"]
        for plan in plans:
            for activity in sorted(plan["activities"], key=lambda item: item["position"]):
                if activity["resource"]:
                    response = self.client.post(f"/api/recovery-plans/{plan['id']}/activities/{activity['id']}/complete/", {"answers": {}}, format="json")
                    self.assertEqual(response.status_code, 200)
        post_assessment = Assessment.objects.get(kind=Assessment.Kind.POST)
        start = self.client.get(f"/api/assessments/{post_assessment.id}/start/")
        self.assertEqual(start.status_code, 200)
        answers = [{"question_id": question.id, "answer": question.correct_answer} for question in post_assessment.questions.all()]
        submitted = self.client.post(f"/api/assessments/{post_assessment.id}/submit/", {"answers": answers}, format="json")
        self.assertEqual(submitted.status_code, 201)
        self.assertEqual(float(submitted.data["score"]), 100)
        self.assertFalse(RecoveryPlan.objects.filter(student__username="student@tala.edu.ph", status="active").exists())
