from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from . import rewards
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
        body = resp.json()
        # Streak/aggregate stats are surfaced as before…
        self.assertEqual(body["day_streak"], 7)
        self.assertEqual(body["personal_best"], 12)
        self.assertEqual(body["studies_done"], 4)
        self.assertEqual(body["avg_score"], 83)
        # …alongside the reward economy (zeros for a fresh reward state).
        self.assertEqual(body["xp"], 0)
        self.assertEqual(body["level"], 1)
        self.assertEqual(body["rank_title"], "Beginner")
        self.assertEqual(body["coins"], 0)
        self.assertEqual(body["streak_freezes"], 0)

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


class RewardsMathTests(TestCase):
    """Pure reward math (no DB) — the tuning lives in ``progress.rewards``."""

    def test_study_value_scales_with_difficulty(self):
        self.assertEqual(rewards.study_xp_value(None), 0)
        self.assertEqual(rewards.study_xp_value(_FakeStudy(1)), 100)
        self.assertEqual(rewards.study_xp_value(_FakeStudy(10)), 1000)

    def test_xp_delta_pays_only_the_improvement(self):
        # First take (no prior best) pays the full grade-as-a-percentage.
        self.assertEqual(rewards.xp_delta(80, 0, 500), 400)
        # Beating a prior best pays only the gain…
        self.assertEqual(rewards.xp_delta(88, 80, 500), 40)
        # …and a take at/under the best pays nothing.
        self.assertEqual(rewards.xp_delta(80, 80, 500), 0)
        self.assertEqual(rewards.xp_delta(70, 80, 500), 0)

    def test_lifetime_xp_from_a_study_is_capped_at_its_value(self):
        # Improving 0→60→100 sums to exactly the study's value (a full "mining").
        value = 500
        total = (
            rewards.xp_delta(60, 0, value)
            + rewards.xp_delta(100, 60, value)
        )
        self.assertEqual(total, value)

    def test_level_thresholds(self):
        self.assertEqual(rewards.total_xp_for_level(1), 0)
        self.assertEqual(rewards.total_xp_for_level(2), 500)
        self.assertEqual(rewards.total_xp_for_level(3), 1500)
        self.assertEqual(rewards.total_xp_for_level(5), 5000)

    def test_level_for_xp_resolves_progress(self):
        self.assertEqual(rewards.level_for_xp(0).level, 1)
        self.assertEqual(rewards.level_for_xp(499).level, 1)
        p = rewards.level_for_xp(800)  # into level 2 (500..1500)
        self.assertEqual(p.level, 2)
        self.assertEqual(p.xp_into_level, 300)
        self.assertEqual(p.xp_for_next_level, 1000)

    def test_rank_titles_track_level_bands(self):
        self.assertEqual(rewards.rank_title(1), "Beginner")
        self.assertEqual(rewards.rank_title(4), "Beginner")
        self.assertEqual(rewards.rank_title(5), "Student")
        self.assertEqual(rewards.rank_title(10), "Cornetist")
        self.assertEqual(rewards.rank_title(20), "Soloist")
        self.assertEqual(rewards.rank_title(35), "Virtuoso")


class _FakeStudy:
    def __init__(self, difficulty: int):
        self.difficulty = difficulty


