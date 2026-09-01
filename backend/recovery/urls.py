from rest_framework.routers import DefaultRouter
from django.urls import path
from .views import AcademicClassViewSet, AssessmentViewSet, CompetencyViewSet, ContentImportViewSet, DeviceRegistrationViewSet, EnrollmentRequestViewSet, InterventionViewSet, LearningAssignmentViewSet, NotificationViewSet, RecoveryPlanViewSet, ResourceViewSet, SubjectViewSet, UserAdminViewSet, admin_overview, ai_message_evaluations, audit_events, health, notification_preferences, privacy_requests, research_evidence, research_snapshots, student_context, student_dashboard, system_configuration, teacher_context, teacher_learners, teacher_learner_detail, teacher_learner_recommendations, teacher_material_analytics, usability_evaluations
from .tutor_views import assessment_recovery_evidence, companion_analytics, companion_dashboard, companion_help_request, learning_assignment_tutor_message, learning_goal_detail, learning_goals, misconception_detail, misconception_signals, misconceptions, start_companion_session, tutor_feedback, tutor_health, tutor_message, update_companion_session

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
router.register("learning-assignments", LearningAssignmentViewSet, basename="learning-assignment")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("enrollment-requests", EnrollmentRequestViewSet, basename="enrollment-request")
router.register("devices", DeviceRegistrationViewSet, basename="device")
urlpatterns = router.urls + [path("health/", health), path("notification-preferences/", notification_preferences), path("dashboard/admin/", admin_overview), path("dashboard/student/", student_dashboard), path("dashboard/student/context/", student_context), path("dashboard/teacher/context/", teacher_context), path("dashboard/teacher/materials/", teacher_material_analytics), path("dashboard/teacher/learners/", teacher_learners), path("dashboard/teacher/learners/<int:student_id>/", teacher_learner_detail), path("dashboard/teacher/learners/<int:student_id>/recommendations/", teacher_learner_recommendations), path("research/evidence/", research_evidence), path("research/snapshots/", research_snapshots), path("research/usability-evaluations/", usability_evaluations), path("research/ai-evaluations/", ai_message_evaluations), path("privacy/requests/", privacy_requests), path("system/configuration/", system_configuration), path("system/audit-events/", audit_events), path("tutor/health/", tutor_health), path("tutor/companion/", companion_dashboard), path("tutor/companion/analytics/", companion_analytics), path("tutor/companion/sessions/", start_companion_session), path("tutor/companion/sessions/<int:session_id>/", update_companion_session), path("tutor/companion/help/", companion_help_request), path("tutor/misconceptions/", misconceptions), path("tutor/misconceptions/<int:misconception_id>/", misconception_detail), path("tutor/misconception-signals/", misconception_signals), path("tutor/goals/", learning_goals), path("tutor/goals/<int:goal_id>/", learning_goal_detail), path("tutor/evidence/", assessment_recovery_evidence), path("tutor/plans/<int:plan_id>/messages/", tutor_message), path("tutor/learning-assignments/<int:assignment_id>/messages/", learning_assignment_tutor_message), path("tutor/messages/<int:message_id>/feedback/", tutor_feedback)]
