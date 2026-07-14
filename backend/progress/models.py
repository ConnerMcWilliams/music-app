"""
Per-user practice progress: the daily streak and aggregate stats.

Identity (name, email) lives on the account model in ``users`` — this app owns
only what accrues as a user *practices*: the current and best day streak, how
many studies they have completed, and their running average score. It is a
``OneToOne`` companion to ``settings.AUTH_USER_MODEL`` (never the concrete user
class) so account data stays decoupled from progress data.

The numbers are live: ``record_practice`` is called for every graded take (see
``studies.views.SubmissionCreateView``), advancing the streak and folding the
score into the average.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from django.conf import settings
from django.db import models

from . import rewards


@dataclass(frozen=True)
class PracticeReward:
    """What one graded take earned the player (returned by ``record_practice``)."""

    xp_awarded: int
    coins_awarded: int
    level: int
    rank_title: str
    leveled_up: bool


class Profile(models.Model):
    """A user's practice streak and aggregate stats."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="profile",
    )

    # --- Streak -----------------------------------------------------------
    # Consecutive days with at least one graded take, the all-time best, and
    # the last day the user practiced (drives the streak arithmetic).
    day_streak = models.PositiveIntegerField(default=0)
    longest_streak = models.PositiveIntegerField(default=0)
    last_active_date = models.DateField(null=True, blank=True)

    # --- Aggregate stats --------------------------------------------------
    studies_completed = models.PositiveIntegerField(default=0)
    # Rounded 0–100 mean of every graded take. ``scored_count`` is retained so
    # the average can be updated incrementally without re-reading submissions.
    avg_score = models.PositiveIntegerField(default=0)
    scored_count = models.PositiveIntegerField(default=0)

    # --- Reward economy ---------------------------------------------------
    # Lifetime XP (only ever grows) drives the derived level and rank title.
    # Coins drop on level-up and are spent on streak freezes, each of which
    # bridges one missed day so the streak survives. See ``rewards``.
    xp_total = models.PositiveIntegerField(default=0)
    coins = models.PositiveIntegerField(default=0)
    streak_freezes = models.PositiveSmallIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Progress for {self.user}"

    def record_practice(
        self,
        *,
        score: int,
        study_value: int = 0,
        prev_best_pct: int = 0,
        today: date | None = None,
    ) -> PracticeReward:
        """Register a graded take: advance the streak, stats, and reward economy.

        * Streak: unchanged if already practiced today, +1 if the last practice
          was yesterday. On a longer gap, held streak freezes are consumed (one
          per missed day) to bridge it and keep the streak alive; if there aren't
          enough, the streak resets to 1.
        * ``studies_completed`` increments once per take; ``avg_score`` folds
          ``score`` into the running mean.
        * XP: awarded only for beating the prior best on this study, paying the
          improvement (``rewards.xp_delta``). Crossing a level threshold grants
          ``rewards.COINS_PER_LEVEL`` coins per level gained.

        ``study_value`` is the study's XP value (``rewards.study_xp_value``) and
        ``prev_best_pct`` the player's previous best score on it; both default to
        0 so a take with no resolvable study simply earns no XP. ``today`` is
        injectable so tests are deterministic.

        Returns the :class:`PracticeReward` for this take (what the Results
        screen shows).
        """
        today = today or date.today()

        # --- Streak (freezes bridge missed days) ---
        if self.last_active_date is None:
            self.day_streak = 1
        else:
            gap = (today - self.last_active_date).days
            if gap <= 0:
                pass  # Already practiced today (or clock skew) — streak holds.
            elif gap == 1:
                self.day_streak += 1
            else:
                missed = gap - 1
                if self.streak_freezes >= missed:
                    self.streak_freezes -= missed
                    self.day_streak += 1  # Bridged the gap — streak continues.
                else:
                    self.day_streak = 1
        self.last_active_date = today
        self.longest_streak = max(self.longest_streak, self.day_streak)

        # --- Aggregate stats ---
        self.studies_completed += 1
        total = self.avg_score * self.scored_count + score
        self.scored_count += 1
        self.avg_score = round(total / self.scored_count)

        # --- XP / level / coins ---
        xp_awarded = rewards.xp_delta(score, prev_best_pct, study_value)
        before = rewards.level_for_xp(self.xp_total)
        self.xp_total += xp_awarded
        after = rewards.level_for_xp(self.xp_total)
        levels_gained = max(0, after.level - before.level)
        coins_awarded = levels_gained * rewards.COINS_PER_LEVEL
        self.coins += coins_awarded

        self.save()

        return PracticeReward(
            xp_awarded=xp_awarded,
            coins_awarded=coins_awarded,
            level=after.level,
            rank_title=rewards.rank_title(after.level),
            leveled_up=levels_gained > 0,
        )

    @classmethod
    def for_user(cls, user) -> Profile:
        """Return the user's progress profile, creating it on first access.

        Profiles are created lazily (rather than eagerly on registration) so
        there is exactly one code path that guarantees a profile exists, and the
        ``OneToOne`` uniqueness constraint makes it idempotent.
        """
        profile, _ = cls.objects.get_or_create(user=user)
        return profile

    @classmethod
    def lock_for_user(cls, user) -> Profile:
        """Like :meth:`for_user`, but locks the row for the current transaction.

        Used by the write paths (grading a take, buying a freeze) so concurrent
        uploads can't clobber each other's streak/XP/coin updates. Must be called
        inside ``transaction.atomic`` (``select_for_update`` requires it).
        """
        cls.objects.get_or_create(user=user)
        return cls.objects.select_for_update().get(user=user)