class RecordPracticeRewardTests(TestCase):
    """``record_practice`` turns a take into XP, levels, and coins."""

    def setUp(self):
        self.user = User.objects.create_user(email="rw@example.com", password="x")

    def test_first_take_awards_full_xp_for_the_score(self):
        profile = Profile.for_user(self.user)

        reward = profile.record_practice(score=80, study_value=1000, prev_best_pct=0)

        self.assertEqual(reward.xp_awarded, 800)
        self.assertEqual(profile.xp_total, 800)
        self.assertEqual(reward.level, 2)          # 800 XP → level 2
        self.assertTrue(reward.leveled_up)
        self.assertEqual(reward.coins_awarded, rewards.COINS_PER_LEVEL)
        self.assertEqual(profile.coins, rewards.COINS_PER_LEVEL)

    def test_take_below_prior_best_awards_no_xp(self):
        profile = Profile.for_user(self.user)

        reward = profile.record_practice(score=70, study_value=1000, prev_best_pct=85)

        self.assertEqual(reward.xp_awarded, 0)
        self.assertEqual(profile.xp_total, 0)
        self.assertFalse(reward.leveled_up)
        self.assertEqual(profile.coins, 0)

    def test_improvement_awards_only_the_delta(self):
        profile = Profile.for_user(self.user)

        reward = profile.record_practice(score=90, study_value=1000, prev_best_pct=80)

        self.assertEqual(reward.xp_awarded, 100)  # (90-80)% of 1000

    def test_multi_level_jump_grants_coins_per_level(self):
        profile = Profile.for_user(self.user)

        # 5000 XP vaults straight from level 1 to level 5 → 4 levels of coins.
        reward = profile.record_practice(score=100, study_value=5000, prev_best_pct=0)

        self.assertEqual(reward.level, 5)
        self.assertEqual(reward.coins_awarded, 4 * rewards.COINS_PER_LEVEL)
        self.assertEqual(profile.coins, 4 * rewards.COINS_PER_LEVEL)

    def test_no_study_value_means_no_xp_but_still_counts_practice(self):
        profile = Profile.for_user(self.user)

        reward = profile.record_practice(score=95)  # unresolved study → value 0

        self.assertEqual(reward.xp_awarded, 0)
        self.assertEqual(profile.studies_completed, 1)
        self.assertEqual(profile.avg_score, 95)


class StreakFreezeBridgingTests(TestCase):
    """Held freezes are spent to bridge missed days in ``record_practice``."""

    def setUp(self):
        self.user = User.objects.create_user(email="fz@example.com", password="x")

    def test_freezes_bridge_a_gap_and_are_consumed(self):
        today = date(2026, 7, 10)
        profile = Profile.for_user(self.user)
        profile.day_streak = 5
        profile.longest_streak = 5
        profile.last_active_date = today - timedelta(days=3)  # 2 days missed
        profile.streak_freezes = 2
        profile.save()

        profile.record_practice(score=50, today=today)

        self.assertEqual(profile.day_streak, 6)       # continued, not reset
        self.assertEqual(profile.streak_freezes, 0)   # both freezes spent

    def test_insufficient_freezes_resets_and_keeps_them(self):
        today = date(2026, 7, 10)
        profile = Profile.for_user(self.user)
        profile.day_streak = 5
        profile.last_active_date = today - timedelta(days=3)  # 2 days missed
        profile.streak_freezes = 1
        profile.save()

        profile.record_practice(score=50, today=today)

        self.assertEqual(profile.day_streak, 1)       # not enough to bridge → reset
        self.assertEqual(profile.streak_freezes, 1)   # untouched


class StreakFreezePurchaseTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="buy@example.com", password="x")
        self.client = APIClient()
        self.url = reverse("progress:streak-freeze")

    def test_requires_authentication(self):
        self.assertEqual(self.client.post(self.url).status_code, 401)

    def test_buys_a_freeze_and_spends_coins(self):
        profile = Profile.for_user(self.user)
        profile.coins = rewards.FREEZE_COST + 10
        profile.save()

        self.client.force_authenticate(self.user)
        resp = self.client.post(self.url)

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["streak_freezes"], 1)
        self.assertEqual(resp.json()["coins"], 10)
        profile.refresh_from_db()
        self.assertEqual(profile.streak_freezes, 1)
        self.assertEqual(profile.coins, 10)

    def test_rejects_when_too_poor(self):
        profile = Profile.for_user(self.user)
        profile.coins = rewards.FREEZE_COST - 1
        profile.save()

        self.client.force_authenticate(self.user)
        resp = self.client.post(self.url)

        self.assertEqual(resp.status_code, 400)
        profile.refresh_from_db()
        self.assertEqual(profile.streak_freezes, 0)
        self.assertEqual(profile.coins, rewards.FREEZE_COST - 1)  # nothing spent

    def test_rejects_at_hold_cap(self):
        profile = Profile.for_user(self.user)
        profile.coins = 10_000
        profile.streak_freezes = rewards.MAX_FREEZES
        profile.save()

        self.client.force_authenticate(self.user)
        resp = self.client.post(self.url)

        self.assertEqual(resp.status_code, 400)
        profile.refresh_from_db()
        self.assertEqual(profile.streak_freezes, rewards.MAX_FREEZES)
        self.assertEqual(profile.coins, 10_000)  # nothing spent
