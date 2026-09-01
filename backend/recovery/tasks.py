import json
from datetime import timedelta
from urllib import request as urlrequest

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from .models import AICompanionSession, ActivityAttempt, Notification, NotificationDelivery, RecoveryActivity, RecoveryPlan, SystemConfiguration
from .notifications import assigned_teachers_for, notify


@shared_task(bind=True, autoretry_for=(OSError,), retry_backoff=True, retry_kwargs={"max_retries": 2})
def process_video_content_import(self, content_import_id):
    from django.contrib.auth import get_user_model
    from .content_imports import process_content_import
    from .models import ContentImport, UserProfile

    content_import = process_content_import(ContentImport.objects.get(pk=content_import_id))
    if content_import.status == ContentImport.Status.NEEDS_REVIEW:
        for administrator in get_user_model().objects.filter(tala_profile__role=UserProfile.Role.ADMIN, tala_profile__is_active=True, is_active=True):
            notify(recipient=administrator, kind=Notification.Kind.CONTENT_REVIEW, title="Content awaiting review", message=f"{content_import.uploaded_by.get_full_name() or content_import.uploaded_by.email} submitted {content_import.title}.", action_url=f"/imports/{content_import.id}", deduplication_key=f"content-import:{content_import.id}:review:{administrator.id}")
    return content_import.status


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


@shared_task
def generate_inactivity_reminders():
    configuration = SystemConfiguration.load()
    now = timezone.now()
    cutoff = now - timedelta(days=configuration.inactivity_days)
    cooldown = max(1, configuration.inactivity_reminder_cooldown_days)
    bucket = timezone.localdate().toordinal() // cooldown
    plans = RecoveryPlan.objects.filter(status="active", activities__completed_at__isnull=True).select_related("student", "competency").distinct()
    created = 0
    for plan in plans:
        preference = getattr(plan.student, "notification_preference", None)
        if preference and not preference.reminders_enabled:
            continue
        timestamps = [plan.created_at]
        last_attempt = ActivityAttempt.objects.filter(activity__plan=plan, student=plan.student).order_by("-started_at").values_list("started_at", flat=True).first()
        last_session = AICompanionSession.objects.filter(student=plan.student, conversation__plan=plan).order_by("-updated_at").values_list("updated_at", flat=True).first()
        timestamps.extend(value for value in [last_attempt, last_session] if value)
        last_activity = max(timestamps)
        if last_activity > cutoff:
            continue
        notification = notify(recipient=plan.student, kind=Notification.Kind.PLAN_PROGRESS, title="Continue your learning support", message=f"Your next activity for {plan.competency.title} is ready when you are.", action_url="/recovery", deduplication_key=f"plan:{plan.id}:inactive:{bucket}")
        created += int(notification is not None)
        if last_activity <= now - timedelta(days=configuration.inactivity_days * 2):
            for teacher in assigned_teachers_for(plan.student):
                notify(recipient=teacher, kind=Notification.Kind.INTERVENTION, title="Learner may need a follow-up", message=f"{plan.student.get_full_name() or plan.student.username} has not continued {plan.competency.title} support recently.", action_url=f"/learners/{plan.student_id}", deduplication_key=f"plan:{plan.id}:inactive-teacher:{bucket}:{teacher.id}")
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
