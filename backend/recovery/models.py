from django.conf import settings
from django.db import models
from django.utils import timezone
import secrets


def generate_class_code():
    return secrets.token_hex(4).upper()

class AcademicClass(models.Model):
    name = models.CharField(max_length=120)
    grade_level = models.PositiveSmallIntegerField()
    school_year = models.CharField(max_length=16)
    is_active = models.BooleanField(default=True)
    class_code = models.CharField(max_length=16, unique=True, null=True, blank=True)

    class Meta:
        verbose_name_plural = "academic classes"

    def save(self, *args, **kwargs):
        if not self.class_code:
            self.class_code = generate_class_code()
            while AcademicClass.objects.filter(class_code=self.class_code).exclude(pk=self.pk).exists():
                self.class_code = generate_class_code()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Grade {self.grade_level} – {self.name}"

class UserProfile(models.Model):
    class Role(models.TextChoices):
        STUDENT = "student", "Student"
        TEACHER = "teacher", "Teacher"
        ADMIN = "admin", "Administrator"
    user = models.OneToOneField(settings.AUTH_USER_MODEL, related_name="tala_profile", on_delete=models.CASCADE)
    role = models.CharField(max_length=12, choices=Role.choices)
    preferred_name = models.CharField(max_length=100, blank=True)
    avatar = models.FileField(upload_to="profile-photos/%Y/%m/", blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    gender = models.CharField(max_length=32, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    address_line = models.CharField(max_length=180, blank=True)
    city_municipality = models.CharField(max_length=100, blank=True)
    province = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=16, blank=True)
    academic_class = models.ForeignKey(AcademicClass, null=True, blank=True, related_name="members", on_delete=models.SET_NULL)
    assigned_classes = models.ManyToManyField(AcademicClass, related_name="assigned_teachers", blank=True)
    assigned_subjects = models.ManyToManyField("Subject", related_name="assigned_teachers", blank=True)
    is_active = models.BooleanField(default=True)
    must_change_password = models.BooleanField(default=False)
    mfa_enabled = models.BooleanField(default=False)
    mfa_secret = models.TextField(blank=True)
    mfa_pending_secret = models.TextField(blank=True)
    mfa_recovery_codes = models.JSONField(default=list, blank=True)


class EnrollmentRequest(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        CANCELLED = "cancelled", "Cancelled"

    class Source(models.TextChoices):
        STUDENT = "student", "Student class code"
        TEACHER = "teacher", "Teacher enrollment"
        ADMIN = "admin", "Administrator override"

    student = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="enrollment_requests", on_delete=models.CASCADE)
    academic_class = models.ForeignKey(AcademicClass, related_name="enrollment_requests", on_delete=models.CASCADE)
    subject = models.ForeignKey("Subject", null=True, blank=True, related_name="enrollment_requests", on_delete=models.PROTECT)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    source = models.CharField(max_length=12, choices=Source.choices)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="submitted_enrollment_requests", on_delete=models.PROTECT)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, related_name="reviewed_enrollment_requests", on_delete=models.PROTECT)
    decision_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["student", "academic_class", "subject"], condition=models.Q(status="pending"), name="unique_pending_subject_class_enrollment"),
        ]


class PrivacyAcknowledgment(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="privacy_acknowledgments", on_delete=models.PROTECT)
    policy_version = models.CharField(max_length=40)
    declaration_text = models.TextField()
    accepted_at = models.DateTimeField(auto_now_add=True)
    response_ip = models.GenericIPAddressField(null=True, blank=True)
    response_user_agent = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ["-accepted_at"]
        constraints = [models.UniqueConstraint(fields=["user", "policy_version"], name="unique_user_privacy_acknowledgment")]

class StudentProfile(models.Model):
    class Cluster(models.TextChoices):
        ACADEMICS = "academics", "Academics"
        TECH_PRO = "tech_pro", "Tech Pro"

    profile = models.OneToOneField(UserProfile, related_name="student_details", on_delete=models.CASCADE)
    student_number = models.CharField(max_length=40, unique=True, null=True, blank=True)
    learner_reference_number = models.CharField(max_length=40, blank=True)
    grade_level = models.PositiveSmallIntegerField(default=11)
    cluster = models.CharField(max_length=16, choices=Cluster.choices, default=Cluster.ACADEMICS)

