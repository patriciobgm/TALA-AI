import hashlib
import mimetypes
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.core.cache import cache
from django.http import FileResponse
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from .account_security import consume_recovery_code, decrypt_secret, encrypt_secret, generate_recovery_codes, generate_totp_secret, hash_recovery_codes, provisioning_uri, verify_totp
from .models import AuditEvent
from .models import UserProfile
from .secure_media import validate_media_token
from .serializers import ProfileSerializer

class TalaTokenObtainPairSerializer(TokenObtainPairSerializer):
    otp = serializers.CharField(required=False, allow_blank=True, write_only=True)

    def validate(self, attrs):
        data = super().validate(attrs)
        profile = getattr(self.user, "tala_profile", None)
        if profile and not profile.is_active:
            raise serializers.ValidationError("This account has been deactivated.")
        if profile and profile.mfa_enabled:
            otp = attrs.get("otp", "")
            secret = decrypt_secret(profile.mfa_secret)
            if not otp:
                raise serializers.ValidationError({"code": "mfa_required", "detail": "Enter the code from your authenticator app or a recovery code."})
            if not verify_totp(secret, otp) and not consume_recovery_code(profile, otp):
                raise serializers.ValidationError({"otp": "The verification code is invalid or expired."})
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
        "is_superadmin": user.is_superuser,
        "class_name": str(profile.academic_class) if profile and profile.academic_class else None,
        "must_change_password": bool(profile and profile.must_change_password),
        "mfa_enabled": bool(profile and profile.mfa_enabled),
    }

class TalaTokenObtainPairView(TokenObtainPairView):
    serializer_class = TalaTokenObtainPairSerializer
    throttle_scope = "login"

    def post(self, request, *args, **kwargs):
        identity = str(request.data.get("username") or request.data.get("email") or "").strip().casefold()
        digest = hashlib.sha256(identity.encode()).hexdigest()
        failure_key = f"tala:login-failures:{digest}"
        lock_key = f"tala:login-lock:{digest}"
        if identity and cache.get(lock_key):
            return Response({"detail": "Too many unsuccessful sign-in attempts. Try again in 15 minutes or reset your password."}, status=status.HTTP_429_TOO_MANY_REQUESTS)
        response = super().post(request, *args, **kwargs)
        if response.status_code < 400:
            cache.delete_many([failure_key, lock_key])
        elif identity:
            failures = int(cache.get(failure_key, 0)) + 1
            cache.set(failure_key, failures, timeout=15 * 60)
            if failures >= 5:
                cache.set(lock_key, True, timeout=15 * 60)
                AuditEvent.objects.create(actor=None, action="account.login_locked", object_type="AuthenticationIdentity", object_id=digest[:16], metadata={"failed_attempts": failures})
        return response

class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        return Response(user_payload(request.user))


def send_reset_email(user, request=None):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    frontend_url = getattr(settings, "FRONTEND_URL", "http://localhost:5173").rstrip("/")
    reset_url = f"{frontend_url}/reset-password?uid={uid}&token={token}"
    send_mail("Reset your TALA-AI password", f"Use this single-use link to reset your password:\n\n{reset_url}\n\nIf you did not request this, ignore this message.", settings.DEFAULT_FROM_EMAIL, [user.email], fail_silently=False)


@api_view(["POST"])
@permission_classes([AllowAny])
def request_password_reset(request):
    email = str(request.data.get("email", "")).strip().casefold()
    user = get_user_model().objects.filter(username__iexact=email, is_active=True).first()
    if user:
        send_reset_email(user, request)
        AuditEvent.objects.create(actor=user, action="account.password_reset_requested", object_type="User", object_id=str(user.pk))
    return Response({"detail": "If an active account matches that email, password reset instructions have been sent."})


