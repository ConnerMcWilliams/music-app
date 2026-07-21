"""Serializer for the public page-visit tracking endpoint."""
from __future__ import annotations

from rest_framework import serializers


class PageVisitSerializer(serializers.Serializer):
    """Validates a visit ping from the marketing site.

    A plain ``Serializer`` (not ``ModelSerializer``): the client sends a raw
    ``referrer`` URL that the view turns into a host + normalized source, so the
    input shape and the stored columns deliberately differ. Only ``visitor_id``
    is required — everything else is best-effort context.
    """

    visitor_id = serializers.CharField(max_length=64)
    path = serializers.CharField(max_length=255, allow_blank=True, default="")
    # Full referrer URL (document.referrer); the view derives host + source.
    referrer = serializers.CharField(max_length=500, allow_blank=True, default="")
    utm_source = serializers.CharField(max_length=120, allow_blank=True, default="")
    utm_medium = serializers.CharField(max_length=120, allow_blank=True, default="")
    utm_campaign = serializers.CharField(max_length=120, allow_blank=True, default="")
