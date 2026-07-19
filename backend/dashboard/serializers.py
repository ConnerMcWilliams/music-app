"""Serializers for the owner-only dashboard endpoints."""
from __future__ import annotations

from rest_framework import serializers

from waitlist.models import WaitlistSignup

from .models import Newsletter


class NewsletterSerializer(serializers.ModelSerializer):
    """Compose input (subject, body) plus the send-log fields, read-only."""

    class Meta:
        model = Newsletter
        fields = [
            "id",
            "subject",
            "body",
            "created_at",
            "sent_at",
            "recipient_count",
            "failed_count",
        ]
        read_only_fields = [
            "id",
            "created_at",
            "sent_at",
            "recipient_count",
            "failed_count",
        ]


class WaitlistEntrySerializer(serializers.ModelSerializer):
    """Read-only row for the dashboard's waitlist browser."""

    class Meta:
        model = WaitlistSignup
        fields = ["email", "instrument", "skill", "role", "subscribed", "created_at"]
