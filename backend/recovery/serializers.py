from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import AcademicClass, ActivityAttempt, Assessment, AssessmentAttempt, Competency, CompetencyResult, Intervention, LearningResource, Question, RecoveryActivity, RecoveryPlan, Subject, UserProfile

class SubjectSerializer(serializers.ModelSerializer):
    competency_count = serializers.IntegerField(source="competencies.count", read_only=True)
    class Meta:
        model = Subject
        fields = ["id", "name", "code", "competency_count"]

class UserAdminSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    name = serializers.CharField()
    email = serializers.EmailField()
    role = serializers.ChoiceField(choices=UserProfile.Role.choices)
    assignment = serializers.CharField(read_only=True)
    status = serializers.CharField(read_only=True)
    password = serializers.CharField(write_only=True, min_length=8)

    def validate_email(self, value):
        if get_user_model().objects.filter(username=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def create(self, validated_data):
        User = get_user_model()
        name_parts = validated_data["name"].strip().split(maxsplit=1)
        user = User.objects.create_user(username=validated_data["email"], email=validated_data["email"], password=validated_data["password"], first_name=name_parts[0], last_name=name_parts[1] if len(name_parts) > 1 else "")
        UserProfile.objects.create(user=user, role=validated_data["role"])
        return user

    def to_representation(self, user):
        profile = user.tala_profile
        assignment = str(profile.academic_class) if profile.academic_class else ("All modules" if profile.role == UserProfile.Role.ADMIN else "Unassigned")
        return {"id": user.id, "name": user.get_full_name() or user.username, "email": user.email, "role": profile.role, "assignment": assignment, "status": "Active" if profile.is_active and user.is_active else "Inactive"}

class CompetencySerializer(serializers.ModelSerializer):
    class Meta:
        model = Competency
        fields = ["id", "subject", "code", "title", "mastery_threshold"]

class ResourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = LearningResource
        fields = ["id", "title", "resource_type", "difficulty", "content", "competencies", "is_approved"]

class AssessmentSerializer(serializers.ModelSerializer):
    question_count = serializers.IntegerField(source="questions.count", read_only=True)
    available = serializers.SerializerMethodField()
    def get_available(self, assessment):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated or assessment.kind == Assessment.Kind.PRE:
            return assessment.is_active
        competency_ids = assessment.questions.values_list("competency_id", flat=True)
        return not RecoveryActivity.objects.filter(plan__student=request.user, plan__status="active", plan__competency_id__in=competency_ids, resource__isnull=False, completed_at__isnull=True).exists()
    class Meta:
        model = Assessment
        fields = ["id", "title", "subject", "kind", "is_active", "available", "created_by", "question_count"]
        read_only_fields = ["created_by"]

class QuestionPublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = ["id", "competency", "prompt", "question_type", "options"]

class AssessmentDetailSerializer(AssessmentSerializer):
    questions = QuestionPublicSerializer(many=True, read_only=True)
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
    class Meta:
        model = RecoveryActivity
        fields = ["id", "title", "position", "completed_at", "resource", "resource_title", "resource_type", "content"]

class RecoveryPlanSerializer(serializers.ModelSerializer):
    activities = RecoveryActivitySerializer(many=True, read_only=True)
    competency_title = serializers.CharField(source="competency.title", read_only=True)
    class Meta:
        model = RecoveryPlan
        fields = ["id", "student", "competency", "competency_title", "baseline_score", "status", "created_at", "activities"]

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
