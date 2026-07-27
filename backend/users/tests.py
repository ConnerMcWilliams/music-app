"""
Tests for account registration, login, Google sign-in, session lifecycle,
and isolation.

The credential endpoints are rate-limited (ScopedRateThrottle). DRF keeps the
throttle history in the cache, so each test clears it in setUp to start from a
clean rate budget rather than inheriting counts from a prior test.
"""
from __future__ import annotations

import re
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured
from django.db import IntegrityError
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from . import instruments
from .google import GoogleTokenError, verify_google_id_token
from .models import UserPreferences

User = get_user_model()

STRONG_PASSWORD = "clarke-Trumpet-92xz"

# The client mirror of ``users.instruments`` (see that module's docstring). It is
# hand-maintained, so this suite parses it and pins it against the Python side.
MOBILE_INSTRUMENTS_TS = (
    Path(__file__).resolve().parents[2] / "apps" / "mobile" / "src" / "data" / "instruments.ts"
)

# Fields that must agree across the two files, named as the TypeScript spells them.
MIRRORED_FIELDS = ("slug", "label", "clef", "soundingOffsetSemitones", "family")

_TS_ARRAY_RE = re.compile(r"export const INSTRUMENTS\s*(?::[^=]*)?=\s*\[(.*?)\n\];", re.DOTALL)
_TS_LINE_COMMENT_RE = re.compile(r"//[^\n]*")
_TS_ENTRY_RE = re.compile(r"\{([^{}]*)\}")
_TS_FIELD_RE = re.compile(r"(\w+)\s*:\s*(?:'([^']*)'|\"([^\"]*)\"|(-?\d+))")


