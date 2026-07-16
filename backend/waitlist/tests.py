"""
Tests for the public waitlist signup endpoint.

The endpoint is rate-limited (ScopedRateThrottle). DRF keeps the throttle
history in the cache, so each test clears it in setUp to start from a clean
rate budget rather than inheriting counts from a prior test.
"""
from __future__ import annotations

from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse
from rest_framework.settings import api_settings
from rest_framework.test import APIClient

from .models import WaitlistSignup


class ThrottleResetMixin:
    """Reset DRF's throttle cache before each test so scopes start fresh."""

    def setUp(self):
        cache.clear()
        super().setUp()


class WaitlistSignupTests(ThrottleResetMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.url = reverse("waitlist:signup")

    def test_signup_normalizes_email_and_persists_optional_fields(self):
        resp = self.client.post(
            self.url,
            {
                "email": "Player@EXAMPLE.com",
                "instrument": "Trumpet",
                "skill": "Intermediate",
                "role": "Student",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data, {"email": "player@example.com"})
        signup = WaitlistSignup.objects.get()
        self.assertEqual(signup.email, "player@example.com")
        self.assertEqual(signup.instrument, "Trumpet")
        self.assertEqual(signup.skill, "Intermediate")
        self.assertEqual(signup.role, "Student")

    def test_signup_with_email_only_defaults_optional_fields_to_blank(self):
        resp = self.client.post(self.url, {"email": "a@b.com"}, format="json")
        self.assertEqual(resp.status_code, 201)
        signup = WaitlistSignup.objects.get()
        self.assertEqual(signup.email, "a@b.com")
        self.assertEqual(signup.instrument, "")
        self.assertEqual(signup.skill, "")
        self.assertEqual(signup.role, "")

    def test_missing_email_is_rejected(self):
        resp = self.client.post(self.url, {"instrument": "Trumpet"}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(WaitlistSignup.objects.count(), 0)

    def test_invalid_email_is_rejected(self):
        resp = self.client.post(self.url, {"email": "not-an-email"}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(WaitlistSignup.objects.count(), 0)

    def test_duplicate_signup_is_idempotent_and_first_write_wins(self):
        first = self.client.post(
            self.url,
            {"email": "player@example.com", "instrument": "Trumpet"},
            format="json",
        )
        second = self.client.post(
            self.url,
            {"email": "PLAYER@example.COM", "instrument": "Cornet"},
            format="json",
        )
        # Same status and body shape either way — never confirms membership.
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 201)
        self.assertEqual(second.data, {"email": "player@example.com"})
        signup = WaitlistSignup.objects.get()
        self.assertEqual(signup.instrument, "Trumpet")

    def test_signups_beyond_the_rate_limit_are_throttled(self):
        rate = api_settings.DEFAULT_THROTTLE_RATES["waitlist"]
        limit = int(rate.split("/")[0])
        for i in range(limit):
            resp = self.client.post(
                self.url, {"email": f"player{i}@example.com"}, format="json"
            )
            self.assertEqual(resp.status_code, 201)
        resp = self.client.post(self.url, {"email": "late@example.com"}, format="json")
        self.assertEqual(resp.status_code, 429)
