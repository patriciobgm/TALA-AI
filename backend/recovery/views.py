from decimal import Decimal
from urllib.parse import quote
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import connection
from django.db.models import Q
from django.core.files.storage import default_storage
from django.http import FileResponse, HttpResponse
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response

from .content_imports import ContentImportError, process_content_import, publish_content_import
from .models import AcademicClass, ActivityAttempt, Assessment, AssessmentAttempt, AuditEvent, Competency, CompetencyResult, ContentImport, DeviceRegistration, Intervention, LearningResource, Notification, NotificationPreference, RecoveryActivity, RecoveryPlan, StudentAnswer, Subject, SystemConfiguration, UserProfile
from .notifications import assigned_teachers_for, notify
from .permissions import IsAdmin, IsStudent, IsTeacher, IsTeacherOrAdmin, role_for
from .secure_media import validate_media_token
from .serializers import AcademicClassSerializer, ActivityAttemptSerializer, AssessmentAttemptSerializer, AssessmentDetailSerializer, AssessmentSerializer, AuditEventSerializer, CompetencySerializer, ContentImportSerializer, DeviceRegistrationSerializer, InterventionSerializer, NotificationPreferenceSerializer, NotificationSerializer, ResourceSerializer, RecoveryActivitySerializer, RecoveryPlanSerializer, SubjectSerializer, SystemConfigurationSerializer, UserAdminSerializer
from .services import calculate_competency_results, create_recovery_plan

def protected_file_response(file_field, mime_type, filename):
    disposition = f"inline; filename*=UTF-8''{quote(filename)}"
    if not settings.DEBUG:
        response = HttpResponse(content_type=mime_type or "application/octet-stream")
        response["X-Accel-Redirect"] = f"/protected-media/{file_field.name}"
    else:
        response = FileResponse(file_field.open("rb"), content_type=mime_type or "application/octet-stream")
    response["Content-Disposition"] = disposition
    response["Cache-Control"] = "private, max-age=300"
    return response

@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def health(request):
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        cursor.fetchone()
    return Response({"status": "ok", "database": "ok"})


class AuditedAdminModelMixin:
    def perform_create(self, serializer):
        instance = serializer.save()
        AuditEvent.objects.create(actor=self.request.user, action=f"{instance._meta.model_name}.created", object_type=instance.__class__.__name__, object_id=str(instance.pk))

    def perform_update(self, serializer):
        instance = serializer.save()
        AuditEvent.objects.create(actor=self.request.user, action=f"{instance._meta.model_name}.updated", object_type=instance.__class__.__name__, object_id=str(instance.pk))

class CompetencyViewSet(AuditedAdminModelMixin, viewsets.ModelViewSet):
    queryset = Competency.objects.select_related("subject").order_by("subject__name", "code")
    serializer_class = CompetencySerializer
    http_method_names = ["get", "post", "put", "patch", "head", "options"]
    def get_permissions(self):
        return [permissions.IsAuthenticated()] if self.action in {"list", "retrieve"} else [IsAdmin()]
    def get_queryset(self):
        queryset = super().get_queryset()
        if role_for(self.request.user) == "teacher":
            queryset = queryset.filter(subject__in=self.request.user.tala_profile.assigned_subjects.all())
        if subject_id := self.request.query_params.get("subject"):
            queryset = queryset.filter(subject_id=subject_id)
        if status_filter := self.request.query_params.get("status"):
            queryset = queryset.filter(is_active=status_filter == "active")
        if search := self.request.query_params.get("search", "").strip():
            queryset = queryset.filter(Q(code__icontains=search) | Q(title__icontains=search) | Q(subject__name__icontains=search))
        ordering = {"code": "code", "title": "title", "threshold": "mastery_threshold", "status": "is_active", "-code": "-code", "-title": "-title", "-threshold": "-mastery_threshold", "-status": "-is_active"}.get(self.request.query_params.get("ordering", "code"), "code")
        return queryset.order_by(ordering, "id")

class SubjectViewSet(AuditedAdminModelMixin, viewsets.ModelViewSet):
    queryset = Subject.objects.prefetch_related("competencies").order_by("name")
    serializer_class = SubjectSerializer
    http_method_names = ["get", "post", "put", "patch", "head", "options"]
    def get_permissions(self):
        return [permissions.IsAuthenticated()] if self.action in {"list", "retrieve"} else [IsAdmin()]
    def get_queryset(self):
        queryset = super().get_queryset()
        if status_filter := self.request.query_params.get("status"):
            queryset = queryset.filter(is_active=status_filter == "active")
        if search := self.request.query_params.get("search", "").strip():
            queryset = queryset.filter(Q(code__icontains=search) | Q(name__icontains=search))
        ordering = {"name": "name", "code": "code", "competencies": "competency_count", "status": "is_active", "-name": "-name", "-code": "-code", "-competencies": "-competency_count", "-status": "-is_active"}.get(self.request.query_params.get("ordering", "name"), "name")
        if "competency_count" in ordering:
            from django.db.models import Count
            queryset = queryset.annotate(competency_count=Count("competencies"))
        return queryset.order_by(ordering, "id")