class EmployeeProfile(models.Model):
    profile = models.OneToOneField(UserProfile, related_name="employee_details", on_delete=models.CASCADE)
    employee_id = models.CharField(max_length=40, unique=True, null=True, blank=True)
    job_title = models.CharField(max_length=100, blank=True)

class EmergencyContact(models.Model):
    profile = models.ForeignKey(UserProfile, related_name="emergency_contacts", on_delete=models.CASCADE)
    name = models.CharField(max_length=150)
    relationship = models.CharField(max_length=80)
    phone = models.CharField(max_length=32)
    email = models.EmailField(blank=True)
    is_primary = models.BooleanField(default=False)

class GuardianContact(models.Model):
    profile = models.ForeignKey(UserProfile, related_name="guardian_contacts", on_delete=models.CASCADE)
    name = models.CharField(max_length=150)
    relationship = models.CharField(max_length=80)
    phone = models.CharField(max_length=32)
    email = models.EmailField(blank=True)
    receives_progress_updates = models.BooleanField(default=False)
    consent_recorded_at = models.DateTimeField(null=True, blank=True)

class Subject(models.Model):
    name = models.CharField(max_length=120, unique=True)
    code = models.CharField(max_length=24, unique=True)
    grade_level = models.PositiveSmallIntegerField(default=11)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.name

class Competency(models.Model):
    subject = models.ForeignKey(Subject, related_name="competencies", on_delete=models.CASCADE)
    code = models.CharField(max_length=32)
    title = models.CharField(max_length=240)
    mastery_threshold = models.PositiveSmallIntegerField(default=75)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["subject", "code"], name="unique_subject_competency")]

class LearningResource(models.Model):
    class ResourceType(models.TextChoices):
        LESSON = "lesson", "Lesson"
        EXAMPLE = "example", "Worked example"
        EXERCISE = "exercise", "Exercise"
        MODULE = "module", "Module"
        VIDEO = "video", "Video"
    class Purpose(models.TextChoices):
        REGULAR = "regular", "Regular class material"
        PREREQUISITE = "prerequisite", "Required before diagnostic"
        RECOVERY = "recovery", "Recovery/remediation material"
        ENRICHMENT = "enrichment", "Enrichment material"
    title = models.CharField(max_length=240)
    resource_type = models.CharField(max_length=16, choices=ResourceType.choices)
    difficulty = models.CharField(max_length=32, default="foundation")
    content = models.TextField()
    file = models.FileField(upload_to="learning-resources/%Y/%m/", null=True, blank=True)
    external_url = models.URLField(blank=True)
    original_filename = models.CharField(max_length=255, blank=True)
    mime_type = models.CharField(max_length=120, blank=True)
    passing_score = models.PositiveSmallIntegerField(default=70)
    purpose = models.CharField(max_length=16, choices=Purpose.choices, default=Purpose.REGULAR)
    competencies = models.ManyToManyField(Competency, related_name="resources")
    is_approved = models.BooleanField(default=False)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, related_name="uploaded_resources", on_delete=models.SET_NULL)
    created_at = models.DateTimeField(default=timezone.now, editable=False)

class LearningResourceChunk(models.Model):
    resource = models.ForeignKey(LearningResource, related_name="chunks", on_delete=models.CASCADE)
    position = models.PositiveIntegerField()
    heading = models.CharField(max_length=240, blank=True)
    content = models.TextField()
    locator = models.CharField(max_length=240, blank=True)
    keywords = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["resource_id", "position"]
        constraints = [models.UniqueConstraint(fields=["resource", "position"], name="unique_resource_chunk_position")]

class LearningAssignment(models.Model):
    resource = models.OneToOneField(LearningResource, related_name="assignment", on_delete=models.CASCADE)
    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="created_learning_assignments", on_delete=models.PROTECT)
    assigned_classes = models.ManyToManyField(AcademicClass, related_name="learning_assignments")
    instructions = models.TextField(blank=True)
    due_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["due_at", "-created_at"]

class LearningAssignmentProgress(models.Model):
    assignment = models.ForeignKey(LearningAssignment, related_name="progress_records", on_delete=models.CASCADE)
    student = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="learning_progress", on_delete=models.CASCADE)
    opened_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    playback_position_seconds = models.PositiveIntegerField(default=0)
    duration_seconds = models.PositiveIntegerField(default=0)
    last_viewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["assignment", "student"], name="unique_learning_assignment_student")]

