from datetime import timedelta
from decimal import Decimal
import re
from urllib.parse import quote
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing
from django.core.mail import send_mail
from django.db import connection
from django.db.models import F, Max, Prefetch, Q
from django.core.files.storage import default_storage
from django.http import FileResponse, HttpResponse, StreamingHttpResponse
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import permissions, status, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response

from .content_imports import ContentImportError, process_content_import, publish_content_import, sync_published_practice_questions
from .learning_intelligence import rank_learning_resources, record_evidence
from .models import AIMessage, AIMessageEvaluation, AcademicClass, ActivityAttempt, Assessment, AssessmentAttempt, AuditEvent, Competency, CompetencyResult, ContentImport, DeviceRegistration, GuardianContact, Intervention, LearnerCompetencyEvidence, LearningAssignment, LearningAssignmentProgress, LearningAssignmentQuizAttempt, LearningRecommendationDecision, LearningResource, Notification, NotificationPreference, PrivacyRequest, RecoveryActivity, RecoveryPlan, RemedialExamConsent, ResearchEvaluationSnapshot, StudentAnswer, Subject, SystemConfiguration, UsabilityEvaluation, UserProfile
from .notifications import assigned_teachers_for, notify
from .permissions import IsAdmin, IsStudent, IsTeacher, IsTeacherOrAdmin, role_for
from .secure_media import validate_media_token
from .serializers import AcademicClassSerializer, ActivityAttemptSerializer, AssessmentAttemptSerializer, AssessmentDetailSerializer, AssessmentSerializer, AuditEventSerializer, CompetencySerializer, ContentImportSerializer, DeviceRegistrationSerializer, InterventionSerializer, LearnerCompetencyEvidenceSerializer, LearningAssignmentSerializer, NotificationPreferenceSerializer, NotificationSerializer, QuestionEditorSerializer, ResourceSerializer, RecoveryActivitySerializer, RecoveryPlanSerializer, SubjectSerializer, SystemConfigurationSerializer, UserAdminSerializer
from .services import calculate_competency_results, create_recovery_plan
from .resource_index import index_learning_resource
from .research_evidence import build_evidence_package, freeze_evidence_package
from .assignment_rules import sync_teacher_classes

