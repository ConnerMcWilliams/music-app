"""
Tests for account registration, login, Google sign-in, session lifecycle,
and isolation.

The credential endpoints are rate-limited (ScopedRateThrottle). DRF keeps the
throttle history in the cache, so each test clears it in setUp to start from a
clean rate budget rather than inheriting counts from a prior test.
"""
from __future__ import annotations

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured
from django.db import IntegrityError
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from .google import GoogleTokenError, verify_google_id_token

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


GOOGLE_CLAIMS = {
    "sub": "google-sub-1234567890",
    "email": "gplayer@example.com",
    "email_verified": True,
    "name": "G Player",
    "aud": "web-client-id.apps.googleusercontent.com",
}

GENERIC_GOOGLE_ERROR = "Google sign-in failed. Please try again."


@patch("users.serializers.verify_google_id_token")
class GoogleLoginTests(ThrottleResetMixin, TestCase):
    """Endpoint tests with the token verifier mocked — no network, no real JWTs.

    The verifier is patched where it is *used* (users.serializers), so these
    tests exercise everything from the URL down to account resolution.
    """

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.url = reverse("users:google")

    def _post(self):
        return self.client.post(self.url, {"id_token": "raw-token"}, format="json")

    def test_new_user_created_with_google_identity(self, verify):
        verify.return_value = dict(GOOGLE_CLAIMS)
        resp = self._post()
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertIn("access", resp.data)
        self.assertIn("refresh", resp.data)
        self.assertEqual(resp.data["user"]["email"], "gplayer@example.com")
        self.assertEqual(resp.data["user"]["display_name"], "G Player")
        user = User.objects.get(email="gplayer@example.com")
        self.assertEqual(user.google_sub, GOOGLE_CLAIMS["sub"])
        # Google-only accounts must not have a usable (guessable) password.
        self.assertFalse(user.has_usable_password())

    def test_display_name_falls_back_to_email_local_part(self, verify):
        verify.return_value = {**GOOGLE_CLAIMS, "name": ""}
        resp = self._post()
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["user"]["display_name"], "gplayer")

    def test_existing_google_account_signs_in_without_duplicate(self, verify):
        verify.return_value = dict(GOOGLE_CLAIMS)
        first = self._post()
        self.assertEqual(first.status_code, 200)
        again = self._post()
        self.assertEqual(again.status_code, 200)
        self.assertEqual(User.objects.filter(google_sub=GOOGLE_CLAIMS["sub"]).count(), 1)
        self.assertEqual(first.data["user"]["id"], again.data["user"]["id"])

    def test_google_sub_matching_survives_email_change(self, verify):
        verify.return_value = dict(GOOGLE_CLAIMS)
        first = self._post()
        # Same Google account, new email — must resolve to the same user.
        verify.return_value = {**GOOGLE_CLAIMS, "email": "renamed@example.com"}
        again = self._post()
        self.assertEqual(again.status_code, 200)
        self.assertEqual(first.data["user"]["id"], again.data["user"]["id"])

    def test_existing_password_account_is_linked_by_verified_email(self, verify):
        existing = User.objects.create_user(
            email="gplayer@example.com", password=STRONG_PASSWORD, display_name="Original"
        )
        verify.return_value = dict(GOOGLE_CLAIMS)
        resp = self._post()
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["user"]["id"], str(existing.id))
        # Linked, not renamed: the account keeps its own display name.
        self.assertEqual(resp.data["user"]["display_name"], "Original")
        existing.refresh_from_db()
        self.assertEqual(existing.google_sub, GOOGLE_CLAIMS["sub"])
        # Password login must keep working after the link.
        login = self.client.post(
            reverse("users:login"),
            {"email": "gplayer@example.com", "password": STRONG_PASSWORD},
            format="json",
        )
        self.assertEqual(login.status_code, 200, login.data)

    def test_email_linked_to_a_different_google_account_is_rejected(self, verify):
        # An account already linked to Google account "other-sub" must not be
        # silently re-linked to a new Google account with the same email (e.g. a
        # recycled/reassigned address) — that would be an account takeover.
        existing = User.objects.create_user(
            email="gplayer@example.com", password=STRONG_PASSWORD
        )
        existing.google_sub = "other-sub-existing"
        existing.save(update_fields=["google_sub"])
        verify.return_value = dict(GOOGLE_CLAIMS)  # sub = google-sub-1234567890
        resp = self._post()
        self.assertEqual(resp.status_code, 400)
        self.assertIn(GENERIC_GOOGLE_ERROR, str(resp.data))
        existing.refresh_from_db()
        self.assertEqual(existing.google_sub, "other-sub-existing")

    def test_concurrent_create_race_resolves_to_the_existing_account(self, verify):
        verify.return_value = dict(GOOGLE_CLAIMS)
        # Simulate the lost create race: a concurrent request created the account
        # between our lookups and our insert, so create_user raises IntegrityError
        # and we must fall back to the now-existing row instead of 500-ing.
        winner = User.objects.create_user(
            email="gplayer@example.com", password=None, google_sub=GOOGLE_CLAIMS["sub"]
        )
        with patch.object(
            User.objects, "create_user", side_effect=IntegrityError("duplicate google_sub")
        ):
            resp = self._post()
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["user"]["id"], str(winner.id))
        self.assertEqual(User.objects.filter(google_sub=GOOGLE_CLAIMS["sub"]).count(), 1)

    def test_unverified_email_rejected_without_side_effects(self, verify):
        verify.return_value = {**GOOGLE_CLAIMS, "email_verified": False}
        resp = self._post()
        self.assertEqual(resp.status_code, 400)
        self.assertIn(GENERIC_GOOGLE_ERROR, str(resp.data))
        self.assertFalse(User.objects.filter(email="gplayer@example.com").exists())

    def test_invalid_token_gives_generic_error(self, verify):
        verify.side_effect = GoogleTokenError("bad token")
        resp = self._post()
        self.assertEqual(resp.status_code, 400)
        self.assertIn(GENERIC_GOOGLE_ERROR, str(resp.data))

    def test_inactive_account_gives_same_generic_error(self, verify):
        User.objects.create_user(
            email="gplayer@example.com", password=STRONG_PASSWORD, is_active=False
        )
        verify.return_value = dict(GOOGLE_CLAIMS)
        resp = self._post()
        self.assertEqual(resp.status_code, 400)
        self.assertIn(GENERIC_GOOGLE_ERROR, str(resp.data))

    def test_response_never_leaks_sensitive_fields(self, verify):
        verify.return_value = dict(GOOGLE_CLAIMS)
        resp = self._post()
        self.assertNotIn("google_sub", resp.data["user"])
        self.assertNotIn("password", resp.data["user"])

    def test_missing_id_token_rejected(self, verify):
        resp = self.client.post(self.url, {}, format="json")
        self.assertEqual(resp.status_code, 400)
        verify.assert_not_called()


