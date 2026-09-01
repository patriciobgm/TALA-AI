import time
import tempfile
from pathlib import Path
from django.conf import settings
from django.db import connection
from django.db.models import Count, Q
from django.contrib.auth import get_user_model
from django.utils import timezone
from redis import Redis
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from .llm.base import LLMUnavailable
from .llm.base import LLMRequest
from .models import AICompanionSession, AIConversation, AIHelpRequest, AIMessage, AIMessageFeedback, AdaptiveLearningState, Assessment, AssessmentAttempt, AuditEvent, Competency, ContentImport, LearnerCompetencyEvidence, LearnerMisconception, LearningAssignment, LearningAssignmentProgress, LearningGoal, Misconception, PracticeQuestion, Question, RecoveryPlan, UserProfile
from .permissions import IsStudent, role_for
from .tutor import answer_learning_assignment, answer_student
from .llm.factory import get_llm_provider
from .llm.openai_compatible import OpenAICompatibleProvider
from .permissions import IsTeacherOrAdmin
from .transcription import whisper_status
from .notifications import assigned_teachers_for, notify
from .serializers import RecoveryPlanSerializer


def _subject_allowed(user, subject_id):
    if role_for(user) == UserProfile.Role.ADMIN:
        return True
    return user.tala_profile.assigned_subjects.filter(pk=subject_id).exists()


def _message_data(message):
    feedback = getattr(message, "feedback", None)
    return {
        "id": message.id,
        "role": message.role,
        "content": message.content,
        "action": message.action,
        "provider": message.provider,
        "model": message.model,
        "grounding_status": message.grounding_status,
        "sources": message.source_citations,
        "feedback": feedback.rating if feedback else None,
        "created_at": message.created_at,
    }


def _conversation_history(conversation):
    return [_message_data(item) for item in conversation.messages.select_related("feedback").order_by("created_at", "id")]

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

@api_view(["GET", "POST"])
@permission_classes([IsStudent])
def tutor_message(request, plan_id):
    try:
        plan = RecoveryPlan.objects.select_related("competency").get(pk=plan_id, student=request.user)
    except RecoveryPlan.DoesNotExist:
        return Response({"detail": "Recovery plan not found."}, status=status.HTTP_404_NOT_FOUND)
    conversation, _ = AIConversation.objects.get_or_create(student=request.user, plan=plan)
    if request.method == "GET":
        session = conversation.companion_sessions.order_by("-updated_at").first()
        return Response({"messages": _conversation_history(conversation), "session": {"id": session.id, "goal": session.goal, "stage": session.stage, "stage_label": session.get_stage_display(), "summary": session.summary, "completed_at": session.completed_at} if session else None})
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
    session = conversation.companion_sessions.filter(completed_at__isnull=True).order_by("-updated_at").first()
    if session and not session.completed_at:
        stage_by_action = {"explain": AICompanionSession.Stage.EXPLAIN, "simplify": AICompanionSession.Stage.EXPLAIN, "example": AICompanionSession.Stage.EXAMPLE, "reasoning": AICompanionSession.Stage.REASONING, "practice": AICompanionSession.Stage.PRACTICE, "check": AICompanionSession.Stage.REFLECT}
        next_stage = stage_by_action.get(action)
        if next_stage:
            session.stage = next_stage
            session.save(update_fields=["stage", "updated_at"])
    return Response({"id": assistant.id, "answer": assistant.content, "mode": action, "grounding_status": assistant.grounding_status, "sources": citations})


@api_view(["GET", "POST"])
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
    conversation, _ = AIConversation.objects.get_or_create(student=request.user, learning_assignment=assignment, defaults={"plan": None})
    if request.method == "GET":
        return Response({"messages": _conversation_history(conversation)})
    message = str(request.data.get("message", "")).strip()
    action = str(request.data.get("action", "explain"))
    supported_actions = {"explain", "example", "hint", "check", "simplify", "reasoning", "practice"}
    if action not in supported_actions:
        return Response({"action": "Choose a supported tutoring mode."}, status=status.HTTP_400_BAD_REQUEST)
    if not message:
        return Response({"message": "Enter a question."}, status=status.HTTP_400_BAD_REQUEST)
    question = assignment.resource.practice_questions.filter(pk=request.data.get("question_id")).first() if request.data.get("question_id") else None
    selected_answer = str(request.data.get("selected_answer", "")).strip()[:500]
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


