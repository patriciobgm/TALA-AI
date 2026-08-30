import time
import tempfile
from pathlib import Path
from django.conf import settings
from django.db import connection
from django.utils import timezone
from redis import Redis
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from .llm.base import LLMUnavailable
from .llm.base import LLMRequest
from .models import AIConversation, AIMessage, AIMessageFeedback, AuditEvent, LearnerCompetencyEvidence, LearningAssignment, RecoveryPlan, UserProfile
from .permissions import IsStudent, role_for
from .tutor import answer_learning_assignment, answer_student
from .llm.factory import get_llm_provider
from .llm.openai_compatible import OpenAICompatibleProvider
from .permissions import IsTeacherOrAdmin
from .transcription import whisper_status

@api_view(["POST"])
@permission_classes([IsTeacherOrAdmin])
def learner_support_insight(request, student_id):
    from django.contrib.auth import get_user_model
    student = get_user_model().objects.filter(pk=student_id, tala_profile__role=UserProfile.Role.STUDENT).select_related("tala_profile__academic_class").first()
    if not student:
        return Response({"detail": "Learner not found."}, status=status.HTTP_404_NOT_FOUND)
    if role_for(request.user) == UserProfile.Role.TEACHER and not request.user.tala_profile.assigned_classes.filter(pk=student.tala_profile.academic_class_id).exists():
        return Response({"detail": "You are not assigned to this learner's class."}, status=status.HTTP_403_FORBIDDEN)
    evidence_query = LearnerCompetencyEvidence.objects.filter(student=student).select_related("competency")
    plan_query = RecoveryPlan.objects.filter(student=student, status="active").select_related("competency").prefetch_related("activities")
    if role_for(request.user) == UserProfile.Role.TEACHER:
        subject_ids = request.user.tala_profile.assigned_subjects.values_list("id", flat=True)
        requested_subject_id = request.query_params.get("subject")
        if requested_subject_id:
            if not request.user.tala_profile.assigned_subjects.filter(pk=requested_subject_id).exists():
                return Response({"subject": "You are not assigned to this subject."}, status=status.HTTP_403_FORBIDDEN)
            subject_ids = [requested_subject_id]
        evidence_query = evidence_query.filter(competency__subject_id__in=subject_ids)
        plan_query = plan_query.filter(competency__subject_id__in=subject_ids)
    evidence = list(evidence_query[:20])
    plans = list(plan_query)
    evidence_lines = [f"[E{index}] {item.competency.code} {item.get_evidence_type_display()}: {item.summary} Score: {item.score if item.score is not None else 'not scored'}" for index, item in enumerate(evidence, start=1)]
    plan_lines = [f"[P{index}] {plan.competency.code} {plan.competency.title}: {plan.activities.filter(completed_at__isnull=False).count()} of {plan.activities.count()} activities complete" for index, plan in enumerate(plans, start=1)]
    priority_plan = min(plans, key=lambda plan: plan.activities.filter(completed_at__isnull=False).count() / max(plan.activities.count(), 1)) if plans else None
    recommended_action = "guided_practice" if priority_plan else "monitor"
    recommended_note = f"Provide guided practice for {priority_plan.competency.code} – {priority_plan.competency.title}, then review the learner's next completed activity before reassessment." if priority_plan else "Review the learner's next assessment or practice evidence before changing the recovery plan."
    system = """You are TALA's teacher decision-support assistant. Analyze only the supplied learner evidence. Produce: (1) a concise learning-status summary, (2) the highest-priority instructional next step, (3) one specific teacher action, and (4) what evidence to collect next. Cite supplied identifiers like [E1] or [P1] for every conclusion. Do not diagnose a disability, infer sensitive traits, make disciplinary recommendations, change grades, or claim certainty beyond the evidence. Say when evidence is insufficient. Keep the response under 250 words."""
    prompt = "Learner evidence:\n" + ("\n".join(evidence_lines) or "No scored evidence.") + "\n\nActive recovery plans:\n" + ("\n".join(plan_lines) or "No active recovery plan.")
    try:
        response = get_llm_provider().generate(LLMRequest(system=system, messages=[{"role": "user", "content": prompt}], temperature=0.1, max_tokens=450))
    except LLMUnavailable as exc:
        return Response({"detail": str(exc), "code": "llm_unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    AuditEvent.objects.create(actor=request.user, action="ai.learner_support_insight_generated", object_type="User", object_id=str(student.id), metadata={"evidence_count": len(evidence), "active_plan_count": len(plans), "provider": response.provider, "model": response.model})
    return Response({"insight": response.text, "recommended_action": recommended_action, "recommended_note": recommended_note, "priority_competency": priority_plan.competency.title if priority_plan else "", "provider": response.provider, "model": response.model, "evidence_count": len(evidence), "generated_at": timezone.now()})

@api_view(["POST"])
@permission_classes([IsStudent])
def tutor_message(request, plan_id):
    try:
        plan = RecoveryPlan.objects.select_related("competency").get(pk=plan_id, student=request.user)
    except RecoveryPlan.DoesNotExist:
        return Response({"detail": "Recovery plan not found."}, status=status.HTTP_404_NOT_FOUND)
    message = str(request.data.get("message", "")).strip()
    action = str(request.data.get("action", "explain"))
    supported_actions = {"explain", "example", "hint", "check", "simplify", "reasoning", "practice"}
    if action not in supported_actions:
        return Response({"action": "Choose a supported tutoring mode."}, status=status.HTTP_400_BAD_REQUEST)
    if not message:
        return Response({"message": "Enter a question."}, status=status.HTTP_400_BAD_REQUEST)
    activity = None
    question = None
    activity_id = request.data.get("activity_id")
    question_id = request.data.get("question_id")
    if activity_id:
        activity = plan.activities.select_related("resource").filter(pk=activity_id).first()
    if activity and activity.resource_id and question_id:
        question = activity.resource.practice_questions.filter(pk=question_id).first()
    selected_answer = str(request.data.get("selected_answer", "")).strip()[:500]
    conversation, _ = AIConversation.objects.get_or_create(student=request.user, plan=plan)
    previous = list(conversation.messages.order_by("-created_at")[:6])
    history = [{"role": "assistant" if item.role == AIMessage.Role.ASSISTANT else "user", "content": item.content[:1600]} for item in reversed(previous)]
    AIMessage.objects.create(conversation=conversation, role=AIMessage.Role.USER, content=message, action=action)
    started = time.monotonic()
    try:
        llm_response, evidence, _learner_context = answer_student(plan, message, action, activity=activity, question=question, selected_answer=selected_answer, history=history)
    except LLMUnavailable as exc:
        return Response({"detail": str(exc), "code": "llm_unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    citations = [{"number": index, "chunk_id": item.chunk_id, "resource_id": item.resource_id, "title": item.title, "resource_type": item.resource_type, "locator": item.locator, "excerpt": item.excerpt[:240]} for index, item in enumerate(evidence, start=1)]
    assistant = AIMessage.objects.create(conversation=conversation, role=AIMessage.Role.ASSISTANT, content=llm_response.text, action=action, provider=llm_response.provider, model=llm_response.model, source_resource_ids=sorted({item.resource_id for item in evidence}), source_citations=citations, grounding_status="grounded" if evidence else "insufficient_evidence", latency_ms=round((time.monotonic() - started) * 1000))
    return Response({"id": assistant.id, "answer": assistant.content, "mode": action, "grounding_status": assistant.grounding_status, "sources": citations})


@api_view(["POST"])
@permission_classes([IsStudent])
def learning_assignment_tutor_message(request, assignment_id):
    profile = request.user.tala_profile
    assignment = (
        LearningAssignment.objects.filter(
            pk=assignment_id,
            is_active=True,
            resource__is_approved=True,
            assigned_classes=profile.academic_class,
        )
        .select_related("resource")
        .prefetch_related("resource__competencies", "resource__practice_questions")
        .distinct()
        .first()
    )
    if not assignment:
        return Response({"detail": "Learning assignment not found."}, status=status.HTTP_404_NOT_FOUND)
    message = str(request.data.get("message", "")).strip()
    action = str(request.data.get("action", "explain"))
    supported_actions = {"explain", "example", "hint", "check", "simplify", "reasoning", "practice"}
    if action not in supported_actions:
        return Response({"action": "Choose a supported tutoring mode."}, status=status.HTTP_400_BAD_REQUEST)
    if not message:
        return Response({"message": "Enter a question."}, status=status.HTTP_400_BAD_REQUEST)
    question = assignment.resource.practice_questions.filter(pk=request.data.get("question_id")).first() if request.data.get("question_id") else None
    selected_answer = str(request.data.get("selected_answer", "")).strip()[:500]
    conversation, _ = AIConversation.objects.get_or_create(student=request.user, learning_assignment=assignment, defaults={"plan": None})
    previous = list(conversation.messages.order_by("-created_at")[:6])
    history = [{"role": "assistant" if item.role == AIMessage.Role.ASSISTANT else "user", "content": item.content[:1600]} for item in reversed(previous)]
    AIMessage.objects.create(conversation=conversation, role=AIMessage.Role.USER, content=message, action=action)
    started = time.monotonic()
    try:
        llm_response, evidence = answer_learning_assignment(assignment, request.user, message, action, question=question, selected_answer=selected_answer, history=history)
    except LLMUnavailable as exc:
        return Response({"detail": str(exc), "code": "llm_unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    citations = [{"number": index, "chunk_id": item.chunk_id, "resource_id": item.resource_id, "title": item.title, "resource_type": item.resource_type, "locator": item.locator, "excerpt": item.excerpt[:240]} for index, item in enumerate(evidence, start=1)]
    assistant = AIMessage.objects.create(conversation=conversation, role=AIMessage.Role.ASSISTANT, content=llm_response.text, action=action, provider=llm_response.provider, model=llm_response.model, source_resource_ids=sorted({item.resource_id for item in evidence}), source_citations=citations, grounding_status="grounded" if evidence else "insufficient_evidence", latency_ms=round((time.monotonic() - started) * 1000))
    return Response({"id": assistant.id, "answer": assistant.content, "mode": action, "grounding_status": assistant.grounding_status, "sources": citations})


@api_view(["POST"])
@permission_classes([IsStudent])
def tutor_feedback(request, message_id):
    try:
        message = AIMessage.objects.get(pk=message_id, role=AIMessage.Role.ASSISTANT, conversation__student=request.user)
    except AIMessage.DoesNotExist:
        return Response({"detail": "TALA response not found."}, status=status.HTTP_404_NOT_FOUND)
    rating = str(request.data.get("rating", ""))
    if rating not in AIMessageFeedback.Rating.values:
        return Response({"rating": "Choose helpful or not helpful."}, status=status.HTTP_400_BAD_REQUEST)
    issue = str(request.data.get("issue", ""))[:32]
    comment = str(request.data.get("comment", "")).strip()[:500]
    feedback, _ = AIMessageFeedback.objects.update_or_create(message=message, defaults={"student": request.user, "rating": rating, "issue": issue, "comment": comment})
    return Response({"id": feedback.id, "rating": feedback.rating, "issue": feedback.issue})

@api_view(["GET"])
@permission_classes([IsTeacherOrAdmin])
def tutor_health(request):
    started = time.monotonic()
    components = {}
    requested = request.query_params.get("service", "").strip().lower()

    def should_check(name):
        return not requested or requested == name

    if should_check("application"):
        components["application"] = {"status": "operational", "detail": "Authenticated API request completed"}
    try:
        if not should_check("database"):
            raise StopIteration
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        components["database"] = {"status": "operational", "detail": "Connection successful"}
    except StopIteration:
        pass
    except Exception:
        components["database"] = {"status": "unavailable", "detail": "Database connection failed"}
    try:
        if not should_check("storage"):
            raise StopIteration
        Path(settings.MEDIA_ROOT).mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=settings.MEDIA_ROOT, prefix="tala-health-") as probe:
            probe.write(b"ok")
            probe.flush()
        components["storage"] = {"status": "operational", "detail": "Media storage write and cleanup succeeded"}
    except StopIteration:
        pass
    except OSError:
        components["storage"] = {"status": "unavailable", "detail": "Media storage is not writable"}
    if should_check("queue"):
        if settings.CELERY_TASK_ALWAYS_EAGER:
            components["queue"] = {"status": "development", "detail": "Background tasks run synchronously in this environment"}
        else:
            try:
                Redis.from_url(settings.CELERY_BROKER_URL, socket_connect_timeout=2, socket_timeout=2).ping()
                components["queue"] = {"status": "operational", "detail": "Redis broker reachable"}
            except Exception:
                components["queue"] = {"status": "unavailable", "detail": "Redis broker cannot be reached"}
    if should_check("email"):
        is_console = settings.EMAIL_BACKEND.endswith("console.EmailBackend")
        components["email"] = {"status": "development" if is_console else "configured", "detail": "Messages are written to the backend console" if is_console else "Email delivery backend is configured"}
    if should_check("push"):
        components["push"] = {"status": "configured" if settings.EXPO_PUSH_URL else "misconfigured", "detail": "Push delivery endpoint is configured" if settings.EXPO_PUSH_URL else "Push delivery endpoint is missing"}
    if should_check("transcription"):
        components["transcription"] = whisper_status()
    try:
        if not should_check("assistance"):
            raise StopIteration
        configured = get_llm_provider()
        provider = OpenAICompatibleProvider(configured.name, configured.base_url, configured.api_key, configured.model, timeout=min(5, configured.timeout))
        available = provider.health_check()
        components["assistance"] = {"status": "operational" if available else "unavailable", "detail": "Model service reachable" if available else "Model service cannot be reached"}
    except StopIteration:
        provider = None
        available = False
    except (ValueError, AttributeError):
        provider = None
        available = False
        components["assistance"] = {"status": "misconfigured", "detail": "Provider configuration is invalid"}
    unhealthy = {"unavailable", "misconfigured"}
    overall = "attention" if any(item["status"] in unhealthy for item in components.values()) else "operational"
    return Response({"status": overall, "checked_at": timezone.now(), "latency_ms": round((time.monotonic() - started) * 1000), "components": components})
