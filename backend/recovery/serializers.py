import hashlib
from pathlib import Path
from urllib.parse import urlencode

from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from .models import AcademicClass, ActivityAttempt, Assessment, AssessmentAttempt, AuditEvent, Competency, CompetencyResult, ContentImport, DeviceRegistration, EmergencyContact, EmployeeProfile, GuardianContact, Intervention, LearningResource, Notification, NotificationPreference, PracticeQuestion, Question, RecoveryActivity, RecoveryPlan, StudentProfile, Subject, SystemConfiguration, UserProfile
from .secure_media import create_media_token


def protected_media_url(request, kind, object_id, path):
    if not request or not request.user.is_authenticated:
        return ""
    query = urlencode({"token": create_media_token(kind, object_id, request.user.id)})
    return request.build_absolute_uri(f"{path}?{query}")

class AcademicClassSerializer(serializers.ModelSerializer):
    label = serializers.CharField(source="__str__", read_only=True)
    student_count = serializers.IntegerField(source="members.count", read_only=True)
    teacher_count = serializers.IntegerField(source="assigned_teachers.count", read_only=True)
    class Meta:
        model = AcademicClass
        fields = ["id", "name", "grade_level", "school_year", "is_active", "label", "student_count", "teacher_count"]

class SubjectSerializer(serializers.ModelSerializer):
    competency_count = serializers.IntegerField(source="competencies.count", read_only=True)
    class Meta:
        model = Subject
        fields = ["id", "name", "code", "is_active", "competency_count"]

class UserAdminSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=UserProfile.Role.choices)
    academic_class = serializers.PrimaryKeyRelatedField(queryset=AcademicClass.objects.all(), allow_null=True, required=False)
    assigned_classes = serializers.PrimaryKeyRelatedField(queryset=AcademicClass.objects.all(), many=True, required=False)
    assigned_subjects = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all(), many=True, required=False)
    is_active = serializers.BooleanField(required=False, default=True)
    assignment = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    password = serializers.CharField(write_only=True, min_length=8, required=False)
    last_login = serializers.DateTimeField(read_only=True)
    date_joined = serializers.DateTimeField(read_only=True)
    mfa_enabled = serializers.BooleanField(read_only=True)
    must_change_password = serializers.BooleanField(read_only=True)
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    gender = serializers.CharField(required=False, allow_blank=True, max_length=32)
    phone = serializers.CharField(required=False, allow_blank=True, max_length=32)
    student_number = serializers.CharField(required=False, allow_blank=True, max_length=40)
    employee_id = serializers.CharField(required=False, allow_blank=True, max_length=40)

    def validate_email(self, value):
        queryset = get_user_model().objects.filter(username__iexact=value)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value.casefold()

    def validate_password(self, value):
        validate_password(value, self.instance)
        return value

    def validate(self, attrs):
        role = attrs.get("role", getattr(getattr(self.instance, "tala_profile", None), "role", None))
        request = self.context.get("request")
        if self.instance and request and request.user == self.instance:
            if attrs.get("is_active") is False:
                raise serializers.ValidationError({"is_active": "You cannot deactivate your own account."})
            if "role" in attrs and attrs["role"] != self.instance.tala_profile.role:
                raise serializers.ValidationError({"role": "You cannot change your own administrator role."})
        if not self.instance and not attrs.get("password"):
            raise serializers.ValidationError({"password": "A temporary password is required."})
        if role == UserProfile.Role.STUDENT and not attrs.get("academic_class", getattr(getattr(self.instance, "tala_profile", None), "academic_class", None)):
            raise serializers.ValidationError({"academic_class": "Assign the student to a class."})
        return attrs

    def _apply_profile(self, user, validated_data):
        profile = user.tala_profile
        profile.role = validated_data.get("role", profile.role)
        profile.is_active = validated_data.get("is_active", profile.is_active)
        profile.academic_class = validated_data.get("academic_class", profile.academic_class) if profile.role == UserProfile.Role.STUDENT else None
        for field in ("date_of_birth", "gender", "phone"):
            if field in validated_data:
                setattr(profile, field, validated_data[field])
        profile.save()
        if profile.role == UserProfile.Role.STUDENT:
            details, _ = StudentProfile.objects.get_or_create(profile=profile)
            if "student_number" in validated_data:
                details.student_number = validated_data["student_number"] or None
            details.save()
        else:
            details, _ = EmployeeProfile.objects.get_or_create(profile=profile)
            if "employee_id" in validated_data:
                details.employee_id = validated_data["employee_id"] or None
            details.save()
        profile.assigned_classes.set(validated_data.get("assigned_classes", []) if profile.role == UserProfile.Role.TEACHER else [])
        profile.assigned_subjects.set(validated_data.get("assigned_subjects", []) if profile.role == UserProfile.Role.TEACHER else [])
        user.is_active = profile.is_active
        user.save(update_fields=["is_active"])

    def create(self, validated_data):
        User = get_user_model()
        password = validated_data.pop("password")
        related = {key: validated_data.pop(key, []) for key in ("assigned_classes", "assigned_subjects")}
        name_parts = validated_data["name"].strip().split(maxsplit=1)
        user = User.objects.create_user(username=validated_data["email"], email=validated_data["email"], password=password, first_name=name_parts[0], last_name=name_parts[1] if len(name_parts) > 1 else "", is_active=validated_data.get("is_active", True))
        UserProfile.objects.create(user=user, role=validated_data["role"])
        self._apply_profile(user, {**validated_data, **related})
        return user

    def update(self, user, validated_data):
        password = validated_data.pop("password", None)
        related = {key: validated_data.pop(key, None) for key in ("assigned_classes", "assigned_subjects")}
        name_parts = validated_data.pop("name", user.get_full_name()).strip().split(maxsplit=1)
        user.first_name = name_parts[0]
        user.last_name = name_parts[1] if len(name_parts) > 1 else ""
        if "email" in validated_data:
            user.email = validated_data["email"]
            user.username = validated_data["email"]
        if password:
            user.set_password(password)
        user.save()
        profile_data = {**validated_data}
        for key, value in related.items():
            if value is not None:
                profile_data[key] = value
        self._apply_profile(user, profile_data)
        return user

    def to_representation(self, user):
        profile = user.tala_profile
        if profile.role == UserProfile.Role.STUDENT:
            assignment = str(profile.academic_class) if profile.academic_class else "Unassigned"
        elif profile.role == UserProfile.Role.TEACHER:
            assignment = f"{profile.assigned_classes.count()} classes · {profile.assigned_subjects.count()} subjects"
        else:
            assignment = "System administration"
        student_details = getattr(profile, "student_details", None)
        employee_details = getattr(profile, "employee_details", None)
        return {"id": user.id, "name": user.get_full_name() or user.username, "email": user.email, "role": profile.role, "academic_class": profile.academic_class_id, "assigned_classes": list(profile.assigned_classes.values_list("id", flat=True)), "assigned_subjects": list(profile.assigned_subjects.values_list("id", flat=True)), "assignment": assignment, "status": "Active" if profile.is_active and user.is_active else "Inactive", "is_active": profile.is_active and user.is_active, "last_login": user.last_login, "date_joined": user.date_joined, "mfa_enabled": profile.mfa_enabled, "must_change_password": profile.must_change_password, "date_of_birth": profile.date_of_birth, "gender": profile.gender, "phone": profile.phone, "student_number": student_details.student_number if student_details else "", "employee_id": employee_details.employee_id if employee_details else ""}

class CompetencySerializer(serializers.ModelSerializer):
    class Meta:
        model = Competency
        fields = ["id", "subject", "code", "title", "mastery_threshold", "is_active"]

    def validate_mastery_threshold(self, value):
        if not 1 <= value <= 100:
            raise serializers.ValidationError("Enter a threshold from 1 to 100.")
        return value


class ProfileSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(max_length=150)
    email = serializers.EmailField(read_only=True)
    role = serializers.CharField(read_only=True)
    class_name = serializers.CharField(read_only=True)
    assignments = serializers.ListField(read_only=True)
    mfa_enabled = serializers.BooleanField(read_only=True)
    preferred_name = serializers.CharField(required=False, allow_blank=True, max_length=100)
    avatar = serializers.FileField(required=False)
    avatar_url = serializers.CharField(read_only=True)
    date_of_birth = serializers.DateField(read_only=True, allow_null=True)
    gender = serializers.CharField(required=False, allow_blank=True, max_length=32)
    phone = serializers.CharField(required=False, allow_blank=True, max_length=32)
    address_line = serializers.CharField(required=False, allow_blank=True, max_length=180)
    city_municipality = serializers.CharField(required=False, allow_blank=True, max_length=100)
    province = serializers.CharField(required=False, allow_blank=True, max_length=100)
    postal_code = serializers.CharField(required=False, allow_blank=True, max_length=16)
    identifier = serializers.CharField(read_only=True)
    emergency_contacts = serializers.ListField(child=serializers.DictField(), required=False)
    guardian_contacts = serializers.ListField(child=serializers.DictField(), read_only=True)

    def validate_avatar(self, value):
        if value.size > 5 * 1024 * 1024:
            raise serializers.ValidationError("Profile photos must be 5 MB or smaller.")
        if getattr(value, "content_type", "") not in {"image/jpeg", "image/png", "image/webp"}:
            raise serializers.ValidationError("Choose a JPEG, PNG, or WebP image.")
        return value

    def update(self, user, validated_data):
        if "name" in validated_data:
            parts = validated_data.pop("name").strip().split(maxsplit=1)
            user.first_name = parts[0]
            user.last_name = parts[1] if len(parts) > 1 else ""
            user.save(update_fields=["first_name", "last_name"])
        contacts = validated_data.pop("emergency_contacts", None)
        profile = user.tala_profile
        for field, value in validated_data.items():
            setattr(profile, field, value)
        profile.save()
        if contacts is not None:
            profile.emergency_contacts.all().delete()
            for item in contacts[:3]:
                EmergencyContact.objects.create(profile=profile, name=str(item.get("name", ""))[:150], relationship=str(item.get("relationship", ""))[:80], phone=str(item.get("phone", ""))[:32], email=str(item.get("email", ""))[:254], is_primary=bool(item.get("is_primary", False)))
        return user

    def to_representation(self, user):
        profile = user.tala_profile
        assignments = []
        if profile.role == UserProfile.Role.TEACHER:
            assignments = [str(item) for item in profile.assigned_classes.all()] + list(profile.assigned_subjects.values_list("name", flat=True))
        elif profile.academic_class:
            assignments = [str(profile.academic_class)]
        request = self.context.get("request")
        student_details = getattr(profile, "student_details", None)
        employee_details = getattr(profile, "employee_details", None)
        avatar_url = protected_media_url(request, "avatar", profile.id, f"/api/auth/profile/avatar/{profile.id}/") if profile.avatar else ""
        return {"id": user.id, "name": user.get_full_name() or user.username, "email": user.email, "role": profile.role, "class_name": str(profile.academic_class) if profile.academic_class else "", "assignments": assignments, "mfa_enabled": profile.mfa_enabled, "preferred_name": profile.preferred_name, "avatar_url": avatar_url, "date_of_birth": profile.date_of_birth, "gender": profile.gender, "phone": profile.phone, "address_line": profile.address_line, "city_municipality": profile.city_municipality, "province": profile.province, "postal_code": profile.postal_code, "identifier": student_details.student_number if student_details else employee_details.employee_id if employee_details else "", "emergency_contacts": list(profile.emergency_contacts.values("id", "name", "relationship", "phone", "email", "is_primary")), "guardian_contacts": list(profile.guardian_contacts.values("id", "name", "relationship", "phone", "email", "receives_progress_updates", "consent_recorded_at"))}


class SystemConfigurationSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemConfiguration
        fields = ["school_year", "default_mastery_threshold", "reminder_hour", "reminder_days_before", "updated_at"]
        read_only_fields = ["updated_at"]

    def validate_default_mastery_threshold(self, value):
        if not 1 <= value <= 100:
            raise serializers.ValidationError("Enter a threshold from 1 to 100.")
        return value

    def validate_reminder_hour(self, value):
        if not 0 <= value <= 23:
            raise serializers.ValidationError("Enter an hour from 0 to 23.")
        return value


class AuditEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source="actor.get_full_name", read_only=True)
    class Meta:
        model = AuditEvent
        fields = ["id", "actor", "actor_name", "action", "object_type", "object_id", "metadata", "created_at"]

class PracticeQuestionPublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = PracticeQuestion
        fields = ["id", "prompt", "question_type", "options", "position"]

class PracticeQuestionEditorSerializer(serializers.ModelSerializer):
    class Meta:
        model = PracticeQuestion
        fields = ["id", "prompt", "question_type", "options", "correct_answer", "explanation", "position"]