class LearningAssignmentQuizAttempt(models.Model):
    assignment = models.ForeignKey(LearningAssignment, related_name="quiz_attempts", on_delete=models.CASCADE)
    student = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="learning_quiz_attempts", on_delete=models.CASCADE)
    answers = models.JSONField(default=dict)
    score = models.DecimalField(max_digits=5, decimal_places=2)
    passed = models.BooleanField(default=False)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-submitted_at", "-id"]

class PracticeQuestion(models.Model):
    class QuestionType(models.TextChoices):
        MULTIPLE_CHOICE = "mcq", "Multiple choice"
        TRUE_FALSE = "tf", "True/False"
        SHORT_ANSWER = "short", "Short answer"
    resource = models.ForeignKey(LearningResource, related_name="practice_questions", on_delete=models.CASCADE)
    prompt = models.TextField()
    question_type = models.CharField(max_length=8, choices=QuestionType.choices)
    options = models.JSONField(default=list)
    correct_answer = models.CharField(max_length=240)
    explanation = models.TextField(blank=True)
    position = models.PositiveSmallIntegerField(default=1)
    provenance = models.CharField(max_length=16, choices=[("extracted", "Extracted"), ("ai", "AI generated"), ("manual", "Manually authored")], default="manual")
    source_locator = models.CharField(max_length=240, blank=True)
    misconceptions = models.ManyToManyField("Misconception", related_name="practice_questions", blank=True)

    class Meta:
        ordering = ["position", "id"]

class Assessment(models.Model):
    class Kind(models.TextChoices):
        PRE = "pre", "Pre-assessment"
        POST = "post", "Post-assessment"
        REMEDIAL = "remedial", "Remedial exam"
    title = models.CharField(max_length=240)
    subject = models.ForeignKey(Subject, on_delete=models.PROTECT)
    kind = models.CharField(max_length=8, choices=Kind.choices)
    is_active = models.BooleanField(default=False)
    instructions = models.TextField(blank=True)
    due_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    assigned_classes = models.ManyToManyField(AcademicClass, related_name="assessments", blank=True)
    prerequisite_assignments = models.ManyToManyField(LearningAssignment, related_name="prerequisite_for_assessments", blank=True)

class Question(models.Model):
    class QuestionType(models.TextChoices):
        MULTIPLE_CHOICE = "mcq", "Multiple choice"
        TRUE_FALSE = "tf", "True/False"
        SHORT_ANSWER = "short", "Identification"
        ESSAY = "essay", "Short essay"
    assessment = models.ForeignKey(Assessment, related_name="questions", on_delete=models.CASCADE)
    competency = models.ForeignKey(Competency, on_delete=models.PROTECT)
    prompt = models.TextField()
    question_type = models.CharField(max_length=8, choices=QuestionType.choices)
    options = models.JSONField(default=list)
    correct_answer = models.TextField()
    character_limit = models.PositiveSmallIntegerField(default=500)
    source_resources = models.ManyToManyField(LearningResource, related_name="grounded_assessment_questions", blank=True)
    generation_metadata = models.JSONField(default=dict, blank=True)
    misconceptions = models.ManyToManyField("Misconception", related_name="assessment_questions", blank=True)


class AssessmentEligibility(models.Model):
    class Status(models.TextChoices):
        RECOMMENDED = "recommended", "Recommended for teacher review"
        ELIGIBLE = "eligible", "Eligible"
        EXEMPTED = "exempted", "Not required"
        COMPLETED = "completed", "Completed"

    assessment = models.ForeignKey(Assessment, related_name="eligibilities", on_delete=models.CASCADE)
    student = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="assessment_eligibilities", on_delete=models.CASCADE)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.RECOMMENDED)
    reason = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, related_name="reviewed_assessment_eligibilities", on_delete=models.PROTECT)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["assessment", "student"], name="unique_assessment_student_eligibility")]

class AssessmentAttempt(models.Model):
    class GradingStatus(models.TextChoices):
        AUTO_SCORED = "auto_scored", "Automatically scored"
        PENDING_REVIEW = "pending_review", "Awaiting teacher review"
        TEACHER_SCORED = "teacher_scored", "Teacher scored"

    assessment = models.ForeignKey(Assessment, on_delete=models.PROTECT)
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    submitted_at = models.DateTimeField(null=True, blank=True)
    score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    grading_status = models.CharField(max_length=16, choices=GradingStatus.choices, default=GradingStatus.AUTO_SCORED)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, related_name="reviewed_assessment_attempts", on_delete=models.PROTECT)
    reviewed_at = models.DateTimeField(null=True, blank=True)

