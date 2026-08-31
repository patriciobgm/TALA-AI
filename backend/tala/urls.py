from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework_simplejwt.views import TokenRefreshView
from recovery.auth_views import CurrentUserView, TalaTokenObtainPairView, begin_mfa_setup, change_password, confirm_mfa_setup, confirm_password_reset, disable_mfa, privacy_acknowledgment, profile, profile_avatar, request_password_reset
from recovery.views import remedial_consent_response
from recovery.tutor_views import learner_support_insight

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/login/", TalaTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/me/", CurrentUserView.as_view(), name="current_user"),
    path("api/auth/password-reset/", request_password_reset),
    path("api/auth/password-reset/confirm/", confirm_password_reset),
    path("api/auth/change-password/", change_password),
    path("api/auth/profile/", profile),
    path("api/auth/privacy-acknowledgment/", privacy_acknowledgment),
    path("api/auth/profile/avatar/<int:profile_id>/", profile_avatar),
    path("api/auth/mfa/setup/", begin_mfa_setup),
    path("api/auth/mfa/confirm/", confirm_mfa_setup),
    path("api/auth/mfa/disable/", disable_mfa),
    path("api/remedial-consent/", remedial_consent_response),
    path("api/tutor/learners/<int:student_id>/insight/", learner_support_insight),
    path("api/", include("recovery.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
