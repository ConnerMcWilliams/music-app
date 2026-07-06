"""
Django settings for the Clarke studies backend.

Configuration is environment-driven so the same code runs against local Docker
Postgres in development and managed Postgres (Neon/Railway) in production. The
only thing that changes between environments is `DATABASE_URL` and a handful of
other env vars — see `.env.example`.
"""
from __future__ import annotations

import os
from pathlib import Path

import dj_database_url
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Load a local `.env` if present. In production, real env vars take precedence
# and no `.env` file exists, so this is a no-op there.
load_dotenv(BASE_DIR / ".env")


def _env_bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).lower() in {"1", "true", "yes", "on"}


SECRET_KEY = os.environ.get("SECRET_KEY", "dev-insecure-change-me")

DEBUG = _env_bool("DEBUG", default=False)

# Hosts Django will serve. When ALLOWED_HOSTS is set explicitly it always wins.
# Otherwise: in DEBUG we accept any Host (a phone/emulator reaches the dev
# machine over a LAN IP that changes with DHCP, so pinning it is brittle), while
# a non-DEBUG deploy stays locked down and must set ALLOWED_HOSTS explicitly.
_allowed_hosts = os.environ.get("ALLOWED_HOSTS", "").strip()
if _allowed_hosts:
    ALLOWED_HOSTS = [h.strip() for h in _allowed_hosts.split(",") if h.strip()]
elif DEBUG:
    ALLOWED_HOSTS = ["*"]
else:
    ALLOWED_HOSTS = []

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "corsheaders",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    # Local apps
    "users",
    "studies",
    "grading",
    "progress",
]

# Email is the login identifier; see users/models.py. This is the project's
# first user model, so there is no prior default-user table to migrate away
# from — the custom model ships with the initial user migration.
AUTH_USER_MODEL = "users.User"

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    # CorsMiddleware must sit as high as possible, before any middleware that
    # can generate a response (e.g. CommonMiddleware).
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# Database — a single DATABASE_URL drives every environment.
DATABASES = {
    "default": dj_database_url.config(
        default=os.environ.get(
            "DATABASE_URL", "postgres://studies:studies@localhost:5433/studies"
        ),
        conn_max_age=600,
    )
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

# Uploaded submission audio is written under MEDIA_ROOT (local disk in dev;
# object storage — S3/R2 — swaps in via DEFAULT_FILE_STORAGE later, per
# docs/architecture.md). Overridable so tests/CI can use a temp dir.
MEDIA_URL = "media/"
MEDIA_ROOT = Path(os.environ.get("MEDIA_ROOT", BASE_DIR / "media"))

# Grading takes are audio files a few MB in size; raise the multipart limits
# above Django's 2.5 MB default so a normal recording isn't rejected. The
# serializer enforces the real per-file cap (grading/serializers.py).
DATA_UPLOAD_MAX_MEMORY_SIZE = 30 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 30 * 1024 * 1024

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
    # JWT (via djangorestframework-simplejwt) is the authentication scheme for
    # the mobile app. SessionAuthentication is kept only so the browsable API /
    # admin stay usable in dev; it is not used by the app.
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    # Endpoints are authenticated by default; public ones opt out explicitly
    # with permission_classes = [AllowAny] (register, login, and the read-only
    # study catalog).
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        # Rate-limit credential endpoints to blunt brute-force / abuse. Applied
        # per-scope via ScopedRateThrottle on the register/login views.
        "auth_login": os.environ.get("THROTTLE_AUTH_LOGIN", "10/min"),
        "auth_register": os.environ.get("THROTTLE_AUTH_REGISTER", "5/min"),
        # Submission uploads are authenticated, so this is per-user. Generous
        # for real practice (a take lasts ~30s+) while capping upload/grading
        # abuse from a single account.
        "submissions": os.environ.get("THROTTLE_SUBMISSIONS", "20/min"),
    },
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 50,
}


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


# JSON Web Token configuration. Short-lived access tokens keep a leaked access
# token useful only briefly; refresh tokens are rotated on use and the previous
# one is blacklisted, so a stolen refresh token is invalidated once the real
# client refreshes. Tokens are signed with SECRET_KEY (HS256) — keep it secret.
from datetime import timedelta  # noqa: E402  (kept next to its only use)

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=_env_int("ACCESS_TOKEN_LIFETIME_MINUTES", 15)),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=_env_int("REFRESH_TOKEN_LIFETIME_DAYS", 7)),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# CORS — the Expo app is served from a different origin than the API. Native
# builds fetch over the network and aren't subject to browser CORS, but Expo
# web and the dev browser preview are, so the frontend origins must be allowed.
#
# In dev we default to allowing all origins (the read API is public, GET-only,
# and uses no cookies). In production, set CORS_ALLOWED_ORIGINS explicitly and
# leave CORS_ALLOW_ALL_ORIGINS off.
CORS_ALLOW_ALL_ORIGINS = _env_bool("CORS_ALLOW_ALL_ORIGINS", default=DEBUG)

CORS_ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get("CORS_ALLOWED_ORIGINS", "").split(",")
    if o.strip()
]

# Only expose the read endpoints to cross-origin GETs; no credentials needed.
CORS_ALLOW_CREDENTIALS = False