class RemedialExamConsent(models.Model):
    class Status(models.TextChoices):
        REQUESTED = "requested", "Awaiting parent/guardian"
        APPROVED = "approved", "Approved"
        DECLINED = "declined", "Declined"
        REVOKED = "revoked", "Revoked"
        EXPIRED = "expired", "Expired"

    class Method(models.TextChoices):
        DIGITAL = "digital", "Digital response"
        PAPER = "paper", "Verified paper form"

    assessment = models.ForeignKey(Assessment, related_name="remedial_consents", on_delete=models.PROTECT)
    student = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="remedial_exam_consents", on_delete=models.CASCADE)
    guardian = models.ForeignKey(GuardianContact, null=True, blank=True, related_name="remedial_consents", on_delete=models.SET_NULL)
    guardian_name = models.CharField(max_length=150)
    guardian_relationship = models.CharField(max_length=80)
    guardian_email = models.EmailField(blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.REQUESTED)
    method = models.CharField(max_length=16, choices=Method.choices, default=Method.DIGITAL)
    policy_reference = models.CharField(max_length=180, default="DepEd DO 010, s. 2026")
    consent_text = models.TextField()
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="requested_remedial_consents", on_delete=models.PROTECT)
    requested_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    responded_at = models.DateTimeField(null=True, blank=True)
    identity_verification_method = models.CharField(max_length=40, default="verified_email_link")
    identity_verified_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, related_name="verified_remedial_consents", on_delete=models.PROTECT)
    evidence_file = models.FileField(upload_to="remedial-consents/%Y/%m/", blank=True)
    response_ip = models.GenericIPAddressField(null=True, blank=True)
    response_user_agent = models.CharField(max_length=300, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    withdrawal_reason = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        ordering = ["-requested_at", "-id"]
        constraints = [models.UniqueConstraint(fields=["assessment", "student"], name="unique_remedial_exam_consent")]

class StudentAnswer(models.Model):
    attempt = models.ForeignKey(AssessmentAttempt, related_name="answers", on_delete=models.CASCADE)
    question = models.ForeignKey(Question, on_delete=models.PROTECT)
    answer = models.TextField()
    is_correct = models.BooleanField(null=True, blank=True, default=None)
    score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    feedback = models.TextField(blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["attempt", "question"], name="unique_attempt_question_answer")]

class CompetencyResult(models.Model):
    class Status(models.TextChoices):
        MASTERED = "mastered", "Mastered"
        DEVELOPING = "developing", "Developing"
        REMEDIATION = "remediation", "Needs remediation"
    attempt = models.ForeignKey(AssessmentAttempt, related_name="competency_results", on_delete=models.CASCADE)
    competency = models.ForeignKey(Competency, on_delete=models.PROTECT)
    score = models.DecimalField(max_digits=5, decimal_places=2)
    status = models.CharField(max_length=16, choices=Status.choices)

class RecoveryPlan(models.Model):
    student = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="recovery_plans", on_delete=models.CASCADE)
    competency = models.ForeignKey(Competency, on_delete=models.PROTECT)
    baseline_score = models.DecimalField(max_digits=5, decimal_places=2)
    trigger_status = models.CharField(max_length=16, blank=True)
    trigger_attempt = models.ForeignKey(AssessmentAttempt, null=True, blank=True, related_name="generated_recovery_plans", on_delete=models.SET_NULL)
    status = models.CharField(max_length=16, default="active")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["student", "competency"], condition=models.Q(status="active"), name="unique_active_student_competency_plan"),
        ]

class RecoveryActivity(models.Model):
    plan = models.ForeignKey(RecoveryPlan, related_name="activities", on_delete=models.CASCADE)
    resource = models.ForeignKey(LearningResource, null=True, blank=True, on_delete=models.PROTECT)
    title = models.CharField(max_length=240)
    position = models.PositiveSmallIntegerField()
    due_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    recommendation_reason = models.TextField(blank=True)
    recommendation_metadata = models.JSONField(default=dict, blank=True)