class AcademicClassViewSet(AuditedAdminModelMixin, viewsets.ModelViewSet):
    serializer_class = AcademicClassSerializer
    http_method_names = ["get", "post", "put", "patch", "head", "options"]
    def get_permissions(self):
        return [IsTeacherOrAdmin()] if self.action in {"list", "retrieve"} else [IsAdmin()]
    def get_queryset(self):
        queryset = AcademicClass.objects.all().order_by("grade_level", "name")
        if role_for(self.request.user) == UserProfile.Role.TEACHER:
            queryset = queryset.filter(assigned_teachers=self.request.user.tala_profile)
        if status_filter := self.request.query_params.get("status"):
            queryset = queryset.filter(is_active=status_filter == "active")
        if search := self.request.query_params.get("search", "").strip():
            queryset = queryset.filter(Q(name__icontains=search) | Q(school_year__icontains=search))
        ordering = {"class": "name", "grade": "grade_level", "year": "school_year", "status": "is_active", "-class": "-name", "-grade": "-grade_level", "-year": "-school_year", "-status": "-is_active"}.get(self.request.query_params.get("ordering", "grade"), "grade_level")
        return queryset.order_by(ordering, "name", "id")

class UserAdminViewSet(viewsets.ModelViewSet):
    serializer_class = UserAdminSerializer
    permission_classes = [IsAdmin]
    http_method_names = ["get", "post", "patch", "head", "options"]
    def get_queryset(self):
        queryset = get_user_model().objects.filter(tala_profile__isnull=False, is_superuser=False).select_related("tala_profile__academic_class")
        if role_filter := self.request.query_params.get("role"):
            queryset = queryset.filter(tala_profile__role=role_filter)
        if status_filter := self.request.query_params.get("status"):
            queryset = queryset.filter(is_active=status_filter == "active", tala_profile__is_active=status_filter == "active")
        if search := self.request.query_params.get("search", "").strip():
            queryset = queryset.filter(Q(first_name__icontains=search) | Q(last_name__icontains=search) | Q(email__icontains=search) | Q(tala_profile__academic_class__name__icontains=search))
        ordering = {"user": "last_name", "role": "tala_profile__role", "assignment": "tala_profile__academic_class__name", "status": "is_active", "-user": "-last_name", "-role": "-tala_profile__role", "-assignment": "-tala_profile__academic_class__name", "-status": "-is_active"}.get(self.request.query_params.get("ordering", "user"), "last_name")
        return queryset.order_by(ordering, "first_name", "id")

    def perform_create(self, serializer):
        user = serializer.save()
        AuditEvent.objects.create(actor=self.request.user, action="user.created", object_type="User", object_id=str(user.pk), metadata={"email": user.email, "role": user.tala_profile.role})

    def perform_update(self, serializer):
        user = serializer.save()
        AuditEvent.objects.create(actor=self.request.user, action="user.updated", object_type="User", object_id=str(user.pk), metadata={"email": user.email, "active": user.is_active})

    @action(detail=True, methods=["post"], url_path="send-password-reset")
    def send_password_reset(self, request, pk=None):
        from .auth_views import send_reset_email
        user = self.get_object()
        send_reset_email(user, request)
        AuditEvent.objects.create(actor=request.user, action="user.password_reset_requested", object_type="User", object_id=str(user.pk), metadata={"email": user.email})
        return Response({"detail": "Password reset instructions were sent."})

    @action(detail=True, methods=["post"], url_path="require-password-change")
    def require_password_change(self, request, pk=None):
        user = self.get_object()
        user.tala_profile.must_change_password = True
        user.tala_profile.save(update_fields=["must_change_password"])
        AuditEvent.objects.create(actor=request.user, action="user.password_change_required", object_type="User", object_id=str(user.pk))
        return Response(self.get_serializer(user).data)

