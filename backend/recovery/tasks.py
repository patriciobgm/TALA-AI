import json
from datetime import timedelta
from urllib import request as urlrequest

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from .models import Notification, NotificationDelivery, RecoveryActivity
from .notifications import notify


@shared_task
def generate_due_reminders():
    now = timezone.now()
    upcoming = RecoveryActivity.objects.filter(completed_at__isnull=True, due_at__gt=now, due_at__lte=now + timedelta(hours=24)).select_related("plan__student", "plan__competency")
    overdue = RecoveryActivity.objects.filter(completed_at__isnull=True, due_at__lte=now).select_related("plan__student", "plan__competency")
    created = 0
    for activity, kind in [(item, Notification.Kind.ACTIVITY_DUE) for item in upcoming] + [(item, Notification.Kind.ACTIVITY_OVERDUE) for item in overdue]:
        student = activity.plan.student
        preference = getattr(student, "notification_preference", None)
        if preference and not preference.reminders_enabled:
            continue
        due_label = timezone.localtime(activity.due_at).strftime("%b %d at %I:%M %p")
        notification = notify(
            recipient=student,
            kind=kind,
            title="Activity due soon" if kind == Notification.Kind.ACTIVITY_DUE else "Recovery activity overdue",
            message=f"{activity.title} for {activity.plan.competency.title} is due {due_label}.",
            action_url="/recovery",
            deduplication_key=f"activity:{activity.id}:{kind}:{timezone.localdate().isoformat()}",
        )
        created += int(notification is not None)
    return created


@shared_task(bind=True, autoretry_for=(OSError,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def dispatch_notification_delivery(self, delivery_id):
    delivery = NotificationDelivery.objects.select_related("notification__recipient").get(pk=delivery_id)
    if delivery.status == NotificationDelivery.Status.SENT:
        return "already-sent"
    delivery.attempt_count += 1
    notification = delivery.notification
    recipient = notification.recipient
    try:
        if delivery.channel == NotificationDelivery.Channel.EMAIL:
            send_mail(notification.title, notification.message, settings.DEFAULT_FROM_EMAIL, [recipient.email], fail_silently=False)
        else:
            tokens = list(recipient.devices.filter(is_active=True).values_list("push_token", flat=True))
            if not tokens:
                delivery.status = NotificationDelivery.Status.SKIPPED
                delivery.error_message = "No active push devices."
                delivery.save(update_fields=["status", "error_message", "attempt_count", "updated_at"])
                return "no-devices"
            payload = [{"to": token, "title": notification.title, "body": notification.message, "data": {"url": notification.action_url}} for token in tokens]
            req = urlrequest.Request(settings.EXPO_PUSH_URL, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}, method="POST")
            with urlrequest.urlopen(req, timeout=15) as response:
                if response.status >= 300:
                    raise OSError(f"Push service returned HTTP {response.status}.")
        delivery.status = NotificationDelivery.Status.SENT
        delivery.delivered_at = timezone.now()
        delivery.error_message = ""
    except Exception as exc:
        delivery.status = NotificationDelivery.Status.FAILED
        delivery.error_message = str(exc)[:2000]
        delivery.save(update_fields=["status", "error_message", "attempt_count", "updated_at"])
        raise
    delivery.save(update_fields=["status", "delivered_at", "error_message", "attempt_count", "updated_at"])
    return "sent"


@shared_task
def dispatch_pending_notifications():
    delivery_ids = list(NotificationDelivery.objects.filter(status__in=[NotificationDelivery.Status.PENDING, NotificationDelivery.Status.FAILED], attempt_count__lt=3).values_list("id", flat=True)[:500])
    for delivery_id in delivery_ids:
        dispatch_notification_delivery.delay(delivery_id)
    return len(delivery_ids)