class LearningRecommendationDecision(models.Model):
    class Decision(models.TextChoices):
        ACCEPTED = "accepted", "Accepted"
        DISMISSED = "dismissed", "Dismissed"

    student = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="learning_recommendation_decisions", on_delete=models.CASCADE)
    competency = models.ForeignKey(Competency, related_name="recommendation_decisions", on_delete=models.CASCADE)
    resource = models.ForeignKey(LearningResource, related_name="recommendation_decisions", on_delete=models.CASCADE)
    teacher = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="reviewed_learning_recommendations", on_delete=models.PROTECT)
    decision = models.CharField(max_length=12, choices=Decision.choices)
    score = models.DecimalField(max_digits=6, decimal_places=2)
    rationale = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]

class ActivityAttempt(models.Model):
    activity = models.ForeignKey(RecoveryActivity, related_name="attempts", on_delete=models.CASCADE)
    student = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="activity_attempts", on_delete=models.CASCADE)
    answers = models.JSONField(default=dict)
    score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]

class Intervention(models.Model):
    student = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="interventions", on_delete=models.CASCADE)
    teacher = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="assigned_interventions", on_delete=models.PROTECT)
    action = models.CharField(max_length=32)
    note = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

class AIConversation(models.Model):
    student = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="ai_conversations", on_delete=models.CASCADE)
    plan = models.ForeignKey(RecoveryPlan, null=True, blank=True, related_name="ai_conversations", on_delete=models.CASCADE)
    learning_assignment = models.ForeignKey(LearningAssignment, null=True, blank=True, related_name="ai_conversations", on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(models.Q(plan__isnull=False, learning_assignment__isnull=True) | models.Q(plan__isnull=True, learning_assignment__isnull=False)),
                name="ai_conversation_has_one_learning_context",
            ),
            models.UniqueConstraint(fields=["student", "plan"], condition=models.Q(plan__isnull=False), name="unique_student_plan_ai_conversation"),
            models.UniqueConstraint(fields=["student", "learning_assignment"], condition=models.Q(learning_assignment__isnull=False), name="unique_student_assignment_ai_conversation"),
        ]


class AICompanionSession(models.Model):
    class Stage(models.TextChoices):
        ORIENT = "orient", "Set the learning goal"
        EXPLAIN = "explain", "Understand the concept"
        EXAMPLE = "example", "Review an example"
        REASONING = "reasoning", "Explain your reasoning"
        PRACTICE = "practice", "Try independent practice"
        REFLECT = "reflect", "Reflect and summarize"
        COMPLETED = "completed", "Completed"

    conversation = models.ForeignKey(AIConversation, related_name="companion_sessions", on_delete=models.CASCADE)
    student = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="companion_sessions", on_delete=models.CASCADE)
    goal = models.CharField(max_length=240, blank=True)
    stage = models.CharField(max_length=16, choices=Stage.choices, default=Stage.ORIENT)
    summary = models.TextField(blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    completed_at = models.DateTimeField(null=True, blank=True)


class AIHelpRequest(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        ACKNOWLEDGED = "acknowledged", "Acknowledged"
        RESOLVED = "resolved", "Resolved"

    student = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="ai_help_requests", on_delete=models.CASCADE)
    plan = models.ForeignKey(RecoveryPlan, null=True, blank=True, related_name="help_requests", on_delete=models.SET_NULL)
    session = models.ForeignKey(AICompanionSession, null=True, blank=True, related_name="help_requests", on_delete=models.SET_NULL)
    competency = models.ForeignKey(Competency, null=True, blank=True, related_name="ai_help_requests", on_delete=models.SET_NULL)
    summary = models.TextField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

class AIMessage(models.Model):
    class Role(models.TextChoices):
        USER = "user", "User"
        ASSISTANT = "assistant", "Assistant"
    conversation = models.ForeignKey(AIConversation, related_name="messages", on_delete=models.CASCADE)
    role = models.CharField(max_length=12, choices=Role.choices)
    content = models.TextField()
    action = models.CharField(max_length=32, blank=True)
    provider = models.CharField(max_length=32, blank=True)
    model = models.CharField(max_length=120, blank=True)
    source_resource_ids = models.JSONField(default=list)
    source_citations = models.JSONField(default=list)
    grounding_status = models.CharField(max_length=24, default="grounded")
    latency_ms = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

class AIMessageFeedback(models.Model):
    class Rating(models.TextChoices):
        HELPFUL = "helpful", "Helpful"
        NOT_HELPFUL = "not_helpful", "Not helpful"
    message = models.OneToOneField(AIMessage, related_name="feedback", on_delete=models.CASCADE)
    student = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="ai_message_feedback", on_delete=models.CASCADE)
    rating = models.CharField(max_length=16, choices=Rating.choices)
    issue = models.CharField(max_length=32, blank=True)
    comment = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class AIMessageEvaluation(models.Model):
    """Human review evidence for claims about TALA safety and grounding."""

    message = models.OneToOneField(AIMessage, related_name="evaluation", on_delete=models.CASCADE)
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="ai_message_evaluations", on_delete=models.PROTECT)
    grounding_accurate = models.BooleanField()
    hallucination_detected = models.BooleanField(default=False)
    incorrect_answer_leakage = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    evaluated_at = models.DateTimeField(auto_now=True)


