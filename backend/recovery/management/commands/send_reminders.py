from django.core.management.base import BaseCommand

from recovery.tasks import dispatch_pending_notifications, generate_due_reminders


class Command(BaseCommand):
    help = "Generate due-activity reminders and queue pending notification deliveries."

    def handle(self, *args, **options):
        reminders = generate_due_reminders()
        deliveries = dispatch_pending_notifications()
        self.stdout.write(self.style.SUCCESS(f"Generated {reminders} reminders and queued {deliveries} deliveries."))
