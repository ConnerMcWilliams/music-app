"""
Contact-form messages from the marketing site.

Like ``waitlist``, this is a lightweight anonymous capture: the marketing site
posts here with no auth. Unlike waitlist, a message is *not* an identity — the
same person may send several, so there is no unique constraint and every POST
creates a new row. The email is still normalized (lower-cased) so replies and
searches stay case-insensitive.
"""
from __future__ import annotations

from django.contrib.auth.models import BaseUserManager
from django.db import models


class ContactMessage(models.Model):
    """One contact-form message from the marketing site."""

    name = models.CharField(max_length=120)
    # Normalized (lower-cased) for case-insensitive search/replies. Not unique:
    # a visitor may send more than one message.
    email = models.EmailField()
    message = models.TextField()

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.name} <{self.email}>"

    def save(self, *args, **kwargs):
        # Keep the stored email normalized even when a row is created outside
        # the serializer (e.g. via the admin or a shell).
        if self.email:
            self.email = BaseUserManager.normalize_email(self.email).lower()
        super().save(*args, **kwargs)
