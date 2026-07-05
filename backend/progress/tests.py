from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from .models import Profile

User = get_user_model()


class ProfileModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="p@example.com", password="x")

    def test_for_user_creates_profile_once(self):
        self.assertEqual(Profile.objects.count(), 0)

        profile = Profile.for_user(self.user)

        self.assertEqual(profile.user, self.user)
        # Called again, it returns the same row rather than creating a second.
        self.assertEqual(Profile.for_user(self.user).pk, profile.pk)
        self.assertEqual(Profile.objects.count(), 1)

    def test_new_profile_starts_at_zero(self):
        profile = Profile.for_user(self.user)
        self.assertEqual(profile.day_streak, 0)
        self.assertEqual(profile.longest_streak, 0)
        self.assertEqual(profile.studies_completed, 0)
        self.assertEqual(profile.avg_score, 0)
        self.assertIsNone(profile.last_active_date)

    def test_record_practice_first_time_starts_streak_at_one(self):
        profile = Profile.for_user(self.user)
        today = date(2026, 7, 5)

        profile.record_practice(score=90, today=today)

        self.assertEqual(profile.day_streak, 1)
        self.assertEqual(profile.longest_streak, 1)
        self.assertEqual(profile.last_active_date, today)
        self.assertEqual(profile.studies_completed, 1)
        self.assertEqual(profile.avg_score, 90)

    def test_record_practice_consecutive_day_increments_streak(self):
        today = date(2026, 7, 5)
        profile = Profile.for_user(self.user)
        profile.day_streak = 3
        profile.longest_streak = 3
        profile.last_active_date = today - timedelta(days=1)
        profile.save()

        profile.record_practice(score=80, today=today)

        self.assertEqual(profile.day_streak, 4)
        self.assertEqual(profile.longest_streak, 4)

    def test_record_practice_same_day_does_not_change_streak(self):
        today = date(2026, 7, 5)
        profile = Profile.for_user(self.user)
        profile.day_streak = 5
        profile.last_active_date = today
        profile.save()

        profile.record_practice(score=70, today=today)

        self.assertEqual(profile.day_streak, 5)
        # But it still counts as a completed study.
        self.assertEqual(profile.studies_completed, 1)

    def test_record_practice_gap_resets_streak_but_keeps_best(self):
        today = date(2026, 7, 5)
        profile = Profile.for_user(self.user)
        profile.day_streak = 9
        profile.longest_streak = 9
        profile.last_active_date = today - timedelta(days=3)
        profile.save()

        profile.record_practice(score=88, today=today)

        self.assertEqual(profile.day_streak, 1)
        self.assertEqual(profile.longest_streak, 9)

    def test_record_practice_updates_running_average(self):
        profile = Profile.for_user(self.user)
        profile.avg_score = 80
        profile.scored_count = 2
        profile.save()

        profile.record_practice(score=90)  # mean of {80, 80, 90} = 83.3 -> 83

        self.assertEqual(profile.scored_count, 3)
        self.assertEqual(profile.avg_score, 83)

    def test_record_practice_persists_to_db(self):
        profile = Profile.for_user(self.user)
        profile.record_practice(score=75, today=date(2026, 7, 5))

        reloaded = Profile.objects.get(pk=profile.pk)
        self.assertEqual(reloaded.day_streak, 1)
        self.assertEqual(reloaded.avg_score, 75)


class ProfileEndpointTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="me@example.com", password="x")
        self.client = APIClient()
        self.url = reverse("progress:current-profile")

    def test_requires_authentication(self):
        resp = self.client.get(self.url)
        self.assertEqual(resp.status_code, 401)

    def test_returns_current_users_stats(self):
        profile = Profile.for_user(self.user)
        profile.day_streak = 7
        profile.longest_streak = 12
        profile.studies_completed = 4
        profile.avg_score = 83
        profile.save()

        self.client.force_authenticate(self.user)
        resp = self.client.get(self.url)

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp.json(),
            {"day_streak": 7, "personal_best": 12, "studies_done": 4, "avg_score": 83},
        )

    def test_creates_profile_on_first_access(self):
        self.assertEqual(Profile.objects.count(), 0)

        self.client.force_authenticate(self.user)
        resp = self.client.get(self.url)

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(Profile.objects.filter(user=self.user).count(), 1)
        # A brand-new profile reports zeroed stats.
        self.assertEqual(resp.json()["day_streak"], 0)

    def test_users_only_see_their_own_stats(self):
        Profile.for_user(self.user)  # requester: zeros
        other = User.objects.create_user(email="other@example.com", password="x")
        other_profile = Profile.for_user(other)
        other_profile.day_streak = 99
        other_profile.save()

        self.client.force_authenticate(self.user)
        resp = self.client.get(self.url)

        self.assertEqual(resp.json()["day_streak"], 0)
