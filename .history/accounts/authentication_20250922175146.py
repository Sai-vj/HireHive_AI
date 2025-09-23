# accounts/authentication.py
from rest_framework_simplejwt.authentication import JWTAuthentication

class CookieJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        # Try header first
        header = self.get_header(request)
        if header:
            return super().authenticate(request)

        # Else try cookie
        raw_token = request.COOKIES.get("access")
        if raw_token is None:
            return None
        validated_token = self.get_validated_token(raw_token)
        return self.get_user(validated_token), validated_token
