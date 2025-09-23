from pathlib import Path
import os
from decouple import config
import pathlib
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY=os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.environ.get('OPENAI_MODEL', 'gpt-4o-mini')

SECRET_KEY = config('SECRET_KEY', default='unsafe-key')
DEBUG = config('DEBUG', default=False, cast=bool)
ALLOWED_HOSTS = config('DJANGO_ALLOWED_HOSTS', default='localhost').split()
CELERY_BROKER_URL = config('CELERY_BROKER_URL', default='redis://localhost:6379/0')
CELERY_RESULT_BACKEND = config('CELERY_RESULT_BACKEND', default='redis://localhost:6379/1')


# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = pathlib.Path(__file__).resolve().parent.parent

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = 'django-insecure-et8!y(64t0669_v)dh=xp0vv0jsg-q%4n7zp%pu7ivp%_*ik+y'

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True

ALLOWED_HOSTS = []

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework','quiz','news','interviews','resumes','accounts',
]

MIDDLEWARE = [
    'core.middleware.jwt_cookie_middleware.JWTFromCookieMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
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
        'ENGINE': 'django.db.backends.mysql',
        'NAME': 'career_db',
        'USER': 'root',
        'PASSWORD': 'Sai@9876',   
        'HOST': 'localhost',      
        'PORT': '3306',
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]
LOGIN_URL = 'home'
LOGOUT_REDIRECT_URL = 'home'

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True

STATIC_URL = 'static/'
STATICFILES_DIRS=[
    BASE_DIR /'static'
]

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
CELERY_BROKER_URL = os.environ.get('CELERY_BROKER_URL', 'redis://localhost:6379/0')
CELERY_RESULT_BACKEND = os.environ.get('CELERY_RESULT_BACKEND', 'redis://localhost:6379/1')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = 'UTC'

CACHES = {
  "default": {
    "BACKEND": "django_redis.cache.RedisCache",
    "LOCATION": "redis://127.0.0.1:6379/1",
    "OPTIONS": {"CLIENT_CLASS": "django_redis.client.DefaultClient"},
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
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        "accounts.authentication.CookieJWTAuthentication"
    ],
    'DEFAULT_PERMISSION_CLASSES':[
        'rest_framework.permissions.IsAuthenticated'
        
    ],
}

from datetime import timedelta

SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = 
CSRF_TRUSTED_ORIGINS = ["http://127.0.0.1:8000"]
SESSION_COOKIE_SAMESITE = "Lax"
SIMPLE_JWT={
    
    "ACCES_TOKEN_LIFETIME":timedelta(minutes=15),
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
