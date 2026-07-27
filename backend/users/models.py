"""
Account model for the Clarke studies app, plus the per-user preferences
(instrument, goals, practice cadence) captured during onboarding.

This is the project's first user model, introduced as a **custom** user model so
email is the login identifier (not a username) and the primary key is a UUID.
The rest of the domain (submissions, grading results, streaks) must reference
``settings.AUTH_USER_MODEL`` — never this class directly — so account data stays
decoupled from those later concerns.

Passwords are managed entirely through Django's authentication system
(``set_password`` / ``check_password`` via ``AbstractBaseUser``). There is no
separate password field and nothing here hashes passwords by hand.
"""
from __future__ import annotations

import uuid

from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models

from . import instruments


class UserManager(BaseUserManager):
    """Manager for the email-as-identifier ``User`` model."""

    use_in_migrations = True

    def _create_user(self, email: str, password: str | None, **extra_fields):
        if not email:
            raise ValueError("An email address is required.")
        # normalize_email lower-cases the domain; we also lower-case the whole
        # address so lookups are case-insensitive and duplicates are rejected.
        email = self.normalize_email(email).lower()
        user = self.model(email=email, **extra_fields)
        # Django hashes the password; never store or log the plaintext.
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email: str, password: str | None = None, **extra_fields):
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email: str, password: str | None = None, **extra_fields):
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")
        return self._create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """A registered account. Login identifier is the normalized email."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Unique, normalized (lower-cased) email — the login identifier.
    email = models.EmailField(unique=True)

    display_name = models.CharField(max_length=120, blank=True)

    # Google's stable account identifier (`sub` claim), set once the account is
    # created via — or linked to — Google Sign-In. Matching on this, not email,
    # keeps the link intact if the user's Google email ever changes. Null (not
    # blank string) when absent so the UNIQUE constraint ignores non-Google rows.
    google_sub = models.CharField(
        max_length=255, unique=True, null=True, blank=True, editable=False
    )

    # Standard Django flags. is_active gates login; is_staff gates admin access.
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    # createsuperuser prompts only for email + password; display_name is optional.
    REQUIRED_FIELDS: list[str] = []

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.email

    def save(self, *args, **kwargs):
        # Belt-and-suspenders: keep the stored email normalized even when a user
        # is created outside the manager (e.g. via the admin or a serializer).
        if self.email:
            self.email = self.__class__.objects.normalize_email(self.email).lower()
        super().save(*args, **kwargs)


class UserPreferences(models.Model):
    """The answers a player gives during onboarding, and can change afterwards.

    Deliberately separate from ``progress.Profile``: that model owns what accrues
    as a user *practices* (streak, stats, XP), whereas these are standing choices
    the user makes and edits. They sit in ``users`` alongside identity, and this
    is where later account settings belong too.

    ``onboarding_completed_at`` is the gate the mobile route guard reads (via the
    ``onboarding_completed`` flag on the auth payload). A user with no row at all
    counts as not onboarded, which is what routes pre-existing accounts through
    the flow exactly once.
    """

    class ExperienceLevel(models.TextChoices):
        UNDER_1 = "under_1", "Less than a year"
        Y1_3 = "y1_3", "1–3 years"
        Y3_7 = "y3_7", "3–7 years"
        OVER_7 = "over_7", "7+ years"

    class PrimaryGoal(models.TextChoices):
        TONE = "tone", "Better tone and control"
        RANGE = "range", "Extend my range"
        ENDURANCE = "endurance", "Build endurance"
        TECHNIQUE = "technique", "Faster, cleaner technique"
        CONSISTENCY = "consistency", "Practice consistently"
        AUDITION = "audition", "Prepare for an audition"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="preferences",
    )

    # --- Onboarding answers ----------------------------------------------
    # The player's instrument, as a slug from ``instruments.INSTRUMENTS``. The
    # per-instrument transposition of the Clarke corpus keys off this.
    instrument = models.CharField(
        max_length=32, choices=instruments.INSTRUMENT_CHOICES, blank=True
    )
    experience_level = models.CharField(
        max_length=16, choices=ExperienceLevel.choices, blank=True
    )
    primary_goal = models.CharField(max_length=16, choices=PrimaryGoal.choices, blank=True)

    # Days per week the user is aiming for — the streak's target, not a measure
    # of it (what actually happened lives on ``progress.Profile``).
    practice_days_goal = models.PositiveSmallIntegerField(default=5)

    # Naive local wall-clock time; the device schedules the notification, so no
    # timezone is stored. Scheduling itself is not implemented yet.
    reminder_time = models.TimeField(null=True, blank=True)
    reminder_enabled = models.BooleanField(default=False)

    # Which Clarke Study (1–10) the user starts from; null means "new to Clarke"
    # and the Today card begins at the first study, as it always has.
    clarke_start_section = models.PositiveSmallIntegerField(null=True, blank=True)

    # --- Gate -------------------------------------------------------------
    onboarding_completed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "user preferences"

    def __str__(self) -> str:
        return f"Preferences for {self.user}"

    @property
    def onboarding_completed(self) -> bool:
        return self.onboarding_completed_at is not None

    @classmethod
    def for_user(cls, user) -> UserPreferences:
        """Return the user's preferences, creating the row on first access.

        Created lazily rather than eagerly at registration, mirroring
        ``progress.Profile.for_user``: one code path guarantees the row exists
        and the ``OneToOne`` constraint makes it idempotent.
        """
        preferences, _ = cls.objects.get_or_create(user=user)
        return preferences