@api_view(["POST"])
@permission_classes([AllowAny])
def confirm_password_reset(request):
    try:
        user_id = force_str(urlsafe_base64_decode(request.data.get("uid", "")))
        user = get_user_model().objects.get(pk=user_id, is_active=True)
    except (ValueError, TypeError, OverflowError, get_user_model().DoesNotExist):
        return Response({"detail": "This password reset link is invalid or expired."}, status=status.HTTP_400_BAD_REQUEST)
    token = request.data.get("token", "")
    password = request.data.get("password", "")
    if not default_token_generator.check_token(user, token):
        return Response({"detail": "This password reset link is invalid or expired."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        validate_password(password, user)
    except Exception as exc:
        return Response({"password": list(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
    user.set_password(password)
    user.save(update_fields=["password"])
    if hasattr(user, "tala_profile"):
        user.tala_profile.must_change_password = False
        user.tala_profile.save(update_fields=["must_change_password"])
    AuditEvent.objects.create(actor=user, action="account.password_reset_completed", object_type="User", object_id=str(user.pk))
    return Response({"detail": "Password updated. You can now sign in."})


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def profile(request):
    if request.method == "PATCH":
        serializer = ProfileSerializer(request.user, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
    return Response(ProfileSerializer(request.user, context={"request": request}).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def profile_avatar(request, profile_id):
    if not validate_media_token(request.query_params.get("token"), "avatar", profile_id):
        return Response({"detail": "A valid profile photo link is required."}, status=status.HTTP_403_FORBIDDEN)
    profile_value = UserProfile.objects.filter(pk=profile_id).first()
    if not profile_value or not profile_value.avatar:
        return Response({"detail": "Profile photo not found."}, status=status.HTTP_404_NOT_FOUND)
    content_type = mimetypes.guess_type(profile_value.avatar.name)[0] or "application/octet-stream"
    return FileResponse(profile_value.avatar.open("rb"), content_type=content_type)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def change_password(request):
    if not request.user.check_password(request.data.get("current_password", "")):
        return Response({"current_password": "The current password is incorrect."}, status=status.HTTP_400_BAD_REQUEST)
    password = request.data.get("new_password", "")
    try:
        validate_password(password, request.user)
    except Exception as exc:
        return Response({"new_password": list(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)
    request.user.set_password(password)
    request.user.save(update_fields=["password"])
    request.user.tala_profile.must_change_password = False
    request.user.tala_profile.save(update_fields=["must_change_password"])
    AuditEvent.objects.create(actor=request.user, action="account.password_changed", object_type="User", object_id=str(request.user.pk))
    return Response({"detail": "Password updated. Sign in again with your new password."})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def begin_mfa_setup(request):
    secret = generate_totp_secret()
    request.user.tala_profile.mfa_pending_secret = encrypt_secret(secret)
    request.user.tala_profile.save(update_fields=["mfa_pending_secret"])
    return Response({"secret": secret, "provisioning_uri": provisioning_uri(request.user.email, secret)})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def confirm_mfa_setup(request):
    profile_value = request.user.tala_profile
    secret = decrypt_secret(profile_value.mfa_pending_secret)
    if not secret or not verify_totp(secret, request.data.get("otp")):
        return Response({"otp": "The verification code is invalid or expired."}, status=status.HTTP_400_BAD_REQUEST)
    codes = generate_recovery_codes()
    profile_value.mfa_enabled = True
    profile_value.mfa_secret = profile_value.mfa_pending_secret
    profile_value.mfa_pending_secret = ""
    profile_value.mfa_recovery_codes = hash_recovery_codes(codes)
    profile_value.save(update_fields=["mfa_enabled", "mfa_secret", "mfa_pending_secret", "mfa_recovery_codes"])
    AuditEvent.objects.create(actor=request.user, action="account.mfa_enabled", object_type="User", object_id=str(request.user.pk))
    return Response({"detail": "Multi-factor authentication enabled.", "recovery_codes": codes})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def disable_mfa(request):
    if not request.user.check_password(request.data.get("password", "")):
        return Response({"password": "The password is incorrect."}, status=status.HTTP_400_BAD_REQUEST)
    profile_value = request.user.tala_profile
    profile_value.mfa_enabled = False
    profile_value.mfa_secret = ""
    profile_value.mfa_pending_secret = ""
    profile_value.mfa_recovery_codes = []
    profile_value.save(update_fields=["mfa_enabled", "mfa_secret", "mfa_pending_secret", "mfa_recovery_codes"])
    AuditEvent.objects.create(actor=request.user, action="account.mfa_disabled", object_type="User", object_id=str(request.user.pk))
    return Response({"detail": "Multi-factor authentication disabled."})
