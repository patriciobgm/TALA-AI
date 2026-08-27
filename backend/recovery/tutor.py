from .llm.base import LLMRequest
from .llm.factory import get_llm_provider
from .retrieval import retrieve_approved_resources

ACTION_GUIDANCE = {
    "explain": "Explain the concept clearly at the learner's grade level.",
    "example": "Provide one new worked example and show each step.",
    "hint": "Give a useful hint without revealing the complete answer.",
    "check": "Ask one short question that checks understanding. Do not provide its answer yet.",
}

def answer_student(plan, message: str, action: str = "explain"):
    resources = retrieve_approved_resources(plan.competency, message)
    context = "\n\n".join(f"[Resource {resource.id}: {resource.title}]\n{resource.content}" for resource in resources)
    system = f"""You are TALA, an academic recovery tutor for a Grade 11 learner.
Stay within this competency: {plan.competency.title}.
Use only the approved resource excerpts below. If they are insufficient, say that approved material is unavailable and advise the learner to ask the teacher.
Do not change grades, declare mastery, or reveal hidden assessment answers.
{ACTION_GUIDANCE.get(action, ACTION_GUIDANCE['explain'])}

Approved resources:
{context or 'No approved resource was retrieved.'}"""
    response = get_llm_provider().generate(LLMRequest(system=system, messages=[{"role": "user", "content": message}]))
    return response, resources
