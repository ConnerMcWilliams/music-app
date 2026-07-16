"""
Serializers for account registration, login, and profile output.

Password handling goes exclusively through Django: strength is checked with the
project's configured ``AUTH_PASSWORD_VALIDATORS`` and hashing happens in
``UserManager.create_user``. Passwords are write-only and never serialized back.
"""
from __future__ import annotations

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import IntegrityError, transaction
from rest_framework import serializers

from .google import GoogleTokenError, verify_google_id_token

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """Safe, public representation of an account — no password, no staff flags."""

    class Meta:
        model = User
        fields = ["id", "email", "display_name", "created_at"]
        read_only_fields = fields


class RegisterSerializer(serializers.ModelSerializer):
    """Validates and creates a new account.

    Email is normalized, uniqueness is enforced case-insensitively, and the
    password is run through Django's configured validators before hashing.
    """

    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    class Meta:
        model = User
        fields = ["email", "password", "display_name"]

    def validate_email(self, value: str) -> str:
        normalized = User.objects.normalize_email(value).lower()
        if User.objects.filter(email=normalized).exists():
            # Registration legitimately reveals that an email is taken (login,
            # by contrast, must stay generic to avoid account enumeration).
            raise serializers.ValidationError("An account with this email already exists.")
        return normalized

    def validate_password(self, value: str) -> str:
        # Build a throwaway instance so UserAttributeSimilarityValidator can
        # compare the password against the email/display_name being submitted.
        candidate = User(
            email=self.initial_data.get("email", ""),
            display_name=self.initial_data.get("display_name", ""),
        )
        validate_password(value, user=candidate)
        return value

    def create(self, validated_data: dict) -> User:
        return User.objects.create_user(
            email=validated_data["email"],
            password=validated_data["password"],
            display_name=validated_data.get("display_name", ""),
        )


class LoginSerializer(serializers.Serializer):
    """Authenticates an email/password pair with a generic failure message."""

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, style={"input_type": "password"})

    # Deliberately identical for "no such user", "wrong password", and
    # "inactive account" so the endpoint never leaks whether an email exists.
    _invalid = "Invalid email or password."

    def validate(self, attrs: dict) -> dict:
        email = User.objects.normalize_email(attrs["email"]).lower()
        user = authenticate(
            request=self.context.get("request"),
            username=email,
            password=attrs["password"],
        )
        if user is None:
            raise serializers.ValidationError(self._invalid, code="authorization")
        attrs["user"] = user
        return attrs


class GoogleLoginSerializer(serializers.Serializer):
    """Exchanges a verified Google ID token for a local account.

    Resolution order: existing Google-linked account (matched on the stable
    ``sub`` claim, which survives email changes), then auto-link to the account
    holding the token's verified email — but only when that account has no
    Google link yet, so a recycled/reassigned Google address can never take
    over an account linked to a different Google identity — then create a new
    account with an unusable password. Like login, every failure — bad token,
    unverified email, inactive account, conflicting link — raises one generic
    message so the endpoint never leaks whether an email is registered.
    """

    id_token = serializers.CharField(write_only=True)

    _invalid = "Google sign-in failed. Please try again."

    def validate(self, attrs: dict) -> dict:
        try:
            claims = verify_google_id_token(attrs["id_token"])
        except GoogleTokenError:
            raise serializers.ValidationError(self._invalid, code="authorization") from None
        # Only trust the email for account matching when Google itself has
        # verified it — linking on an unverified address would let anyone who
        # can register that address at Google take over the local account.
        if not claims.get("sub") or not claims.get("email"):
            raise serializers.ValidationError(self._invalid, code="authorization")
        if claims.get("email_verified") is not True:
            raise serializers.ValidationError(self._invalid, code="authorization")
        user = self._resolve_user(claims)
        if not user.is_active:
            raise serializers.ValidationError(self._invalid, code="authorization")
        attrs["user"] = user
        return attrs

    def _resolve_user(self, claims: dict) -> User:
        sub = claims["sub"]
        email = User.objects.normalize_email(claims["email"]).lower()

        user = self._match_existing(sub, email)
        if user is not None:
            return user

        try:
            # Savepoint: a lost concurrent-create race must not poison the
            # view's surrounding transaction.
            with transaction.atomic():
                return User.objects.create_user(
                    email=email,
                    password=None,  # unusable password — this account signs in via Google
                    display_name=(claims.get("name") or email.split("@")[0])[:120],
                    google_sub=sub,
                )
        except IntegrityError:
            # A concurrent request created or linked the same account between
            # our lookups and the insert — resolve to it instead of erroring.
            user = self._match_existing(sub, email)
            if user is None:
                raise serializers.ValidationError(self._invalid, code="authorization") from None
            return user

    def _match_existing(self, sub: str, email: str) -> User | None:
        user = User.objects.filter(google_sub=sub).first()
        if user is not None:
            return user

        user = User.objects.filter(email=email).first()
        if user is None:
            return None
        if user.google_sub is not None:
            # The email matches an account already linked to a *different*
            # Google identity (same-sub matches returned above). Never silently
            # re-link: a recycled Google address must not capture the account.
            raise serializers.ValidationError(self._invalid, code="authorization")
        user.google_sub = sub
        user.save(update_fields=["google_sub", "updated_at"])
        return user
