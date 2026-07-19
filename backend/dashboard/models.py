"""
Owner-only dashboard models.

The dashboard app is the private counterpart to the public marketing endpoints:
analytics over existing data plus the newsletter send log. Newsletters are
compose-and-send in one shot — a row is the record of what went out, not a
draft workflow.
"""
from __future__ import annotations

from django.db import models


class Newsletter(models.Model):
    """One newsletter sent (or attempted) to the subscribed waitlist."""

    subject = models.CharField(max_length=200)
    # Plain text on purpose: no template/HTML pipeline to maintain, and the
    # unsubscribe footer is appended per-recipient at send time.
    body = models.TextField()

    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    recipient_count = models.IntegerField(default=0)
    failed_count = models.IntegerField(default=0)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.subject
