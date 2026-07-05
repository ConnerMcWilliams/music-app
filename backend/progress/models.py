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

from datetime import date, timedelta

from django.conf import settings
from django.db import models


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

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Progress for {self.user}"

    def record_practice(self, score: int, *, today: date | None = None) -> None:
        """Register a graded take: advance the streak and update the stats.

        * Streak: unchanged if already practiced today, +1 if the last practice
          was yesterday, otherwise reset to 1 (a broken streak starts over).
        * ``studies_completed`` increments once per take.
        * ``avg_score`` folds ``score`` into the running mean.

        ``today`` is injectable so tests are deterministic; production passes
        the real current date.
        """
        today = today or date.today()

        if self.last_active_date == today:
            pass  # Already counted a practice today — streak stays put.
        elif self.last_active_date == today - timedelta(days=1):
            self.day_streak += 1
        else:
            self.day_streak = 1
        self.last_active_date = today
        self.longest_streak = max(self.longest_streak, self.day_streak)

        self.studies_completed += 1
        total = self.avg_score * self.scored_count + score
        self.scored_count += 1
        self.avg_score = round(total / self.scored_count)

        self.save()

    @classmethod
    def for_user(cls, user) -> Profile:
        """Return the user's progress profile, creating it on first access.

        Profiles are created lazily (rather than eagerly on registration) so
        there is exactly one code path that guarantees a profile exists, and the
        ``OneToOne`` uniqueness constraint makes it idempotent.
        """
        profile, _ = cls.objects.get_or_create(user=user)
        return profile