class ResourceSerializer(serializers.ModelSerializer):
    practice_questions = serializers.SerializerMethodField()
    file_url = serializers.SerializerMethodField()
    def get_practice_questions(self, resource):
        request = self.context.get("request")
        profile = getattr(getattr(request, "user", None), "tala_profile", None)
        serializer = PracticeQuestionEditorSerializer if profile and profile.role in {UserProfile.Role.TEACHER, UserProfile.Role.ADMIN} else PracticeQuestionPublicSerializer
        return serializer(resource.practice_questions.all(), many=True).data
    def get_file_url(self, resource):
        if not resource.file:
            return ""
        request = self.context.get("request")
        path = f"/api/resources/{resource.id}/file/"
        return protected_media_url(request, "resource", resource.id, path)
    class Meta:
        model = LearningResource
        fields = ["id", "title", "resource_type", "difficulty", "content", "file_url", "external_url", "original_filename", "mime_type", "passing_score", "competencies", "practice_questions", "is_approved", "created_at"]
        read_only_fields = ["original_filename", "mime_type", "created_at"]

class AssessmentSerializer(serializers.ModelSerializer):
    question_count = serializers.IntegerField(source="questions.count", read_only=True)
    competency_ids = serializers.SerializerMethodField()
    available = serializers.SerializerMethodField()
    availability_reason = serializers.SerializerMethodField()
    remaining_activities = serializers.SerializerMethodField()
    def _remaining_activities(self, assessment):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated or assessment.kind != Assessment.Kind.POST:
            return 0
        competency_ids = assessment.questions.values_list("competency_id", flat=True)
        return RecoveryActivity.objects.filter(
            plan__student=request.user,
            plan__status="active",
            plan__competency_id__in=competency_ids,
            resource__isnull=False,
            completed_at__isnull=True,
        ).count()
    def get_available(self, assessment):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated or assessment.kind == Assessment.Kind.PRE:
            return assessment.is_active
        return assessment.is_active and self._remaining_activities(assessment) == 0
    def get_remaining_activities(self, assessment):
        return self._remaining_activities(assessment)
    def get_availability_reason(self, assessment):
        if not assessment.is_active:
            return "This assessment has not been activated by your teacher."
        remaining = self._remaining_activities(assessment)
        if remaining:
            noun = "activity" if remaining == 1 else "activities"
            return f"Complete {remaining} remaining recovery {noun} to unlock this mastery assessment."
        return ""
    def get_competency_ids(self, assessment):
        return list(assessment.questions.values_list("competency_id", flat=True).distinct())
    def validate(self, attrs):
        activating = attrs.get("is_active", getattr(self.instance, "is_active", False))
        if activating and self.instance:
            assigned_classes = attrs.get("assigned_classes")
            has_classes = bool(assigned_classes) if assigned_classes is not None else self.instance.assigned_classes.exists()
            if not has_classes:
                raise serializers.ValidationError({"assigned_classes": "Assign at least one class before activation."})
            if not self.instance.questions.exists():
                raise serializers.ValidationError({"is_active": "Add at least one question before activation."})
        return attrs
    class Meta:
        model = Assessment
        fields = ["id", "title", "subject", "kind", "instructions", "due_at", "is_active", "available", "availability_reason", "remaining_activities", "created_by", "question_count", "competency_ids", "assigned_classes"]
        read_only_fields = ["created_by"]

class QuestionPublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = ["id", "competency", "prompt", "question_type", "options"]

class QuestionEditorSerializer(serializers.ModelSerializer):
    competency_title = serializers.CharField(source="competency.title", read_only=True)
    class Meta:
        model = Question
        fields = ["id", "competency", "competency_title", "prompt", "question_type", "options", "correct_answer"]

class AssessmentDetailSerializer(AssessmentSerializer):
    questions = serializers.SerializerMethodField()
    def get_questions(self, assessment):
        request = self.context.get("request")
        profile = getattr(getattr(request, "user", None), "tala_profile", None)
        serializer = QuestionEditorSerializer if profile and profile.role in {UserProfile.Role.TEACHER, UserProfile.Role.ADMIN} else QuestionPublicSerializer
        questions = assessment.questions.select_related("competency")
        target_competency_id = self.context.get("target_competency_id")
        if target_competency_id:
            questions = questions.filter(competency_id=target_competency_id)
        return serializer(questions, many=True).data
    class Meta(AssessmentSerializer.Meta):
        fields = AssessmentSerializer.Meta.fields + ["questions"]

