from django.contrib import admin
from .models import AcademicClass, Assessment, AuditEvent, Competency, ContentImport, DeviceRegistration, Intervention, LearningResource, Notification, NotificationDelivery, NotificationPreference, PracticeQuestion, RecoveryPlan, Subject, SystemConfiguration, UserProfile

admin.site.register([AcademicClass, Assessment, AuditEvent, Competency, ContentImport, DeviceRegistration, Intervention, LearningResource, Notification, NotificationDelivery, NotificationPreference, PracticeQuestion, RecoveryPlan, Subject, SystemConfiguration, UserProfile])