class Misconception(models.Model):
    competency = models.ForeignKey(Competency, related_name="misconceptions", on_delete=models.CASCADE)
    code = models.CharField(max_length=40)
    title = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, related_name="created_misconceptions", on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["competency__code", "title"]
        constraints = [models.UniqueConstraint(fields=["competency", "code"], name="unique_competency_misconception_code")]


class LearnerMisconception(models.Model):
    class Status(models.TextChoices):
        DETECTED = "detected", "Detected"
        CONFIRMED = "confirmed", "Teacher confirmed"
        DISMISSED = "dismissed", "Dismissed"
        RESOLVED = "resolved", "Resolved"

    student = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="misconception_signals", on_delete=models.CASCADE)
    misconception = models.ForeignKey(Misconception, related_name="learner_signals", on_delete=models.CASCADE)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DETECTED)
    confidence = models.PositiveSmallIntegerField(default=50)
    occurrence_count = models.PositiveIntegerField(default=1)
    source_question_ids = models.JSONField(default=list, blank=True)
    teacher_note = models.TextField(blank=True)
    first_observed_at = models.DateTimeField(auto_now_add=True)
    last_observed_at = models.DateTimeField(auto_now=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, related_name="reviewed_misconception_signals", on_delete=models.SET_NULL)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-last_observed_at"]
        constraints = [models.UniqueConstraint(fields=["student", "misconception"], name="unique_student_misconception_signal")]


class LearningGoal(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        ACHIEVED = "achieved", "Achieved"
        REVISED = "revised", "Revised"
        ARCHIVED = "archived", "Archived"

    student = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="learning_goals", on_delete=models.CASCADE)
    competency = models.ForeignKey(Competency, related_name="learning_goals", on_delete=models.CASCADE)
    plan = models.ForeignKey(RecoveryPlan, null=True, blank=True, related_name="learning_goals", on_delete=models.SET_NULL)
    title = models.CharField(max_length=240)
    target_score = models.PositiveSmallIntegerField(default=75)
    target_date = models.DateField(null=True, blank=True)
    progress_percent = models.PositiveSmallIntegerField(default=0)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, related_name="created_learning_goals", on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["status", "target_date", "-updated_at"]
        constraints = [models.UniqueConstraint(fields=["student", "competency"], condition=models.Q(status="active"), name="unique_active_student_competency_goal")]


class AdaptiveLearningState(models.Model):
    class Level(models.TextChoices):
        FOUNDATION = "foundation", "Foundation"
        GUIDED = "guided", "Guided"
        STANDARD = "standard", "Standard"
        CHALLENGE = "challenge", "Challenge"

    student = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="adaptive_learning_states", on_delete=models.CASCADE)
    competency = models.ForeignKey(Competency, related_name="adaptive_learning_states", on_delete=models.CASCADE)
    level = models.CharField(max_length=16, choices=Level.choices, default=Level.GUIDED)
    success_streak = models.PositiveSmallIntegerField(default=0)
    miss_streak = models.PositiveSmallIntegerField(default=0)
    reason = models.CharField(max_length=240, blank=True)
    last_signal_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["student", "competency"], name="unique_student_competency_adaptive_state")]


class UsabilityEvaluation(models.Model):
    class ParticipantRole(models.TextChoices):
        STUDENT = "student", "Student"
        TEACHER = "teacher", "Teacher"

    class Outcome(models.TextChoices):
        COMPLETED = "completed", "Completed"
        PARTIAL = "partial", "Partially completed"
        FAILED = "failed", "Failed"

    participant_code = models.CharField(max_length=40)
    participant_role = models.CharField(max_length=12, choices=ParticipantRole.choices)
    task_name = models.CharField(max_length=180)
    outcome = models.CharField(max_length=12, choices=Outcome.choices)
    duration_seconds = models.PositiveIntegerField(null=True, blank=True)
    error_count = models.PositiveSmallIntegerField(default=0)
    sus_score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="recorded_usability_evaluations", on_delete=models.PROTECT)
    recorded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-recorded_at", "-id"]


