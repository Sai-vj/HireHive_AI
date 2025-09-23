from rest_framework.permissions import BasePermission

class IsRecruiter(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        # adjust to your User model: either a flag or group membership
        return getattr(user, 'is_recruiter', False)