from django.conf import settings
from django.db import models
from django.utils import timezone

class AcademicClass(models.Model):
    name = models.CharField(max_length=120)
    grade_level = models.PositiveSmallIntegerField()
    school_year = models.CharField(max_length=16)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name_plural = "academic classes"

    def __str__(self):
        return f"Grade {self.grade_level} – {self.name}"

class UserProfile(models.Model):
    class Role(models.TextChoices):
        STUDENT = "student", "Student"
        TEACHER = "teacher", "Teacher / ARAL Tutor"
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

class StudentProfile(models.Model):
    profile = models.OneToOneField(UserProfile, related_name="student_details", on_delete=models.CASCADE)
    student_number = models.CharField(max_length=40, unique=True, null=True, blank=True)
    learner_reference_number = models.CharField(max_length=40, blank=True)

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
    title = models.CharField(max_length=240)
    resource_type = models.CharField(max_length=16, choices=ResourceType.choices)
    difficulty = models.CharField(max_length=32, default="foundation")
    content = models.TextField()
    file = models.FileField(upload_to="learning-resources/%Y/%m/", null=True, blank=True)
    external_url = models.URLField(blank=True)
    original_filename = models.CharField(max_length=255, blank=True)
    mime_type = models.CharField(max_length=120, blank=True)
    passing_score = models.PositiveSmallIntegerField(default=70)
    competencies = models.ManyToManyField(Competency, related_name="resources")
    is_approved = models.BooleanField(default=False)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, related_name="uploaded_resources", on_delete=models.SET_NULL)
    created_at = models.DateTimeField(default=timezone.now, editable=False)

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

    class Meta:
        ordering = ["position", "id"]

class Assessment(models.Model):
    class Kind(models.TextChoices):
        PRE = "pre", "Pre-assessment"
        POST = "post", "Post-assessment"
    title = models.CharField(max_length=240)
    subject = models.ForeignKey(Subject, on_delete=models.PROTECT)
    kind = models.CharField(max_length=8, choices=Kind.choices)
    is_active = models.BooleanField(default=False)
    instructions = models.TextField(blank=True)
    due_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    assigned_classes = models.ManyToManyField(AcademicClass, related_name="assessments", blank=True)

class Question(models.Model):
    class QuestionType(models.TextChoices):
        MULTIPLE_CHOICE = "mcq", "Multiple choice"
        TRUE_FALSE = "tf", "True/False"
        SHORT_ANSWER = "short", "Short answer"
    assessment = models.ForeignKey(Assessment, related_name="questions", on_delete=models.CASCADE)
    competency = models.ForeignKey(Competency, on_delete=models.PROTECT)
    prompt = models.TextField()
    question_type = models.CharField(max_length=8, choices=QuestionType.choices)
    options = models.JSONField(default=list)
    correct_answer = models.CharField(max_length=240)

class AssessmentAttempt(models.Model):
    assessment = models.ForeignKey(Assessment, on_delete=models.PROTECT)
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    submitted_at = models.DateTimeField(null=True, blank=True)
    score = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)

class StudentAnswer(models.Model):
    attempt = models.ForeignKey(AssessmentAttempt, related_name="answers", on_delete=models.CASCADE)
    question = models.ForeignKey(Question, on_delete=models.PROTECT)
    answer = models.CharField(max_length=240)
    is_correct = models.BooleanField(default=False)

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
    status = models.CharField(max_length=16, default="active")
    created_at = models.DateTimeField(auto_now_add=True)

class RecoveryActivity(models.Model):
    plan = models.ForeignKey(RecoveryPlan, related_name="activities", on_delete=models.CASCADE)
    resource = models.ForeignKey(LearningResource, null=True, blank=True, on_delete=models.PROTECT)
    title = models.CharField(max_length=240)
    position = models.PositiveSmallIntegerField()
    due_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

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
    plan = models.ForeignKey(RecoveryPlan, related_name="ai_conversations", on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

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
    created_at = models.DateTimeField(auto_now_add=True)

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
        CONTENT_PUBLISHED = "content_published", "Learning content published"
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
    reminder_hour = models.PositiveSmallIntegerField(default=7)
    reminder_days_before = models.PositiveSmallIntegerField(default=2)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        value, _ = cls.objects.get_or_create(pk=1)
        return value
