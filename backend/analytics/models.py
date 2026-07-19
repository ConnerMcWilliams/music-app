"""
First-party page-visit tracking for the marketing site.

A privacy-light denominator for the conversion rate. The marketing site pings
the visit endpoint on each page load with an anonymous, browser-generated
``visitor_id`` (a random UUID kept in localStorage) so repeat visits by the same
person collapse to one visitor. No IP address, no user-agent, and no account is
stored — only the coarse traffic ``source`` and optional campaign tags, which is
all the dashboard needs to compute conversion per channel.
"""
from __future__ import annotations

from django.db import models


class PageVisit(models.Model):
    """One marketing-site page view, tied to an anonymous visitor."""

    # Random UUID minted in the browser and kept in localStorage. Indexed
    # because the dashboard counts *distinct* visitor_ids for unique visitors.
    visitor_id = models.CharField(max_length=64, db_index=True)

    path = models.CharField(max_length=255, blank=True)

    # Referring host (leading "www." stripped) and the normalized channel it
    # maps to. ``source`` is indexed for the per-channel group-by.
    referrer_host = models.CharField(max_length=255, blank=True)
    source = models.CharField(max_length=64, blank=True, db_index=True)

    # Raw campaign tags, kept verbatim for the owner to inspect.
    utm_source = models.CharField(max_length=120, blank=True)
    utm_medium = models.CharField(max_length=120, blank=True)
    utm_campaign = models.CharField(max_length=120, blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.source or 'direct'} · {self.path or '/'}"
