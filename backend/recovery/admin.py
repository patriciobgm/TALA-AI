from django.contrib import admin
from .models import AcademicClass, Assessment, Competency, Intervention, LearningResource, RecoveryPlan, Subject, UserProfile

admin.site.register([AcademicClass, Assessment, Competency, Intervention, LearningResource, RecoveryPlan, Subject, UserProfile])
