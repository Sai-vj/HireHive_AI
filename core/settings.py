import os
from pathlib import Path
from decouple import config
from dotenv import load_dotenv
from datetime import timedelta

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

# -----------------------------------------------------
# Basic Config
# -----------------------------------------------------
SECRET_KEY = config('SECRET_KEY', default='django-insecure-et8!y(64t0669_v)dh=xp0vv0jsg-q%4n7zp%pu7ivp%_*ik+y')
DEBUG = config('DEBUG', default=False, cast=bool)
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "hirehive-fijd.onrender.com"]

TIME_ZONE = 'Asia/Kolkata'
USE_TZ = True
LANGUAGE_CODE = 'en-us'
USE_I18N = True

# -----------------------------------------------------
# OpenAI & Redis
# -----------------------------------------------------
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
REDIS_URL = os.getenv("REDIS_URL", "").strip()

# -----------------------------------------------------
# Celery
# -----------------------------------------------------
CELERY_BROKER_URL = REDIS_URL or config('CELERY_BROKER_URL', default='redis://localhost:6379/0')
CELERY_RESULT_BACKEND = REDIS_URL or config('CELERY_RESULT_BACKEND', default='redis://localhost:6379/1')
CELERY_TASK_ALWAYS_EAGER = not REDIS_URL
CELERY_TASK_EAGER_PROPAGATES = True

from celery.schedules import crontab
CELERY_BEAT_SCHEDULE = {
    'check-invite-reminders-every-minute': {
        'task': 'interviews.tasks.check_and_send_invite_reminders',
        'schedule': 60.0,
    },
}

# -----------------------------------------------------
# Database
# -----------------------------------------------------
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

# -----------------------------------------------------
# Installed Apps / Middleware
# -----------------------------------------------------
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'quiz', 'news', 'interviews', 'resumes', 'accounts',
    'widget_tweaks',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'core.middleware.jwt_cookie_middleware.JWTFromCookieMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
]

ROOT_URLCONF = 'core.urls'
WSGI_APPLICATION = 'core.wsgi.application'

# -----------------------------------------------------
# Templates
# -----------------------------------------------------
TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

# -----------------------------------------------------
# Static & Media
# -----------------------------------------------------
STATIC_URL = '/static/'
STATICFILES_DIRS = [BASE_DIR / 'static']
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_STORAGE = 'whitenoise.storage.CompressedManifestStaticFilesStorage'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# -----------------------------------------------------
# Security
# -----------------------------------------------------
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

# -----------------------------------------------------
# Authentication / REST
# -----------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 8}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

AUTH_USER_MODEL = 'auth.User'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'accounts.authentication.CookieJWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticated'],
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
}

# -----------------------------------------------------
# Email
# -----------------------------------------------------
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD")
DEFAULT_FROM_EMAIL = 'no-reply@hirehive.local'

# -----------------------------------------------------
# Session
# -----------------------------------------------------
SESSION_COOKIE_AGE = 1209600
SESSION_SAVE_EVERY_REQUEST = True
SESSION_COOKIE_SAMESITE = 'Lax'

# -----------------------------------------------------
# Logging
# -----------------------------------------------------
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {'console': {'class': 'logging.StreamHandler'}},
    'root': {'handlers': ['console'], 'level': LOG_LEVEL},
}
