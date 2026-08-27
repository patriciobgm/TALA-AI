from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from .llm.base import LLMUnavailable
from .models import AIConversation, AIMessage, RecoveryPlan
from .permissions import IsStudent
from .tutor import answer_student
from .llm.factory import get_llm_provider
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
    conversation, _ = AIConversation.objects.get_or_create(student=request.user, plan=plan)
    AIMessage.objects.create(conversation=conversation, role=AIMessage.Role.USER, content=message, action=action)
    try:
        llm_response, resources = answer_student(plan, message, action)
    except LLMUnavailable as exc:
        return Response({"detail": str(exc), "code": "llm_unavailable"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    assistant = AIMessage.objects.create(conversation=conversation, role=AIMessage.Role.ASSISTANT, content=llm_response.text, action=action, provider=llm_response.provider, model=llm_response.model, source_resource_ids=[resource.id for resource in resources])
    return Response({"id": assistant.id, "answer": assistant.content, "provider": assistant.provider, "model": assistant.model, "sources": [{"id": resource.id, "title": resource.title} for resource in resources]})

@api_view(["GET"])
@permission_classes([IsTeacherOrAdmin])
def tutor_health(request):
    provider = get_llm_provider()
    return Response({"provider": provider.name, "model": provider.model, "available": provider.health_check()})
