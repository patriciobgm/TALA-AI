from django.contrib.auth import get_user_model

from .models import Notification, NotificationDelivery, UserProfile


def notify(*, recipient, kind, title, message, action_url="", deduplication_key=""):
    preference = getattr(recipient, "notification_preference", None)
    if preference and not preference.in_app_enabled:
        return None
    notification, _ = Notification.objects.get_or_create(
        recipient=recipient,
        deduplication_key=deduplication_key,
        defaults={
            "kind": kind,
            "title": title,
            "message": message,
            "action_url": action_url,
        },
    ) if deduplication_key else (Notification.objects.create(
        recipient=recipient,
        kind=kind,
        title=title,
        message=message,
        action_url=action_url,
    ), True)
    preference = getattr(recipient, "notification_preference", None)
    if preference and preference.email_enabled and recipient.email:
        NotificationDelivery.objects.get_or_create(notification=notification, channel=NotificationDelivery.Channel.EMAIL)
    if (preference is None or preference.push_enabled) and recipient.devices.filter(is_active=True).exists():
        NotificationDelivery.objects.get_or_create(notification=notification, channel=NotificationDelivery.Channel.PUSH)
    return notification


def assigned_teachers_for(student):
    profile = getattr(student, "tala_profile", None)
    if not profile or not profile.academic_class_id:
        return get_user_model().objects.none()
    return get_user_model().objects.filter(
        tala_profile__role=UserProfile.Role.TEACHER,
        tala_profile__assigned_classes=profile.academic_class,
    ).distinct()
