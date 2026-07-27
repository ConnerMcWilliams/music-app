"""
Account API views.

Auth flow uses ``djangorestframework-simplejwt``: register/login mint an
access + refresh pair, ``/refresh/`` rotates the pair (old refresh blacklisted),
and ``/logout/`` blacklists the supplied refresh token. JWT signing/verification
is handled entirely by simplejwt — nothing here signs or parses tokens by hand.
"""
from __future__ import annotations

from django.db import transaction
from rest_framework import status
from rest_framework.generics import RetrieveUpdateAPIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken

from .emails import send_account_welcome_email
from .models import UserPreferences
from .serializers import (
    GoogleLoginSerializer,
    LoginSerializer,
    RegisterSerializer,
    UserPreferencesSerializer,
    UserSerializer,
)


def _token_pair(user) -> dict[str, str]:
    """Mint a fresh access/refresh pair for an authenticated user."""
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


def _session_response(user, http_status: int) -> Response:
    """Standard authenticated-session payload: safe profile + credentials."""
    return Response(
        {"user": UserSerializer(user).data, **_token_pair(user)},
        status=http_status,
    )


class RegisterView(APIView):
    """POST /api/auth/register/ — create an account and start a session."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_register"

    @transaction.atomic
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        # No welcome email here: signup asks only for email and password, so the
        # player's name is not known until onboarding step 1. The welcome is
        # dispatched from CurrentPreferencesView when onboarding completes.
        return _session_response(user, status.HTTP_201_CREATED)


class LoginView(APIView):
    """POST /api/auth/login/ — exchange email/password for tokens."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_login"

    def post(self, request):
        serializer = LoginSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        return _session_response(serializer.validated_data["user"], status.HTTP_200_OK)


class GoogleLoginView(APIView):
    """POST /api/auth/google/ — exchange a Google ID token for a session.

    Sign-in and sign-up in one: the serializer resolves the verified token to
    an existing account (by Google id, then verified email) or creates one.
    Atomic so a half-linked/half-created account can't survive a failure.
    """

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth_google"

    @transaction.atomic
    def post(self, request):
        serializer = GoogleLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # A Google sign-up is welcomed on the same trigger as an email/password
        # one — when onboarding completes — so no account can be welcomed twice.
        return _session_response(serializer.validated_data["user"], status.HTTP_200_OK)


class LogoutView(APIView):
    """POST /api/auth/logout/ — revoke the supplied refresh token.

    Requires authentication so the caller proves who they are, but the user is
    always derived from the access token — a client-supplied user id is never
    trusted. Idempotent: an already-revoked or malformed token still returns 205.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh = request.data.get("refresh")
        if refresh:
            try:
                RefreshToken(refresh).blacklist()
            except TokenError:
                # Already blacklisted, expired, or malformed — logout is a
                # best-effort revocation, so treat these as a no-op success.
                pass
        return Response(status=status.HTTP_205_RESET_CONTENT)


class MeView(APIView):
    """GET /api/auth/me/ — the authenticated user's safe profile.

    The user comes from the validated access token (``request.user``); the
    endpoint never accepts another user's id as an authority.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class CurrentPreferencesView(RetrieveUpdateAPIView):
    """GET/PATCH /api/preferences/ — the caller's onboarding answers.

    Always scoped to ``request.user``, so a caller can only ever read or write
    their own row; the row is created on first access like the progress profile.
    PATCH is partial by design — the onboarding flow saves one step at a time so
    an abandoned run can be resumed where it stopped.

    This is also where the account welcome email is dispatched: finishing
    onboarding is the first moment the player's name is known.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = UserPreferencesSerializer

    def get_object(self) -> UserPreferences:
        return UserPreferences.for_user(self.request.user)

    @transaction.atomic
    def perform_update(self, serializer):
        # Atomic because the write can span two rows (the account's display name
        # and the preferences), and so the welcome below can hang off the commit.
        was_completed = serializer.instance.onboarding_completed
        preferences = serializer.save()
        # Welcome on the null → stamped transition only. The stamp itself is
        # idempotent, so re-sending `complete` while editing an answer later
        # leaves this False and no second welcome goes out. on_commit keeps a
        # rolled-back save from emailing; the helper never raises.
        if not was_completed and preferences.onboarding_completed:
            transaction.on_commit(lambda: send_account_welcome_email(preferences.user))
