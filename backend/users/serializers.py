"""
Serializers for account registration, login, and profile output.

Password handling goes exclusively through Django: strength is checked with the
project's configured ``AUTH_PASSWORD_VALIDATORS`` and hashing happens in
``UserManager.create_user``. Passwords are write-only and never serialized back.
"""
from __future__ import annotations

from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

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
