"""
Tests for account registration, login, session lifecycle, and isolation.

The credential endpoints are rate-limited (ScopedRateThrottle). DRF keeps the
throttle history in the cache, so each test clears it in setUp to start from a
clean rate budget rather than inheriting counts from a prior test.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

User = get_user_model()

STRONG_PASSWORD = "clarke-Trumpet-92xz"


class ThrottleResetMixin:
    """Reset DRF's throttle cache before each test so scopes start fresh."""

    def setUp(self):
        cache.clear()
        super().setUp()


class RegisterTests(ThrottleResetMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.url = reverse("users:register")

    def test_register_success_creates_user_and_returns_tokens(self):
        resp = self.client.post(
            self.url,
            {
                "email": "player@example.com",
                "password": STRONG_PASSWORD,
                "display_name": "Player One",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertIn("access", resp.data)
        self.assertIn("refresh", resp.data)
        self.assertEqual(resp.data["user"]["email"], "player@example.com")
        self.assertEqual(resp.data["user"]["display_name"], "Player One")
        self.assertTrue(User.objects.filter(email="player@example.com").exists())

    def test_email_is_normalized(self):
        resp = self.client.post(
            self.url,
            {"email": "Player@EXAMPLE.com", "password": STRONG_PASSWORD, "display_name": "P"},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertTrue(User.objects.filter(email="player@example.com").exists())
        self.assertEqual(resp.data["user"]["email"], "player@example.com")

    def test_duplicate_email_rejected_case_insensitively(self):
        User.objects.create_user(email="dupe@example.com", password=STRONG_PASSWORD)
        resp = self.client.post(
            self.url,
            {"email": "DUPE@example.com", "password": STRONG_PASSWORD, "display_name": "Dupe"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("email", resp.data)

    def test_weak_password_rejected(self):
        resp = self.client.post(
            self.url,
            {"email": "weak@example.com", "password": "123", "display_name": "Weak"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("password", resp.data)
        self.assertFalse(User.objects.filter(email="weak@example.com").exists())

    def test_password_is_hashed_not_stored_plaintext(self):
        self.client.post(
            self.url,
            {"email": "hash@example.com", "password": STRONG_PASSWORD, "display_name": "H"},
            format="json",
        )
        user = User.objects.get(email="hash@example.com")
        self.assertNotEqual(user.password, STRONG_PASSWORD)
        self.assertTrue(user.password.startswith(("pbkdf2_", "argon2", "bcrypt")))
        self.assertTrue(user.check_password(STRONG_PASSWORD))

    def test_password_never_returned_in_response(self):
        resp = self.client.post(
            self.url,
            {"email": "nopw@example.com", "password": STRONG_PASSWORD, "display_name": "N"},
            format="json",
        )
        self.assertNotIn("password", resp.data)
        self.assertNotIn("password", resp.data["user"])

    def test_missing_required_fields_rejected(self):
        resp = self.client.post(self.url, {"email": "x@example.com"}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("password", resp.data)


class LoginTests(ThrottleResetMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.url = reverse("users:login")
        self.user = User.objects.create_user(
            email="login@example.com", password=STRONG_PASSWORD, display_name="Login User"
        )

    def test_login_success_returns_tokens_and_profile(self):
        resp = self.client.post(
            self.url,
            {"email": "login@example.com", "password": STRONG_PASSWORD},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertIn("access", resp.data)
        self.assertIn("refresh", resp.data)
        self.assertEqual(resp.data["user"]["email"], "login@example.com")

    def test_login_is_case_insensitive_on_email(self):
        resp = self.client.post(
            self.url,
            {"email": "LOGIN@example.com", "password": STRONG_PASSWORD},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_invalid_password_gives_generic_error(self):
        resp = self.client.post(
            self.url,
            {"email": "login@example.com", "password": "wrong-password-xyz"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        # Generic message — must not reveal that the email exists.
        self.assertNotIn("password", str(resp.data).lower().replace("password.", ""))

    def test_unknown_email_gives_same_generic_error(self):
        resp = self.client.post(
            self.url,
            {"email": "ghost@example.com", "password": STRONG_PASSWORD},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Invalid email or password.", str(resp.data))


class MeTests(ThrottleResetMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.url = reverse("users:me")
        self.user = User.objects.create_user(
            email="me@example.com", password=STRONG_PASSWORD, display_name="Me"
        )

    def _login(self, email=None, password=STRONG_PASSWORD):
        resp = self.client.post(
            reverse("users:login"),
            {"email": email or self.user.email, "password": password},
            format="json",
        )
        return resp.data["access"]

    def test_me_requires_authentication(self):
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 401)

    def test_me_returns_authenticated_user(self):
        access = self._login()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["email"], "me@example.com")
        self.assertEqual(resp.data["display_name"], "Me")
        self.assertIn("id", resp.data)
        self.assertIn("created_at", resp.data)
        # No sensitive fields leaked.
        self.assertNotIn("password", resp.data)
        self.assertNotIn("is_staff", resp.data)
        self.assertNotIn("is_superuser", resp.data)

    def test_me_derives_user_from_token_not_client_supplied_id(self):
        other = User.objects.create_user(email="other@example.com", password=STRONG_PASSWORD)
        access = self._login()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        # Attempt to smuggle another user's id — it must be ignored.
        resp = self.client.get(self.url, {"id": str(other.id)})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["email"], "me@example.com")


class TokenLifecycleTests(ThrottleResetMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.user = User.objects.create_user(email="tok@example.com", password=STRONG_PASSWORD)

    def _session(self):
        resp = self.client.post(
            reverse("users:login"),
            {"email": self.user.email, "password": STRONG_PASSWORD},
            format="json",
        )
        return resp.data["access"], resp.data["refresh"]

    def test_refresh_issues_new_access_token(self):
        _, refresh = self._session()
        resp = self.client.post(reverse("users:refresh"), {"refresh": refresh}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertIn("access", resp.data)
        # Rotation is on, so a new refresh token is also returned.
        self.assertIn("refresh", resp.data)

    def test_invalid_refresh_token_rejected(self):
        resp = self.client.post(
            reverse("users:refresh"), {"refresh": "not-a-real-token"}, format="json"
        )
        self.assertEqual(resp.status_code, 401)

    def test_rotated_refresh_token_is_blacklisted(self):
        _, refresh = self._session()
        first = self.client.post(reverse("users:refresh"), {"refresh": refresh}, format="json")
        self.assertEqual(first.status_code, 200)
        # Reusing the old (now rotated + blacklisted) refresh token must fail.
        replay = self.client.post(reverse("users:refresh"), {"refresh": refresh}, format="json")
        self.assertEqual(replay.status_code, 401)

    def test_logout_blacklists_refresh_token(self):
        access, refresh = self._session()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        resp = self.client.post(reverse("users:logout"), {"refresh": refresh}, format="json")
        self.assertEqual(resp.status_code, 205)
        # The refresh token no longer works after logout.
        after = self.client.post(reverse("users:refresh"), {"refresh": refresh}, format="json")
        self.assertEqual(after.status_code, 401)

    def test_logout_requires_authentication(self):
        _, refresh = self._session()
        resp = self.client.post(reverse("users:logout"), {"refresh": refresh}, format="json")
        self.assertEqual(resp.status_code, 401)

    def test_logout_is_idempotent_for_bad_token(self):
        access, _ = self._session()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        resp = self.client.post(reverse("users:logout"), {"refresh": "garbage"}, format="json")
        self.assertEqual(resp.status_code, 205)


class UserModelTests(TestCase):
    def test_create_user_normalizes_email_and_hashes_password(self):
        user = User.objects.create_user(email="Model@Example.com", password=STRONG_PASSWORD)
        self.assertEqual(user.email, "model@example.com")
        self.assertTrue(user.check_password(STRONG_PASSWORD))
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_create_superuser_flags(self):
        admin = User.objects.create_superuser(email="admin@example.com", password=STRONG_PASSWORD)
        self.assertTrue(admin.is_staff)
        self.assertTrue(admin.is_superuser)

    def test_create_user_without_email_raises(self):
        with self.assertRaises(ValueError):
            User.objects.create_user(email="", password=STRONG_PASSWORD)
