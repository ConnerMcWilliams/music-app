"""
Server-side verification of Google Sign-In ID tokens.

The mobile app performs the native Google sign-in flow and sends the resulting
ID token here; nothing else about Google's OAuth machinery (authorization
codes, access tokens, scopes) is involved. ``google-auth`` enforces the token's
signature (against Google's published JWKS), expiry, and issuer; the audience
is checked in this module because a valid token's ``aud`` differs by platform
(the Web client ID on Android, the iOS client ID on iOS), so it must match any
one of ``settings.GOOGLE_OAUTH_CLIENT_IDS``.
"""
from __future__ import annotations

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from google.auth.exceptions import GoogleAuthError
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token


class GoogleTokenError(Exception):
    """The supplied ID token failed verification (malformed, expired, bad aud)."""


def verify_google_id_token(raw_token: str) -> dict:
    """Verify a Google ID token and return its claims.

    Raises ``GoogleTokenError`` for any token-side failure and
    ``ImproperlyConfigured`` when the server has no client IDs configured —
    a deployment error that must not be reported as a bad credential.
    """
    if not settings.GOOGLE_OAUTH_CLIENT_IDS:
        raise ImproperlyConfigured(
            "GOOGLE_OAUTH_CLIENT_IDS is not set; Google Sign-In is disabled."
        )
    try:
        # audience=None skips the library's single-audience equality check;
        # membership in the configured list is enforced just below. Signature,
        # expiry, and issuer are still fully verified by the library.
        claims = id_token.verify_oauth2_token(
            raw_token, google_requests.Request(), audience=None
        )
    except (ValueError, GoogleAuthError) as exc:
        raise GoogleTokenError("Invalid Google ID token.") from exc
    if claims.get("aud") not in settings.GOOGLE_OAUTH_CLIENT_IDS:
        raise GoogleTokenError("Google ID token has an unexpected audience.")
    return claims
