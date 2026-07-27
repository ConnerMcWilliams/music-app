"""
Which onboarding flow an account gets, and — when an experiment is running —
which arm of it.

Bucketing is a pure function of ``(experiment.key, user.pk)``: the same account
always lands in the same arm, without a lookup, which is what makes it testable
and a lost assignment row harmless. The row is still written, because it is what
pins a player in place when an arm's weight is later edited.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field

from django.db import IntegrityError, transaction

from users.models import UserPreferences

from .models import (
    SURFACE_ONBOARDING,
    Experiment,
    ExperimentArm,
    ExperimentAssignment,
    OnboardingVariant,
)
from .seed.onboarding import DEFAULT_STEPS


@dataclass(frozen=True)
class Resolution:
    """The flow to serve this account, and the experiment context behind it."""

    variant: OnboardingVariant | None
    experiment: Experiment | None
    arm: ExperimentArm | None
    steps: list[dict] = field(default_factory=list)


def bucket(experiment_key: str, user_pk: object, arms: list[ExperimentArm]) -> ExperimentArm:
    """The arm this account falls into, by weight. Deterministic, no state.

    ``arms`` must be in a stable order (``ExperimentArm.Meta.ordering`` sorts by
    ``key``) — the cumulative walk below is only reproducible if it is.
    """
    total = sum(arm.weight for arm in arms)
    if total <= 0:
        # Every weight zeroed out. Serving the first arm beats serving nothing.
        return arms[0]

    digest = hashlib.sha256(f"{experiment_key}:{user_pk}".encode()).digest()
    point = int.from_bytes(digest[:8], "big") % total

    upto = 0
    for arm in arms:
        upto += arm.weight
        if point < upto:
            return arm
    return arms[-1]


def running_experiment(surface: str = SURFACE_ONBOARDING) -> Experiment | None:
    """The one running experiment for a surface, if there is one."""
    return (
        Experiment.objects.filter(surface=surface, status=Experiment.Status.RUNNING)
        .prefetch_related("arms__variant")
        .first()
    )


def default_variant() -> OnboardingVariant | None:
    """The flow served when no experiment is running."""
    return OnboardingVariant.objects.filter(is_default=True).first()


def _without_experiment() -> Resolution:
    """The default flow, falling back to the shipped one on an empty database.

    Never returns an empty step list: onboarding is a hard gate, so a database
    that was never seeded (or whose default was deleted) must still serve a
    complete flow rather than strand every signup.
    """
    variant = default_variant()
    steps = variant.active_steps() if variant else DEFAULT_STEPS
    return Resolution(variant=variant, experiment=None, arm=None, steps=steps or DEFAULT_STEPS)


def _from_arm(arm: ExperimentArm, experiment: Experiment) -> Resolution:
    """The flow one arm serves, with the experiment context behind it.

    One place, so the concurrent-write recovery path below can never drift from
    the one that reads an existing assignment.
    """
    return Resolution(
        variant=arm.variant,
        experiment=experiment,
        arm=arm,
        steps=arm.variant.active_steps(),
    )


def _has_onboarded(user) -> bool:
    """Whether this account already finished onboarding."""
    return (
        UserPreferences.objects.filter(user=user)
        .exclude(onboarding_completed_at=None)
        .exists()
    )


def resolve_for_user(user) -> Resolution:
    """The flow this account should see, assigning it to an arm if needed.

    Assignment happens here — on the first *read* of the config — rather than at
    registration, so "assigned" means "actually opened onboarding" and the
    experiment's denominator isn't diluted by accounts that sign up and vanish.
    Coupling it to ``RegisterView`` would also mean a bucketing bug could break
    signup, which for a hard gate is not a trade worth making.

    An account that has *already* finished onboarding is never newly assigned:
    it reaches this endpoint through the account screen's edit deep-links, and
    counting those as experiment starts would quietly wreck every completion
    rate. An existing assignment is still honoured, so an edit shows the flow
    the player was actually onboarded with.
    """
    experiment = running_experiment()
    if experiment is None:
        return _without_experiment()

    arms = list(experiment.arms.all())
    if not arms:
        # A running experiment with no arms is a misconfiguration, not a reason
        # to block onboarding.
        return _without_experiment()

    existing = (
        ExperimentAssignment.objects.filter(experiment=experiment, user=user)
        .select_related("arm__variant")
        .first()
    )
    if existing is not None:
        return _from_arm(existing.arm, experiment)

    if _has_onboarded(user):
        return _without_experiment()

    chosen = bucket(experiment.key, user.pk, arms)
    try:
        with transaction.atomic():
            ExperimentAssignment.objects.create(experiment=experiment, arm=chosen, user=user)
    except IntegrityError:
        # A concurrent request assigned the same account first. Bucketing is
        # deterministic so it picked the same arm, but read it back rather than
        # assume — the stored row is the authority.
        existing = (
            ExperimentAssignment.objects.filter(experiment=experiment, user=user)
            .select_related("arm__variant")
            .first()
        )
        if existing is not None:
            return _from_arm(existing.arm, experiment)

    return _from_arm(chosen, experiment)
