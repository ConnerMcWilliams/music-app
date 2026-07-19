"""
Tests for update posts: the public feed the marketing site renders and the
staff-only manage endpoints the dashboard uses.

The public list is rate-limited (ScopedRateThrottle), so throttle-sensitive
tests clear the cache in setUp to start from a clean rate budget.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse
from rest_framework.settings import api_settings
from rest_framework.test import APIClient

from .models import UpdatePost

User = get_user_model()


class ThrottleResetMixin:
    """Reset DRF's throttle cache before each test so scopes start fresh."""

    def setUp(self):
        cache.clear()
        super().setUp()


class PublicUpdatesTests(ThrottleResetMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.url = reverse("updates:public-list")

    def test_lists_only_published_posts_newest_first(self):
        UpdatePost.objects.create(title="Old news", body="a", published=True)
        UpdatePost.objects.create(title="Draft", body="b", published=False)
        UpdatePost.objects.create(title="Fresh news", body="c", published=True)
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200)
        # Paginated envelope — the web page reads .results.
        self.assertEqual(resp.data["count"], 2)
        titles = [row["title"] for row in resp.data["results"]]
        self.assertEqual(titles, ["Fresh news", "Old news"])

    def test_requests_beyond_the_rate_limit_are_throttled(self):
        rate = api_settings.DEFAULT_THROTTLE_RATES["updates_public"]
        limit = int(rate.split("/")[0])
        for _ in range(limit):
            self.assertEqual(self.client.get(self.url).status_code, 200)
        self.assertEqual(self.client.get(self.url).status_code, 429)


class ManageUpdatesTests(TestCase):
    def setUp(self):
        self.anon = APIClient()
        self.member = APIClient()
        self.member.force_authenticate(
            User.objects.create_user("member@example.com", "pw")
        )
        self.staff = APIClient()
        self.staff.force_authenticate(
            User.objects.create_user("owner@example.com", "pw", is_staff=True)
        )
        self.list_url = reverse("updates:manage-list")

    def detail_url(self, post: UpdatePost) -> str:
        return reverse("updates:manage-detail", args=[post.pk])

    def test_manage_endpoints_are_staff_only(self):
        post = UpdatePost.objects.create(title="T", body="b")
        for client, expected in ((self.anon, 401), (self.member, 403)):
            self.assertEqual(client.get(self.list_url).status_code, expected)
            self.assertEqual(client.get(self.detail_url(post)).status_code, expected)
            self.assertEqual(
                client.post(
                    self.list_url, {"title": "X", "body": "y"}, format="json"
                ).status_code,
                expected,
            )
        self.assertEqual(UpdatePost.objects.count(), 1)

    def test_manage_list_includes_drafts(self):
        UpdatePost.objects.create(title="Draft", body="b", published=False)
        UpdatePost.objects.create(title="Live", body="b", published=True)
        resp = self.staff.get(self.list_url)
        self.assertEqual(resp.data["count"], 2)

    def test_create_publish_and_delete_round_trip(self):
        # Create — drafts by default.
        resp = self.staff.post(
            self.list_url, {"title": "Beta opens", "body": "Soon."}, format="json"
        )
        self.assertEqual(resp.status_code, 201)
        self.assertFalse(resp.data["published"])
        post = UpdatePost.objects.get()
        public_url = reverse("updates:public-list")
        self.assertEqual(self.anon.get(public_url).data["count"], 0)

        # Publish via PATCH — appears on the public feed with no other change.
        resp = self.staff.patch(
            self.detail_url(post), {"published": True}, format="json"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["published"])
        self.assertEqual(self.anon.get(public_url).data["count"], 1)

        # Delete — gone everywhere.
        resp = self.staff.delete(self.detail_url(post))
        self.assertEqual(resp.status_code, 204)
        self.assertEqual(UpdatePost.objects.count(), 0)

    def test_blank_title_or_body_is_rejected(self):
        for payload in ({"title": "", "body": "x"}, {"title": "x", "body": ""}):
            resp = self.staff.post(self.list_url, payload, format="json")
            self.assertEqual(resp.status_code, 400)
        self.assertEqual(UpdatePost.objects.count(), 0)
