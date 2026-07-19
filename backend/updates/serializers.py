"""Serializers for update posts (public list and dashboard CRUD)."""
from __future__ import annotations

from rest_framework import serializers

from .models import UpdatePost


class UpdatePostSerializer(serializers.ModelSerializer):
    """Full post, used by both the public list and the manage endpoints."""

    class Meta:
        model = UpdatePost
        fields = ["id", "title", "body", "published", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]
