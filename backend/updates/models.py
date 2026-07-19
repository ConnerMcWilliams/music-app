"""
Update posts for the marketing site's /updates page.

Posts live in the database so publishing from the dashboard is instant — the
static site fetches them client-side, no redeploy. Content is plain text;
the web page renders paragraphs split on blank lines.
"""
from __future__ import annotations

from django.db import models


class UpdatePost(models.Model):
    """One update post; only ``published`` posts appear on the public site."""

    title = models.CharField(max_length=200)
    body = models.TextField()
    published = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title
