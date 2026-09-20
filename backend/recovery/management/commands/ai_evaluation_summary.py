import json

from django.core.management.base import BaseCommand
from django.db.models import Avg

from recovery.models import AIMessage, AIMessageEvaluation, AIMessageFeedback, AuditEvent


class Command(BaseCommand):
    help = "Summarize observed AI usage and human review evidence without inventing accuracy claims."

    def handle(self, *args, **options):
        assistant = AIMessage.objects.filter(role=AIMessage.Role.ASSISTANT)
        evaluations = AIMessageEvaluation.objects.filter(message__in=assistant)
        feedback = AIMessageFeedback.objects.filter(message__in=assistant)
        total = assistant.count()
        reviewed = evaluations.count()
        payload = {
            "assistant_messages": total,
            "grounded_messages": assistant.filter(grounding_status="grounded").count(),
            "insufficient_evidence_messages": assistant.filter(grounding_status="insufficient_evidence").count(),
            "average_latency_ms": assistant.aggregate(value=Avg("latency_ms"))["value"],
            "human_reviewed_messages": reviewed,
            "human_review_coverage_percent": round(reviewed / total * 100, 2) if total else 0,
            "reviewed_grounding_accurate": evaluations.filter(grounding_accurate=True).count(),
            "reviewed_hallucination_detected": evaluations.filter(hallucination_detected=True).count(),
            "reviewed_answer_leakage_detected": evaluations.filter(incorrect_answer_leakage=True).count(),
            "helpful_feedback": feedback.filter(rating=AIMessageFeedback.Rating.HELPFUL).count(),
            "not_helpful_feedback": feedback.filter(rating=AIMessageFeedback.Rating.NOT_HELPFUL).count(),
            "recorded_provider_failures": AuditEvent.objects.filter(action="ai.service_unavailable").count(),
            "notice": "Review findings apply only to the human-reviewed sample and are not a system-wide AI accuracy claim.",
        }
        self.stdout.write(json.dumps(payload, indent=2, default=float))
