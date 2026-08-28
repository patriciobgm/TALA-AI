from rest_framework.routers import DefaultRouter
from django.urls import path
from .views import AcademicClassViewSet, AssessmentViewSet, CompetencyViewSet, ContentImportViewSet, DeviceRegistrationViewSet, InterventionViewSet, NotificationViewSet, RecoveryPlanViewSet, ResourceViewSet, SubjectViewSet, UserAdminViewSet, admin_overview, audit_events, health, notification_preferences, student_dashboard, system_configuration, teacher_learners, teacher_learner_detail
from .tutor_views import tutor_health, tutor_message

router = DefaultRouter()
router.register("subjects", SubjectViewSet)
router.register("classes", AcademicClassViewSet, basename="class")
router.register("users", UserAdminViewSet, basename="user")
router.register("competencies", CompetencyViewSet)
router.register("resources", ResourceViewSet)
router.register("assessments", AssessmentViewSet)
router.register("recovery-plans", RecoveryPlanViewSet, basename="recovery-plan")
router.register("interventions", InterventionViewSet)
router.register("content-imports", ContentImportViewSet, basename="content-import")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("devices", DeviceRegistrationViewSet, basename="device")
urlpatterns = router.urls + [path("health/", health), path("notification-preferences/", notification_preferences), path("dashboard/admin/", admin_overview), path("dashboard/student/", student_dashboard), path("dashboard/teacher/learners/", teacher_learners), path("dashboard/teacher/learners/<int:student_id>/", teacher_learner_detail), path("system/configuration/", system_configuration), path("system/audit-events/", audit_events), path("tutor/health/", tutor_health), path("tutor/plans/<int:plan_id>/messages/", tutor_message)]
