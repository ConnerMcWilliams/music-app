"""
Tests for the owner-only dashboard endpoints.

Every endpoint here is the first admin surface in the API, so the gating tests
matter most: anonymous callers get 401, authenticated non-staff get 403, staff
get through. Email is delivered via the in-memory (locmem) backend so
assertions can read ``mail.outbox``.
"""
from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.mail import EmailMessage
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from waitlist.models import WaitlistSignup
from waitlist.tokens import read_unsubscribe_token

from .models import Newsletter

User = get_user_model()


class DashboardAuthMixin:
    """Clients for the three caller kinds the gating tests exercise."""

    def setUp(self):
        super().setUp()
        self.anon = APIClient()
        self.member = APIClient()
        self.member.force_authenticate(
            User.objects.create_user("member@example.com", "pw")
        )
        self.staff = APIClient()
        self.staff.force_authenticate(
            User.objects.create_user("owner@example.com", "pw", is_staff=True)
        )


class DashboardGatingTests(DashboardAuthMixin, TestCase):
    def test_all_dashboard_endpoints_are_staff_only(self):
        for name in ("analytics", "waitlist", "newsletters"):
            url = reverse(f"dashboard:{name}")
            with self.subTest(endpoint=name):
                self.assertEqual(self.anon.get(url).status_code, 401)
                self.assertEqual(self.member.get(url).status_code, 403)
                self.assertEqual(self.staff.get(url).status_code, 200)

    def test_newsletter_send_is_staff_only(self):
        url = reverse("dashboard:newsletters")
        payload = {"subject": "Hi", "body": "News."}
        self.assertEqual(
            self.anon.post(url, payload, format="json").status_code, 401
        )
        self.assertEqual(
            self.member.post(url, payload, format="json").status_code, 403
        )
        self.assertEqual(Newsletter.objects.count(), 0)


