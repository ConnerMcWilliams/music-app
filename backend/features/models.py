"""
Remotely editable app configuration, and the A/B experiments that serve it.

The first — and so far only — configurable surface is the mobile onboarding
flow, which is otherwise compiled into the app bundle. An ``OnboardingVariant``
is one complete flow: which of the six steps appear, in what order, with what
copy and which answers offered. Two or more variants can then be run head to
head as an ``Experiment``.

``steps`` is a JSON document rather than a child table because a variant is
always read and written whole — the mobile app fetches one, the dashboard edits
one, and duplicating one for an experiment arm is a copy of the list. Nothing
queries *into* it, so a child table would buy referential integrity we get from
``features.serializers`` instead, at the cost of a renumbering transaction on
every reorder. Precedent: ``grading.GradingResult.note_results``.

The list's **position is the step order** — there is no separate ``order``
field to disagree with it.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models, transaction

from . import onboarding_catalog

# The only configurable surface today. Kept as a field rather than assumed so
# the experiment machinery is reusable when a second one arrives.
SURFACE_ONBOARDING = "onboarding"
SURFACE_CHOICES = [(SURFACE_ONBOARDING, "Onboarding")]

STEP_KEY_CHOICES = [(key, key) for key in onboarding_catalog.STEP_KEYS]


class OnboardingVariant(models.Model):
    """One complete onboarding flow, editable from the dashboard."""

    key = models.SlugField(max_length=64, unique=True)
    name = models.CharField(max_length=120)
    # What this variant is trying — read by whoever picks the experiment up later.
    notes = models.TextField(blank=True)

    # Served to anyone not in a running experiment. Exactly one variant holds
    # it, enforced both by the constraint below and by ``save()``.
    is_default = models.BooleanField(default=False)
    # Hidden from the dashboard's pickers. Variants referenced by an experiment
    # can never be deleted (the arms are PROTECTed, so results survive), so
    # this is how a finished variant stops cluttering the list.
    archived = models.BooleanField(default=False)

    # [{step_key, enabled, copy: {...}, options: {group: [{value, label?, hint?}]}}]
    steps = models.JSONField(default=list, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-is_default", "name"]
        constraints = [
            # Only one row may carry True. Without this the resolver would pick
            # a default arbitrarily, and which flow a signup saw would depend on
            # row order.
            models.UniqueConstraint(
                fields=["is_default"],
                condition=models.Q(is_default=True),
                name="features_one_default_variant",
            )
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.key})"

    def save(self, *args, **kwargs) -> None:
        if not self.is_default:
            super().save(*args, **kwargs)
            return
        # Demote first, save second: the unique constraint above would reject
        # the moment two rows both claimed the default.
        with transaction.atomic():
            others = OnboardingVariant.objects.filter(is_default=True)
            if self.pk is not None:
                others = others.exclude(pk=self.pk)
            others.update(is_default=False)
            super().save(*args, **kwargs)

    def active_steps(self) -> list[dict]:
        """The enabled steps, in flow order, with stale options dropped.

        Filtered on read as well as on write because the catalog is code and the
        variant is data: an instrument slug or goal value removed in a later
        release would otherwise still be sitting in a document saved when it was
        legal, and the app would render an answer the API now rejects.
        """
        return [
            onboarding_catalog.prune_step(step)
            for step in self.steps
            if step.get("enabled", True) and onboarding_catalog.get_step(step.get("step_key"))
        ]


class Experiment(models.Model):
    """A head-to-head test of two or more variants of one surface."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        RUNNING = "running", "Running"
        STOPPED = "stopped", "Stopped"

    key = models.SlugField(max_length=64, unique=True)
    surface = models.CharField(max_length=32, choices=SURFACE_CHOICES, default=SURFACE_ONBOARDING)
    name = models.CharField(max_length=120)
    # What you expect to happen, written down before the numbers arrive.
    hypothesis = models.TextField(blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)

    started_at = models.DateTimeField(null=True, blank=True)
    stopped_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            # Two running experiments on one surface would assign the same
            # account twice and neither result would mean anything.
            models.UniqueConstraint(
                fields=["surface"],
                condition=models.Q(status="running"),
                name="features_one_running_experiment_per_surface",
            )
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.key}, {self.status})"


class ExperimentArm(models.Model):
    """One side of an experiment: a variant and the share of traffic it gets."""

    experiment = models.ForeignKey(Experiment, on_delete=models.CASCADE, related_name="arms")
    # PROTECT: deleting a variant an experiment has served would take its arm —
    # and with it the meaning of every assignment recorded against it.
    variant = models.ForeignKey(OnboardingVariant, on_delete=models.PROTECT, related_name="arms")
    key = models.SlugField(max_length=32)
    # Relative, not a percentage: bucketing divides by the arms' total.
    weight = models.PositiveSmallIntegerField(default=50)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Bucketing walks the arms cumulatively, so a stable order is what makes
        # assignment reproducible. Sorting by key is that order.
        ordering = ["key"]
        constraints = [
            models.UniqueConstraint(fields=["experiment", "key"], name="features_unique_arm_key")
        ]

    def __str__(self) -> str:
        return f"{self.experiment.key}:{self.key}"


class ExperimentAssignment(models.Model):
    """The arm one account was placed in, recorded the first time it asked.

    Bucketing is a pure function of ``(experiment.key, user.pk)``, so this row
    is not what makes assignment stable — it is what makes it *survive an edit*.
    Changing an arm's weight re-buckets nobody who already has a row here, which
    is what keeps a running experiment's numbers honest.
    """

    experiment = models.ForeignKey(
        Experiment, on_delete=models.CASCADE, related_name="assignments"
    )
    # PROTECT for the same reason as the variant above: an arm cannot be
    # dropped out from under the accounts it has already been served to.
    arm = models.ForeignKey(ExperimentArm, on_delete=models.PROTECT, related_name="assignments")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="experiment_assignments"
    )
    assigned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-assigned_at"]
        indexes = [models.Index(fields=["arm", "assigned_at"])]
        constraints = [
            models.UniqueConstraint(
                fields=["experiment", "user"], name="features_unique_assignment_per_user"
            )
        ]

    def __str__(self) -> str:
        return f"{self.user_id} → {self.arm}"


class OnboardingStepView(models.Model):
    """That an account reached one step of the flow. Powers the drop-off table.

    Views only, never answers: a step counts as answered once the *next* one is
    viewed, and the final answer is the completion stamp already on
    ``users.UserPreferences.onboarding_completed_at``. That halves what the
    client has to report and keeps the answers themselves in one place.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="onboarding_step_views"
    )
    # Null when the view happened outside an experiment (the default variant).
    experiment = models.ForeignKey(
        Experiment, null=True, blank=True, on_delete=models.SET_NULL, related_name="step_views"
    )
    arm = models.ForeignKey(
        ExperimentArm, null=True, blank=True, on_delete=models.SET_NULL, related_name="step_views"
    )
    # Denormalized so a renamed or archived variant can't rewrite history that
    # has already been read off this table.
    variant_key = models.SlugField(max_length=64)
    step_key = models.CharField(max_length=32, choices=STEP_KEY_CHOICES)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            # First view only. The beacon is fire-and-forget, so it retries and
            # re-fires on a re-mount; without this a Back-and-forward walk (or a
            # flaky connection) would inflate the funnel it exists to measure.
            models.UniqueConstraint(
                fields=["user", "variant_key", "step_key"],
                name="features_unique_step_view",
            )
        ]

    def __str__(self) -> str:
        return f"{self.user_id} viewed {self.step_key}"
