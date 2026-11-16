from .models import AcademicClass, UserProfile


def sync_teacher_classes(profile):
    """Derive teaching classes from the teacher's cluster and subject grades."""
    if profile.role != UserProfile.Role.TEACHER:
        profile.assigned_classes.clear()
        return []
    grade_levels = list(profile.assigned_subjects.filter(is_active=True).values_list("grade_level", flat=True).distinct())
    classes = AcademicClass.objects.filter(is_active=True, grade_level__in=grade_levels).order_by("grade_level", "name")
    employee = getattr(profile, "employee_details", None)
    if employee and employee.cluster_id:
        classes = classes.filter(cluster_id=employee.cluster_id)
    profile.assigned_classes.set(classes)
    return list(classes)
