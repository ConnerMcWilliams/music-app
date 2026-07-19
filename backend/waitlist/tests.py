"""
Tests for the public waitlist signup endpoint.

The endpoint is rate-limited (ScopedRateThrottle). DRF keeps the throttle
history in the cache, so each test clears it in setUp to start from a clean
rate budget rather than inheriting counts from a prior test.
"""
from __future__ import annotations

import csv
import io

from django.contrib.admin.sites import AdminSite
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.urls import reverse
from rest_framework.settings import api_settings
from rest_framework.test import APIClient

from .admin import WaitlistSignupAdmin
from .models import WaitlistSignup
from .tokens import make_unsubscribe_token, read_unsubscribe_token


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

    def test_email_longer_than_the_column_is_rejected(self):
        # Valid-looking but longer than the 254-char email column: must be a
        # 400 from the serializer, not a database error at insert time.
        email = "a" * 250 + "@example.com"
        resp = self.client.post(self.url, {"email": email}, format="json")
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


class WaitlistSignupModelTests(TestCase):
    def test_full_clean_flags_case_variant_duplicates(self):
        WaitlistSignup.objects.create(email="player@example.com")
        duplicate = WaitlistSignup(email="Player@Example.com")
        with self.assertRaises(ValidationError) as ctx:
            duplicate.full_clean()
        self.assertIn("email", ctx.exception.error_dict)


class WaitlistAdminExportTests(TestCase):
    def test_export_csv_defuses_spreadsheet_formulas(self):
        WaitlistSignup.objects.create(
            email="=1+1@example.com",
            instrument='=HYPERLINK("http://evil.example/","open")',
            skill="+SUM(A1:A9)",
            role="@cmd",
        )
        WaitlistSignup.objects.create(
            email="player@example.com", instrument="Trumpet", skill="", role="Student"
        )
        model_admin = WaitlistSignupAdmin(WaitlistSignup, AdminSite())
        response = model_admin.export_csv(None, WaitlistSignup.objects.all())
        rows = list(csv.reader(io.StringIO(response.content.decode())))
        self.assertEqual(
            rows[0],
            ["email", "instrument", "skill", "role", "subscribed", "created_at"],
        )
        self.assertEqual(
            rows[1][:4],
            [
                "'=1+1@example.com",
                "'=HYPERLINK(\"http://evil.example/\",\"open\")",
                "'+SUM(A1:A9)",
                "'@cmd",
            ],
        )
        # Benign values are exported untouched; subscribed defaults to True.
        self.assertEqual(
            rows[2][:5], ["player@example.com", "Trumpet", "", "Student", "True"]
        )


class UnsubscribeTokenTests(TestCase):
    def test_token_round_trips_to_the_signup_pk(self):
        signup = WaitlistSignup.objects.create(email="player@example.com")
        token = make_unsubscribe_token(signup)
        self.assertEqual(read_unsubscribe_token(token), signup.pk)

    def test_tampered_token_reads_as_none(self):
        signup = WaitlistSignup.objects.create(email="player@example.com")
        token = make_unsubscribe_token(signup)
        self.assertIsNone(read_unsubscribe_token(token + "x"))
        self.assertIsNone(read_unsubscribe_token("garbage"))
        self.assertIsNone(read_unsubscribe_token(""))


class UnsubscribeTests(ThrottleResetMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.url = reverse("waitlist:unsubscribe")
        self.signup = WaitlistSignup.objects.create(email="player@example.com")

    def test_valid_token_unsubscribes(self):
        resp = self.client.get(
            self.url, {"token": make_unsubscribe_token(self.signup)}
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn(b"unsubscribed", resp.content)
        self.signup.refresh_from_db()
        self.assertFalse(self.signup.subscribed)

    def test_repeat_clicks_are_idempotent(self):
        token = make_unsubscribe_token(self.signup)
        self.client.get(self.url, {"token": token})
        resp = self.client.get(self.url, {"token": token})
        self.assertEqual(resp.status_code, 200)
        self.signup.refresh_from_db()
        self.assertFalse(self.signup.subscribed)

    def test_invalid_token_changes_nothing(self):
        resp = self.client.get(self.url, {"token": "garbage"})
        self.assertEqual(resp.status_code, 400)
        self.signup.refresh_from_db()
        self.assertTrue(self.signup.subscribed)

    def test_missing_token_is_rejected(self):
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 400)

    def test_clicks_beyond_the_rate_limit_are_throttled(self):
        rate = api_settings.DEFAULT_THROTTLE_RATES["unsubscribe"]
        limit = int(rate.split("/")[0])
        token = make_unsubscribe_token(self.signup)
        for _ in range(limit):
            resp = self.client.get(self.url, {"token": token})
            self.assertEqual(resp.status_code, 200)
        resp = self.client.get(self.url, {"token": token})
        self.assertEqual(resp.status_code, 429)
