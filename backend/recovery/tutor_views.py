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
from .models import AIConversation, AIMessage, RecoveryPlan
from .permissions import IsStudent
from .tutor import answer_student
from .llm.factory import get_llm_provider
from .llm.openai_compatible import OpenAICompatibleProvider
from .permissions import IsTeacherOrAdmin

@api_view(["POST"])
@permission_classes([IsStudent])
def tutor_message(request, plan_id):
    try:
        plan = RecoveryPlan.objects.select_related("competency").get(pk=plan_id, student=request.user)
    except RecoveryPlan.DoesNotExist:
        return Response({"detail": "Recovery plan not found."}, status=status.HTTP_404_NOT_FOUND)
    message = str(request.data.get("message", "")).strip()
    action = str(request.data.get("action", "explain"))
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
    AIMessage.objects.create(conversation=conversation, role=AIMessage.Role.USER, content=message, action=action)
    try:
        llm_response, resources = answer_student(plan, message, action, activity=activity, question=question, selected_answer=selected_answer)
    except LLMUnavailable as exc:
        return Response({"detail": str(exc), "code": "llm_unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    assistant = AIMessage.objects.create(conversation=conversation, role=AIMessage.Role.ASSISTANT, content=llm_response.text, action=action, provider=llm_response.provider, model=llm_response.model, source_resource_ids=[resource.id for resource in resources])
    return Response({"id": assistant.id, "answer": assistant.content, "provider": assistant.provider, "model": assistant.model, "sources": [{"id": resource.id, "title": resource.title} for resource in resources]})

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