class ResearchEvaluationSnapshot(models.Model):
    """Immutable evidence package generated from a named, versioned dataset."""

    name = models.CharField(max_length=180)
    algorithm_version = models.CharField(max_length=80, default="evidence-rank-v1")
    dataset_version = models.CharField(max_length=80)
    period_start = models.DateTimeField(null=True, blank=True)
    period_end = models.DateTimeField(null=True, blank=True)
    metrics = models.JSONField(default=dict)
    record_counts = models.JSONField(default=dict)
    checksum_sha256 = models.CharField(max_length=64, unique=True)
    notes = models.TextField(blank=True)
    frozen_by = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="research_evaluation_snapshots", on_delete=models.PROTECT)
    frozen_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-frozen_at", "-id"]


class PrivacyRequest(models.Model):
    class RequestType(models.TextChoices):
        ACCESS = "access", "Access"
        CORRECTION = "correction", "Correction"
        EXPORT = "export", "Export"
        DELETION = "deletion", "Deletion"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        IN_REVIEW = "in_review", "In review"
        COMPLETED = "completed", "Completed"
        DENIED = "denied", "Denied"

    subject_user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="privacy_requests", on_delete=models.PROTECT)
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="submitted_privacy_requests", on_delete=models.PROTECT)
    request_type = models.CharField(max_length=12, choices=RequestType.choices)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.OPEN)
    details = models.TextField()
    resolution = models.TextField(blank=True)
    handled_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, related_name="handled_privacy_requests", on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]

class LearnerCompetencyEvidence(models.Model):
    class EvidenceType(models.TextChoices):
        DIAGNOSTIC = "diagnostic", "Diagnostic assessment"
        PRACTICE = "practice", "Recovery practice"
        MASTERY = "mastery", "Mastery assessment"
        INTERVENTION = "intervention", "Teacher intervention"
    student = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="competency_evidence", on_delete=models.CASCADE)
    competency = models.ForeignKey(Competency, related_name="learner_evidence", on_delete=models.CASCADE)
    evidence_type = models.CharField(max_length=16, choices=EvidenceType.choices)
    score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    source_type = models.CharField(max_length=40)
    source_id = models.PositiveIntegerField()
    summary = models.CharField(max_length=300)
    details = models.JSONField(default=dict, blank=True)
    occurred_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-occurred_at", "-id"]
        constraints = [models.UniqueConstraint(fields=["student", "competency", "evidence_type", "source_type", "source_id"], name="unique_learner_competency_evidence_source")]

class ContentImport(models.Model):
    class Kind(models.TextChoices):
        EXAM = "exam", "Exam"
        MODULE = "module", "Learning module"
        VIDEO = "video", "Video"
    class Status(models.TextChoices):
        UPLOADED = "uploaded", "Uploaded"
        PROCESSING = "processing", "Processing"
        NEEDS_REVIEW = "needs_review", "Needs review"
        PUBLISHED = "published", "Published"
        FAILED = "failed", "Failed"
        REJECTED = "rejected", "Rejected"
    title = models.CharField(max_length=240)
    kind = models.CharField(max_length=12, choices=Kind.choices)
    source_file = models.FileField(upload_to="content-imports/%Y/%m/")
    original_filename = models.CharField(max_length=255)
    mime_type = models.CharField(max_length=120)
    size_bytes = models.PositiveBigIntegerField()
    checksum_sha256 = models.CharField(max_length=64)
    subject = models.ForeignKey(Subject, related_name="content_imports", on_delete=models.PROTECT)
    competency = models.ForeignKey(Competency, null=True, blank=True, related_name="content_imports", on_delete=models.PROTECT)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="content_imports", on_delete=models.PROTECT)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.UPLOADED)
    configuration = models.JSONField(default=dict)
    extracted_text = models.TextField(blank=True)
    extracted_payload = models.JSONField(default=dict)
    error_message = models.TextField(blank=True)
    published_assessment = models.ForeignKey(Assessment, null=True, blank=True, related_name="source_imports", on_delete=models.SET_NULL)
    published_resource = models.ForeignKey(LearningResource, null=True, blank=True, related_name="source_imports", on_delete=models.SET_NULL)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, related_name="reviewed_content_imports", on_delete=models.SET_NULL)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    archived_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, related_name="archived_content_imports", on_delete=models.SET_NULL)
    archived_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

