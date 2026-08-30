from .models import AcademicClass, UserProfile


def sync_teacher_classes(profile):
    """Derive teaching classes from the grade levels of assigned subjects."""
    if profile.role != UserProfile.Role.TEACHER:
        profile.assigned_classes.clear()
        return []
    grade_levels = list(profile.assigned_subjects.filter(is_active=True).values_list("grade_level", flat=True).distinct())
    classes = AcademicClass.objects.filter(is_active=True, grade_level__in=grade_levels).order_by("grade_level", "name")
    profile.assigned_classes.set(classes)
    return list(classes)