@api_view(["GET"])
@permission_classes([IsStudent])
def companion_dashboard(request):
    subject_id = request.query_params.get("subject")
    plans = RecoveryPlan.objects.filter(student=request.user).select_related("competency").prefetch_related("activities__resource__practice_questions")
    if subject_id:
        plans = plans.filter(competency__subject_id=subject_id)
    plan = plans.filter(status="active").order_by("created_at", "id").first()
    academic_class = request.user.tala_profile.academic_class
    assignments = LearningAssignment.objects.filter(is_active=True, resource__is_approved=True, assigned_classes=academic_class).select_related("resource").prefetch_related("resource__competencies") if academic_class else LearningAssignment.objects.none()
    if subject_id:
        assignments = assignments.filter(resource__competencies__subject_id=subject_id)
    assignments = assignments.exclude(progress_records__student=request.user, progress_records__completed_at__isnull=False).distinct()
    material = assignments.order_by("due_at", "id").first()
    diagnostics = Assessment.objects.filter(kind=Assessment.Kind.PRE, is_active=True, assigned_classes=academic_class) if academic_class else Assessment.objects.none()
    if subject_id:
        diagnostics = diagnostics.filter(subject_id=subject_id)
    diagnostic = diagnostics.exclude(assessmentattempt__student=request.user, assessmentattempt__submitted_at__isnull=False).order_by("due_at", "id").first()
    if plan:
        activity = plan.activities.filter(completed_at__isnull=True).order_by("position").first()
        next_action = {"kind": "mastery" if activity and not activity.resource_id else "recovery", "title": activity.title if activity else "Review your completed plan", "detail": f"Continue support for {plan.competency.title}. Your baseline was {round(float(plan.baseline_score))}%.", "route": "/assessments" if activity and not activity.resource_id else "/recovery", "plan_id": plan.id}
    elif material:
        next_action = {"kind": "material", "title": material.resource.title, "detail": "Complete this assigned learning material and its quiz before moving forward.", "route": "/materials", "assignment_id": material.id}
    elif diagnostic:
        next_action = {"kind": "diagnostic", "title": diagnostic.title, "detail": "Take this diagnostic so TALA can identify competency support needs.", "route": "/assessments", "assessment_id": diagnostic.id}
    else:
        next_action = {"kind": "review", "title": "Review your learning evidence", "detail": "You have no required activity waiting. Review your progress and continue practicing.", "route": "/evidence"}
    sessions = AICompanionSession.objects.filter(student=request.user, conversation__plan__in=plans).select_related("conversation__plan__competency").order_by("-updated_at")
    goals = LearningGoal.objects.filter(student=request.user, competency__subject_id=subject_id, status=LearningGoal.Status.ACTIVE).select_related("competency") if subject_id else LearningGoal.objects.filter(student=request.user, status=LearningGoal.Status.ACTIVE).select_related("competency")
    adaptive = AdaptiveLearningState.objects.filter(student=request.user, competency__subject_id=subject_id).select_related("competency") if subject_id else AdaptiveLearningState.objects.filter(student=request.user).select_related("competency")
    signals = LearnerMisconception.objects.filter(student=request.user, misconception__competency__subject_id=subject_id, status__in=[LearnerMisconception.Status.DETECTED, LearnerMisconception.Status.CONFIRMED]).select_related("misconception__competency") if subject_id else LearnerMisconception.objects.filter(student=request.user, status__in=[LearnerMisconception.Status.DETECTED, LearnerMisconception.Status.CONFIRMED]).select_related("misconception__competency")
    return Response({
        "next_action": next_action,
        "active_plan": RecoveryPlanSerializer(plan, context={"request": request}).data if plan else None,
        "sessions": [{"id": item.id, "plan_id": item.conversation.plan_id, "competency": item.conversation.plan.competency.title if item.conversation.plan else "", "goal": item.goal, "stage": item.stage, "stage_label": item.get_stage_display(), "summary": item.summary, "started_at": item.started_at, "updated_at": item.updated_at, "completed_at": item.completed_at} for item in sessions[:10]],
        "goals": [_goal_data(item) for item in goals],
        "adaptive_states": [{"competency": item.competency_id, "competency_title": item.competency.title, "level": item.level, "reason": item.reason, "success_streak": item.success_streak, "miss_streak": item.miss_streak} for item in adaptive],
        "learning_focus": [{"id": item.id, "competency": item.misconception.competency.title, "title": item.misconception.title, "status": item.status, "confidence": item.confidence} for item in signals],
    })


