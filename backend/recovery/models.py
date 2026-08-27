from django.conf import settings
from django.db import models

class AcademicClass(models.Model):
    name = models.CharField(max_length=120)
    grade_level = models.PositiveSmallIntegerField()
    school_year = models.CharField(max_length=16)

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
    academic_class = models.ForeignKey(AcademicClass, null=True, blank=True, related_name="members", on_delete=models.SET_NULL)
    assigned_classes = models.ManyToManyField(AcademicClass, related_name="assigned_teachers", blank=True)
    assigned_subjects = models.ManyToManyField("Subject", related_name="assigned_teachers", blank=True)
    is_active = models.BooleanField(default=True)

class Subject(models.Model):
    name = models.CharField(max_length=120, unique=True)
    code = models.CharField(max_length=24, unique=True)

    def __str__(self):
        return self.name

class Competency(models.Model):
    subject = models.ForeignKey(Subject, related_name="competencies", on_delete=models.CASCADE)
    code = models.CharField(max_length=32)
    title = models.CharField(max_length=240)
    mastery_threshold = models.PositiveSmallIntegerField(default=75)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["subject", "code"], name="unique_subject_competency")]

class LearningResource(models.Model):
    class ResourceType(models.TextChoices):
        LESSON = "lesson", "Lesson"
        EXAMPLE = "example", "Worked example"
        EXERCISE = "exercise", "Exercise"
    title = models.CharField(max_length=240)
    resource_type = models.CharField(max_length=16, choices=ResourceType.choices)
    difficulty = models.CharField(max_length=32, default="foundation")
    content = models.TextField()
    competencies = models.ManyToManyField(Competency, related_name="resources")
    is_approved = models.BooleanField(default=False)

class Assessment(models.Model):
    class Kind(models.TextChoices):
        PRE = "pre", "Pre-assessment"
        POST = "post", "Post-assessment"
    title = models.CharField(max_length=240)
    subject = models.ForeignKey(Subject, on_delete=models.PROTECT)
    kind = models.CharField(max_length=8, choices=Kind.choices)
    is_active = models.BooleanField(default=False)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    assigned_classes = models.ManyToManyField(AcademicClass, related_name="assessments", blank=True)

class Question(models.Model):
    class QuestionType(models.TextChoices):
        MULTIPLE_CHOICE = "mcq", "Multiple choice"
        TRUE_FALSE = "tf", "True/False"
    assessment = models.ForeignKey(Assessment, related_name="questions", on_delete=models.CASCADE)
    competency = models.ForeignKey(Competency, on_delete=models.PROTECT)
    prompt = models.TextField()
    question_type = models.CharField(max_length=4, choices=QuestionType.choices)
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