def _range_file_iterator(file_handle, start, length, chunk_size=64 * 1024):
    try:
        file_handle.seek(start)
        remaining = length
        while remaining > 0:
            chunk = file_handle.read(min(chunk_size, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk
    finally:
        file_handle.close()


def protected_file_response(request, file_field, mime_type, filename):
    disposition = f"inline; filename*=UTF-8''{quote(filename)}"
    if not settings.DEBUG:
        response = HttpResponse(content_type=mime_type or "application/octet-stream")
        response["X-Accel-Redirect"] = f"/protected-media/{file_field.name}"
    else:
        size = file_field.size
        range_header = request.headers.get("Range", "").strip()
        match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_header) if range_header else None
        if range_header and not match:
            response = HttpResponse(status=416)
            response["Content-Range"] = f"bytes */{size}"
            return response
        if match:
            start_text, end_text = match.groups()
            if not start_text and not end_text:
                response = HttpResponse(status=416)
                response["Content-Range"] = f"bytes */{size}"
                return response
            if start_text:
                start = int(start_text)
                end = min(int(end_text), size - 1) if end_text else size - 1
            else:
                suffix_length = int(end_text)
                start = max(size - suffix_length, 0)
                end = size - 1
            if start >= size or start > end:
                response = HttpResponse(status=416)
                response["Content-Range"] = f"bytes */{size}"
                return response
            length = end - start + 1
            response = StreamingHttpResponse(_range_file_iterator(file_field.open("rb"), start, length), status=206, content_type=mime_type or "application/octet-stream")
            response["Content-Length"] = str(length)
            response["Content-Range"] = f"bytes {start}-{end}/{size}"
        else:
            response = FileResponse(file_field.open("rb"), content_type=mime_type or "application/octet-stream")
    response["Content-Disposition"] = disposition
    response["Cache-Control"] = "private, max-age=300"
    response["Accept-Ranges"] = "bytes"
    return response

@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def health(request):
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        cursor.fetchone()
    return Response({"status": "ok", "database": "ok"})


def _snapshot_data(snapshot):
    return {
        "id": snapshot.id,
        "name": snapshot.name,
        "algorithm_version": snapshot.algorithm_version,
        "dataset_version": snapshot.dataset_version,
        "period_start": snapshot.period_start,
        "period_end": snapshot.period_end,
        "metrics": snapshot.metrics,
        "record_counts": snapshot.record_counts,
        "checksum_sha256": snapshot.checksum_sha256,
        "notes": snapshot.notes,
        "frozen_by": snapshot.frozen_by.get_full_name() or snapshot.frozen_by.username,
        "frozen_at": snapshot.frozen_at,
    }


@api_view(["GET"])
@permission_classes([IsAdmin])
def research_evidence(request):
    period_start = parse_datetime(request.query_params.get("period_start", "")) if request.query_params.get("period_start") else None
    period_end = parse_datetime(request.query_params.get("period_end", "")) if request.query_params.get("period_end") else None
    return Response(build_evidence_package(period_start, period_end))


@api_view(["GET", "POST"])
@permission_classes([IsAdmin])
def research_snapshots(request):
    if request.method == "GET":
        rows = ResearchEvaluationSnapshot.objects.select_related("frozen_by")[:50]
        return Response([_snapshot_data(row) for row in rows])
    name = str(request.data.get("name", "")).strip()
    dataset_version = str(request.data.get("dataset_version", "")).strip()
    if not name or not dataset_version:
        return Response({"detail": "Snapshot name and dataset version are required."}, status=status.HTTP_400_BAD_REQUEST)
    period_start = parse_datetime(str(request.data.get("period_start", ""))) if request.data.get("period_start") else None
    period_end = parse_datetime(str(request.data.get("period_end", ""))) if request.data.get("period_end") else None
    if period_start and period_end and period_start >= period_end:
        return Response({"period_end": "The end of the evaluation period must be after its start."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        snapshot = freeze_evidence_package(name=name, dataset_version=dataset_version, frozen_by=request.user, notes=str(request.data.get("notes", "")).strip(), period_start=period_start, period_end=period_end)
    except Exception as exc:
        if "checksum" in str(exc).casefold() or "unique" in str(exc).casefold():
            return Response({"detail": "An identical evidence snapshot has already been frozen."}, status=status.HTTP_409_CONFLICT)
        raise
    AuditEvent.objects.create(actor=request.user, action="research_snapshot.frozen", object_type="ResearchEvaluationSnapshot", object_id=str(snapshot.id), metadata={"dataset_version": dataset_version, "algorithm_version": snapshot.algorithm_version, "checksum": snapshot.checksum_sha256})
    return Response(_snapshot_data(snapshot), status=status.HTTP_201_CREATED)


@api_view(["GET", "POST"])
@permission_classes([IsAdmin])
def usability_evaluations(request):
    if request.method == "GET":
        rows = UsabilityEvaluation.objects.select_related("recorded_by")[:100]
        return Response([{"id": row.id, "participant_code": row.participant_code, "participant_role": row.participant_role, "task_name": row.task_name, "outcome": row.outcome, "duration_seconds": row.duration_seconds, "error_count": row.error_count, "sus_score": row.sus_score, "notes": row.notes, "recorded_by": row.recorded_by.get_full_name() or row.recorded_by.username, "recorded_at": row.recorded_at} for row in rows])
    participant_role = str(request.data.get("participant_role", ""))
    outcome = str(request.data.get("outcome", ""))
    if participant_role not in UsabilityEvaluation.ParticipantRole.values or outcome not in UsabilityEvaluation.Outcome.values:
        return Response({"detail": "Choose a valid participant role and task outcome."}, status=status.HTTP_400_BAD_REQUEST)
    if not str(request.data.get("participant_code", "")).strip() or not str(request.data.get("task_name", "")).strip():
        return Response({"detail": "Participant code and task name are required."}, status=status.HTTP_400_BAD_REQUEST)
    row = UsabilityEvaluation.objects.create(participant_code=str(request.data["participant_code"]).strip(), participant_role=participant_role, task_name=str(request.data["task_name"]).strip(), outcome=outcome, duration_seconds=request.data.get("duration_seconds") or None, error_count=request.data.get("error_count") or 0, sus_score=request.data.get("sus_score") or None, notes=str(request.data.get("notes", "")).strip(), recorded_by=request.user)
    return Response({"id": row.id}, status=status.HTTP_201_CREATED)


@api_view(["GET", "POST"])
@permission_classes([IsAdmin])
def ai_message_evaluations(request):
    if request.method == "GET":
        if request.query_params.get("queue") == "unreviewed":
            messages = AIMessage.objects.filter(role=AIMessage.Role.ASSISTANT, evaluation__isnull=True).select_related("conversation__student", "conversation__plan__competency", "conversation__learning_assignment__resource").order_by("-created_at")[:100]
            return Response([{"id": row.id, "student": row.conversation.student.get_full_name() or row.conversation.student.username, "competency": row.conversation.plan.competency.title if row.conversation.plan_id else row.conversation.learning_assignment.resource.title, "content": row.content, "source_citations": row.source_citations, "grounding_status": row.grounding_status, "provider": row.provider, "model": row.model, "created_at": row.created_at} for row in messages])
        rows = AIMessageEvaluation.objects.select_related("message__conversation__student", "reviewer")[:100]
        return Response([{"id": row.id, "message": row.message_id, "student": row.message.conversation.student.get_full_name() or row.message.conversation.student.username, "content": row.message.content, "grounding_accurate": row.grounding_accurate, "hallucination_detected": row.hallucination_detected, "incorrect_answer_leakage": row.incorrect_answer_leakage, "notes": row.notes, "reviewer": row.reviewer.get_full_name() or row.reviewer.username, "evaluated_at": row.evaluated_at} for row in rows])
    message = AIMessage.objects.filter(pk=request.data.get("message"), role=AIMessage.Role.ASSISTANT).first()
    if not message:
        return Response({"message": "Select a valid TALA assistant response."}, status=status.HTTP_400_BAD_REQUEST)
    row, _ = AIMessageEvaluation.objects.update_or_create(message=message, defaults={"reviewer": request.user, "grounding_accurate": bool(request.data.get("grounding_accurate")), "hallucination_detected": bool(request.data.get("hallucination_detected")), "incorrect_answer_leakage": bool(request.data.get("incorrect_answer_leakage")), "notes": str(request.data.get("notes", "")).strip()})
    return Response({"id": row.id}, status=status.HTTP_201_CREATED)


@api_view(["GET", "POST", "PATCH"])
@permission_classes([permissions.IsAuthenticated])
def privacy_requests(request):
    is_admin = role_for(request.user) == UserProfile.Role.ADMIN
    if request.method == "GET":
        rows = PrivacyRequest.objects.select_related("subject_user", "requested_by", "handled_by") if is_admin else PrivacyRequest.objects.filter(requested_by=request.user).select_related("subject_user", "requested_by", "handled_by")
        return Response([{"id": row.id, "subject_user": row.subject_user_id, "subject_name": row.subject_user.get_full_name() or row.subject_user.username, "request_type": row.request_type, "status": row.status, "details": row.details, "resolution": row.resolution, "created_at": row.created_at, "resolved_at": row.resolved_at} for row in rows[:100]])
    if request.method == "POST":
        request_type = str(request.data.get("request_type", ""))
        if request_type not in PrivacyRequest.RequestType.values or not str(request.data.get("details", "")).strip():
            return Response({"detail": "Choose a request type and explain what you need."}, status=status.HTTP_400_BAD_REQUEST)
        subject_user = request.user
        if is_admin and request.data.get("subject_user"):
            subject_user = get_user_model().objects.filter(pk=request.data["subject_user"]).first()
            if not subject_user:
                return Response({"subject_user": "User not found."}, status=status.HTTP_400_BAD_REQUEST)
        row = PrivacyRequest.objects.create(subject_user=subject_user, requested_by=request.user, request_type=request_type, details=str(request.data["details"]).strip())
        AuditEvent.objects.create(actor=request.user, action="privacy_request.created", object_type="PrivacyRequest", object_id=str(row.id), metadata={"request_type": row.request_type})
        administrators = get_user_model().objects.filter(
            is_active=True,
            tala_profile__role=UserProfile.Role.ADMIN,
            tala_profile__is_active=True,
        ).distinct()
        for administrator in administrators:
            notify(
                recipient=administrator,
                kind=Notification.Kind.PRIVACY_REQUEST,
                title="Privacy request submitted",
                message="A new privacy request requires administrator review.",
                action_url=f"/settings/privacy/{row.id}",
                deduplication_key=f"privacy-request:{row.id}:submitted:admin:{administrator.id}",
            )
        return Response({"id": row.id, "status": row.status}, status=status.HTTP_201_CREATED)
    if not is_admin:
        raise PermissionDenied("Only administrators can resolve privacy requests.")
    row = PrivacyRequest.objects.filter(pk=request.data.get("id")).first()
    next_status = str(request.data.get("status", ""))
    if not row or next_status not in PrivacyRequest.Status.values:
        return Response({"detail": "Choose a valid privacy request and status."}, status=status.HTTP_400_BAD_REQUEST)
    row.status = next_status
    row.resolution = str(request.data.get("resolution", row.resolution)).strip()
    row.handled_by = request.user
    row.resolved_at = timezone.now() if next_status in {PrivacyRequest.Status.COMPLETED, PrivacyRequest.Status.DENIED} else None
    row.save(update_fields=["status", "resolution", "handled_by", "resolved_at"])
    AuditEvent.objects.create(actor=request.user, action="privacy_request.updated", object_type="PrivacyRequest", object_id=str(row.id), metadata={"status": row.status})
    notification_copy = {
        PrivacyRequest.Status.IN_REVIEW: (
            "Privacy request in review",
            "Your privacy request is being reviewed.",
        ),
        PrivacyRequest.Status.COMPLETED: (
            "Privacy request completed",
            "Your privacy request has been completed. Open Account & Security to review the response.",
        ),
        PrivacyRequest.Status.DENIED: (
            "Privacy request decision recorded",
            "A decision has been recorded for your privacy request. Open Account & Security to review the response.",
        ),
    }
    if next_status in notification_copy:
        title, message = notification_copy[next_status]
        notify(
            recipient=row.requested_by,
            kind=Notification.Kind.PRIVACY_REQUEST,
            title=title,
            message=message,
            action_url="/profile",
            deduplication_key=f"privacy-request:{row.id}:{next_status}:requester",
        )
    return Response({"id": row.id, "status": row.status})


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
        if role_for(self.request.user) == UserProfile.Role.TEACHER:
            queryset = queryset.filter(assigned_teachers=self.request.user.tala_profile)
        if status_filter := self.request.query_params.get("status"):
            queryset = queryset.filter(is_active=status_filter == "active")
        if grade_filter := self.request.query_params.get("grade"):
            if grade_filter not in {"11", "12"}:
                raise ValidationError({"grade": "Choose Grade 11 or Grade 12."})
            queryset = queryset.filter(grade_level=int(grade_filter))
        if search := self.request.query_params.get("search", "").strip():
            queryset = queryset.filter(Q(code__icontains=search) | Q(name__icontains=search))
        ordering = {"name": "name", "code": "code", "competencies": "competency_count", "status": "is_active", "-name": "-name", "-code": "-code", "-competencies": "-competency_count", "-status": "-is_active"}.get(self.request.query_params.get("ordering", "name"), "name")
        if "competency_count" in ordering:
            from django.db.models import Count
            queryset = queryset.annotate(competency_count=Count("competencies"))
        return queryset.order_by(ordering, "id")

    def perform_create(self, serializer):
        super().perform_create(serializer)

    def perform_update(self, serializer):
        subject = serializer.save()
        for profile in subject.assigned_teachers.all():
            sync_teacher_classes(profile)
        AuditEvent.objects.create(actor=self.request.user, action="subject.updated", object_type="Subject", object_id=str(subject.pk))

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
        if grade_filter := self.request.query_params.get("grade"):
            if grade_filter not in {"11", "12"}:
                raise ValidationError({"grade": "Choose Grade 11 or Grade 12."})
            queryset = queryset.filter(grade_level=int(grade_filter))
        if search := self.request.query_params.get("search", "").strip():
            queryset = queryset.filter(Q(name__icontains=search) | Q(school_year__icontains=search))
        ordering = {"class": "name", "grade": "grade_level", "year": "school_year", "status": "is_active", "-class": "-name", "-grade": "-grade_level", "-year": "-school_year", "-status": "-is_active"}.get(self.request.query_params.get("ordering", "grade"), "grade_level")
        return queryset.order_by(ordering, "name", "id")

    def perform_create(self, serializer):
        instance = serializer.save()
        for profile in UserProfile.objects.filter(role=UserProfile.Role.TEACHER, assigned_subjects__grade_level=instance.grade_level).distinct():
            sync_teacher_classes(profile)
        AuditEvent.objects.create(actor=self.request.user, action="academicclass.created", object_type="AcademicClass", object_id=str(instance.pk))

    def perform_update(self, serializer):
        instance = serializer.save()
        for profile in UserProfile.objects.filter(role=UserProfile.Role.TEACHER).distinct():
            sync_teacher_classes(profile)
        AuditEvent.objects.create(actor=self.request.user, action="academicclass.updated", object_type="AcademicClass", object_id=str(instance.pk))

class UserAdminViewSet(viewsets.ModelViewSet):
    serializer_class = UserAdminSerializer
    permission_classes = [IsAdmin]
    http_method_names = ["get", "post", "patch", "head", "options"]
    def get_queryset(self):
        queryset = get_user_model().objects.filter(tala_profile__isnull=False).exclude(pk=self.request.user.pk).select_related("tala_profile__academic_class")
        if not self.request.user.is_superuser:
            queryset = queryset.exclude(tala_profile__role=UserProfile.Role.ADMIN)
        if role_filter := self.request.query_params.get("role"):
            queryset = queryset.filter(tala_profile__role=role_filter)
        if grade_filter := self.request.query_params.get("grade"):
            queryset = queryset.filter(tala_profile__academic_class__grade_level=grade_filter)
        if section_filter := self.request.query_params.get("section"):
            queryset = queryset.filter(tala_profile__academic_class_id=section_filter)
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

    def get_object(self):
        user = super().get_object()
        if user.tala_profile.role == UserProfile.Role.ADMIN and not self.request.user.is_superuser:
            raise PermissionDenied("Only a superadministrator can manage administrator access.")
        return user

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
            queryset = queryset.filter(competencies__subject__in=self.request.user.tala_profile.assigned_subjects.all())
            if subject_id := self.request.query_params.get("subject"):
                if not self.request.user.tala_profile.assigned_subjects.filter(pk=subject_id).exists():
                    raise PermissionDenied("You are not assigned to this subject.")
                queryset = queryset.filter(competencies__subject_id=subject_id)
            return queryset.distinct().order_by("title", "id")
        return queryset.order_by("title", "id")
    def get_permissions(self):
        if self.action == "file":
            return [permissions.AllowAny()]
        if self.action in {"list", "retrieve"}:
            return [permissions.IsAuthenticated()]
        return [IsTeacherOrAdmin()]

    def perform_create(self, serializer):
        resource = serializer.save(uploaded_by=self.request.user)
        if resource.is_approved:
            index_learning_resource(resource)

    def perform_update(self, serializer):
        resource = serializer.save()
        if resource.is_approved:
            index_learning_resource(resource)
        else:
            resource.chunks.all().delete()

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
        return protected_file_response(request, resource.file, resource.mime_type, resource.original_filename or resource.file.name.rsplit("/", 1)[-1])

class LearningAssignmentViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = LearningAssignmentSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = LearningAssignment.objects.filter(is_active=True, resource__is_approved=True).select_related("resource__uploaded_by").prefetch_related("resource__competencies", "resource__practice_questions", "resource__source_imports__uploaded_by", "assigned_classes", "progress_records", "quiz_attempts")
        role = role_for(self.request.user)
        if role == UserProfile.Role.STUDENT:
            profile = self.request.user.tala_profile
            queryset = queryset.filter(assigned_classes=profile.academic_class) if profile.academic_class_id else queryset.none()
            if subject_id := self.request.query_params.get("subject"):
                queryset = queryset.filter(resource__competencies__subject_id=subject_id)
            return queryset.distinct().order_by("-created_at", "-id")
        if role == UserProfile.Role.TEACHER:
            return queryset.filter(assigned_by=self.request.user)
        return queryset.order_by("-created_at", "-id")

    def _update_progress(self, request, assignment, *, complete=False):
        if role_for(request.user) != UserProfile.Role.STUDENT:
            return Response({"detail": "Only students can record learning progress."}, status=status.HTTP_403_FORBIDDEN)
        if complete and assignment.resource.practice_questions.exists() and not assignment.quiz_attempts.filter(student=request.user, passed=True).exists():
            return Response({"detail": "Complete the module quiz before marking this material complete.", "code": "module_quiz_required"}, status=status.HTTP_409_CONFLICT)
        progress, _ = LearningAssignmentProgress.objects.get_or_create(assignment=assignment, student=request.user)
        now = timezone.now()
        update_fields = []
        if progress.opened_at is None:
            progress.opened_at = now
            update_fields.append("opened_at")
        if complete and progress.completed_at is None:
            progress.completed_at = now
            update_fields.append("completed_at")
        if update_fields:
            progress.save(update_fields=update_fields)
        assignment = self.get_queryset().get(pk=assignment.pk)
        return Response(self.get_serializer(assignment).data)

    @action(detail=True, methods=["post"])
    def open(self, request, pk=None):
        return self._update_progress(request, self.get_object())

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        return self._update_progress(request, self.get_object(), complete=True)

    @action(detail=True, methods=["post"])
    def progress(self, request, pk=None):
        assignment = self.get_object()
        if role_for(request.user) != UserProfile.Role.STUDENT:
            return Response({"detail": "Only students can record learning progress."}, status=status.HTTP_403_FORBIDDEN)
        if assignment.resource.resource_type != LearningResource.ResourceType.VIDEO:
            return Response({"detail": "Playback progress applies only to video material."}, status=status.HTTP_409_CONFLICT)
        try:
            position = max(0, int(float(request.data.get("position_seconds", 0))))
            duration = max(0, int(float(request.data.get("duration_seconds", 0))))
        except (TypeError, ValueError):
            return Response({"detail": "Playback position and duration must be numeric."}, status=status.HTTP_400_BAD_REQUEST)
        if duration:
            position = min(position, duration)
        progress, _ = LearningAssignmentProgress.objects.get_or_create(assignment=assignment, student=request.user)
        now = timezone.now()
        progress.opened_at = progress.opened_at or now
        progress.playback_position_seconds = position
        progress.duration_seconds = duration or progress.duration_seconds
        progress.last_viewed_at = now
        progress.save(update_fields=["opened_at", "playback_position_seconds", "duration_seconds", "last_viewed_at"])
        assignment = self.get_queryset().get(pk=assignment.pk)
        return Response(self.get_serializer(assignment).data)

    @action(detail=True, methods=["post"], url_path="submit-quiz")
    def submit_quiz(self, request, pk=None):
        assignment = self.get_object()
        if role_for(request.user) != UserProfile.Role.STUDENT:
            return Response({"detail": "Only students can submit module quizzes."}, status=status.HTTP_403_FORBIDDEN)
        questions = list(assignment.resource.practice_questions.all())
        if not questions:
            return Response({"detail": "This module has no extracted quiz."}, status=status.HTTP_409_CONFLICT)
        supplied = request.data.get("answers")
        if not isinstance(supplied, list):
            return Response({"answers": "Expected a list of question answers."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            answer_map = {int(item.get("question_id")): str(item.get("answer", "")) for item in supplied if item.get("question_id")}
        except (TypeError, ValueError):
            return Response({"answers": "Question identifiers must be valid integers."}, status=status.HTTP_400_BAD_REQUEST)
        if set(answer_map) != {question.id for question in questions}:
            return Response({"answers": "Answer every module quiz question exactly once."}, status=status.HTTP_400_BAD_REQUEST)
        correct = sum(answer_map[question.id].strip().casefold() == question.correct_answer.strip().casefold() for question in questions)
        score = Decimal(correct * 100) / Decimal(len(questions))
        passed = score >= assignment.resource.passing_score
        LearningAssignmentQuizAttempt.objects.create(assignment=assignment, student=request.user, answers=answer_map, score=score, passed=passed)
        if passed:
            progress, _ = LearningAssignmentProgress.objects.get_or_create(assignment=assignment, student=request.user)
            progress.opened_at = progress.opened_at or timezone.now()
            progress.completed_at = progress.completed_at or timezone.now()
            progress.save(update_fields=["opened_at", "completed_at"])
        assignment = self.get_queryset().get(pk=assignment.pk)
        return Response({"score": round(float(score), 2), "passed": passed, "required_score": assignment.resource.passing_score, "assignment": self.get_serializer(assignment).data}, status=status.HTTP_201_CREATED)

class AssessmentViewSet(viewsets.ModelViewSet):
    queryset = Assessment.objects.select_related("subject", "created_by").prefetch_related("questions", "assigned_classes", "remedial_consents").order_by("title", "id")

    def get_queryset(self):
        queryset = super().get_queryset()
        if role_for(self.request.user) == "student":
            profile = getattr(self.request.user, "tala_profile", None)
            queryset = queryset.filter(is_active=True, assigned_classes=profile.academic_class) if profile and profile.academic_class else queryset.none()
            if subject_id := self.request.query_params.get("subject"):
                queryset = queryset.filter(subject_id=subject_id)
            return queryset
        if role_for(self.request.user) == "teacher":
            queryset = queryset.filter(subject__in=self.request.user.tala_profile.assigned_subjects.all())
        subject_id = self.request.query_params.get("subject")
        if subject_id:
            queryset = queryset.filter(subject_id=subject_id)
        return queryset

    def get_serializer_class(self):
        return AssessmentDetailSerializer if self.action in {"retrieve", "start"} else AssessmentSerializer

    def get_permissions(self):
        if self.action in {"list", "retrieve", "start", "submit", "my_attempts"}:
            return [permissions.IsAuthenticated()]
        return [IsTeacherOrAdmin()]

    def perform_create(self, serializer):
        subject = serializer.validated_data["subject"]
        if role_for(self.request.user) == UserProfile.Role.TEACHER and not self.request.user.tala_profile.assigned_subjects.filter(pk=subject.id).exists():
            raise PermissionDenied("You are not assigned to this assessment subject.")
        serializer.save(created_by=self.request.user, is_active=False)

    def perform_update(self, serializer):
        was_active = serializer.instance.is_active
        subject = serializer.validated_data.get("subject", serializer.instance.subject)
        if role_for(self.request.user) == UserProfile.Role.TEACHER and not self.request.user.tala_profile.assigned_subjects.filter(pk=subject.id).exists():
            raise PermissionDenied("You are not assigned to this assessment subject.")
        assessment = serializer.save()
        if assessment.is_active and not was_active:
            students = get_user_model().objects.filter(tala_profile__role=UserProfile.Role.STUDENT, tala_profile__academic_class__in=assessment.assigned_classes.all()).distinct()
            for student in students:
                notify(recipient=student, kind=Notification.Kind.CONTENT_PUBLISHED, title="Assessment assigned", message=f"{assessment.title} is now available.", action_url="/assessments", deduplication_key=f"assessment:{assessment.id}:assigned:student:{student.id}")

    @action(detail=True, methods=["post"], url_path="questions")
    def add_question(self, request, pk=None):
        assessment = self.get_object()
        if assessment.is_active:
            return Response({"detail": "Return the assessment to draft before adding questions."}, status=status.HTTP_409_CONFLICT)
        serializer = QuestionEditorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        competency = serializer.validated_data["competency"]
        if competency.subject_id != assessment.subject_id:
            return Response({"competency": "Choose a competency from the assessment subject."}, status=status.HTTP_400_BAD_REQUEST)
        if role_for(request.user) == UserProfile.Role.TEACHER and not request.user.tala_profile.assigned_subjects.filter(pk=assessment.subject_id).exists():
            raise PermissionDenied("You are not assigned to this assessment subject.")
        question = serializer.save(assessment=assessment)
        AuditEvent.objects.create(actor=request.user, action="assessment.question_added", object_type="Question", object_id=str(question.id), metadata={"assessment_id": assessment.id})
        return Response(QuestionEditorSerializer(question).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["patch"], url_path=r"questions/(?P<question_id>[^/.]+)")
    def edit_question(self, request, pk=None, question_id=None):
        assessment = self.get_object()
        if assessment.is_active:
            return Response({"detail": "Return the assessment to draft before editing questions."}, status=status.HTTP_409_CONFLICT)
        question = assessment.questions.filter(pk=question_id).first()
        if not question:
            return Response({"detail": "Assessment question not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = QuestionEditorSerializer(question, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        competency = serializer.validated_data.get("competency", question.competency)
        if competency.subject_id != assessment.subject_id:
            return Response({"competency": "Choose a competency from the assessment subject."}, status=status.HTTP_400_BAD_REQUEST)
        question = serializer.save()
        AuditEvent.objects.create(actor=request.user, action="assessment.question_updated", object_type="Question", object_id=str(question.id), metadata={"assessment_id": assessment.id})
        return Response(QuestionEditorSerializer(question).data)

    def _post_assessment_ready(self, assessment, user, target_competency_id=None):
        if assessment.kind not in {Assessment.Kind.POST, Assessment.Kind.REMEDIAL}:
            return True
        competency_ids = [target_competency_id] if target_competency_id else assessment.questions.values_list("competency_id", flat=True)
        return not RecoveryActivity.objects.filter(plan__student=user, plan__status="active", plan__competency_id__in=competency_ids, resource__isnull=False, completed_at__isnull=True).exists()

    def _remedial_consent_ready(self, assessment, user):
        return assessment.kind != Assessment.Kind.REMEDIAL or assessment.remedial_consents.filter(student=user, status=RemedialExamConsent.Status.APPROVED).exists()

    @action(detail=True, methods=["post"], url_path="request-consent")
    def request_consent(self, request, pk=None):
        assessment = self.get_object()
        if assessment.kind != Assessment.Kind.REMEDIAL:
            return Response({"detail": "Consent requests apply only to remedial exams."}, status=status.HTTP_409_CONFLICT)
        student = get_user_model().objects.filter(pk=request.data.get("student"), tala_profile__role=UserProfile.Role.STUDENT, tala_profile__academic_class__in=assessment.assigned_classes.all()).first()
        if not student:
            return Response({"student": "Select a learner assigned to this remedial exam."}, status=status.HTTP_400_BAD_REQUEST)
        if role_for(request.user) == UserProfile.Role.TEACHER and not request.user.tala_profile.assigned_classes.filter(pk=student.tala_profile.academic_class_id).exists():
            raise PermissionDenied("You are not assigned to this learner's class.")
        if not self._post_assessment_ready(assessment, student):
            return Response({"detail": "The learner must complete the required recovery activities before consent is requested."}, status=status.HTTP_409_CONFLICT)
        guardian = GuardianContact.objects.filter(pk=request.data.get("guardian_id"), profile=student.tala_profile).first() if request.data.get("guardian_id") else student.tala_profile.guardian_contacts.first()
        guardian_name = guardian.name if guardian else str(request.data.get("guardian_name", "")).strip()
        guardian_relationship = guardian.relationship if guardian else str(request.data.get("guardian_relationship", "")).strip()
        guardian_email = guardian.email if guardian else str(request.data.get("guardian_email", "")).strip().casefold()
        if not guardian_name or not guardian_relationship or not guardian_email:
            return Response({"guardian": "A parent/legal guardian name, relationship, and email address are required."}, status=status.HTTP_400_BAD_REQUEST)
        learner_name = student.get_full_name() or student.username
        configuration = SystemConfiguration.load()
        consent_text = f"I consent to {learner_name} taking the remedial exam titled '{assessment.title}' after completing the assigned recovery activities. I understand that I may decline or withdraw consent before the exam begins."
        requested_at = timezone.now()
        consent, _ = RemedialExamConsent.objects.update_or_create(assessment=assessment, student=student, defaults={"guardian": guardian, "guardian_name": guardian_name, "guardian_relationship": guardian_relationship, "guardian_email": guardian_email, "status": RemedialExamConsent.Status.REQUESTED, "method": RemedialExamConsent.Method.DIGITAL, "policy_reference": f"DepEd DO 010, s. 2026 · School policy {configuration.consent_policy_version}", "consent_text": consent_text, "requested_by": request.user, "requested_at": requested_at, "expires_at": requested_at + timedelta(days=configuration.consent_expiry_days), "responded_at": None, "identity_verified_at": None, "verified_by": None, "revoked_at": None, "withdrawal_reason": ""})
        token = signing.dumps({"consent_id": consent.id}, salt="tala-remedial-consent", compress=True)
        consent_url = f"{getattr(settings, 'FRONTEND_URL', 'http://localhost:5173').rstrip('/')}/consent?token={token}"
        send_mail(f"Consent requested: {assessment.title}", f"A remedial exam consent request was created for {learner_name}.\n\nReview and respond using this secure link:\n{consent_url}\n\nThis link expires in {configuration.consent_expiry_days} days. If you did not expect this message, contact the school.", settings.DEFAULT_FROM_EMAIL, [guardian_email], fail_silently=False)
        notify(recipient=student, kind=Notification.Kind.INTERVENTION, title="Parent consent requested", message=f"A consent request for {assessment.title} was sent to {guardian_name}.", action_url="/assessments", deduplication_key=f"remedial-consent:{consent.id}:requested")
        AuditEvent.objects.create(actor=request.user, action="remedial_consent.requested", object_type="RemedialExamConsent", object_id=str(consent.id), metadata={"assessment_id": assessment.id, "student_id": student.id, "guardian_email": guardian_email})
        return Response({"id": consent.id, "status": consent.status, "guardian_name": guardian_name, "guardian_email": guardian_email, "requested_at": consent.requested_at}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"])
    def start(self, request, pk=None):
        assessment = self.get_object()
        if role_for(request.user) != "student":
            return Response({"detail": "Only students can start an assessment."}, status=status.HTTP_403_FORBIDDEN)
        target_competency_id = request.query_params.get("competency")
        if not self._post_assessment_ready(assessment, request.user, target_competency_id):
            return Response({"detail": "Complete the required recovery activities before starting this mastery assessment."}, status=status.HTTP_409_CONFLICT)
        if not self._remedial_consent_ready(assessment, request.user):
            return Response({"detail": "Verified parent or legal-guardian consent is required before starting this remedial exam."}, status=status.HTTP_409_CONFLICT)
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
        if not self._remedial_consent_ready(assessment, request.user):
            return Response({"detail": "Verified parent or legal-guardian consent is required before submitting this remedial exam."}, status=status.HTTP_409_CONFLICT)
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
            evidence_type = LearnerCompetencyEvidence.EvidenceType.DIAGNOSTIC if assessment.kind == Assessment.Kind.PRE else LearnerCompetencyEvidence.EvidenceType.MASTERY
            for competency_result in results:
                record_evidence(student=request.user, competency=competency_result.competency, evidence_type=evidence_type, source_type="assessment_attempt", source_id=attempt.id, score=competency_result.score, summary=f"{assessment.get_kind_display()} result: {competency_result.get_status_display()}.", details={"assessment_id": assessment.id, "status": competency_result.status}, occurred_at=attempt.submitted_at)
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
        if subject_id := request.query_params.get("subject"):
            attempts = attempts.filter(assessment__subject_id=subject_id)
        return Response(AssessmentAttemptSerializer(attempts, many=True).data)

@api_view(["GET", "POST"])
@permission_classes([permissions.AllowAny])
def remedial_consent_response(request):
    try:
        payload = signing.loads(request.query_params.get("token", ""), salt="tala-remedial-consent", max_age=60 * 60 * 24 * 30)
        consent = RemedialExamConsent.objects.select_related("assessment", "student").get(pk=payload["consent_id"])
    except (signing.BadSignature, signing.SignatureExpired, KeyError, RemedialExamConsent.DoesNotExist):
        return Response({"detail": "This consent link is invalid or has expired. Ask the teacher to send a new request."}, status=status.HTTP_400_BAD_REQUEST)
    if consent.status == RemedialExamConsent.Status.REQUESTED and consent.expires_at and consent.expires_at <= timezone.now():
        consent.status = RemedialExamConsent.Status.EXPIRED
        consent.save(update_fields=["status"])
    data = {"id": consent.id, "learner_name": consent.student.get_full_name() or consent.student.username, "assessment_title": consent.assessment.title, "guardian_name": consent.guardian_name, "guardian_relationship": consent.guardian_relationship, "consent_text": consent.consent_text, "policy_reference": consent.policy_reference, "status": consent.status, "requested_at": consent.requested_at, "expires_at": consent.expires_at, "responded_at": consent.responded_at, "identity_verification_method": consent.identity_verification_method, "evidence_present": bool(consent.evidence_file)}
    if request.method == "GET":
        return Response(data)
    decision = str(request.data.get("decision", "")).casefold()
    signed_name = str(request.data.get("signed_name", "")).strip()
    allowed = {RemedialExamConsent.Status.APPROVED, RemedialExamConsent.Status.DECLINED} if consent.status == RemedialExamConsent.Status.REQUESTED else {RemedialExamConsent.Status.REVOKED} if consent.status == RemedialExamConsent.Status.APPROVED else set()
    if decision not in allowed:
        return Response({"detail": "This response is not allowed for the current consent status.", **data}, status=status.HTTP_409_CONFLICT)
    if decision == RemedialExamConsent.Status.REVOKED and AssessmentAttempt.objects.filter(assessment=consent.assessment, student=consent.student).exists():
        return Response({"detail": "Consent cannot be revoked because the learner has already started this remedial exam.", **data}, status=status.HTTP_409_CONFLICT)
    if not signed_name:
        return Response({"signed_name": "Enter your full name as your electronic signature."}, status=status.HTTP_400_BAD_REQUEST)
    evidence_file = request.FILES.get("evidence_file")
    if evidence_file:
        allowed_types = {"application/pdf", "image/jpeg", "image/png"}
        suffix = str(evidence_file.name).casefold().rsplit(".", 1)[-1] if "." in str(evidence_file.name) else ""
        if getattr(evidence_file, "content_type", "") not in allowed_types or suffix not in {"pdf", "jpg", "jpeg", "png"}:
            return Response({"evidence_file": "Upload a PDF, JPG, or PNG signed consent document."}, status=status.HTTP_400_BAD_REQUEST)
        if evidence_file.size > 10 * 1024 * 1024:
            return Response({"evidence_file": "The signed consent document must not exceed 10 MB."}, status=status.HTTP_400_BAD_REQUEST)
    withdrawal_reason = str(request.data.get("withdrawal_reason", "")).strip()
    if decision == RemedialExamConsent.Status.REVOKED and not withdrawal_reason:
        return Response({"withdrawal_reason": "Explain why consent is being withdrawn for the school record."}, status=status.HTTP_400_BAD_REQUEST)
    consent.status = decision
    consent.responded_at = timezone.now()
    consent.identity_verified_at = consent.responded_at
    consent.revoked_at = consent.responded_at if decision == RemedialExamConsent.Status.REVOKED else None
    consent.withdrawal_reason = withdrawal_reason if decision == RemedialExamConsent.Status.REVOKED else ""
    consent.response_ip = request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip() or request.META.get("REMOTE_ADDR")
    consent.response_user_agent = request.META.get("HTTP_USER_AGENT", "")[:300]
    consent.notes = f"Electronically signed by {signed_name}."
    update_fields = ["status", "responded_at", "identity_verified_at", "revoked_at", "withdrawal_reason", "response_ip", "response_user_agent", "notes"]
    if evidence_file:
        consent.evidence_file = evidence_file
        update_fields.append("evidence_file")
    consent.save(update_fields=update_fields)
    notify(recipient=consent.student, kind=Notification.Kind.INTERVENTION, title="Remedial exam consent updated", message=f"Your parent or legal guardian {consent.get_status_display().lower()} {consent.assessment.title}.", action_url="/assessments", deduplication_key=f"remedial-consent:{consent.id}:response:{decision}")
    for teacher in assigned_teachers_for(consent.student):
        notify(recipient=teacher, kind=Notification.Kind.INTERVENTION, title="Parent consent response", message=f"{consent.guardian_name} {consent.get_status_display().lower()} {consent.assessment.title} for {consent.student.get_full_name() or consent.student.username}.", action_url=f"/learners/{consent.student_id}", deduplication_key=f"remedial-consent:{consent.id}:teacher:{teacher.id}:{decision}")
    AuditEvent.objects.create(actor=None, action=f"remedial_consent.{decision}", object_type="RemedialExamConsent", object_id=str(consent.id), metadata={"signed_name": signed_name, "response_ip": consent.response_ip})
    return Response({**data, "status": consent.status, "responded_at": consent.responded_at, "evidence_present": bool(consent.evidence_file)})

class RecoveryPlanViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = RecoveryPlanSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = RecoveryPlan.objects.select_related("student", "competency").prefetch_related("activities__resource__practice_questions", "activities__attempts").order_by("-created_at")
        if role_for(self.request.user) == "student":
            queryset = queryset.filter(student=self.request.user)
            if subject_id := self.request.query_params.get("subject"):
                queryset = queryset.filter(competency__subject_id=subject_id)
            return queryset
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
        record_evidence(student=request.user, competency=plan.competency, evidence_type=LearnerCompetencyEvidence.EvidenceType.PRACTICE, source_type="activity_attempt", source_id=attempt.id, score=score, summary=f"Practice for {activity.title}: {'passed' if passed else 'needs another attempt'}.", details={"activity_id": activity.id, "passed": passed, "required_score": activity.resource.passing_score}, occurred_at=completed_at)
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
        notify(recipient=student, kind=Notification.Kind.INTERVENTION, title="Teacher follow-up planned", message="Your teacher recorded a follow-up action for your recovery plan.", action_url="/recovery", deduplication_key=f"intervention:{intervention.id}")

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
    results = CompetencyResult.objects.filter(attempt__student=request.user, status=CompetencyResult.Status.MASTERED)
    academic_class = request.user.tala_profile.academic_class
    competencies = Competency.objects.filter(subject__assessment__assigned_classes=academic_class) if academic_class else Competency.objects.none()
    if subject_id := request.query_params.get("subject"):
        plans = plans.filter(competency__subject_id=subject_id)
        attempts = attempts.filter(assessment__subject_id=subject_id)
        results = results.filter(competency__subject_id=subject_id)
        competencies = competencies.filter(subject_id=subject_id)
    mastered = results.values("competency_id").distinct().count()
    total = competencies.distinct().count()
    return Response({"mastered": mastered, "total_competencies": total, "plans": RecoveryPlanSerializer(plans, many=True).data, "attempts": AssessmentAttemptSerializer(attempts, many=True).data})


@api_view(["GET"])
@permission_classes([IsStudent])
def student_context(request):
    academic_class = request.user.tala_profile.academic_class
    subject_ids = set(RecoveryPlan.objects.filter(student=request.user).values_list("competency__subject_id", flat=True))
    subject_ids.update(AssessmentAttempt.objects.filter(student=request.user, submitted_at__isnull=False).values_list("assessment__subject_id", flat=True))
    if academic_class:
        subject_ids.update(Assessment.objects.filter(is_active=True, assigned_classes=academic_class).values_list("subject_id", flat=True))
        subject_ids.update(LearningAssignment.objects.filter(is_active=True, resource__is_approved=True, assigned_classes=academic_class).values_list("resource__competencies__subject_id", flat=True))
    subjects = Subject.objects.filter(id__in=subject_ids, is_active=True).order_by("grade_level", "name")
    return Response({"subjects": SubjectSerializer(subjects, many=True).data})

@api_view(["GET"])
@permission_classes([IsTeacherOrAdmin])
def teacher_learners(request):
    User = get_user_model()
    students = User.objects.filter(tala_profile__role=UserProfile.Role.STUDENT).select_related("tala_profile__academic_class")
    subject_ids = None
    if role_for(request.user) == "teacher":
        students = students.filter(tala_profile__academic_class__in=request.user.tala_profile.assigned_classes.all())
        allowed_subject_ids = set(request.user.tala_profile.assigned_subjects.values_list("id", flat=True))
        requested_subject_id = request.query_params.get("subject")
        if requested_subject_id:
            try:
                requested_subject_id = int(requested_subject_id)
            except (TypeError, ValueError):
                return Response({"subject": "Choose a valid subject."}, status=status.HTTP_400_BAD_REQUEST)
            if requested_subject_id not in allowed_subject_ids:
                return Response({"subject": "You are not assigned to this subject."}, status=status.HTTP_403_FORBIDDEN)
            subject_ids = [requested_subject_id]
            subject_grade = Subject.objects.filter(pk=requested_subject_id).values_list("grade_level", flat=True).first()
            if subject_grade:
                students = students.filter(tala_profile__academic_class__grade_level=subject_grade)
        else:
            subject_ids = allowed_subject_ids
    rows = []
    for student in students:
        plans = RecoveryPlan.objects.filter(student=student)
        activities = RecoveryActivity.objects.filter(plan__student=student)
        attempts = AssessmentAttempt.objects.filter(student=student, submitted_at__isnull=False)
        if subject_ids is not None:
            plans = plans.filter(competency__subject_id__in=subject_ids)
            activities = activities.filter(plan__competency__subject_id__in=subject_ids)
            attempts = attempts.filter(assessment__subject_id__in=subject_ids)
        total_activities = activities.count()
        completed_activities = activities.filter(completed_at__isnull=False).count()
        last_attempt = attempts.order_by("-submitted_at").first()
        gaps = plans.filter(status="active").count()
        rows.append({"id": student.id, "name": student.get_full_name() or student.username, "email": student.email, "section": str(student.tala_profile.academic_class) if student.tala_profile.academic_class else "Unassigned", "progress": round(completed_activities / total_activities * 100) if total_activities else 0, "gaps": gaps, "assessment": float(last_attempt.score) if last_attempt and last_attempt.score is not None else None, "status": "Intervention" if gaps >= 3 else "Monitor" if gaps else "On track"})
    return Response(rows)

@api_view(["GET"])
@permission_classes([IsTeacher])
def teacher_context(request):
    profile = request.user.tala_profile
    classes = profile.assigned_classes.filter(is_active=True).order_by("grade_level", "name")
    subjects = profile.assigned_subjects.filter(is_active=True).order_by("name")
    return Response({"classes": AcademicClassSerializer(classes, many=True).data, "subjects": SubjectSerializer(subjects, many=True).data})


@api_view(["GET"])
@permission_classes([IsTeacher])
def teacher_material_analytics(request):
    assignments = LearningAssignment.objects.filter(
        Q(assigned_by=request.user) | Q(resource__source_imports__uploaded_by=request.user),
        is_active=True,
    ).select_related("resource").prefetch_related("assigned_classes", "progress_records__student__tala_profile__academic_class", "quiz_attempts__student", "resource__practice_questions").distinct()
    requested_subject_id = request.query_params.get("subject")
    if requested_subject_id:
        if not request.user.tala_profile.assigned_subjects.filter(pk=requested_subject_id).exists():
            return Response({"subject": "You are not assigned to this subject."}, status=status.HTTP_403_FORBIDDEN)
        assignments = assignments.filter(resource__competencies__subject_id=requested_subject_id).distinct()
    materials = []
    learner_rows = []
    for assignment in assignments:
        class_ids = list(assignment.assigned_classes.values_list("id", flat=True))
        students = list(get_user_model().objects.filter(tala_profile__role=UserProfile.Role.STUDENT, tala_profile__academic_class_id__in=class_ids, tala_profile__is_active=True, is_active=True).select_related("tala_profile__academic_class").distinct())
        progress_by_student = {item.student_id: item for item in assignment.progress_records.all()}
        attempts_by_student = {}
        for attempt in assignment.quiz_attempts.all():
            attempts_by_student.setdefault(attempt.student_id, []).append(attempt)
        counts = {"not_started": 0, "in_progress": 0, "completed": 0, "quiz_passed": 0}
        scored_attempts = []
        for student in students:
            progress = progress_by_student.get(student.id)
            attempts = attempts_by_student.get(student.id, [])
            latest = attempts[0] if attempts else None
            if progress and progress.completed_at:
                state = "completed"
            elif progress and progress.opened_at:
                state = "in_progress"
            else:
                state = "not_started"
            counts[state] += 1
            if latest:
                scored_attempts.append(float(latest.score))
                if latest.passed:
                    counts["quiz_passed"] += 1
            learner_rows.append({
                "assignment_id": assignment.id,
                "material": assignment.resource.title,
                "resource_type": assignment.resource.resource_type,
                "student_id": student.id,
                "student": student.get_full_name() or student.username,
                "section": str(student.tala_profile.academic_class),
                "status": state,
                "progress_percent": 100 if state == "completed" else round(progress.playback_position_seconds / progress.duration_seconds * 100) if progress and progress.duration_seconds else 0,
                "latest_quiz_score": float(latest.score) if latest else None,
                "quiz_passed": bool(latest and latest.passed),
                "attempt_count": len(attempts),
                "last_activity_at": (latest.submitted_at if latest else progress.last_viewed_at or progress.opened_at if progress else None),
            })
        materials.append({
            "id": assignment.id,
            "title": assignment.resource.title,
            "resource_type": assignment.resource.resource_type,
            "quiz_question_count": assignment.resource.practice_questions.count(),
            "assigned": len(students),
            **counts,
            "quiz_attempted": len(scored_attempts),
            "average_quiz_score": round(sum(scored_attempts) / len(scored_attempts), 1) if scored_attempts else None,
        })
    return Response({
        "summary": {
            "materials": len(materials),
            "assigned_learners": len(learner_rows),
            "in_progress": sum(item["in_progress"] for item in materials),
            "completed": sum(item["completed"] for item in materials),
            "quiz_passed": sum(item["quiz_passed"] for item in materials),
        },
        "materials": materials,
        "learners": learner_rows,
    })

def _recommendation_rows(student, plans):
    rows = []
    for plan in plans:
        existing_resource_ids = plan.activities.exclude(resource__isnull=True).values_list("resource_id", flat=True)
        for item in rank_learning_resources(student, plan.competency, exclude_resource_ids=existing_resource_ids, limit=3):
            resource = item["resource"]
            rows.append({
                "plan": plan.id,
                "competency": plan.competency_id,
                "competency_title": plan.competency.title,
                "resource": resource.id,
                "resource_title": resource.title,
                "resource_type": resource.resource_type,
                "difficulty": resource.difficulty,
                "score": item["score"],
                "confidence": item["confidence"],
                "reason": item["reason"],
                "signals": item["signals"],
            })
    return rows


@api_view(["GET", "POST"])
@permission_classes([IsTeacherOrAdmin])
def teacher_learner_recommendations(request, student_id):
    student = get_user_model().objects.filter(pk=student_id, tala_profile__role=UserProfile.Role.STUDENT).select_related("tala_profile__academic_class").first()
    if not student:
        return Response({"detail": "Learner not found."}, status=status.HTTP_404_NOT_FOUND)
    is_teacher = role_for(request.user) == UserProfile.Role.TEACHER
    if is_teacher and not request.user.tala_profile.assigned_classes.filter(pk=student.tala_profile.academic_class_id).exists():
        return Response({"detail": "You are not assigned to this learner's class."}, status=status.HTTP_403_FORBIDDEN)
    plans = RecoveryPlan.objects.filter(student=student, status="active").select_related("competency__subject").prefetch_related("activities")
    if is_teacher:
        plans = plans.filter(competency__subject__in=request.user.tala_profile.assigned_subjects.all())
    if request.method == "GET":
        return Response(_recommendation_rows(student, plans))

    plan = plans.filter(pk=request.data.get("plan")).first()
    if not plan:
        return Response({"plan": "Choose an active recovery plan within your teaching scope."}, status=status.HTTP_400_BAD_REQUEST)
    resource = LearningResource.objects.filter(pk=request.data.get("resource"), is_approved=True, competencies=plan.competency).first()
    if not resource:
        return Response({"resource": "Choose an approved resource aligned with this competency."}, status=status.HTTP_400_BAD_REQUEST)
    existing_resource_ids = plan.activities.exclude(resource__isnull=True).values_list("resource_id", flat=True)
    ranked = rank_learning_resources(student, plan.competency, exclude_resource_ids=existing_resource_ids, limit=20)
    recommendation = next((item for item in ranked if item["resource"].id == resource.id), None)
    if not recommendation:
        return Response({"resource": "This material is no longer an available recommendation."}, status=status.HTTP_409_CONFLICT)
    decision = request.data.get("decision")
    if decision not in {LearningRecommendationDecision.Decision.ACCEPTED, LearningRecommendationDecision.Decision.DISMISSED}:
        return Response({"decision": "Choose accepted or dismissed."}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        reviewed = LearningRecommendationDecision.objects.create(
            student=student,
            competency=plan.competency,
            resource=resource,
            teacher=request.user,
            decision=decision,
            score=recommendation["score"],
            rationale={"reason": recommendation["reason"], "confidence": recommendation["confidence"], **recommendation["signals"]},
        )
        activity = None
        if decision == LearningRecommendationDecision.Decision.ACCEPTED:
            mastery = plan.activities.filter(resource__isnull=True).order_by("position").first()
            position = mastery.position if mastery else (plan.activities.aggregate(value=Max("position"))["value"] or 0) + 1
            plan.activities.filter(position__gte=position).update(position=F("position") + 1)
            activity = RecoveryActivity.objects.create(
                plan=plan,
                resource=resource,
                title=resource.title,
                position=position,
                due_at=timezone.now() + timedelta(days=2),
                recommendation_reason=recommendation["reason"],
                recommendation_metadata={"score": recommendation["score"], "confidence": recommendation["confidence"], **recommendation["signals"]},
            )
            Intervention.objects.create(student=student, teacher=request.user, action="resource_support", note=f"Assigned {resource.title} for {plan.competency.title}. Rationale: {recommendation['reason']}")
            notify(recipient=student, kind=Notification.Kind.PLAN_ASSIGNED, title="Recovery activity added", message=f"Your teacher added {resource.title} to support {plan.competency.title}.", action_url="/recovery", deduplication_key=f"recommendation:{reviewed.id}:accepted")
        AuditEvent.objects.create(actor=request.user, action=f"learning_recommendation.{decision}", object_type="LearningResource", object_id=str(resource.id), metadata={"student_id": student.id, "plan_id": plan.id, "score": recommendation["score"], "algorithm_version": recommendation["signals"]["algorithm_version"]})
    return Response({"decision": decision, "activity_id": activity.id if activity else None}, status=status.HTTP_201_CREATED)


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
    is_teacher = role_for(request.user) == UserProfile.Role.TEACHER
    subject_ids = list(request.user.tala_profile.assigned_subjects.values_list("id", flat=True)) if is_teacher else None
    requested_subject_id = request.query_params.get("subject")
    if requested_subject_id:
        try:
            requested_subject_id = int(requested_subject_id)
        except (TypeError, ValueError):
            return Response({"subject": "Choose a valid subject."}, status=status.HTTP_400_BAD_REQUEST)
        if is_teacher and requested_subject_id not in subject_ids:
            return Response({"subject": "You are not assigned to this subject."}, status=status.HTTP_403_FORBIDDEN)
        subject_ids = [requested_subject_id]
    plans = RecoveryPlan.objects.filter(student=student).select_related("competency__subject").prefetch_related("activities__resource")
    attempts = AssessmentAttempt.objects.filter(student=student, submitted_at__isnull=False).select_related("assessment")
    interventions = Intervention.objects.filter(student=student).select_related("teacher").order_by("-created_at")
    evidence = LearnerCompetencyEvidence.objects.filter(student=student).select_related("competency__subject")
    remedial_exams = Assessment.objects.filter(kind=Assessment.Kind.REMEDIAL, is_active=True, assigned_classes=student.tala_profile.academic_class).prefetch_related("questions", "remedial_consents")
    competency_results = CompetencyResult.objects.select_related("competency__subject")
    if subject_ids is not None:
        plans = plans.filter(competency__subject_id__in=subject_ids)
        attempts = attempts.filter(assessment__subject_id__in=subject_ids)
        competency_results = competency_results.filter(competency__subject_id__in=subject_ids)
        evidence = evidence.filter(competency__subject_id__in=subject_ids)
        remedial_exams = remedial_exams.filter(subject_id__in=subject_ids)
    if is_teacher:
        interventions = interventions.filter(teacher=request.user)
    attempts = attempts.prefetch_related(Prefetch("competency_results", queryset=competency_results)).order_by("submitted_at")
    evidence = evidence.order_by("-occurred_at")[:30]
    remedial_rows = []
    for assessment in remedial_exams:
        competency_ids = assessment.questions.values_list("competency_id", flat=True)
        remaining = RecoveryActivity.objects.filter(plan__student=student, plan__status="active", plan__competency_id__in=competency_ids, resource__isnull=False, completed_at__isnull=True).count()
        consent = assessment.remedial_consents.filter(student=student).first()
        remedial_rows.append({"id": assessment.id, "title": assessment.title, "eligible": remaining == 0, "remaining_activities": remaining, "consent_status": consent.status if consent else "not_requested", "guardian_name": consent.guardian_name if consent else "", "requested_at": consent.requested_at if consent else None, "evidence_attached": bool(consent and consent.evidence_file)})
    guardians = list(student.tala_profile.guardian_contacts.values("id", "name", "relationship", "phone", "email"))
    return Response({"student": {"id": student.id, "name": student.get_full_name() or student.username, "email": student.email, "section": str(student.tala_profile.academic_class) if student.tala_profile.academic_class else "Unassigned"}, "plans": RecoveryPlanSerializer(plans, many=True).data, "attempts": AssessmentAttemptSerializer(attempts, many=True).data, "evidence": LearnerCompetencyEvidenceSerializer(evidence, many=True).data, "interventions": InterventionSerializer(interventions, many=True).data, "guardians": guardians, "remedial_exams": remedial_rows, "recommendations": _recommendation_rows(student, plans.filter(status="active"))})

@api_view(["GET"])
@permission_classes([IsAdmin])
def admin_overview(request):
    User = get_user_model()
    recent_imports = ContentImport.objects.select_related("uploaded_by").order_by("-created_at")[:5]
    return Response({
        "active_accounts": User.objects.filter(tala_profile__is_active=True, is_active=True).count(),
        "students": User.objects.filter(tala_profile__role=UserProfile.Role.STUDENT).count(),
        "teachers": User.objects.filter(tala_profile__role=UserProfile.Role.TEACHER).count(),
        "classes": AcademicClass.objects.filter(is_active=True).count(),
        "subjects": Subject.objects.filter(is_active=True).count(),
        "competencies": Competency.objects.filter(is_active=True).count(),
        "approved_resources": LearningResource.objects.filter(is_approved=True).count(),
        "pending_resources": ContentImport.objects.filter(status=ContentImport.Status.NEEDS_REVIEW, archived_at__isnull=True).count(),
        "failed_imports": ContentImport.objects.filter(status=ContentImport.Status.FAILED, archived_at__isnull=True).count(),
        "unassigned_students": UserProfile.objects.filter(role=UserProfile.Role.STUDENT, academic_class__isnull=True, is_active=True).count(),
        "unassigned_teachers": UserProfile.objects.filter(role=UserProfile.Role.TEACHER, assigned_classes__isnull=True, is_active=True).distinct().count(),
        "pending_consents": RemedialExamConsent.objects.filter(status=RemedialExamConsent.Status.REQUESTED).count(),
        "active_learning_assignments": LearningAssignment.objects.filter(is_active=True).count(),
        "recent_imports": [{"id": item.id, "title": item.title, "kind": item.kind, "status": item.status, "uploaded_by": item.uploaded_by.get_full_name() or item.uploaded_by.email, "created_at": item.created_at} for item in recent_imports],
    })


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
        if self.action == "create":
            return [IsTeacher()]
        if self.action in {"publish", "reject", "archive"}:
            return [IsAdmin()]
        return [IsTeacherOrAdmin()]

    def get_queryset(self):
        queryset = ContentImport.objects.select_related("subject", "competency", "uploaded_by", "reviewed_by", "published_assessment", "published_resource")
        if role_for(self.request.user) == UserProfile.Role.TEACHER:
            queryset = queryset.filter(uploaded_by=self.request.user)
            if subject_id := self.request.query_params.get("subject"):
                if not self.request.user.tala_profile.assigned_subjects.filter(pk=subject_id).exists():
                    raise PermissionDenied("You are not assigned to this subject.")
                queryset = queryset.filter(subject_id=subject_id)
        return queryset.order_by("-created_at", "-id")

    def _notify_reviewers(self, content_import):
        if content_import.status == ContentImport.Status.NEEDS_REVIEW:
            administrators = get_user_model().objects.filter(tala_profile__role=UserProfile.Role.ADMIN, tala_profile__is_active=True, is_active=True)
            for administrator in administrators:
                notify(recipient=administrator, kind=Notification.Kind.CONTENT_REVIEW, title="Content awaiting review", message=f"{content_import.uploaded_by.get_full_name() or content_import.uploaded_by.email} submitted {content_import.title}.", action_url=f"/imports/{content_import.id}", deduplication_key=f"content-import:{content_import.id}:review:{administrator.id}")

    def perform_create(self, serializer):
        self._notify_reviewers(process_content_import(serializer.save()))

    def partial_update(self, request, *args, **kwargs):
        content_import = self.get_object()
        if role_for(request.user) == UserProfile.Role.TEACHER:
            if content_import.status not in {ContentImport.Status.NEEDS_REVIEW, ContentImport.Status.PUBLISHED}:
                return Response({"detail": "Only content awaiting review or published learning content can be edited."}, status=status.HTTP_409_CONFLICT)
            unsupported = set(request.data) - {"extracted_payload", "configuration"}
            if unsupported:
                return Response({"detail": "Teachers can edit extracted questions and proposed class assignments only."}, status=status.HTTP_403_FORBIDDEN)
        try:
            with transaction.atomic():
                response = super().partial_update(request, *args, **kwargs)
                content_import.refresh_from_db()
                if "extracted_payload" in request.data and content_import.status == ContentImport.Status.PUBLISHED:
                    sync_published_practice_questions(content_import, request.user)
        except ContentImportError as exc:
            raise ValidationError({"extracted_payload": str(exc)}) from exc
        return response

    @action(detail=True, methods=["post"])
    def process(self, request, pk=None):
        content_import = self.get_object()
        if content_import.archived_at:
            return Response({"detail": "Archived content cannot be processed."}, status=status.HTTP_409_CONFLICT)
        content_import = process_content_import(content_import)
        self._notify_reviewers(content_import)
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
        return protected_file_response(request, content_import.source_file, content_import.mime_type, content_import.original_filename)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        if self.get_object().archived_at:
            return Response({"detail": "Archived content cannot be published."}, status=status.HTTP_409_CONFLICT)
        try:
            content_import = publish_content_import(self.get_object(), request.user)
        except ContentImportError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(content_import).data)

    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        content_import = self.get_object()
        if content_import.archived_at:
            return Response({"detail": "Archived learning material cannot be assigned."}, status=status.HTTP_409_CONFLICT)
        if content_import.kind == ContentImport.Kind.EXAM or not content_import.published_resource_id:
            return Response({"detail": "Only published modules and videos can be assigned here."}, status=status.HTTP_409_CONFLICT)
        supplied = request.data.get("assigned_class_ids", [])
        if not isinstance(supplied, list):
            return Response({"assigned_class_ids": "Expected a list of class identifiers."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            class_ids = {int(item) for item in supplied}
        except (TypeError, ValueError):
            return Response({"assigned_class_ids": "Class identifiers must be integers."}, status=status.HTTP_400_BAD_REQUEST)
        classes = AcademicClass.objects.filter(id__in=class_ids, is_active=True)
        if classes.count() != len(class_ids):
            return Response({"assigned_class_ids": "One or more classes are unavailable."}, status=status.HTTP_400_BAD_REQUEST)
        if role_for(request.user) == UserProfile.Role.TEACHER:
            allowed = set(request.user.tala_profile.assigned_classes.values_list("id", flat=True))
            if not class_ids.issubset(allowed):
                return Response({"assigned_class_ids": "You can assign material only to your assigned classes."}, status=status.HTTP_403_FORBIDDEN)
        assignment, _ = LearningAssignment.objects.get_or_create(resource=content_import.published_resource, defaults={"assigned_by": content_import.uploaded_by})
        assignment.assigned_classes.set(classes)
        assignment.is_active = True
        assignment.save(update_fields=["is_active", "updated_at"])
        content_import.configuration = {**content_import.configuration, "assigned_class_ids": sorted(class_ids)}
        content_import.save(update_fields=["configuration", "updated_at"])
        students = UserProfile.objects.filter(role=UserProfile.Role.STUDENT, academic_class_id__in=class_ids, is_active=True).select_related("user").distinct()
        for profile in students:
            notify(recipient=profile.user, kind=Notification.Kind.LEARNING_ASSIGNED, title="Learning material assigned", message=f"{content_import.published_resource.title} has been assigned to your class.", action_url="/materials", deduplication_key=f"learning-assignment:{assignment.id}:student:{profile.user_id}")
        return Response(self.get_serializer(content_import).data)

    @action(detail=True, methods=["post"])
    def archive(self, request, pk=None):
        content_import = self.get_object()
        if content_import.archived_at:
            return Response({"detail": "This content is already archived."}, status=status.HTTP_409_CONFLICT)
        if content_import.status == ContentImport.Status.PROCESSING:
            return Response({"detail": "Wait for processing to finish before archiving this content."}, status=status.HTTP_409_CONFLICT)
        now = timezone.now()
        content_import.archived_by = request.user
        content_import.archived_at = now
        content_import.save(update_fields=["archived_by", "archived_at", "updated_at"])
        if content_import.published_resource_id:
            LearningResource.objects.filter(pk=content_import.published_resource_id).update(is_approved=False)
            LearningAssignment.objects.filter(resource_id=content_import.published_resource_id).update(is_active=False, updated_at=now)
        if content_import.published_assessment_id:
            Assessment.objects.filter(pk=content_import.published_assessment_id).update(is_active=False)
        AuditEvent.objects.create(actor=request.user, action="content_import.archived", object_type="ContentImport", object_id=str(content_import.id), metadata={"title": content_import.title, "kind": content_import.kind, "uploaded_by_id": content_import.uploaded_by_id})
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
