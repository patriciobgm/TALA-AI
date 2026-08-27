from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

class TalaTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        profile = getattr(self.user, "tala_profile", None)
        if profile and not profile.is_active:
            raise serializers.ValidationError("This account has been deactivated.")
        data["user"] = user_payload(self.user)
        return data

def user_payload(user):
    profile = getattr(user, "tala_profile", None)
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "name": user.get_full_name() or user.username,
        "role": profile.role if profile else ("admin" if user.is_superuser else "student"),
        "class_name": str(profile.academic_class) if profile and profile.academic_class else None,
    }

class TalaTokenObtainPairView(TokenObtainPairView):
    serializer_class = TalaTokenObtainPairSerializer

class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        return Response(user_payload(request.user))
