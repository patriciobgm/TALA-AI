from django.db import migrations


def backfill_privacy_request_notifications(apps, schema_editor):
    Notification = apps.get_model("recovery", "Notification")
    PrivacyRequest = apps.get_model("recovery", "PrivacyRequest")
    UserProfile = apps.get_model("recovery", "UserProfile")

    administrators = UserProfile.objects.filter(
        role="admin",
        is_active=True,
        user__is_active=True,
    ).values_list("user_id", flat=True)

    for row in PrivacyRequest.objects.all().iterator():
        if row.status in {"open", "in_review"}:
            for administrator_id in administrators:
                Notification.objects.get_or_create(
                    recipient_id=administrator_id,
                    deduplication_key=f"privacy-request:{row.id}:submitted:admin:{administrator_id}",
                    defaults={
                        "kind": "privacy_request",
                        "title": "Privacy request submitted",
                        "message": "A privacy request requires administrator review.",
                        "action_url": f"/settings/privacy/{row.id}",
                    },
                )

        requester_copy = {
            "in_review": ("Privacy request in review", "Your privacy request is being reviewed."),
            "completed": (
                "Privacy request completed",
                "Your privacy request has been completed. Open Account & Security to review the response.",
            ),
            "denied": (
                "Privacy request decision recorded",
                "A decision has been recorded for your privacy request. Open Account & Security to review the response.",
            ),
        }
        if row.status in requester_copy:
            title, message = requester_copy[row.status]
            Notification.objects.get_or_create(
                recipient_id=row.requested_by_id,
                deduplication_key=f"privacy-request:{row.id}:{row.status}:requester",
                defaults={
                    "kind": "privacy_request",
                    "title": title,
                    "message": message,
                    "action_url": "/profile",
                },
            )


class Migration(migrations.Migration):
    dependencies = [("recovery", "0024_privacy_notifications_and_recovery_cleanup")]

    operations = [
        migrations.RunPython(backfill_privacy_request_notifications, migrations.RunPython.noop),
    ]
