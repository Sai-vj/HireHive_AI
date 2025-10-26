# settings.py - single-file dev/prod switch (copy into your project)
import os
from pathlib import Path
from datetime import timedelta

# Load .env when present (development)
from dotenv import load_dotenv
load_dotenv()

# Base dir
BASE_DIR = Path(__file__).resolve().parent.parent

# -----------------------------
# Environment flags
# -----------------------------
# DEBUG can be set in env (DEBUG=True for local dev)
DEBUG = os.getenv("DEBUG", "False").lower() in ("1", "true", "yes")

# Recommended: set SECRET_KEY in environment for production
SECRET_KEY = os.getenv(
    "SECRET_KEY",
    "django-insecure-replace-this-in-prod-with-env-var"  # fallback for dev only
)

# Allowed hosts: include Render-host provided via env or fallback
RENDER_HOSTNAME = os.getenv("RENDER_EXTERNAL_HOSTNAME")
ALLOWED_HOSTS = ["localhost", "127.0.0.1"]
if RENDER_HOSTNAME:
    ALLOWED_HOSTS.append(RENDER_HOSTNAME)
# Optionally add a hard-coded render domain if you prefer:
ALLOWED_HOSTS.append("hirehive-fijd.onrender.com")

# -----------------------------
# Applications / Middleware
# -----------------------------
INSTALLED_APPS = [
    # Django apps
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # Third-party
    "rest_framework",
    "widget_tweaks",

    # Your apps
    "quiz", "news", "interviews", "resumes", "accounts",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # Whitenoise goes after SecurityMiddleware
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    # your custom middleware (keep as before)
    "core.middleware.jwt_cookie_middleware.JWTFromCookieMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "core.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

WSGI_APPLICATION = "core.wsgi.application"

# -----------------------------
# Database: SQLite by default; use DATABASE_URL for production
# -----------------------------
# If you want to use Postgres on Render later, set DATABASE_URL in env.
DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
if DATABASE_URL:
    # Lazy import so not required in dev until DATABASE_URL used
    import dj_database_url  # ensure dj-database-url is in requirements
    DATABASES = {
        "default": dj_database_url.parse(DATABASE_URL, conn_max_age=600)
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

# -----------------------------
# Password validation
# -----------------------------
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# -----------------------------
# Internationalization / Timezone
# -----------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = os.getenv("TIME_ZONE", "Asia/Kolkata")
USE_I18N = True
USE_TZ = True

# -----------------------------
# Static & Media (Whitenoise)
# -----------------------------
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"           # collectstatic target
        # your local static dir

# Whitenoise storage (compressed + manifest caching)
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# -----------------------------
# Security
# -----------------------------
# When DEBUG=False, ensure secure cookie defaults; in dev these can be off
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True

# If you are behind a proxy/load balancer (Render), honor X-Forwarded-Proto:
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# -----------------------------
# Logging (console)
# -----------------------------
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": LOG_LEVEL},
}

# -----------------------------
# Caching: Redis if REDIS_URL else LocMem
# -----------------------------
REDIS_URL = os.getenv("REDIS_URL", "").strip()
if REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django_redis.cache.RedisCache",
            "LOCATION": REDIS_URL,
            "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient", "IGNORE_EXCEPTIONS": True},
        }
    }
else:
    CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

# -----------------------------
# Celery: dev-friendly fallback + optional worker toggle
# -----------------------------
# If you want real background workers in production, create a separate Celery worker service and set USE_CELERY_WORKER=true
USE_CELERY_WORKER = os.getenv("USE_CELERY_WORKER", "False").lower() in ("1", "true", "yes")

# Broker/backends (prefer REDIS_URL, else env vars, else local default)
CELERY_BROKER_URL = (
    REDIS_URL
    or os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")
)
CELERY_RESULT_BACKEND = (
    REDIS_URL
    or os.getenv("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")
)

if USE_CELERY_WORKER:
    # In production with a worker, do not run tasks eagerly
    CELERY_TASK_ALWAYS_EAGER = False
    CELERY_TASK_EAGER_PROPAGATES = False
else:
    # Safe default for local/dev and initial deploys: run tasks synchronously
    CELERY_TASK_ALWAYS_EAGER = True
    CELERY_TASK_EAGER_PROPAGATES = True

# Example beat schedule (keep if you use celery beat)
from celery.schedules import crontab
CELERY_BEAT_SCHEDULE = {
    "check-invite-reminders-every-minute": {
        "task": "interviews.tasks.check_and_send_invite_reminders",
        "schedule": 60.0,
    }
}

# -----------------------------
# REST Framework (keep your settings)
# -----------------------------
AUTH_USER_MODEL = os.getenv("AUTH_USER_MODEL", "auth.User")
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "accounts.authentication.CookieJWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
}

# -----------------------------
# OpenAI + AI model config (do NOT instantiate client at import time)
# -----------------------------
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip() or None
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

# Note: DO NOT create an OpenAI client here. Create it lazily inside tasks or helper functions:
# Example helper (place in a utils/openai_helper.py or inside tasks.py):
#
# from openai import OpenAI
# from django.conf import settings
#
# _OPENAI_CLIENT = None
# def get_openai_client():
#     global _OPENAI_CLIENT
#     if not _OPENAI_CLIENT:
#         _OPENAI_CLIENT = OpenAI(api_key=settings.OPENAI_API_KEY)
#     return _OPENAI_CLIENT
#
# def call_openai(prompt, model=None, max_tokens=800):
#     client = get_openai_client()
#     model = model or settings.OPENAI_MODEL
#     resp = client.chat.completions.create(
#         model=model,
#         messages=[{"role":"user","content":prompt}],
#         max_tokens=max_tokens, temperature=0.2
#     )
#     return resp.choices[0].message.content
#
# This pattern avoids import-time crashes when OPENAI_API_KEY is not present.

# -----------------------------
# Email (dev-safe default)
# -----------------------------
EMAIL_BACKEND = os.getenv("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", 587))
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "True").lower() in ("1", "true", "yes")
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "no-reply@hirehive.local")

# -----------------------------
# Misc / Files
# -----------------------------
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LOGIN_URL = "/"
LOGOUT_REDIRECT_URL = "/"

# -----------------------------
# Additional dev convenience
# -----------------------------
# Print a warning in logs if required env vars are missing in production
if not DEBUG:
    missing = []
    if not SECRET_KEY or "replace-this-in-prod" in SECRET_KEY:
        missing.append("SECRET_KEY")
    if not OPENAI_API_KEY:
        # optional but warn
        missing.append("OPENAI_API_KEY (recommended)")
    if missing:
        import logging
        logging.getLogger("django").warning("Missing important env vars for production: %s", missing)
