from decimal import Decimal
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response

from .models import ActivityAttempt, Assessment, AssessmentAttempt, Competency, CompetencyResult, Intervention, LearningResource, RecoveryActivity, RecoveryPlan, StudentAnswer, Subject, UserProfile
from .permissions import IsAdmin, IsStudent, IsTeacherOrAdmin, role_for
from .serializers import ActivityAttemptSerializer, AssessmentAttemptSerializer, AssessmentDetailSerializer, AssessmentSerializer, CompetencySerializer, InterventionSerializer, ResourceSerializer, RecoveryActivitySerializer, RecoveryPlanSerializer, SubjectSerializer, UserAdminSerializer
from .services import calculate_competency_results, create_recovery_plan

class CompetencyViewSet(viewsets.ModelViewSet):
    queryset = Competency.objects.select_related("subject").all()
    serializer_class = CompetencySerializer
    def get_permissions(self):
        return [permissions.IsAuthenticated()] if self.action in {"list", "retrieve"} else [IsTeacherOrAdmin()]
    def get_queryset(self):
        queryset = super().get_queryset()
        if role_for(self.request.user) == "teacher":
            return queryset.filter(subject__in=self.request.user.tala_profile.assigned_subjects.all())
        return queryset

class SubjectViewSet(viewsets.ModelViewSet):
    queryset = Subject.objects.prefetch_related("competencies").all()
    serializer_class = SubjectSerializer
    def get_permissions(self):
        return [permissions.IsAuthenticated()] if self.action in {"list", "retrieve"} else [IsTeacherOrAdmin()]

class UserAdminViewSet(viewsets.ModelViewSet):
    serializer_class = UserAdminSerializer
    permission_classes = [IsAdmin]
    http_method_names = ["get", "post", "head", "options"]
    def get_queryset(self):
        return get_user_model().objects.filter(tala_profile__isnull=False).select_related("tala_profile__academic_class").order_by("last_name", "first_name")

class ResourceViewSet(viewsets.ModelViewSet):
    queryset = LearningResource.objects.prefetch_related("competencies").all()
    serializer_class = ResourceSerializer
    def get_queryset(self):
        queryset = super().get_queryset()
        if role_for(self.request.user) == "student":
            return queryset.filter(is_approved=True)
        if role_for(self.request.user) == "teacher":
            return queryset.filter(competencies__subject__in=self.request.user.tala_profile.assigned_subjects.all()).distinct()
        return queryset
    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [permissions.IsAuthenticated()]
        return [IsTeacherOrAdmin()]

