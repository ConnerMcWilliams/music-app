"""
Tests for the public contact-form endpoint.

The endpoint is rate-limited (ScopedRateThrottle). DRF keeps the throttle
history in the cache, so each test clears it in setUp to start from a clean
rate budget rather than inheriting counts from a prior test. Email is delivered
via the in-memory (locmem) backend so assertions can read ``mail.outbox``.
"""
from __future__ import annotations

import csv
import io
from unittest.mock import patch

from django.contrib.admin.sites import AdminSite
from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.settings import api_settings
from rest_framework.test import APIClient

from .admin import ContactMessageAdmin
from .models import ContactMessage


class ThrottleResetMixin:
    """Reset DRF's throttle cache before each test so scopes start fresh."""

    def setUp(self):
        cache.clear()
        super().setUp()


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    CONTACT_NOTIFICATION_EMAIL="owner@example.com",
    DEFAULT_FROM_EMAIL="no-reply@example.com",
)
class ContactMessageTests(ThrottleResetMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.url = reverse("contact:create")

    def test_submission_normalizes_email_persists_and_emails_owner(self):
        resp = self.client.post(
            self.url,
            {
                "name": "Ada Player",
                "email": "Ada@EXAMPLE.com",
                "message": "Hi, when does beta open?",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data, {"name": "Ada Player", "email": "ada@example.com"})
        msg = ContactMessage.objects.get()
        self.assertEqual(msg.name, "Ada Player")
        self.assertEqual(msg.email, "ada@example.com")
        self.assertEqual(msg.message, "Hi, when does beta open?")
        # The site owner gets a notification email carrying the submission, with
        # the submitter set as Reply-To so replying reaches them directly.
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["owner@example.com"])
        self.assertEqual(mail.outbox[0].reply_to, ["ada@example.com"])
        self.assertIn("Ada Player", mail.outbox[0].body)
        self.assertIn("ada@example.com", mail.outbox[0].body)
        self.assertIn("when does beta open", mail.outbox[0].body)

    def test_missing_message_is_rejected(self):
        resp = self.client.post(
            self.url, {"name": "Ada", "email": "a@b.com"}, format="json"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(ContactMessage.objects.count(), 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_blank_name_is_rejected(self):
        resp = self.client.post(
            self.url,
            {"name": "", "email": "a@b.com", "message": "Hello"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(ContactMessage.objects.count(), 0)

    def test_invalid_email_is_rejected(self):
        resp = self.client.post(
            self.url,
            {"name": "Ada", "email": "not-an-email", "message": "Hello"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(ContactMessage.objects.count(), 0)

    def test_repeat_submissions_each_create_a_row(self):
        # Unlike waitlist, contact messages are not idempotent — a visitor may
        # send several and each is its own row.
        self.client.post(
            self.url,
            {"name": "Ada", "email": "a@b.com", "message": "First"},
            format="json",
        )
        self.client.post(
            self.url,
            {"name": "Ada", "email": "a@b.com", "message": "Second"},
            format="json",
        )
        self.assertEqual(ContactMessage.objects.count(), 2)

    def test_submission_succeeds_even_if_email_send_fails(self):
        # A mail-backend outage must not lose the message or 500 the visitor.
        with patch(
            "contact.views.EmailMessage.send", side_effect=RuntimeError("smtp down")
        ):
            resp = self.client.post(
                self.url,
                {"name": "Ada", "email": "a@b.com", "message": "Hello"},
                format="json",
            )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(ContactMessage.objects.count(), 1)

    def test_submissions_beyond_the_rate_limit_are_throttled(self):
        rate = api_settings.DEFAULT_THROTTLE_RATES["contact"]
        limit = int(rate.split("/")[0])
        for i in range(limit):
            resp = self.client.post(
                self.url,
                {"name": "Ada", "email": f"a{i}@b.com", "message": "Hello"},
                format="json",
            )
            self.assertEqual(resp.status_code, 201)
        resp = self.client.post(
            self.url,
            {"name": "Late", "email": "late@b.com", "message": "Hello"},
            format="json",
        )
        self.assertEqual(resp.status_code, 429)


class ContactAdminExportTests(TestCase):
    def test_export_csv_defuses_spreadsheet_formulas(self):
        ContactMessage.objects.create(
            name="=cmd|' /C calc'!A0",
            email="ada@example.com",
            message="+SUM(A1:A9)",
        )
        ContactMessage.objects.create(
            name="Ada Player", email="ada2@example.com", message="Hello there"
        )
        model_admin = ContactMessageAdmin(ContactMessage, AdminSite())
        response = model_admin.export_csv(None, ContactMessage.objects.all())
        rows = list(csv.reader(io.StringIO(response.content.decode())))
        self.assertEqual(rows[0], ["name", "email", "message", "created_at"])
        # Rows export oldest-first; formula-like cells get a leading apostrophe.
        self.assertEqual(rows[1][0], "'=cmd|' /C calc'!A0")
        self.assertEqual(rows[1][2], "'+SUM(A1:A9)")
        # Benign values are exported untouched.
        self.assertEqual(rows[2][:3], ["Ada Player", "ada2@example.com", "Hello there"])
