"""
Marketing-site waitlist signups.

Deliberately separate from ``users``: a signup is a lightweight email capture
with no password or account, and the marketing site posts here anonymously.
The email is the identity — stored lower-cased and unique so re-signups map to
the same row regardless of case.
"""
from __future__ import annotations

from django.contrib.auth.models import BaseUserManager
from django.db import models


class WaitlistSignup(models.Model):
    """One waitlist signup from the marketing site."""

    # Unique, normalized (lower-cased) email — case-insensitive identity.
    email = models.EmailField(unique=True)

    # Optional context the form collects; free text, stored as submitted.
    instrument = models.CharField(max_length=120, blank=True)
    skill = models.CharField(max_length=120, blank=True)
    role = models.CharField(max_length=120, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.email

    def save(self, *args, **kwargs):
        # Belt-and-suspenders: keep the stored email normalized even when a row
        # is created outside the serializer (e.g. via the admin or a shell).
        if self.email:
            self.email = BaseUserManager.normalize_email(self.email).lower()
        super().save(*args, **kwargs)