class AssessmentViewSet(viewsets.ModelViewSet):
    queryset = Assessment.objects.select_related("subject", "created_by").prefetch_related("questions", "assigned_classes").all()

    def get_queryset(self):
        queryset = super().get_queryset()
        if role_for(self.request.user) == "student":
            profile = getattr(self.request.user, "tala_profile", None)
            return queryset.filter(is_active=True, assigned_classes=profile.academic_class) if profile and profile.academic_class else queryset.none()
        if role_for(self.request.user) == "teacher":
            return queryset.filter(subject__in=self.request.user.tala_profile.assigned_subjects.all())
        return queryset

    def get_serializer_class(self):
        return AssessmentDetailSerializer if self.action in {"retrieve", "start"} else AssessmentSerializer

    def get_permissions(self):
        if self.action in {"list", "retrieve", "start", "submit", "my_attempts"}:
            return [permissions.IsAuthenticated()]
        return [IsTeacherOrAdmin()]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def _post_assessment_ready(self, assessment, user):
        if assessment.kind != Assessment.Kind.POST:
            return True
        competency_ids = assessment.questions.values_list("competency_id", flat=True)
        return not RecoveryActivity.objects.filter(plan__student=user, plan__status="active", plan__competency_id__in=competency_ids, resource__isnull=False, completed_at__isnull=True).exists()

    @action(detail=True, methods=["get"])
    def start(self, request, pk=None):
        assessment = self.get_object()
        if role_for(request.user) != "student":
            return Response({"detail": "Only students can start an assessment."}, status=status.HTTP_403_FORBIDDEN)
        if not self._post_assessment_ready(assessment, request.user):
            return Response({"detail": "Complete the required recovery activities before starting this mastery assessment."}, status=status.HTTP_409_CONFLICT)
        attempt = AssessmentAttempt.objects.filter(assessment=assessment, student=request.user, submitted_at__isnull=True).first()
        if attempt is None:
            attempt = AssessmentAttempt.objects.create(assessment=assessment, student=request.user)
        return Response({"attempt_id": attempt.id, "assessment": AssessmentDetailSerializer(assessment).data})

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        assessment = self.get_object()
        if role_for(request.user) != "student":
            return Response({"detail": "Only students can submit assessments."}, status=status.HTTP_403_FORBIDDEN)
        if not self._post_assessment_ready(assessment, request.user):
            return Response({"detail": "Complete the required recovery activities before submitting this mastery assessment."}, status=status.HTTP_409_CONFLICT)
        supplied = request.data.get("answers")
        if not isinstance(supplied, list):
            return Response({"answers": "Expected a list of question answers."}, status=status.HTTP_400_BAD_REQUEST)
        questions = {q.id: q for q in assessment.questions.select_related("competency")}
        try:
            answer_map = {int(item.get("question_id")): str(item.get("answer", "")) for item in supplied if item.get("question_id")}
        except (TypeError, ValueError):
            return Response({"answers": "Question identifiers must be valid integers."}, status=status.HTTP_400_BAD_REQUEST)
        if set(answer_map) != set(questions):
            return Response({"answers": "Every assessment question must be answered exactly once."}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            attempt = AssessmentAttempt.objects.filter(assessment=assessment, student=request.user, submitted_at__isnull=True).first()
            if attempt is None:
                attempt = AssessmentAttempt.objects.create(assessment=assessment, student=request.user)
            attempt.answers.all().delete()
            for question_id, answer in answer_map.items():
                question = questions[question_id]
                StudentAnswer.objects.create(attempt=attempt, question=question, answer=answer, is_correct=answer.strip().casefold() == question.correct_answer.strip().casefold())
            correct = attempt.answers.filter(is_correct=True).count()
            attempt.score = Decimal(correct * 100) / Decimal(len(questions)) if questions else Decimal("0")
            attempt.submitted_at = timezone.now()
            attempt.save(update_fields=["score", "submitted_at"])
            results = calculate_competency_results(attempt)
            if assessment.kind == Assessment.Kind.PRE:
                for result in results:
                    if result.status == CompetencyResult.Status.REMEDIATION:
                        create_recovery_plan(request.user, result)
            else:
                for result in results:
                    if result.status == CompetencyResult.Status.MASTERED:
                        RecoveryPlan.objects.filter(student=request.user, competency=result.competency, status="active").update(status="completed")
        return Response(AssessmentAttemptSerializer(attempt).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="my-attempts")
    def my_attempts(self, request):
        attempts = AssessmentAttempt.objects.filter(student=request.user, submitted_at__isnull=False).prefetch_related("competency_results__competency").order_by("-submitted_at")
        return Response(AssessmentAttemptSerializer(attempts, many=True).data)

class RecoveryPlanViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = RecoveryPlanSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = RecoveryPlan.objects.select_related("student", "competency").prefetch_related("activities__resource").order_by("-created_at")
        if role_for(self.request.user) == "student":
            return queryset.filter(student=self.request.user)
        if role_for(self.request.user) == "teacher":
            queryset = queryset.filter(student__tala_profile__academic_class__in=self.request.user.tala_profile.assigned_classes.all())
        student_id = self.request.query_params.get("student")
        return queryset.filter(student_id=student_id) if student_id else queryset

    @action(detail=True, methods=["post"], url_path=r"activities/(?P<activity_id>[^/.]+)/complete", permission_classes=[IsStudent])
    def complete_activity(self, request, pk=None, activity_id=None):
        plan = self.get_object()
        if plan.student_id != request.user.id:
            return Response({"detail": "This activity does not belong to you."}, status=status.HTTP_403_FORBIDDEN)
        try:
            activity = plan.activities.get(pk=activity_id)
        except RecoveryActivity.DoesNotExist:
            return Response({"detail": "Activity not found."}, status=status.HTTP_404_NOT_FOUND)
        if plan.activities.filter(position__lt=activity.position, completed_at__isnull=True).exists():
            return Response({"detail": "Complete the preceding activities first."}, status=status.HTTP_409_CONFLICT)
        attempt = ActivityAttempt.objects.create(activity=activity, student=request.user, answers=request.data.get("answers", {}), score=100, completed_at=timezone.now())
        activity.completed_at = attempt.completed_at
        activity.save(update_fields=["completed_at"])
        return Response({"activity": RecoveryActivitySerializer(activity).data, "attempt": ActivityAttemptSerializer(attempt).data})

class InterventionViewSet(viewsets.ModelViewSet):
    serializer_class = InterventionSerializer
    queryset = Intervention.objects.select_related("student", "teacher").all()
    permission_classes = [IsTeacherOrAdmin]
    def perform_create(self, serializer):
        student = serializer.validated_data["student"]
        if role_for(self.request.user) == "teacher" and not self.request.user.tala_profile.assigned_classes.filter(pk=student.tala_profile.academic_class_id).exists():
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You are not assigned to this learner's class.")
        serializer.save(teacher=self.request.user)

    def get_queryset(self):
        queryset = super().get_queryset()
        if role_for(self.request.user) == "teacher":
            return queryset.filter(student__tala_profile__academic_class__in=self.request.user.tala_profile.assigned_classes.all())
        return queryset

@api_view(["GET"])
@permission_classes([IsStudent])
def student_dashboard(request):
    plans = RecoveryPlan.objects.filter(student=request.user).select_related("competency").prefetch_related("activities__resource")
    attempts = AssessmentAttempt.objects.filter(student=request.user, submitted_at__isnull=False).prefetch_related("competency_results__competency").order_by("submitted_at")
    mastered = CompetencyResult.objects.filter(attempt__student=request.user, status=CompetencyResult.Status.MASTERED).values("competency_id").distinct().count()
    academic_class = request.user.tala_profile.academic_class
    total = Competency.objects.filter(subject__assessment__assigned_classes=academic_class).distinct().count() if academic_class else 0
    return Response({"mastered": mastered, "total_competencies": total, "plans": RecoveryPlanSerializer(plans, many=True).data, "attempts": AssessmentAttemptSerializer(attempts, many=True).data})

@api_view(["GET"])
@permission_classes([IsTeacherOrAdmin])
def teacher_learners(request):
    User = get_user_model()
    students = User.objects.filter(tala_profile__role=UserProfile.Role.STUDENT).select_related("tala_profile__academic_class")
    if role_for(request.user) == "teacher":
        students = students.filter(tala_profile__academic_class__in=request.user.tala_profile.assigned_classes.all())
    rows = []
    for student in students:
        plans = RecoveryPlan.objects.filter(student=student)
        activities = RecoveryActivity.objects.filter(plan__student=student)
        total_activities = activities.count()
        completed_activities = activities.filter(completed_at__isnull=False).count()
        last_attempt = AssessmentAttempt.objects.filter(student=student, submitted_at__isnull=False).order_by("-submitted_at").first()
        gaps = plans.filter(status="active").count()
        rows.append({"id": student.id, "name": student.get_full_name() or student.username, "email": student.email, "section": str(student.tala_profile.academic_class) if student.tala_profile.academic_class else "Unassigned", "progress": round(completed_activities / total_activities * 100) if total_activities else 0, "gaps": gaps, "assessment": float(last_attempt.score) if last_attempt and last_attempt.score is not None else None, "status": "Intervention" if gaps >= 3 else "Monitor" if gaps else "On track"})
    return Response(rows)

@api_view(["GET"])
@permission_classes([IsTeacherOrAdmin])
def teacher_learner_detail(request, student_id):
    User = get_user_model()
    try:
        student = User.objects.select_related("tala_profile__academic_class").get(pk=student_id, tala_profile__role=UserProfile.Role.STUDENT)
    except User.DoesNotExist:
        return Response({"detail": "Learner not found."}, status=status.HTTP_404_NOT_FOUND)
    if role_for(request.user) == "teacher" and not request.user.tala_profile.assigned_classes.filter(pk=student.tala_profile.academic_class_id).exists():
        return Response({"detail": "You are not assigned to this learner's class."}, status=status.HTTP_403_FORBIDDEN)
    plans = RecoveryPlan.objects.filter(student=student).select_related("competency").prefetch_related("activities__resource")
    attempts = AssessmentAttempt.objects.filter(student=student, submitted_at__isnull=False).prefetch_related("competency_results__competency").order_by("submitted_at")
    interventions = Intervention.objects.filter(student=student).select_related("teacher").order_by("-created_at")
    return Response({"student": {"id": student.id, "name": student.get_full_name() or student.username, "email": student.email, "section": str(student.tala_profile.academic_class) if student.tala_profile.academic_class else "Unassigned"}, "plans": RecoveryPlanSerializer(plans, many=True).data, "attempts": AssessmentAttemptSerializer(attempts, many=True).data, "interventions": InterventionSerializer(interventions, many=True).data})

@api_view(["GET"])
@permission_classes([IsAdmin])
def admin_overview(request):
    User = get_user_model()
    return Response({"active_accounts": User.objects.filter(tala_profile__is_active=True, is_active=True).count(), "students": User.objects.filter(tala_profile__role=UserProfile.Role.STUDENT).count(), "teachers": User.objects.filter(tala_profile__role=UserProfile.Role.TEACHER).count(), "classes": UserProfile.objects.exclude(academic_class=None).values("academic_class_id").distinct().count(), "subjects": Subject.objects.count(), "competencies": Competency.objects.count(), "approved_resources": LearningResource.objects.filter(is_approved=True).count(), "pending_resources": LearningResource.objects.filter(is_approved=False).count()})