@api_view(["POST"])
@permission_classes([IsStudent])
def start_companion_session(request):
    plan = RecoveryPlan.objects.filter(pk=request.data.get("plan_id"), student=request.user).select_related("competency").first()
    if not plan:
        return Response({"plan_id": "Choose one of your recovery plans."}, status=status.HTTP_400_BAD_REQUEST)
    conversation, _ = AIConversation.objects.get_or_create(student=request.user, plan=plan)
    session = conversation.companion_sessions.filter(student=request.user, completed_at__isnull=True).order_by("-updated_at").first()
    if not session:
        session = AICompanionSession(conversation=conversation, student=request.user)
    persistent_goal = LearningGoal.objects.filter(student=request.user, competency=plan.competency, status=LearningGoal.Status.ACTIVE).first()
    session.goal = str(request.data.get("goal", "")).strip()[:240] or (persistent_goal.title if persistent_goal else f"Strengthen {plan.competency.title}")
    session.save()
    return Response({"id": session.id, "plan_id": plan.id, "goal": session.goal, "stage": session.stage, "stage_label": session.get_stage_display(), "summary": session.summary, "messages": _conversation_history(conversation)}, status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
@permission_classes([IsStudent])
def update_companion_session(request, session_id):
    session = AICompanionSession.objects.filter(pk=session_id, student=request.user).select_related("conversation__plan__competency").first()
    if not session:
        return Response({"detail": "Companion session not found."}, status=status.HTTP_404_NOT_FOUND)
    requested_stage = str(request.data.get("stage", ""))
    if requested_stage and requested_stage not in AICompanionSession.Stage.values:
        return Response({"stage": "Choose a valid guided-session stage."}, status=status.HTTP_400_BAD_REQUEST)
    if requested_stage:
        session.stage = requested_stage
    if request.data.get("complete"):
        user_messages = list(session.conversation.messages.filter(role=AIMessage.Role.USER).order_by("-created_at").values_list("content", flat=True)[:3])
        modes = list(session.conversation.messages.exclude(action="").values_list("action", flat=True).distinct())
        session.summary = f"Goal: {session.goal}. Guided modes used: {', '.join(modes) or 'conversation'}. Learner questions included: {'; '.join(reversed(user_messages)) or 'No written question recorded.'}"
        session.stage = AICompanionSession.Stage.COMPLETED
        session.completed_at = timezone.now()
    session.save()
    return Response({"id": session.id, "goal": session.goal, "stage": session.stage, "stage_label": session.get_stage_display(), "summary": session.summary, "completed_at": session.completed_at})


@api_view(["POST"])
@permission_classes([IsStudent])
def companion_help_request(request):
    session = AICompanionSession.objects.filter(pk=request.data.get("session_id"), student=request.user).select_related("conversation__plan__competency").first()
    plan = session.conversation.plan if session else RecoveryPlan.objects.filter(pk=request.data.get("plan_id"), student=request.user).select_related("competency").first()
    if not plan:
        return Response({"detail": "Open a recovery-plan companion session before requesting teacher help."}, status=status.HTTP_400_BAD_REQUEST)
    conversation = plan.ai_conversations.filter(student=request.user).first()
    recent_questions = list(conversation.messages.filter(role=AIMessage.Role.USER).order_by("-created_at").values_list("content", flat=True)[:3]) if conversation else []
    note = str(request.data.get("note", "")).strip()[:1000]
    summary = note or f"The learner requested help with {plan.competency.title}. Recent questions: {'; '.join(reversed(recent_questions)) or 'No written question recorded.'}"
    help_request = AIHelpRequest.objects.create(student=request.user, plan=plan, session=session, competency=plan.competency, summary=summary)
    for teacher in assigned_teachers_for(request.user):
        notify(recipient=teacher, kind="intervention", title="Learner requested TALA follow-up", message=f"{request.user.get_full_name() or request.user.username} still needs help with {plan.competency.title}.", action_url=f"/learners/{request.user.id}", deduplication_key=f"tala-help:{help_request.id}:teacher:{teacher.id}")
    return Response({"id": help_request.id, "status": help_request.status, "summary": help_request.summary}, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def assessment_recovery_evidence(request):
    from django.contrib.auth import get_user_model
    student = request.user
    requested_student = request.query_params.get("student")
    if requested_student and role_for(request.user) != UserProfile.Role.STUDENT:
        student = get_user_model().objects.filter(pk=requested_student, tala_profile__role=UserProfile.Role.STUDENT).select_related("tala_profile__academic_class").first()
        if not student:
            return Response({"detail": "Learner not found."}, status=status.HTTP_404_NOT_FOUND)
        if role_for(request.user) == UserProfile.Role.TEACHER and not request.user.tala_profile.assigned_classes.filter(pk=student.tala_profile.academic_class_id).exists():
            return Response({"detail": "You are not assigned to this learner."}, status=status.HTTP_403_FORBIDDEN)
    subject_id = request.query_params.get("subject")
    attempts = AssessmentAttempt.objects.filter(student=student, submitted_at__isnull=False).select_related("assessment").prefetch_related("competency_results__competency", "answers__question__competency").order_by("submitted_at")
    plans = RecoveryPlan.objects.filter(student=student).select_related("competency").prefetch_related("activities__resource__practice_questions", "activities__attempts")
    assignments = LearningAssignment.objects.filter(is_active=True, resource__is_approved=True, assigned_classes=student.tala_profile.academic_class).select_related("resource").prefetch_related("resource__competencies", "quiz_attempts") if student.tala_profile.academic_class_id else LearningAssignment.objects.none()
    if subject_id:
        attempts = attempts.filter(assessment__subject_id=subject_id)
        plans = plans.filter(competency__subject_id=subject_id)
        assignments = assignments.filter(resource__competencies__subject_id=subject_id)
    material_rows = []
    for assignment in assignments.distinct():
        progress = LearningAssignmentProgress.objects.filter(assignment=assignment, student=student).first()
        quiz = assignment.quiz_attempts.filter(student=student).order_by("-submitted_at").first()
        material_rows.append({"id": assignment.id, "title": assignment.resource.title, "resource_type": assignment.resource.resource_type, "competencies": [item.title for item in assignment.resource.competencies.all()], "completed_at": progress.completed_at if progress else None, "quiz_score": quiz.score if quiz else None, "quiz_passed": quiz.passed if quiz else None})
    attempt_rows = []
    for attempt in attempts:
        attempt_rows.append({"id": attempt.id, "assessment": attempt.assessment.title, "kind": attempt.assessment.kind, "score": attempt.score, "submitted_at": attempt.submitted_at, "competency_results": [{"competency": item.competency.title, "score": item.score, "status": item.status} for item in attempt.competency_results.all()], "incorrect_questions": [{"id": answer.question_id, "prompt": answer.question.prompt, "competency": answer.question.competency.title, "student_answer": answer.answer, "correct_answer": answer.question.correct_answer} for answer in attempt.answers.all() if not answer.is_correct]})
    ai_messages = AIMessage.objects.filter(conversation__student=student, role=AIMessage.Role.ASSISTANT).exclude(provider="")
    if subject_id:
        ai_messages = ai_messages.filter(Q(conversation__plan__competency__subject_id=subject_id) | Q(conversation__learning_assignment__resource__competencies__subject_id=subject_id)).distinct()
    ai_messages = list(ai_messages.order_by("-created_at")[:20])
    source_resource_ids = {citation.get("resource_id") for item in ai_messages for citation in item.source_citations if citation.get("resource_id")}
    source_reviews = {item.published_resource_id: item for item in ContentImport.objects.filter(published_resource_id__in=source_resource_ids).select_related("reviewed_by")}
    ai_rows = []
    for item in ai_messages:
        sources = []
        for citation in item.source_citations:
            review = source_reviews.get(citation.get("resource_id"))
            sources.append({**citation, "approval_status": "reviewed_and_published" if review else "approved_resource", "approved_by": (review.reviewed_by.get_full_name() or review.reviewed_by.username) if review and review.reviewed_by else ""})
        ai_rows.append({"id": item.id, "provider": item.provider, "model": item.model, "grounding_status": item.grounding_status, "sources": sources, "created_at": item.created_at})
    return Response({"student": {"id": student.id, "name": student.get_full_name() or student.username, "section": str(student.tala_profile.academic_class) if student.tala_profile.academic_class else "Unassigned"}, "materials": material_rows, "attempts": attempt_rows, "plans": RecoveryPlanSerializer(plans, many=True, context={"request": request}).data, "ai_evidence": ai_rows, "generated_at": timezone.now()})


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


def _goal_data(goal):
    return {"id": goal.id, "student": goal.student_id, "competency": goal.competency_id, "competency_title": goal.competency.title, "title": goal.title, "target_score": goal.target_score, "target_date": goal.target_date, "progress_percent": goal.progress_percent, "status": goal.status, "created_at": goal.created_at, "updated_at": goal.updated_at}


@api_view(["GET", "POST"])
@permission_classes([permissions.IsAuthenticated])
def learning_goals(request):
    if request.method == "GET":
        goals = LearningGoal.objects.filter(student=request.user).select_related("competency")
        if subject_id := request.query_params.get("subject"):
            goals = goals.filter(competency__subject_id=subject_id)
        return Response([_goal_data(item) for item in goals])
    competency = Competency.objects.filter(pk=request.data.get("competency"), is_active=True).first()
    if not competency:
        return Response({"competency": "Choose an active competency."}, status=status.HTTP_400_BAD_REQUEST)
    if role_for(request.user) != UserProfile.Role.STUDENT:
        return Response({"detail": "Learners create their own learning goals here."}, status=status.HTTP_403_FORBIDDEN)
    title = str(request.data.get("title", "")).strip()[:240]
    if not title:
        return Response({"title": "Describe the learning goal."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        target_score = min(100, max(1, int(request.data.get("target_score", competency.mastery_threshold))))
    except (TypeError, ValueError):
        return Response({"target_score": "Enter a score from 1 to 100."}, status=status.HTTP_400_BAD_REQUEST)
    existing = LearningGoal.objects.filter(student=request.user, competency=competency, status=LearningGoal.Status.ACTIVE).first()
    if existing:
        existing.status = LearningGoal.Status.REVISED
        existing.save(update_fields=["status", "updated_at"])
    goal = LearningGoal.objects.create(student=request.user, competency=competency, plan=RecoveryPlan.objects.filter(student=request.user, competency=competency, status="active").first(), title=title, target_score=target_score, target_date=request.data.get("target_date") or None, created_by=request.user)
    return Response(_goal_data(goal), status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
@permission_classes([permissions.IsAuthenticated])
def learning_goal_detail(request, goal_id):
    goal = LearningGoal.objects.filter(pk=goal_id, student=request.user).select_related("competency").first()
    if not goal:
        return Response({"detail": "Learning goal not found."}, status=status.HTTP_404_NOT_FOUND)
    requested = str(request.data.get("status", goal.status))
    if requested not in LearningGoal.Status.values:
        return Response({"status": "Choose a valid goal status."}, status=status.HTTP_400_BAD_REQUEST)
    goal.status = requested
    if "title" in request.data:
        goal.title = str(request.data["title"]).strip()[:240]
    goal.save()
    return Response(_goal_data(goal))


@api_view(["GET", "POST"])
@permission_classes([IsTeacherOrAdmin])
def misconceptions(request):
    subject_id = request.query_params.get("subject") or request.data.get("subject")
    if not subject_id or not _subject_allowed(request.user, subject_id):
        return Response({"subject": "Choose a subject assigned to you."}, status=status.HTTP_403_FORBIDDEN)
    if request.method == "GET":
        rows = Misconception.objects.filter(competency__subject_id=subject_id).select_related("competency")
        return Response([{"id": item.id, "competency": item.competency_id, "competency_code": item.competency.code, "competency_title": item.competency.title, "code": item.code, "title": item.title, "description": item.description, "is_active": item.is_active, "assessment_question_count": item.assessment_questions.count(), "practice_question_count": item.practice_questions.count()} for item in rows])
    competency = Competency.objects.filter(pk=request.data.get("competency"), subject_id=subject_id).first()
    title = str(request.data.get("title", "")).strip()[:180]
    code = str(request.data.get("code", "")).strip().casefold().replace(" ", "-")[:40]
    if not competency or not title or not code:
        return Response({"detail": "Competency, code, and title are required."}, status=status.HTTP_400_BAD_REQUEST)
    item = Misconception.objects.create(competency=competency, code=code, title=title, description=str(request.data.get("description", "")).strip(), created_by=request.user)
    item.assessment_questions.add(*Question.objects.filter(id__in=request.data.get("question_ids", []), competency=competency))
    item.practice_questions.add(*PracticeQuestion.objects.filter(id__in=request.data.get("practice_question_ids", []), resource__competencies=competency))
    return Response({"id": item.id, "title": item.title, "code": item.code}, status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
@permission_classes([IsTeacherOrAdmin])
def misconception_detail(request, misconception_id):
    item = Misconception.objects.select_related("competency").filter(pk=misconception_id).first()
    if not item or not _subject_allowed(request.user, item.competency.subject_id):
        return Response({"detail": "Misconception category not found."}, status=status.HTTP_404_NOT_FOUND)
    for field in ["title", "description"]:
        if field in request.data:
            setattr(item, field, str(request.data[field]).strip())
    if "is_active" in request.data:
        item.is_active = bool(request.data["is_active"])
    item.save()
    return Response({"id": item.id, "title": item.title, "description": item.description, "is_active": item.is_active})


@api_view(["GET", "PATCH"])
@permission_classes([IsTeacherOrAdmin])
def misconception_signals(request):
    if request.method == "PATCH":
        signal = LearnerMisconception.objects.select_related("misconception__competency").filter(pk=request.data.get("id")).first()
        if not signal or not _subject_allowed(request.user, signal.misconception.competency.subject_id):
            return Response({"detail": "Learning-difficulty signal not found."}, status=status.HTTP_404_NOT_FOUND)
        requested = str(request.data.get("status", ""))
        if requested not in LearnerMisconception.Status.values:
            return Response({"status": "Choose detected, confirmed, dismissed, or resolved."}, status=status.HTTP_400_BAD_REQUEST)
        signal.status = requested
        signal.teacher_note = str(request.data.get("teacher_note", signal.teacher_note)).strip()
        signal.reviewed_by = request.user
        signal.reviewed_at = timezone.now()
        signal.save()
        return Response({"id": signal.id, "status": signal.status, "teacher_note": signal.teacher_note})
    subject_id = request.query_params.get("subject")
    if not subject_id or not _subject_allowed(request.user, subject_id):
        return Response({"subject": "Choose a subject assigned to you."}, status=status.HTTP_403_FORBIDDEN)
    rows = LearnerMisconception.objects.filter(misconception__competency__subject_id=subject_id).select_related("student", "student__tala_profile__academic_class", "misconception__competency")
    if role_for(request.user) == UserProfile.Role.TEACHER:
        rows = rows.filter(student__tala_profile__academic_class__in=request.user.tala_profile.assigned_classes.all())
    return Response([{"id": item.id, "student": item.student_id, "student_name": item.student.get_full_name() or item.student.username, "section": str(item.student.tala_profile.academic_class), "competency": item.misconception.competency.title, "misconception": item.misconception.title, "status": item.status, "confidence": item.confidence, "occurrence_count": item.occurrence_count, "teacher_note": item.teacher_note, "last_observed_at": item.last_observed_at} for item in rows])


@api_view(["GET"])
@permission_classes([IsTeacherOrAdmin])
def companion_analytics(request):
    subject_id = request.query_params.get("subject")
    if not subject_id or not _subject_allowed(request.user, subject_id):
        return Response({"subject": "Choose a subject assigned to you."}, status=status.HTTP_403_FORBIDDEN)
    students = get_user_model().objects.filter(tala_profile__role=UserProfile.Role.STUDENT, tala_profile__is_active=True)
    if role_for(request.user) == UserProfile.Role.TEACHER:
        students = students.filter(tala_profile__academic_class__in=request.user.tala_profile.assigned_classes.all())
    plans = RecoveryPlan.objects.filter(student__in=students, competency__subject_id=subject_id)
    sessions = AICompanionSession.objects.filter(conversation__plan__in=plans)
    assistant_messages = AIMessage.objects.filter(conversation__plan__in=plans, role=AIMessage.Role.ASSISTANT)
    feedback = AIMessageFeedback.objects.filter(message__in=assistant_messages)
    modes = assistant_messages.exclude(action="").values("action").annotate(count=Count("id")).order_by("-count")
    signals = LearnerMisconception.objects.filter(student__in=students, misconception__competency__subject_id=subject_id)
    top = signals.values("misconception__title", "misconception__competency__title").annotate(count=Count("id")).order_by("-count")[:8]
    learner_rows = []
    for student in students.filter(Q(recovery_plans__in=plans) | Q(misconception_signals__in=signals)).distinct():
        learner_sessions = sessions.filter(student=student)
        learner_rows.append({"student": student.id, "student_name": student.get_full_name() or student.username, "section": str(student.tala_profile.academic_class), "sessions": learner_sessions.count(), "completed_sessions": learner_sessions.filter(completed_at__isnull=False).count(), "active_signals": signals.filter(student=student, status__in=[LearnerMisconception.Status.DETECTED, LearnerMisconception.Status.CONFIRMED]).count(), "help_requests": AIHelpRequest.objects.filter(student=student, competency__subject_id=subject_id, status=AIHelpRequest.Status.OPEN).count(), "last_session_at": learner_sessions.order_by("-updated_at").values_list("updated_at", flat=True).first()})
    return Response({"summary": {"learners": len(learner_rows), "sessions": sessions.count(), "completed_sessions": sessions.filter(completed_at__isnull=False).count(), "helpful": feedback.filter(rating=AIMessageFeedback.Rating.HELPFUL).count(), "not_helpful": feedback.filter(rating=AIMessageFeedback.Rating.NOT_HELPFUL).count(), "open_handoffs": AIHelpRequest.objects.filter(student__in=students, competency__subject_id=subject_id, status=AIHelpRequest.Status.OPEN).count(), "active_misconceptions": signals.filter(status__in=[LearnerMisconception.Status.DETECTED, LearnerMisconception.Status.CONFIRMED]).count()}, "modes": list(modes), "top_misconceptions": [{"title": item["misconception__title"], "competency": item["misconception__competency__title"], "count": item["count"]} for item in top], "learners": learner_rows})

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