class AnalyticsTests(DashboardAuthMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.url = reverse("dashboard:analytics")

    def test_counts_and_breakdowns(self):
        WaitlistSignup.objects.create(
            email="a@example.com", role="Teacher", instrument="Trumpet"
        )
        WaitlistSignup.objects.create(
            email="b@example.com", role="teacher", instrument="Cornet"
        )
        WaitlistSignup.objects.create(
            email="c@example.com", role="Student", subscribed=False
        )
        resp = self.staff.get(self.url)
        self.assertEqual(resp.status_code, 200)
        # member + owner from the mixin.
        self.assertEqual(resp.data["members"]["total"], 2)
        waitlist = resp.data["waitlist"]
        self.assertEqual(waitlist["total"], 3)
        self.assertEqual(waitlist["subscribed"], 2)
        # Free-text roles are case-folded so "Teacher" and "teacher" merge;
        # blank instrument stays "" for the client to label.
        self.assertEqual(
            waitlist["by_role"],
            [{"value": "teacher", "count": 2}, {"value": "student", "count": 1}],
        )
        self.assertIn({"value": "", "count": 1}, waitlist["by_instrument"])

    def test_signups_by_day_respects_the_window(self):
        recent = WaitlistSignup.objects.create(email="new@example.com")
        old = WaitlistSignup.objects.create(email="old@example.com")
        # created_at is auto_now_add, so backdate with a queryset update.
        WaitlistSignup.objects.filter(pk=old.pk).update(
            created_at=timezone.now() - timedelta(days=400)
        )
        resp = self.staff.get(self.url)
        series = resp.data["waitlist"]["signups_by_day"]
        self.assertEqual(sum(row["count"] for row in series), 1)
        self.assertEqual(
            series[0]["date"], recent.created_at.date().isoformat()
        )
        # Widening the window is capped at a year, so the old row stays out.
        resp = self.staff.get(self.url, {"days": 100000})
        series = resp.data["waitlist"]["signups_by_day"]
        self.assertEqual(sum(row["count"] for row in series), 1)


class WaitlistBrowseTests(DashboardAuthMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.url = reverse("dashboard:waitlist")
        WaitlistSignup.objects.create(
            email="ada@example.com", role="Music Teacher", instrument="Trumpet"
        )
        WaitlistSignup.objects.create(
            email="ben@example.com", role="Student", instrument="Cornet"
        )
        WaitlistSignup.objects.create(
            email="cal@example.com", role="", subscribed=False
        )

    def emails(self, resp) -> list[str]:
        return [row["email"] for row in resp.data["results"]]

    def test_unfiltered_list_is_paginated_and_complete(self):
        resp = self.staff.get(self.url)
        self.assertEqual(resp.data["count"], 3)
        self.assertEqual(len(resp.data["results"]), 3)

    def test_role_filter_matches_substring_case_insensitively(self):
        resp = self.staff.get(self.url, {"role": "teach"})
        self.assertEqual(self.emails(resp), ["ada@example.com"])

    def test_email_search(self):
        resp = self.staff.get(self.url, {"q": "ben"})
        self.assertEqual(self.emails(resp), ["ben@example.com"])

    def test_subscribed_filter(self):
        resp = self.staff.get(self.url, {"subscribed": "false"})
        self.assertEqual(self.emails(resp), ["cal@example.com"])


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="no-reply@example.com",
    BACKEND_BASE_URL="https://api.example.com",
)
class NewsletterSendTests(DashboardAuthMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.url = reverse("dashboard:newsletters")
        self.subscribed = [
            WaitlistSignup.objects.create(email="a@example.com"),
            WaitlistSignup.objects.create(email="b@example.com"),
        ]
        WaitlistSignup.objects.create(email="out@example.com", subscribed=False)

    def test_send_reaches_only_subscribed_signups_with_working_links(self):
        resp = self.staff.post(
            self.url, {"subject": "Beta news", "body": "It's coming."}, format="json"
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["recipient_count"], 2)
        self.assertEqual(resp.data["failed_count"], 0)
        self.assertIsNotNone(resp.data["sent_at"])

        newsletter = Newsletter.objects.get()
        self.assertEqual(newsletter.recipient_count, 2)
        self.assertEqual(len(mail.outbox), 2)
        by_recipient = {msg.to[0]: msg for msg in mail.outbox}
        self.assertEqual(
            set(by_recipient), {"a@example.com", "b@example.com"}
        )
        for signup in self.subscribed:
            body = by_recipient[signup.email].body
            self.assertIn("It's coming.", body)
            self.assertIn(
                "https://api.example.com/api/waitlist/unsubscribe/?token=", body
            )
            token = body.rsplit("token=", 1)[1].strip()
            # The personalized link must round-trip to this signup.
            self.assertEqual(read_unsubscribe_token(token), signup.pk)

    def test_one_failing_address_does_not_block_the_rest(self):
        real_send = EmailMessage.send

        def flaky_send(msg, *args, **kwargs):
            if msg.to == ["a@example.com"]:
                raise RuntimeError("smtp down")
            return real_send(msg, *args, **kwargs)

        with patch("dashboard.emails.EmailMessage.send", flaky_send):
            resp = self.staff.post(
                self.url, {"subject": "Hi", "body": "News."}, format="json"
            )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["recipient_count"], 1)
        self.assertEqual(resp.data["failed_count"], 1)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["b@example.com"])
        # The composed text is never lost, whatever the mail backend does.
        self.assertEqual(Newsletter.objects.count(), 1)

    def test_blank_subject_or_body_is_rejected(self):
        for payload in ({"subject": "", "body": "x"}, {"subject": "x", "body": ""}):
            resp = self.staff.post(self.url, payload, format="json")
            self.assertEqual(resp.status_code, 400)
        self.assertEqual(Newsletter.objects.count(), 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_history_lists_newest_first(self):
        self.staff.post(self.url, {"subject": "First", "body": "1"}, format="json")
        self.staff.post(self.url, {"subject": "Second", "body": "2"}, format="json")
        resp = self.staff.get(self.url)
        subjects = [row["subject"] for row in resp.data["results"]]
        self.assertEqual(subjects, ["Second", "First"])