class CompetencyResultSerializer(serializers.ModelSerializer):
    competency_title = serializers.CharField(source="competency.title", read_only=True)
    class Meta:
        model = CompetencyResult
        fields = ["id", "competency", "competency_title", "score", "status"]

class AssessmentAttemptSerializer(serializers.ModelSerializer):
    competency_results = CompetencyResultSerializer(many=True, read_only=True)
    class Meta:
        model = AssessmentAttempt
        fields = ["id", "assessment", "student", "submitted_at", "score", "competency_results"]

class RecoveryActivitySerializer(serializers.ModelSerializer):
    resource_title = serializers.CharField(source="resource.title", read_only=True)
    resource_type = serializers.CharField(source="resource.resource_type", read_only=True)
    content = serializers.CharField(source="resource.content", read_only=True)
    file_url = serializers.SerializerMethodField()
    practice_questions = PracticeQuestionPublicSerializer(source="resource.practice_questions", many=True, read_only=True)
    passing_score = serializers.IntegerField(source="resource.passing_score", read_only=True)
    review = serializers.SerializerMethodField()
    def get_file_url(self, activity):
        if not activity.resource or not activity.resource.file:
            return ""
        request = self.context.get("request")
        path = f"/api/resources/{activity.resource.id}/file/"
        return protected_media_url(request, "resource", activity.resource.id, path)
    def get_review(self, activity):
        request = self.context.get("request")
        if not activity.completed_at or not request or not request.user.is_authenticated or activity.plan.student_id != request.user.id:
            return None
        attempt = activity.attempts.filter(student=request.user, completed_at__isnull=False).first()
        if not attempt or not activity.resource:
            return None
        questions = activity.resource.practice_questions.all()
        return {
            "answers": {str(key): str(value) for key, value in attempt.answers.items()},
            "score": attempt.score,
            "completed_at": attempt.completed_at,
            "feedback": [
                {
                    "question_id": question.id,
                    "student_answer": str(attempt.answers.get(str(question.id), attempt.answers.get(question.id, ""))),
                    "correct_answer": question.correct_answer,
                    "is_correct": str(attempt.answers.get(str(question.id), attempt.answers.get(question.id, ""))).strip().casefold() == question.correct_answer.strip().casefold(),
                    "explanation": question.explanation,
                }
                for question in questions
            ],
        }
    class Meta:
        model = RecoveryActivity
        fields = ["id", "title", "position", "due_at", "completed_at", "resource", "resource_title", "resource_type", "content", "file_url", "practice_questions", "passing_score", "review"]

class RecoveryPlanSerializer(serializers.ModelSerializer):
    activities = RecoveryActivitySerializer(many=True, read_only=True)
    competency_title = serializers.CharField(source="competency.title", read_only=True)
    mastery_assessment = serializers.SerializerMethodField()
    def get_mastery_assessment(self, plan):
        request = self.context.get("request")
        profile = getattr(getattr(request, "user", None), "tala_profile", None)
        if not request or not request.user.is_authenticated or request.user.id != plan.student_id or not profile or not profile.academic_class_id:
            return None
        assessment = Assessment.objects.filter(
            kind=Assessment.Kind.POST,
            is_active=True,
            assigned_classes=profile.academic_class,
            questions__competency=plan.competency,
        ).distinct().first()
        if not assessment:
            return None
        remaining = RecoveryActivity.objects.filter(
            plan__student=request.user,
            plan__status="active",
            plan__competency=plan.competency,
            resource__isnull=False,
            completed_at__isnull=True,
        ).count()
        noun = "activity" if remaining == 1 else "activities"
        return {
            "id": assessment.id,
            "title": assessment.title,
            "available": remaining == 0,
            "remaining_activities": remaining,
            "availability_reason": f"Complete {remaining} remaining recovery {noun} for this competency." if remaining else "",
        }
    class Meta:
        model = RecoveryPlan
        fields = ["id", "student", "competency", "competency_title", "baseline_score", "status", "created_at", "activities", "mastery_assessment"]

class InterventionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Intervention
        fields = ["id", "student", "teacher", "action", "note", "created_at"]
        read_only_fields = ["teacher", "created_at"]

class ActivityAttemptSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActivityAttempt
        fields = ["id", "activity", "student", "answers", "score", "started_at", "completed_at"]
        read_only_fields = ["student", "score", "started_at", "completed_at"]

class ContentImportSerializer(serializers.ModelSerializer):
    source_file_url = serializers.SerializerMethodField()
    published_assessment_title = serializers.CharField(source="published_assessment.title", read_only=True)
    published_resource_title = serializers.CharField(source="published_resource.title", read_only=True)

    class Meta:
        model = ContentImport
        fields = ["id", "title", "kind", "source_file", "source_file_url", "original_filename", "mime_type", "size_bytes", "checksum_sha256", "subject", "competency", "uploaded_by", "status", "configuration", "extracted_text", "extracted_payload", "error_message", "published_assessment", "published_assessment_title", "published_resource", "published_resource_title", "reviewed_by", "reviewed_at", "created_at", "updated_at"]
        read_only_fields = ["original_filename", "mime_type", "size_bytes", "checksum_sha256", "uploaded_by", "status", "extracted_text", "error_message", "published_assessment", "published_resource", "reviewed_by", "reviewed_at", "created_at", "updated_at"]
        extra_kwargs = {"source_file": {"write_only": True}}

    def get_source_file_url(self, content_import):
        request = self.context.get("request")
        path = f"/api/content-imports/{content_import.id}/source/"
        return protected_media_url(request, "import", content_import.id, path)

    def validate(self, attrs):
        kind = attrs.get("kind", getattr(self.instance, "kind", None))
        source_file = attrs.get("source_file")
        subject = attrs.get("subject", getattr(self.instance, "subject", None))
        competency = attrs.get("competency", getattr(self.instance, "competency", None))
        if competency and subject and competency.subject_id != subject.id:
            raise serializers.ValidationError({"competency": "The competency must belong to the selected subject."})
        if source_file:
            suffix = Path(source_file.name).suffix.casefold()
            allowed = {ContentImport.Kind.EXAM: {".pdf", ".docx"}, ContentImport.Kind.MODULE: {".pdf", ".docx"}, ContentImport.Kind.VIDEO: {".mp4", ".webm", ".mov"}}[kind]
            maximum = 500 * 1024 * 1024 if kind == ContentImport.Kind.VIDEO else 25 * 1024 * 1024
            if suffix not in allowed:
                raise serializers.ValidationError({"source_file": f"Allowed file types: {', '.join(sorted(allowed))}."})
            if source_file.size > maximum:
                raise serializers.ValidationError({"source_file": f"The file exceeds the {maximum // (1024 * 1024)} MB limit."})
        if kind in {ContentImport.Kind.MODULE, ContentImport.Kind.VIDEO} and not competency:
            raise serializers.ValidationError({"competency": "A competency is required for learning material."})
        return attrs

    def create(self, validated_data):
        source_file = validated_data["source_file"]
        digest = hashlib.sha256()
        for chunk in source_file.chunks():
            digest.update(chunk)
        source_file.seek(0)
        request = self.context["request"]
        return ContentImport.objects.create(
            **validated_data,
            original_filename=Path(source_file.name).name,
            mime_type=getattr(source_file, "content_type", "application/octet-stream"),
            size_bytes=source_file.size,
            checksum_sha256=digest.hexdigest(),
            uploaded_by=request.user,
        )

    def update(self, instance, validated_data):
        if instance.status != ContentImport.Status.NEEDS_REVIEW:
            raise serializers.ValidationError("Only imports awaiting review can be edited.")
        allowed = {"title", "competency", "configuration", "extracted_payload"}
        for field, value in validated_data.items():
            if field in allowed:
                setattr(instance, field, value)
        instance.save()
        return instance

class NotificationSerializer(serializers.ModelSerializer):
    is_read = serializers.SerializerMethodField()
    class Meta:
        model = Notification
        fields = ["id", "kind", "title", "message", "action_url", "is_read", "read_at", "created_at"]
    def get_is_read(self, notification):
        return notification.read_at is not None

class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPreference
        fields = ["in_app_enabled", "email_enabled", "push_enabled", "reminders_enabled", "quiet_hours_start", "quiet_hours_end"]

class DeviceRegistrationSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeviceRegistration
        fields = ["id", "platform", "push_token", "is_active", "last_seen_at", "created_at"]
        read_only_fields = ["last_seen_at", "created_at"]
