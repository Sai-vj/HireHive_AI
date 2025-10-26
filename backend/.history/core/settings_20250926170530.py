from pathlib import Path
import os
from decouple import config
import pathlib
from dotenv import load_dotenv

TIME_ZONE = 'Asia/Kolkata'     # set to your local zone
USE_TZ = True  

# recommended: store datetimes in UTC, display localized
REDIS_URL = os.getenv("REDIS_URL", "").strip()




load_dotenv()

OPENAI_API_KEY=os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.environ.get('OPENAI_MODEL', 'gpt-4o-mini')


DEBUG = config('DEBUG', default=False, cast=bool)
ALLOWED_HOSTS = ["hirehive.onrender.com"]
CELERY_BROKER_URL = config('CELERY_BROKER_URL', default='redis://localhost:6379/0')
CELERY_RESULT_BACKEND = config('CELERY_RESULT_BACKEND', default='redis://localhost:6379/1')


# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = pathlib.Path(__file__).resolve().parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = 'django-insecure-et8!y(64t0669_v)dh=xp0vv0jsg-q%4n7zp%pu7ivp%_*ik+y'

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True

ALLOWED_HOSTS = [
    "localhost",
    "127.0.0.1",
    "hirehive-fijd.onrender.com",   # <-- add your Render domain
]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework','quiz','news','interviews','resumes','accounts',
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
    "whitenoise.middleware.WhiteNoiseMiddleware",
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS':[BASE_DIR /'templates'],
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

WSGI_APPLICATION = 'core.wsgi.application'

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework.authentication.SessionAuthentication",
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
}

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',   # spelling correct
        'NAME': BASE_DIR / 'db.sqlite3',          # db file project root la save aagum
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        "OPTIONS": {"min_length": 8},
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

from django.urls import reverse_lazy

LOGIN_URL = reverse_lazy('home')
LOGOUT_REDIRECT_URL = reverse_lazy('home')

LANGUAGE_CODE = 'en-us'





STATIC_URL = "/static/"
STATICFILES_DIRS = [BASE_DIR / "static"]   # <-- if you have a /static folder
STATIC_ROOT = BASE_DIR / "staticfiles"     # <-- for collectstatic



DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

MEDIA_URL = "/media/"
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')

EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = 'sairamvijay9876@gmail.com'         # replace
EMAIL_HOST_PASSWORD = ''      # replace or use env var
DEFAULT_FROM_EMAIL = 'no-reply@hirehive.local'

# Celery config
CELERY_BROKER_URL = REDIS_URL or os.getenv("CELERY_BROKER_URL", "")
CELERY_RESULT_BACKEND = REDIS_URL or os.getenv("CELERY_RESULT_BACKEND", "")

if not CELERY_BROKER_URL:
    CELERY_TASK_ALWAYS_EAGER = True
    CELERY_TASK_EAGER_PROPAGATES = True

# dev-only: run Celery tasks synchronously (no worker needed)
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True


# Caching: use Redis if REDIS_URL set, else LocMem (no crash)
if REDIS_URL:
    CACHES = {
        "default": {
            "BACKEND": "django_redis.cache.RedisCache",
            "LOCATION": REDIS_URL,
            "OPTIONS": {
                "CLIENT_CLASS": "django_redis.client.DefaultClient",
                "IGNORE_EXCEPTIONS": True,  # Avoid hard crash if Redis hiccups
            },
            "TIMEOUT": 300,
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "hirehive-local",
            "TIMEOUT": 300,
        }
    }


EMBEDDING_MODEL_NAME="all-MiniLM_l6-v2"
EMBEDDING_WEIGHT=0.75
SKILLS_WEIGHT=0.25
TFIDF_WEIGHT=0.0
EMBEDDING_MODEL_VERSION="v2025-09-12"

AUTH_USER_MODEL='auth.User'
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',                 # keep session auth
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'accounts.authentication.CookieJWTAuthentication',                    # your custom cookie JWT
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
}


from datetime import timedelta

SESSION_COOKIE_AGE = 1209600            # 2 weeks
SESSION_SAVE_EVERY_REQUEST = True
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = False           # ok for local http
CSRF_COOKIE_SECURE = False

SIMPLE_JWT={
    
    "ACCESS_TOKEN_LIFETIME":timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME":timedelta(days=7),
}

from celery.schedules import crontab

CELERY_BEAT_SCHEDULE = {
    # run every minute
    'check-invite-reminders-every-minute': {
        'task': 'interviews.tasks.check_and_send_invite_reminders',
        'schedule': 60.0,   # seconds
    },
}
