"""
Tests for the public page-visit tracking endpoint.

The endpoint is rate-limited (ScopedRateThrottle). DRF keeps the throttle
history in the cache, so each test clears it in setUp to start from a clean
budget. A realistic browser User-Agent is sent by default; the bot-filter
tests override it.
"""
from __future__ import annotations

import csv
import io

from django.contrib.admin.sites import AdminSite
from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse
from rest_framework.settings import api_settings
from rest_framework.test import APIClient

from .admin import PageVisitAdmin
from .models import PageVisit

BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)


class ThrottleResetMixin:
    """Reset DRF's throttle cache before each test so scopes start fresh."""

    def setUp(self):
        cache.clear()
        super().setUp()


class VisitTrackTests(ThrottleResetMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient(HTTP_USER_AGENT=BROWSER_UA)
        self.url = reverse("analytics:visit")

    def test_visit_is_recorded_and_source_derived_from_referrer(self):
        resp = self.client.post(
            self.url,
            {"visitor_id": "abc-123", "path": "/", "referrer": "https://www.instagram.com/clarkecoach"},
            format="json",
        )
        self.assertEqual(resp.status_code, 204)
        visit = PageVisit.objects.get()
        self.assertEqual(visit.visitor_id, "abc-123")
        self.assertEqual(visit.path, "/")
        self.assertEqual(visit.referrer_host, "instagram.com")
        self.assertEqual(visit.source, "instagram")

    def test_utm_source_takes_precedence_over_referrer(self):
        self.client.post(
            self.url,
            {
                "visitor_id": "v1",
                "referrer": "https://www.instagram.com/",
                "utm_source": "Newsletter",
                "utm_medium": "email",
                "utm_campaign": "beta-launch",
            },
            format="json",
        )
        visit = PageVisit.objects.get()
        self.assertEqual(visit.source, "newsletter")
        self.assertEqual(visit.utm_campaign, "beta-launch")

    def test_search_engine_referrer_is_organic(self):
        self.client.post(
            self.url,
            {"visitor_id": "v1", "referrer": "https://www.google.co.uk/search?q=trumpet"},
            format="json",
        )
        self.assertEqual(PageVisit.objects.get().source, "organic")

    def test_no_referrer_is_direct(self):
        self.client.post(self.url, {"visitor_id": "v1"}, format="json")
        self.assertEqual(PageVisit.objects.get().source, "direct")

    def test_bot_user_agent_is_dropped(self):
        resp = self.client.post(
            self.url,
            {"visitor_id": "bot-1"},
            format="json",
            HTTP_USER_AGENT="Mozilla/5.0 (compatible; Googlebot/2.1)",
        )
        self.assertEqual(resp.status_code, 204)
        self.assertEqual(PageVisit.objects.count(), 0)

    def test_missing_user_agent_is_dropped(self):
        anon = APIClient()  # no HTTP_USER_AGENT
        resp = anon.post(self.url, {"visitor_id": "v1"}, format="json")
        self.assertEqual(resp.status_code, 204)
        self.assertEqual(PageVisit.objects.count(), 0)

    def test_missing_visitor_id_is_rejected(self):
        resp = self.client.post(self.url, {"path": "/"}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(PageVisit.objects.count(), 0)

    def test_visits_beyond_the_rate_limit_are_throttled(self):
        rate = api_settings.DEFAULT_THROTTLE_RATES["analytics"]
        limit = int(rate.split("/")[0])
        for i in range(limit):
            resp = self.client.post(
                self.url, {"visitor_id": f"v{i}"}, format="json"
            )
            self.assertEqual(resp.status_code, 204)
        resp = self.client.post(self.url, {"visitor_id": "late"}, format="json")
        self.assertEqual(resp.status_code, 429)


class PageVisitAdminExportTests(TestCase):
    def test_export_csv_defuses_spreadsheet_formulas(self):
        PageVisit.objects.create(
            visitor_id="v1", source="instagram", referrer_host="instagram.com", path="/"
        )
        PageVisit.objects.create(
            visitor_id="v2", source="direct", utm_campaign="=cmd|' /C calc'!A0"
        )
        model_admin = PageVisitAdmin(PageVisit, AdminSite())
        response = model_admin.export_csv(None, PageVisit.objects.all())
        rows = list(csv.reader(io.StringIO(response.content.decode())))
        self.assertEqual(rows[0][0], "visitor_id")
        # Formula-like campaign cell gets a leading apostrophe (oldest row first).
        self.assertTrue(any(cell == "'=cmd|' /C calc'!A0" for cell in rows[2]))
