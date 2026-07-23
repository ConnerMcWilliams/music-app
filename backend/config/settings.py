"""
Django settings for the Clarke studies backend.

Configuration is environment-driven so the same code runs against local Docker
Postgres in development and managed Postgres (Neon/Railway) in production. The
only thing that changes between environments is `DATABASE_URL` and a handful of
other env vars — see `.env.example`.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import dj_database_url
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Load a local `.env` if present. In production, real env vars take precedence
# and no `.env` file exists, so this is a no-op there.
load_dotenv(BASE_DIR / ".env")


def _env_bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).lower() in {"1", "true", "yes", "on"}


_INSECURE_SECRET_KEY = "dev-insecure-change-me"
SECRET_KEY = os.environ.get("SECRET_KEY", _INSECURE_SECRET_KEY)

DEBUG = _env_bool("DEBUG", default=False)

# A real deploy must set its own SECRET_KEY — it signs JWTs and the unsubscribe
# tokens, so the public dev default would let anyone forge them. Fail fast if a
# non-debug *server* still uses it. Management commands (test, migrate, …) are
# exempt so local tooling and CI run without a real key; the served app boots
# via wsgi/asgi (argv[1] is not a management command) and is always enforced.
_MANAGEMENT_COMMANDS = {
    "test", "makemigrations", "migrate", "collectstatic", "check", "shell",
    "createsuperuser", "loaddata", "dumpdata", "showmigrations", "sqlmigrate",
}
_is_management_command = len(sys.argv) > 1 and sys.argv[1] in _MANAGEMENT_COMMANDS
if not DEBUG and not _is_management_command and SECRET_KEY == _INSECURE_SECRET_KEY:
    raise ImproperlyConfigured(
        "SECRET_KEY must be set to a unique, secret value when DEBUG is off."
    )

# CI and local test runs execute with DEBUG off, so key the transport-security
# hardening (https redirect, HSTS, secure cookies) off the *combination* of
# non-debug and not-a-test-run. Without this the test client's plain-http
# requests would all 301 to https. A real server boot (not a `test` command) is
# still hardened. Each toggle also has its own env override below.
_running_tests = "test" in sys.argv
_HARDENED = not DEBUG and not _running_tests

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
    "waitlist",
    "contact",
    "dashboard",
    "updates",
    "analytics",
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
    # Catch unexpected exceptions and return a generic, reference-tagged 500
    # (never a stack trace); also log admin auth failures. See
    # config/exception_handler.py.
    "EXCEPTION_HANDLER": "config.exception_handler.exception_handler",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        # Rate-limit credential endpoints to blunt brute-force / abuse. Applied
        # per-scope via ScopedRateThrottle on the register/login views.
        "auth_login": os.environ.get("THROTTLE_AUTH_LOGIN", "10/min"),
        "auth_register": os.environ.get("THROTTLE_AUTH_REGISTER", "5/min"),
        "auth_google": os.environ.get("THROTTLE_AUTH_GOOGLE", "10/min"),
        # Submission uploads are authenticated, so this is per-user. Generous
        # for real practice (a take lasts ~30s+) while capping upload/grading
        # abuse from a single account.
        "submissions": os.environ.get("THROTTLE_SUBMISSIONS", "20/min"),
        # Public marketing-site waitlist form, per client IP. Duplicates are
        # idempotent, so a legit visitor needs at most a couple of requests.
        "waitlist": os.environ.get("THROTTLE_WAITLIST", "10/hour"),
        # Public marketing-site contact form, per client IP. Every submission is
        # a new message, so keep the cap low to blunt spam.
        "contact": os.environ.get("THROTTLE_CONTACT", "10/hour"),
        # Public one-click newsletter unsubscribe link, per client IP. A real
        # recipient clicks once; the cap only blunts token brute-forcing.
        "unsubscribe": os.environ.get("THROTTLE_UNSUBSCRIBE", "30/hour"),
        # Public updates feed for the marketing site, per client IP. Read-only
        # list, so it can be generous.
        "updates_public": os.environ.get("THROTTLE_UPDATES_PUBLIC", "120/hour"),
        # Public page-visit beacon for the marketing site, per client IP. Fires
        # on every page load, so it's generous — the cap only blunts flooding a
        # single IP into the visitor denominator.
        "analytics": os.environ.get("THROTTLE_ANALYTICS", "120/hour"),
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

# Google Sign-In — OAuth client IDs accepted as the ID-token audience (`aud`).
# Comma-separated because tokens minted on Android carry the *Web* client ID
# while tokens minted on iOS may carry the *iOS* client ID; both must verify.
GOOGLE_OAUTH_CLIENT_IDS = [
    c.strip()
    for c in os.environ.get("GOOGLE_OAUTH_CLIENT_IDS", "").split(",")
    if c.strip()
]

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

# Email — used to notify the site owner when the marketing site's contact form
# is submitted (contact/views.py). Env-driven so the same code runs locally and
# in production: unset EMAIL_BACKEND defaults to the console backend in DEBUG
# (prints the message to the dev terminal, no credentials needed) and to SMTP
# otherwise. EMAIL_HOST_PASSWORD is a secret — set it via the deploy environment,
# never in the repo. Until SMTP is configured in production, contact messages
# still persist and appear in the admin; only the notification email is skipped.
EMAIL_BACKEND = os.environ.get(
    "EMAIL_BACKEND",
    "django.core.mail.backends.console.EmailBackend"
    if DEBUG
    else "django.core.mail.backends.smtp.EmailBackend",
)
EMAIL_HOST = os.environ.get("EMAIL_HOST", "")
EMAIL_PORT = _env_int("EMAIL_PORT", 587)
EMAIL_USE_TLS = _env_bool("EMAIL_USE_TLS", default=True)
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
# Cap how long a send may block. Notifications are sent synchronously inside the
# contact request, so without a socket timeout an unreachable SMTP host would
# hang the worker for the OS TCP timeout (tens of seconds). Keep it short.
EMAIL_TIMEOUT = _env_int("EMAIL_TIMEOUT", 10)
# From address on outgoing mail. For Gmail SMTP this must match EMAIL_HOST_USER.
DEFAULT_FROM_EMAIL = os.environ.get(
    "DEFAULT_FROM_EMAIL", "Clarke Coach <no-reply@clarkecoach.com>"
)

# Recipient of contact-form notifications (the site owner's inbox). Set to empty
# to disable the notification email while still storing submissions.
CONTACT_NOTIFICATION_EMAIL = os.environ.get(
    "CONTACT_NOTIFICATION_EMAIL", "connermcwilliams16@gmail.com"
)

# Absolute base URL of this backend, used to build links that leave the app
# (the unsubscribe URL in newsletter emails). Must be the public origin in
# production or unsubscribe links will point at localhost.
BACKEND_BASE_URL = os.environ.get("BACKEND_BASE_URL", "http://localhost:8000")

# --- Security hardening -------------------------------------------------------
# These matter only when the site is served over HTTPS in production. In DEBUG
# (local http) they stay off so there is no http→https redirect loop and no HSTS
# policy pinned to localhost. Each is env-overridable for deploys that differ.
#
# The app runs behind a TLS-terminating proxy (Railway/Render/Fly), so trust the
# forwarded-protocol header to tell whether the original request was HTTPS —
# required for SECURE_SSL_REDIRECT and secure cookies to work behind the proxy.
if _env_bool("USE_PROXY_SSL_HEADER", default=_HARDENED):
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# Redirect http→https. Disable via env on a platform that already forces https
# at the edge and would otherwise loop.
SECURE_SSL_REDIRECT = _env_bool("SECURE_SSL_REDIRECT", default=_HARDENED)

# HSTS: instruct browsers to only ever reach this host over https. Zero unless
# hardened so a plain-http localhost/test visit isn't pinned; a generous default
# (2y) in prod once https is confirmed. `preload` is opt-in — submitting to the
# browser preload list is a long-lived commitment, so leave it to a deliberate
# env set.
SECURE_HSTS_SECONDS = _env_int("SECURE_HSTS_SECONDS", 63072000 if _HARDENED else 0)
SECURE_HSTS_INCLUDE_SUBDOMAINS = _env_bool(
    "SECURE_HSTS_INCLUDE_SUBDOMAINS", default=_HARDENED
)
SECURE_HSTS_PRELOAD = _env_bool("SECURE_HSTS_PRELOAD", default=False)

# Always safe to send.
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"

# Session/CSRF cookies are used only by the Django admin and the browsable API
# (the mobile app and dashboards use bearer JWTs). Harden them for production.
SESSION_COOKIE_SECURE = _HARDENED
CSRF_COOKIE_SECURE = _HARDENED
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

# Deny framing of any Django-served page (the middleware default is SAMEORIGIN);
# the API and admin are never meant to be embedded. The Next apps set the same
# via CSP frame-ancestors.
X_FRAME_OPTIONS = "DENY"

# --- Logging ------------------------------------------------------------------
# Structured, environment-aware console logging (captured by the host's log
# drain). `django.request` emits 500 tracebacks at ERROR while staying quiet
# about routine 4xx; our first-party apps and the custom error handler log at
# INFO (DEBUG locally). Logging rules — never log secrets or full email
# addresses — are documented in docs/security.md.
LOG_LEVEL = os.environ.get("LOG_LEVEL", "DEBUG" if DEBUG else "INFO")

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {
            "format": "[{asctime}] {levelname} {name}: {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "standard",
        },
    },
    "root": {"handlers": ["console"], "level": "WARNING"},
    "loggers": {
        "django.request": {
            "handlers": ["console"],
            "level": "ERROR",
            "propagate": False,
        },
        # First-party apps + the custom exception handler.
        **{
            name: {"handlers": ["console"], "level": LOG_LEVEL, "propagate": False}
            for name in (
                "config.errors",
                "waitlist",
                "contact",
                "dashboard",
                "analytics",
            )
        },
    },
}