class ResourceViewSet(viewsets.ModelViewSet):
    queryset = LearningResource.objects.prefetch_related("competencies", "practice_questions").all()
    serializer_class = ResourceSerializer
    def get_queryset(self):
        queryset = super().get_queryset()
        if role_for(self.request.user) == "student":
            return queryset.filter(is_approved=True)
        if role_for(self.request.user) == "teacher":
            return queryset.filter(competencies__subject__in=self.request.user.tala_profile.assigned_subjects.all()).distinct()
        return queryset
    def get_permissions(self):
        if self.action == "file":
            return [permissions.AllowAny()]
        if self.action in {"list", "retrieve"}:
            return [permissions.IsAuthenticated()]
        return [IsTeacherOrAdmin()]

    @action(detail=True, methods=["get"])
    def file(self, request, pk=None):
        if validate_media_token(request.query_params.get("token"), "resource", pk):
            try:
                resource = LearningResource.objects.get(pk=pk, is_approved=True)
            except LearningResource.DoesNotExist:
                return Response({"detail": "Resource not found."}, status=status.HTTP_404_NOT_FOUND)
        elif request.user.is_authenticated:
            resource = self.get_object()
        else:
            return Response({"detail": "A valid media link is required."}, status=status.HTTP_403_FORBIDDEN)
        if not resource.file:
            return Response({"detail": "This resource has no uploaded file."}, status=status.HTTP_404_NOT_FOUND)
        return protected_file_response(resource.file, resource.mime_type, resource.original_filename or resource.file.name.rsplit("/", 1)[-1])

class AssessmentViewSet(viewsets.ModelViewSet):
    queryset = Assessment.objects.select_related("subject", "created_by").prefetch_related("questions", "assigned_classes").order_by("title", "id")

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

    def perform_update(self, serializer):
        was_active = serializer.instance.is_active
        assessment = serializer.save()
        if assessment.is_active and not was_active:
            students = get_user_model().objects.filter(tala_profile__role=UserProfile.Role.STUDENT, tala_profile__academic_class__in=assessment.assigned_classes.all()).distinct()
            for student in students:
                notify(recipient=student, kind=Notification.Kind.CONTENT_PUBLISHED, title="Assessment assigned", message=f"{assessment.title} is now available.", action_url="/assessments", deduplication_key=f"assessment:{assessment.id}:assigned:student:{student.id}")

    def _post_assessment_ready(self, assessment, user, target_competency_id=None):
        if assessment.kind != Assessment.Kind.POST:
            return True
        competency_ids = [target_competency_id] if target_competency_id else assessment.questions.values_list("competency_id", flat=True)
        return not RecoveryActivity.objects.filter(plan__student=user, plan__status="active", plan__competency_id__in=competency_ids, resource__isnull=False, completed_at__isnull=True).exists()

    @action(detail=True, methods=["get"])
    def start(self, request, pk=None):
        assessment = self.get_object()
        if role_for(request.user) != "student":
            return Response({"detail": "Only students can start an assessment."}, status=status.HTTP_403_FORBIDDEN)
        target_competency_id = request.query_params.get("competency")
        if not self._post_assessment_ready(assessment, request.user, target_competency_id):
            return Response({"detail": "Complete the required recovery activities before starting this mastery assessment."}, status=status.HTTP_409_CONFLICT)
        if target_competency_id and not assessment.questions.filter(competency_id=target_competency_id).exists():
            return Response({"detail": "This assessment does not contain a mastery check for the selected competency."}, status=status.HTTP_400_BAD_REQUEST)
        attempt = AssessmentAttempt.objects.filter(assessment=assessment, student=request.user, submitted_at__isnull=True).first()
        if attempt is None:
            attempt = AssessmentAttempt.objects.create(assessment=assessment, student=request.user)
        return Response({"attempt_id": attempt.id, "assessment": AssessmentDetailSerializer(assessment, context={"request": request, "target_competency_id": target_competency_id}).data})

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        assessment = self.get_object()
        if role_for(request.user) != "student":
            return Response({"detail": "Only students can submit assessments."}, status=status.HTTP_403_FORBIDDEN)
        target_competency_id = request.data.get("competency")
        if not self._post_assessment_ready(assessment, request.user, target_competency_id):
            return Response({"detail": "Complete the required recovery activities before submitting this mastery assessment."}, status=status.HTTP_409_CONFLICT)
        supplied = request.data.get("answers")
        if not isinstance(supplied, list):
            return Response({"answers": "Expected a list of question answers."}, status=status.HTTP_400_BAD_REQUEST)
        question_queryset = assessment.questions.select_related("competency")
        if target_competency_id:
            question_queryset = question_queryset.filter(competency_id=target_competency_id)
            if not question_queryset.exists():
                return Response({"detail": "This assessment does not contain a mastery check for the selected competency."}, status=status.HTTP_400_BAD_REQUEST)
        questions = {q.id: q for q in question_queryset}
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
                        completed_plans = RecoveryPlan.objects.filter(student=request.user, competency=result.competency, status="active")
                        RecoveryActivity.objects.filter(plan__in=completed_plans, resource__isnull=True, completed_at__isnull=True).update(completed_at=timezone.now())
                        completed_plans.update(status="completed")
            notify(recipient=request.user, kind=Notification.Kind.ASSESSMENT_RESULT, title="Assessment submitted", message=f"Your score for {assessment.title} is {round(float(attempt.score))}%.", action_url="/assessments", deduplication_key=f"assessment-attempt:{attempt.id}:student")
            for teacher in assigned_teachers_for(request.user):
                notify(recipient=teacher, kind=Notification.Kind.ASSESSMENT_RESULT, title="Learner assessment submitted", message=f"{request.user.get_full_name() or request.user.username} scored {round(float(attempt.score))}% on {assessment.title}.", action_url=f"/learners/{request.user.id}", deduplication_key=f"assessment-attempt:{attempt.id}:teacher:{teacher.id}")
        return Response(AssessmentAttemptSerializer(attempt).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="my-attempts")
    def my_attempts(self, request):
        attempts = AssessmentAttempt.objects.filter(student=request.user, submitted_at__isnull=False).prefetch_related("competency_results__competency").order_by("-submitted_at")
        return Response(AssessmentAttemptSerializer(attempts, many=True).data)

class RecoveryPlanViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = RecoveryPlanSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = RecoveryPlan.objects.select_related("student", "competency").prefetch_related("activities__resource__practice_questions", "activities__attempts").order_by("-created_at")
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
        if not activity.resource:
            return Response({"detail": "Complete this mastery check from the Assessments page."}, status=status.HTTP_409_CONFLICT)
        questions = list(activity.resource.practice_questions.all())
        supplied = request.data.get("answers", {})
        if not isinstance(supplied, dict):
            return Response({"answers": "Expected an object keyed by practice question ID."}, status=status.HTTP_400_BAD_REQUEST)
        feedback = []
        if questions:
            normalized = {str(key): str(value).strip() for key, value in supplied.items()}
            expected_ids = {str(question.id) for question in questions}
            if set(normalized) != expected_ids:
                return Response({"answers": "Answer every practice question before checking your work."}, status=status.HTTP_400_BAD_REQUEST)
            correct = 0
            for question in questions:
                is_correct = normalized[str(question.id)].casefold() == question.correct_answer.strip().casefold()
                correct += int(is_correct)
                feedback.append({"question_id": question.id, "student_answer": normalized[str(question.id)], "correct_answer": question.correct_answer, "is_correct": is_correct, "explanation": question.explanation})
            score = Decimal(correct * 100) / Decimal(len(questions))
        else:
            score = Decimal("100")
        completed_at = timezone.now()
        passed = score >= activity.resource.passing_score
        attempt = ActivityAttempt.objects.create(activity=activity, student=request.user, answers=supplied, score=score, completed_at=completed_at)
        if passed:
            activity.completed_at = completed_at
            activity.save(update_fields=["completed_at"])
            total = plan.activities.filter(resource__isnull=False).count()
            complete = plan.activities.filter(resource__isnull=False, completed_at__isnull=False).count()
            progress = round(complete / total * 100) if total else 0
            for teacher in assigned_teachers_for(request.user):
                notify(recipient=teacher, kind=Notification.Kind.PLAN_PROGRESS, title="Learner recovery progress", message=f"{request.user.get_full_name() or request.user.username} reached {progress}% in {plan.competency.title}.", action_url=f"/learners/{request.user.id}", deduplication_key=f"plan:{plan.id}:progress:{progress}:teacher:{teacher.id}")
        return Response({"passed": passed, "required_score": activity.resource.passing_score, "feedback": feedback, "activity": RecoveryActivitySerializer(activity, context={"request": request}).data, "attempt": ActivityAttemptSerializer(attempt).data})

class InterventionViewSet(viewsets.ModelViewSet):
    serializer_class = InterventionSerializer
    queryset = Intervention.objects.select_related("student", "teacher").all()
    permission_classes = [IsTeacherOrAdmin]
    def perform_create(self, serializer):
        student = serializer.validated_data["student"]
        if role_for(self.request.user) == "teacher" and not self.request.user.tala_profile.assigned_classes.filter(pk=student.tala_profile.academic_class_id).exists():
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("You are not assigned to this learner's class.")
        intervention = serializer.save(teacher=self.request.user)
        notify(recipient=student, kind=Notification.Kind.INTERVENTION, title="Teacher support added", message="Your teacher added a recovery-plan intervention. Open your progress page to review it.", action_url="/recovery", deduplication_key=f"intervention:{intervention.id}")

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


