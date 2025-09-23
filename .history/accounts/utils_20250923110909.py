# accounts/utils.py (or inside views.py)
from functools import wraps
from django.shortcuts import redirect
from django.conf import settings
from .authentication import CookieJWTAuthentication

def jwt_or_session_login_required(next_url_name='login'):
    """
    Decorator: allow either Django session-authenticated user (request.user)
    or authenticate from 'access' cookie via CookieJWTAuthentication.
    If not authenticated, redirect to login with ?next.
    """
    def decorator(view_func):
        @wraps(view_func)
        def _wrapped(request, *args, **kwargs):
            # session-auth OK
            if getattr(request, 'user', None) and request.user.is_authenticated:
                return view_func(request, *args, **kwargs)

            # try cookie JWT
            auth = CookieJWTAuthentication()
            try:
                auth_result = auth.authenticate(request)
            except Exception:
                auth_result = None

            if auth_result:
                user, token = auth_result
                # attach user to request for view
                request.user = user
                return view_func(request, *args, **kwargs)

            # not authenticated -> redirect to login with next
            next_url = request.get_full_path()
            return redirect(f"{settings.LOGIN_URL}?next={next_url}" if hasattr(settings, 'LOGIN_URL') else f"/accounts/login/?next={next_url}")
        return _wrapped
    return decorator