def parse_mobile_instruments(source: str) -> list[dict[str, object]]:
    """Read the ``INSTRUMENTS`` array out of the TypeScript mirror.

    A small regex reader rather than a real parser: the array is a flat list of
    object literals, and the alternative — shelling out to Node from a Django
    test — would put the mobile toolchain on the backend job's critical path.
    Anything the reader cannot understand raises instead of silently yielding a
    short list, so a reformat surfaces as a failure to fix rather than a check
    that quietly stops checking.
    """
    match = _TS_ARRAY_RE.search(source)
    if match is None:
        raise AssertionError(
            f"No INSTRUMENTS array found in {MOBILE_INSTRUMENTS_TS}. If the file moved or was "
            "reformatted, update parse_mobile_instruments to match."
        )
    body = _TS_LINE_COMMENT_RE.sub("", match.group(1))
    entries: list[dict[str, object]] = []
    for literal in _TS_ENTRY_RE.findall(body):
        fields: dict[str, object] = {}
        for name, single, double, number in _TS_FIELD_RE.findall(literal):
            fields[name] = int(number) if number else single or double
        entries.append(fields)
    if not entries:
        raise AssertionError(
            f"Parsed zero instruments from {MOBILE_INSTRUMENTS_TS}; the reader is out of date."
        )
    return entries


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

    def test_registration_sends_no_welcome_email(self):
        # Signup no longer asks for a name — it is onboarding step 1 — so the
        # welcome waits for the flow to finish (see WelcomeEmailTests). Drain the
        # on_commit queue so a stray dispatch would show up rather than hide.
        with self.captureOnCommitCallbacks(execute=True):
            resp = self.client.post(
                self.url,
                {"email": "welcome@example.com", "password": STRONG_PASSWORD},
                format="json",
            )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(len(mail.outbox), 0)


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

    def test_google_sign_in_never_welcomes_at_account_creation(self, verify):
        # Google sign-up goes through onboarding like every other account, so
        # the welcome comes from completing the flow — never from this endpoint,
        # on the creating call or any later one.
        verify.return_value = dict(GOOGLE_CLAIMS)
        with self.captureOnCommitCallbacks(execute=True):
            created = self._post()
        self.assertEqual(created.status_code, 200, created.data)
        self.assertTrue(User.objects.filter(email="gplayer@example.com").exists())
        with self.captureOnCommitCallbacks(execute=True):
            again = self._post()
        self.assertEqual(again.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    def test_linking_an_existing_account_sends_no_welcome(self, verify):
        # Linking Google to a pre-existing password account is a sign-in, not a
        # sign-up, so it must not email either.
        User.objects.create_user(
            email="gplayer@example.com", password=STRONG_PASSWORD, display_name="Original"
        )
        verify.return_value = dict(GOOGLE_CLAIMS)
        with self.captureOnCommitCallbacks(execute=True):
            resp = self._post()
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(len(mail.outbox), 0)


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


class InstrumentCatalogTests(TestCase):
    """Pins the onboarding instrument list and its transposition data.

    These values are musical facts the per-instrument transposition of the Clarke
    corpus will be generated from, so a change here must be deliberate rather
    than a side effect of editing the picker's copy.
    """

    def test_twelve_instruments_in_picker_order(self):
        self.assertEqual(
            [i.slug for i in instruments.INSTRUMENTS],
            [
                "trumpet",
                "cornet",
                "flugelhorn",
                "piccolo-trumpet",
                "french-horn",
                "mellophone",
                "alto-horn",
                "baritone-treble",
                "euphonium-treble",
                "trombone",
                "bass-trombone",
                "tuba",
            ],
        )

    def test_sounding_offsets(self):
        offsets = {i.slug: i.sounding_offset_semitones for i in instruments.INSTRUMENTS}
        self.assertEqual(
            offsets,
            {
                # B♭ instruments sound a major second below written.
                "trumpet": -2,
                "cornet": -2,
                "flugelhorn": -2,
                # B♭ piccolo trumpet: an octave above the B♭ trumpet.
                "piccolo-trumpet": 10,
                # F instruments sound a perfect fifth below written.
                "french-horn": -7,
                "mellophone": -7,
                # E♭ alto/tenor horn sounds a major sixth below written.
                "alto-horn": -9,
                # Treble-clef low brass reads as a B♭ tenor: a major ninth below.
                "baritone-treble": -14,
                "euphonium-treble": -14,
                # Bass-clef low brass reads concert pitch.
                "trombone": 0,
                "bass-trombone": 0,
                "tuba": 0,
            },
        )

    def test_only_bass_clef_instruments_are_the_low_brass_readers(self):
        bass = {i.slug for i in instruments.INSTRUMENTS if i.clef == instruments.CLEF_BASS}
        self.assertEqual(bass, {"trombone", "bass-trombone", "tuba"})

    def test_get_instrument_resolves_known_slugs_only(self):
        self.assertEqual(instruments.get_instrument("tuba").label, "Tuba")
        self.assertIsNone(instruments.get_instrument("kazoo"))

    def test_choices_mirror_the_instrument_list(self):
        self.assertEqual(
            instruments.INSTRUMENT_CHOICES,
            [(i.slug, i.label) for i in instruments.INSTRUMENTS],
        )

    def test_typescript_mirror_matches_this_module(self):
        """``apps/mobile/src/data/instruments.ts`` must agree entry for entry.

        The client keeps its own copy so the picker renders offline, and the
        per-instrument transposition work will read the offsets from that copy
        on device. Nothing else compares the two, so an instrument added,
        renamed, or re-pitched on one side only would transpose the studies
        wrong rather than fail — hence this check.
        """
        self.assertTrue(
            MOBILE_INSTRUMENTS_TS.is_file(),
            f"The client mirror is missing: {MOBILE_INSTRUMENTS_TS}",
        )
        expected = [
            {
                "slug": i.slug,
                "label": i.label,
                "clef": i.clef,
                "soundingOffsetSemitones": i.sounding_offset_semitones,
                "family": i.family,
            }
            for i in instruments.INSTRUMENTS
        ]
        parsed = parse_mobile_instruments(MOBILE_INSTRUMENTS_TS.read_text(encoding="utf-8"))
        # Compare only the mirrored fields, but compare the whole ordered list,
        # so a missing field, a reordering, or an instrument present in just one
        # file all fail rather than only value edits to shared entries.
        actual = [{name: entry.get(name) for name in MIRRORED_FIELDS} for entry in parsed]
        self.assertEqual(
            actual,
            expected,
            "users/instruments.py and apps/mobile/src/data/instruments.ts have drifted apart; "
            "they are hand-mirrored and must be changed together.",
        )


class PreferencesTests(ThrottleResetMixin, TestCase):
    """GET/PATCH /api/preferences/ — the onboarding answers."""

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.url = reverse("users:preferences")
        self.user = User.objects.create_user(
            email="player@example.com", password=STRONG_PASSWORD, display_name="Player One"
        )
        self.client.force_authenticate(self.user)

    def test_requires_authentication(self):
        anon = APIClient()
        self.assertEqual(anon.get(self.url).status_code, 401)
        self.assertEqual(anon.patch(self.url, {}, format="json").status_code, 401)

    def test_get_creates_the_row_with_defaults(self):
        self.assertFalse(UserPreferences.objects.filter(user=self.user).exists())

        resp = self.client.get(self.url)

        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["display_name"], "Player One")
        self.assertEqual(resp.data["instrument"], "")
        self.assertEqual(resp.data["practice_days_goal"], 5)
        self.assertIsNone(resp.data["clarke_start_section"])
        self.assertFalse(resp.data["onboarding_completed"])
        self.assertTrue(UserPreferences.objects.filter(user=self.user).exists())

    def test_only_ever_touches_the_callers_own_row(self):
        other = User.objects.create_user(email="other@example.com", password=STRONG_PASSWORD)
        UserPreferences.objects.create(user=other, instrument="tuba")

        self.client.patch(self.url, {"instrument": "trumpet"}, format="json")

        other.preferences.refresh_from_db()
        self.assertEqual(other.preferences.instrument, "tuba")
        self.assertEqual(self.user.preferences.instrument, "trumpet")

    def test_partial_patch_preserves_unsent_answers(self):
        """The flow saves one step at a time, so a later step must not blank earlier ones."""
        self.client.patch(self.url, {"display_name": "Herbert"}, format="json")
        self.client.patch(self.url, {"instrument": "cornet"}, format="json")
        resp = self.client.patch(self.url, {"primary_goal": "endurance"}, format="json")

        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["display_name"], "Herbert")
        self.assertEqual(resp.data["instrument"], "cornet")
        self.assertEqual(resp.data["primary_goal"], "endurance")
        # Untouched throughout.
        self.assertEqual(resp.data["practice_days_goal"], 5)

    def test_display_name_writes_through_to_the_account(self):
        resp = self.client.patch(self.url, {"display_name": "Herbert"}, format="json")

        self.assertEqual(resp.status_code, 200, resp.data)
        self.user.refresh_from_db()
        self.assertEqual(self.user.display_name, "Herbert")

    def test_complete_stamps_onboarding_and_is_idempotent(self):
        resp = self.client.patch(
            self.url, {"clarke_start_section": 3, "complete": True}, format="json"
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data["onboarding_completed"])
        # ``complete`` is write-only — it must not echo back.
        self.assertNotIn("complete", resp.data)

        first = UserPreferences.objects.get(user=self.user).onboarding_completed_at
        self.assertIsNotNone(first)

        # Editing an answer later (from the account screen) re-sends complete;
        # the original completion time must not move.
        self.client.patch(self.url, {"instrument": "tuba", "complete": True}, format="json")
        self.assertEqual(UserPreferences.objects.get(user=self.user).onboarding_completed_at, first)

    def test_clarke_start_section_accepts_null_for_new_players(self):
        self.client.patch(self.url, {"clarke_start_section": 4}, format="json")
        resp = self.client.patch(self.url, {"clarke_start_section": None}, format="json")

        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertIsNone(resp.data["clarke_start_section"])

    def test_reminder_time_round_trips(self):
        resp = self.client.patch(
            self.url, {"reminder_time": "07:30:00", "reminder_enabled": True}, format="json"
        )

        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(str(resp.data["reminder_time"]), "07:30:00")
        self.assertTrue(resp.data["reminder_enabled"])

    def test_rejects_unknown_instrument(self):
        resp = self.client.patch(self.url, {"instrument": "kazoo"}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("instrument", resp.data)

    def test_rejects_clarke_section_out_of_range(self):
        for value in (0, 11):
            with self.subTest(value=value):
                resp = self.client.patch(
                    self.url, {"clarke_start_section": value}, format="json"
                )
                self.assertEqual(resp.status_code, 400)
                self.assertIn("clarke_start_section", resp.data)

    def test_rejects_practice_days_out_of_range(self):
        for value in (0, 8):
            with self.subTest(value=value):
                resp = self.client.patch(
                    self.url, {"practice_days_goal": value}, format="json"
                )
                self.assertEqual(resp.status_code, 400)
                self.assertIn("practice_days_goal", resp.data)

    def test_rejects_unknown_experience_or_goal(self):
        self.assertEqual(
            self.client.patch(self.url, {"experience_level": "decades"}, format="json").status_code,
            400,
        )
        self.assertEqual(
            self.client.patch(self.url, {"primary_goal": "fame"}, format="json").status_code, 400
        )


class WelcomeEmailTests(ThrottleResetMixin, TestCase):
    """The welcome lands when onboarding completes, not when the account is made.

    Signup (and Google sign-up) never asks for a name — that is onboarding step
    1 — so the greeting can only be personalised once the flow finishes. The
    dispatch hangs off the null → stamped transition of ``onboarding_completed_at``
    and runs from ``transaction.on_commit``, which a plain ``TestCase`` never
    fires: the helpers below capture and execute those callbacks explicitly.
    """

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.url = reverse("users:preferences")
        self.user = User.objects.create_user(
            email="player@example.com", password=STRONG_PASSWORD
        )
        self.client.force_authenticate(self.user)

    def _patch(self, body: dict):
        with self.captureOnCommitCallbacks(execute=True):
            return self.client.patch(self.url, body, format="json")

    def test_first_completion_welcomes_the_player_by_name(self):
        self._patch({"display_name": "Marcus Bell"})

        resp = self._patch({"clarke_start_section": 3, "complete": True})

        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(len(mail.outbox), 1)
        msg = mail.outbox[0]
        self.assertEqual(msg.to, ["player@example.com"])
        self.assertIn("Welcome to Clarke Coach", msg.subject)
        self.assertIn("Hi Marcus Bell,", msg.body)

    def test_name_saved_in_the_completing_patch_is_still_used(self):
        # The greeting reads the account row this request just wrote, not a
        # stale copy loaded before the name step.
        self._patch({"display_name": "Herbert L. Clarke", "complete": True})

        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Hi Herbert L. Clarke,", mail.outbox[0].body)

    def test_welcome_fires_exactly_once_however_answers_are_edited(self):
        self._patch({"display_name": "Marcus"})
        self._patch({"complete": True})
        self.assertEqual(len(mail.outbox), 1)

        # Editing an answer later from the account screen: a plain PATCH, and a
        # PATCH that re-sends `complete`. Neither is a new completion.
        self._patch({"instrument": "tuba"})
        self._patch({"primary_goal": "tone", "complete": True})

        self.assertEqual(len(mail.outbox), 1)

    def test_welcome_is_sent_only_after_commit(self):
        # Without draining the on_commit queue the stamp lands but no mail goes
        # out — proving the send is gated on the transaction committing.
        resp = self.client.patch(self.url, {"complete": True}, format="json")

        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data["onboarding_completed"])
        self.assertEqual(len(mail.outbox), 0)

    def test_generic_greeting_when_the_name_step_was_skipped(self):
        self._patch({"complete": True})

        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("Hi there,", mail.outbox[0].body)

    def test_welcome_failure_does_not_break_completion(self):
        with patch(
            "users.emails.EmailMessage.send", side_effect=Exception("mail backend down")
        ):
            resp = self._patch({"complete": True})

        # Onboarding is finished and the response is normal even though the
        # welcome send raised — mail is strictly best-effort.
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(UserPreferences.objects.get(user=self.user).onboarding_completed)

    def test_saving_an_answer_without_completing_sends_nothing(self):
        self._patch({"display_name": "Marcus", "instrument": "cornet"})

        self.assertEqual(len(mail.outbox), 0)

    def test_google_created_account_is_welcomed_once_it_finishes_onboarding(self):
        # The Google path stops welcoming at account creation, so completion is
        # the single trigger for every account however it was created.
        google_user = User.objects.create_user(
            email="gplayer@example.com",
            password=None,
            display_name="G Player",
            google_sub="google-sub-welcome",
        )
        self.client.force_authenticate(google_user)

        self._patch({"complete": True})

        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["gplayer@example.com"])
        self.assertIn("Hi G Player,", mail.outbox[0].body)


