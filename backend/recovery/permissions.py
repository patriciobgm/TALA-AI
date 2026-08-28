from rest_framework.permissions import BasePermission

def role_for(user):
    if user.is_superuser:
        return "admin"
    profile = getattr(user, "tala_profile", None)
    return profile.role if profile else None

class IsTeacherOrAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and role_for(request.user) in {"teacher", "admin"}

class IsTeacher(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and role_for(request.user) == "teacher"

class IsStudent(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and role_for(request.user) == "student"

class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and role_for(request.user) == "admin"
