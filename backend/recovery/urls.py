from rest_framework.routers import DefaultRouter
from django.urls import path
from .views import AssessmentViewSet, CompetencyViewSet, InterventionViewSet, RecoveryPlanViewSet, ResourceViewSet, SubjectViewSet, UserAdminViewSet, admin_overview, student_dashboard, teacher_learners, teacher_learner_detail
from .tutor_views import tutor_health, tutor_message

router = DefaultRouter()
router.register("subjects", SubjectViewSet)
router.register("users", UserAdminViewSet, basename="user")
router.register("competencies", CompetencyViewSet)
router.register("resources", ResourceViewSet)
router.register("assessments", AssessmentViewSet)
router.register("recovery-plans", RecoveryPlanViewSet, basename="recovery-plan")
router.register("interventions", InterventionViewSet)
urlpatterns = router.urls + [path("dashboard/admin/", admin_overview), path("dashboard/student/", student_dashboard), path("dashboard/teacher/learners/", teacher_learners), path("dashboard/teacher/learners/<int:student_id>/", teacher_learner_detail), path("tutor/health/", tutor_health), path("tutor/plans/<int:plan_id>/messages/", tutor_message)]
