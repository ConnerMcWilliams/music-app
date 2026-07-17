"""Serializer for the public contact-form endpoint."""
from __future__ import annotations

from django.contrib.auth.models import BaseUserManager
from rest_framework import serializers


class ContactMessageSerializer(serializers.Serializer):
    """Validates a contact submission: name, email, and message all required."""

    name = serializers.CharField(max_length=120)
    email = serializers.EmailField(max_length=254)
    # Cap the free-text body to blunt abuse while staying generous for a real
    # message.
    message = serializers.CharField(max_length=5000)

    def validate_email(self, value: str) -> str:
        # Same normalization as account/waitlist emails: case-insensitive.
        return BaseUserManager.normalize_email(value).lower()