class OnboardingFlagTests(ThrottleResetMixin, TestCase):
    """``onboarding_completed`` on every session payload — the mobile route gate."""

    def setUp(self):
        super().setUp()
        self.client = APIClient()

    def test_register_response_reports_not_onboarded(self):
        resp = self.client.post(
            reverse("users:register"),
            {"email": "new@example.com", "password": STRONG_PASSWORD},
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertFalse(resp.data["user"]["onboarding_completed"])

    def test_me_reports_false_when_no_preferences_row_exists(self):
        """Accounts created before onboarding existed have no row — they get the flow once."""
        user = User.objects.create_user(email="legacy@example.com", password=STRONG_PASSWORD)
        self.assertFalse(UserPreferences.objects.filter(user=user).exists())

        self.client.force_authenticate(user)
        resp = self.client.get(reverse("users:me"))

        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["onboarding_completed"])

    def test_me_reports_false_for_an_unfinished_row(self):
        user = User.objects.create_user(email="partial@example.com", password=STRONG_PASSWORD)
        UserPreferences.objects.create(user=user, instrument="trumpet")

        self.client.force_authenticate(user)
        resp = self.client.get(reverse("users:me"))

        self.assertFalse(resp.data["onboarding_completed"])

    def test_me_and_login_report_true_once_completed(self):
        user = User.objects.create_user(email="done@example.com", password=STRONG_PASSWORD)
        UserPreferences.objects.create(user=user, onboarding_completed_at=timezone.now())

        self.client.force_authenticate(user)
        self.assertTrue(self.client.get(reverse("users:me")).data["onboarding_completed"])

        anon = APIClient()
        resp = anon.post(
            reverse("users:login"),
            {"email": "done@example.com", "password": STRONG_PASSWORD},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data["user"]["onboarding_completed"])
