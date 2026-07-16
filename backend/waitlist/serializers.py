"""Serializer for the public waitlist signup endpoint."""
from __future__ import annotations

from django.contrib.auth.models import BaseUserManager
from rest_framework import serializers


class WaitlistSignupSerializer(serializers.Serializer):
    """Validates a signup payload: required email, optional free-text context.

    Deliberately not a ``ModelSerializer``: that would attach a UniqueValidator
    to ``email`` and turn duplicate signups into 400s, but re-signing up must
    stay an idempotent success (the view handles the get-or-create).
    """

    email = serializers.EmailField(max_length=254)
    instrument = serializers.CharField(allow_blank=True, max_length=120, default="")
    skill = serializers.CharField(allow_blank=True, max_length=120, default="")
    role = serializers.CharField(allow_blank=True, max_length=120, default="")

    def validate_email(self, value: str) -> str:
        # Same normalization as account emails (users/serializers.py): lookups
        # and uniqueness are case-insensitive.
        return BaseUserManager.normalize_email(value).lower()