@api_view(["GET", "PATCH"])
@permission_classes([IsAdmin])
def system_configuration(request):
    configuration = SystemConfiguration.load()
    if request.method == "PATCH":
        serializer = SystemConfigurationSerializer(configuration, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        configuration = serializer.save(updated_by=request.user)
        AuditEvent.objects.create(actor=request.user, action="system_configuration.updated", object_type="SystemConfiguration", object_id="1", metadata=serializer.validated_data)
    return Response(SystemConfigurationSerializer(configuration).data)


@api_view(["GET"])
@permission_classes([IsAdmin])
def audit_events(request):
    events = AuditEvent.objects.select_related("actor")[:100]
    return Response(AuditEventSerializer(events, many=True).data)

class ContentImportViewSet(viewsets.ModelViewSet):
    serializer_class = ContentImportSerializer
    permission_classes = [IsTeacherOrAdmin]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_permissions(self):
        if self.action == "source":
            return [permissions.AllowAny()]
        if self.action in {"create", "process"}:
            return [IsTeacher()]
        if self.action in {"update", "partial_update", "publish", "reject"}:
            return [IsAdmin()]
        return [IsTeacherOrAdmin()]

    def get_queryset(self):
        queryset = ContentImport.objects.select_related("subject", "competency", "uploaded_by", "reviewed_by", "published_assessment", "published_resource")
        if role_for(self.request.user) == UserProfile.Role.TEACHER:
            queryset = queryset.filter(uploaded_by=self.request.user)
        return queryset

    def perform_create(self, serializer):
        process_content_import(serializer.save())

    @action(detail=True, methods=["post"])
    def process(self, request, pk=None):
        content_import = process_content_import(self.get_object())
        return Response(self.get_serializer(content_import).data)

    @action(detail=True, methods=["get"])
    def source(self, request, pk=None):
        if validate_media_token(request.query_params.get("token"), "import", pk):
            try:
                content_import = ContentImport.objects.get(pk=pk)
            except ContentImport.DoesNotExist:
                return Response({"detail": "Import not found."}, status=status.HTTP_404_NOT_FOUND)
        elif request.user.is_authenticated:
            content_import = self.get_object()
        else:
            return Response({"detail": "A valid media link is required."}, status=status.HTTP_403_FORBIDDEN)
        return protected_file_response(content_import.source_file, content_import.mime_type, content_import.original_filename)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        try:
            content_import = publish_content_import(self.get_object(), request.user)
        except ContentImportError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(content_import).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        content_import = self.get_object()
        if content_import.status != ContentImport.Status.NEEDS_REVIEW:
            return Response({"detail": "Only imports awaiting review can be rejected."}, status=status.HTTP_409_CONFLICT)
        content_import.status = ContentImport.Status.REJECTED
        content_import.error_message = str(request.data.get("reason", "Rejected during teacher review."))[:2000]
        content_import.reviewed_by = request.user
        content_import.reviewed_at = timezone.now()
        content_import.save(update_fields=["status", "error_message", "reviewed_by", "reviewed_at", "updated_at"])
        return Response(self.get_serializer(content_import).data)

class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user)

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        notification = self.get_object()
        if notification.read_at is None:
            notification.read_at = timezone.now()
            notification.save(update_fields=["read_at"])
        return Response(self.get_serializer(notification).data)

    @action(detail=False, methods=["post"], url_path="read-all")
    def read_all(self, request):
        self.get_queryset().filter(read_at__isnull=True).update(read_at=timezone.now())
        return Response(status=status.HTTP_204_NO_CONTENT)

class DeviceRegistrationViewSet(viewsets.ModelViewSet):
    serializer_class = DeviceRegistrationSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return DeviceRegistration.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        token = serializer.validated_data["push_token"]
        DeviceRegistration.objects.filter(push_token=token).exclude(user=self.request.user).delete()
        serializer.save(user=self.request.user)

@api_view(["GET", "PATCH"])
@permission_classes([permissions.IsAuthenticated])
def notification_preferences(request):
    preference, _ = NotificationPreference.objects.get_or_create(user=request.user)
    if request.method == "PATCH":
        serializer = NotificationPreferenceSerializer(preference, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
    return Response(NotificationPreferenceSerializer(preference).data)
