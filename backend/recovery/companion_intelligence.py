from django.utils import timezone

from .models import AdaptiveLearningState, LearnerMisconception, LearningGoal, Misconception


LEVELS = [
    AdaptiveLearningState.Level.FOUNDATION,
    AdaptiveLearningState.Level.GUIDED,
    AdaptiveLearningState.Level.STANDARD,
    AdaptiveLearningState.Level.CHALLENGE,
]


def default_misconception(competency):
    value, _ = Misconception.objects.get_or_create(
        competency=competency,
        code="general-understanding",
        defaults={
            "title": f"Needs reinforcement in {competency.title}",
            "description": "A general signal used until the teacher assigns a more specific misconception category.",
        },
    )
    return value


def update_adaptive_state(student, competency, *, correct, reason=""):
    state, _ = AdaptiveLearningState.objects.get_or_create(student=student, competency=competency)
    index = LEVELS.index(state.level)
    if correct:
        state.success_streak += 1
        state.miss_streak = 0
        if state.success_streak >= 2 and index < len(LEVELS) - 1:
            state.level = LEVELS[index + 1]
            state.success_streak = 0
            state.reason = reason or "Advanced after two successful independent checks."
    else:
        state.miss_streak += 1
        state.success_streak = 0
        if state.miss_streak >= 2 and index > 0:
            state.level = LEVELS[index - 1]
            state.miss_streak = 0
            state.reason = reason or "Adjusted after repeated difficulty."
    state.last_signal_at = timezone.now()
    if reason and not state.reason:
        state.reason = reason[:240]
    state.save()
    return state


def record_question_outcome(*, student, question, correct):
    competency = getattr(question, "competency", None)
    if competency is None and hasattr(question, "resource"):
        competency = question.resource.competencies.first()
    if competency is None:
        return None
    update_adaptive_state(student, competency, correct=correct, reason=f"Latest check in {competency.title} was {'successful' if correct else 'not yet successful'}.")
    if correct:
        return None
    tags = list(question.misconceptions.filter(is_active=True))
    if not tags:
        tags = [default_misconception(competency)]
    for tag in tags:
        signal, created = LearnerMisconception.objects.get_or_create(student=student, misconception=tag)
        ids = list(signal.source_question_ids)
        if question.id not in ids:
            ids.append(question.id)
        signal.source_question_ids = ids[-20:]
        signal.occurrence_count = 1 if created else signal.occurrence_count + 1
        signal.confidence = min(95, 45 + signal.occurrence_count * 10)
        if signal.status in {LearnerMisconception.Status.DISMISSED, LearnerMisconception.Status.RESOLVED}:
            signal.status = LearnerMisconception.Status.DETECTED
            signal.reviewed_by = None
            signal.reviewed_at = None
        signal.save()
    return tags


def update_learning_outcome(student, competency, score):
    numeric_score = round(float(score))
    goal = LearningGoal.objects.filter(student=student, competency=competency, status=LearningGoal.Status.ACTIVE).first()
    if goal:
        goal.progress_percent = min(100, round(numeric_score / max(goal.target_score, 1) * 100))
        if numeric_score >= goal.target_score:
            goal.status = LearningGoal.Status.ACHIEVED
        goal.save(update_fields=["progress_percent", "status", "updated_at"])
    if numeric_score >= competency.mastery_threshold:
        LearnerMisconception.objects.filter(student=student, misconception__competency=competency, status__in=[LearnerMisconception.Status.DETECTED, LearnerMisconception.Status.CONFIRMED]).update(status=LearnerMisconception.Status.RESOLVED, reviewed_at=timezone.now())