class Notification(models.Model):
    class Kind(models.TextChoices):
        PLAN_ASSIGNED = "plan_assigned", "Recovery plan assigned"
        ACTIVITY_DUE = "activity_due", "Activity due"
        ACTIVITY_OVERDUE = "activity_overdue", "Activity overdue"
        PLAN_PROGRESS = "plan_progress", "Recovery plan progress"
        ASSESSMENT_RESULT = "assessment_result", "Assessment result"
        INTERVENTION = "intervention", "Teacher intervention"
        CONTENT_REVIEW = "content_review", "Content awaiting review"
        CONTENT_PUBLISHED = "content_published", "Learning content published"
        LEARNING_ASSIGNED = "learning_assigned", "Learning material assigned"
        PRIVACY_REQUEST = "privacy_request", "Privacy request"
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="notifications", on_delete=models.CASCADE)
    kind = models.CharField(max_length=32, choices=Kind.choices)
    title = models.CharField(max_length=180)
    message = models.TextField()
    action_url = models.CharField(max_length=240, blank=True)
    deduplication_key = models.CharField(max_length=180, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [models.UniqueConstraint(fields=["recipient", "deduplication_key"], condition=~models.Q(deduplication_key=""), name="unique_recipient_notification_key")]

class NotificationPreference(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, related_name="notification_preference", on_delete=models.CASCADE)
    in_app_enabled = models.BooleanField(default=True)
    email_enabled = models.BooleanField(default=False)
    push_enabled = models.BooleanField(default=True)
    reminders_enabled = models.BooleanField(default=True)
    quiet_hours_start = models.TimeField(null=True, blank=True)
    quiet_hours_end = models.TimeField(null=True, blank=True)

class NotificationDelivery(models.Model):
    class Channel(models.TextChoices):
        EMAIL = "email", "Email"
        PUSH = "push", "Push"
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"
        SKIPPED = "skipped", "Skipped"
    notification = models.ForeignKey(Notification, related_name="deliveries", on_delete=models.CASCADE)
    channel = models.CharField(max_length=12, choices=Channel.choices)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    attempt_count = models.PositiveSmallIntegerField(default=0)
    error_message = models.TextField(blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["notification", "channel"], name="unique_notification_delivery_channel")]

class DeviceRegistration(models.Model):
    class Platform(models.TextChoices):
        ANDROID = "android", "Android"
        IOS = "ios", "iOS"
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name="devices", on_delete=models.CASCADE)
    platform = models.CharField(max_length=12, choices=Platform.choices)
    push_token = models.CharField(max_length=255, unique=True)
    is_active = models.BooleanField(default=True)
    last_seen_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

class AuditEvent(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, related_name="audit_events", on_delete=models.SET_NULL)
    action = models.CharField(max_length=80)
    object_type = models.CharField(max_length=80)
    object_id = models.CharField(max_length=80)
    metadata = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]


class SystemConfiguration(models.Model):
    """Non-secret settings that administrators may safely manage in the product."""

    school_year = models.CharField(max_length=16, default="2026-2027")
    default_mastery_threshold = models.PositiveSmallIntegerField(default=75)
    developing_support_policy = models.CharField(max_length=16, choices=[("monitor", "Monitor only"), ("guided", "Guided support plan"), ("full", "Full recovery plan")], default="guided")
    reminder_hour = models.PositiveSmallIntegerField(default=7)
    reminder_days_before = models.PositiveSmallIntegerField(default=2)
    inactivity_days = models.PositiveSmallIntegerField(default=3)
    inactivity_reminder_cooldown_days = models.PositiveSmallIntegerField(default=3)
    consent_policy_version = models.CharField(max_length=40, default="DRAFT-1")
    consent_policy_approved = models.BooleanField(default=False)
    consent_expiry_days = models.PositiveSmallIntegerField(default=30)
    minor_data_retention_days = models.PositiveIntegerField(default=1825)
    privacy_contact_email = models.EmailField(blank=True)
    privacy_notice_version = models.CharField(max_length=40, default="TALA-PRIVACY-1")
    privacy_notice_text = models.TextField(default="I acknowledge that TALA-AI records my account details, learning activities, assessment results, and recovery progress for the school's ARAL academic support program. I understand that I may contact the school to request access or correction of my information.")
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        value, _ = cls.objects.get_or_create(pk=1)
        return value