class GoogleTokenVerifierTests(TestCase):
    """Unit tests for the verifier seam itself (google-auth call mocked)."""

    @override_settings(GOOGLE_OAUTH_CLIENT_IDS=[])
    def test_unconfigured_server_raises_improperly_configured(self):
        with self.assertRaises(ImproperlyConfigured):
            verify_google_id_token("raw-token")

    @override_settings(GOOGLE_OAUTH_CLIENT_IDS=["web-client-id.apps.googleusercontent.com"])
    def test_unexpected_audience_rejected(self):
        claims = {**GOOGLE_CLAIMS, "aud": "someone-elses-client-id"}
        with patch("users.google.id_token.verify_oauth2_token", return_value=claims):
            with self.assertRaises(GoogleTokenError):
                verify_google_id_token("raw-token")

    @override_settings(
        GOOGLE_OAUTH_CLIENT_IDS=[
            "web-client-id.apps.googleusercontent.com",
            "ios-client-id.apps.googleusercontent.com",
        ]
    )
    def test_any_configured_audience_accepted(self):
        # iOS-minted tokens carry the iOS client ID; both platforms must pass.
        claims = {**GOOGLE_CLAIMS, "aud": "ios-client-id.apps.googleusercontent.com"}
        with patch("users.google.id_token.verify_oauth2_token", return_value=claims):
            self.assertEqual(verify_google_id_token("raw-token"), claims)

    @override_settings(GOOGLE_OAUTH_CLIENT_IDS=["web-client-id.apps.googleusercontent.com"])
    def test_library_rejection_maps_to_google_token_error(self):
        with patch(
            "users.google.id_token.verify_oauth2_token", side_effect=ValueError("expired")
        ):
            with self.assertRaises(GoogleTokenError):
                verify_google_id_token("raw-token")


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
