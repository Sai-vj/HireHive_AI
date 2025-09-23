# middleware/jwt_cookie_middleware.py

class JWTFromCookieMiddleware:
    """
    For API endpoints, copy 'access' cookie into HTTP_AUTHORIZATION header
    so DRF JWTAuthentication reads it as Bearer <token>.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Only for API endpoints (adjust path filter if needed)
        path = request.path or ""
        # run for API paths or anything under /api/ (adjust to your app)
        if path.startswith("/api/") or path.startswith("/resumes/") or path.startswith("/accounts/"):
            if not request.META.get("HTTP_AUTHORIZATION"):
                access = request.COOKIES.get("access")
                if access:
                    request.META["HTTP_AUTHORIZATION"] = f"Bearer {access}"
        return self.get_response(request)
