"""
Reading an onboarding experiment.

Four numbers per arm, in the order they matter:

* **assigned** — accounts served this arm. Because assignment happens on the
  first config read (``features.assignment``), this is "opened onboarding", not
  "registered".
* **viewed** per step — how far people got, from ``OnboardingStepView``.
* **completed** — the stamp already on ``users.UserPreferences``.
* **activated** — completed *and then actually practised*. This is the one that
  decides the experiment. A shorter flow that completes more often but activates
  fewer players is a worse flow, and completion rate alone would call it a win.

No significance testing: at this volume a p-value would be false precision. Arms
below ``MIN_SAMPLE`` are flagged so a 2-of-3 split isn't read as a result — one
flag per rate, each against the denominator that rate is actually divided by.
"""
from __future__ import annotations

from datetime import timedelta

from django.db.models import (
    Count,
    DateTimeField,
    Exists,
    ExpressionWrapper,
    F,
    OuterRef,
)
from django.utils import timezone

from grading.models import Submission
from users.models import UserPreferences

from .models import Experiment, ExperimentAssignment, OnboardingStepView

# How long after assignment a first take still counts as caused by that flow.
# Seven days because the loosest cadence onboarding offers is once a week, so
# every cohort has had at least one practice day it chose for itself.
ACTIVATION_WINDOW_DAYS = 7

# Below this, the arm's rates are noise. Shown, but flagged.
MIN_SAMPLE = 30


def _ratio(part: int, whole: int) -> float:
    """Share of ``whole``, rounded, and 0.0 rather than a division error."""
    if whole <= 0:
        return 0.0
    return round(min(part / whole, 1.0), 4)


def results_for(experiment: Experiment) -> dict:
    """The per-arm funnel for one experiment."""
    cutoff = timezone.now() - timedelta(days=ACTIVATION_WINDOW_DAYS)

    arms = []
    for arm in experiment.arms.all():
        assignments = ExperimentAssignment.objects.filter(arm=arm)
        user_ids = list(assignments.values_list("user_id", flat=True))
        assigned = len(user_ids)

        completed = (
            UserPreferences.objects.filter(user_id__in=user_ids)
            .exclude(onboarding_completed_at=None)
            .count()
            if user_ids
            else 0
        )

        # Only assignments old enough to have had their full window count in the
        # activation denominator — otherwise yesterday's signups drag it down.
        # The window end is annotated rather than computed inside the subquery
        # because a bare ``OuterRef(...) + timedelta`` has no resolvable output
        # type; the wrapper names it so the subquery can just reference it.
        matured = assignments.filter(assigned_at__lte=cutoff).annotate(
            window_ends_at=ExpressionWrapper(
                F("assigned_at") + timedelta(days=ACTIVATION_WINDOW_DAYS),
                output_field=DateTimeField(),
            )
        )
        activated = (
            matured.filter(
                Exists(
                    Submission.objects.filter(
                        user_id=OuterRef("user_id"),
                        # A take the server could not decode was scored on
                        # length alone; counting it as practice would make a
                        # broken recorder look like an engaged player.
                        grade__analyzed=True,
                        # Bounded at both ends: a take months later is the
                        # player's own habit, not this flow's doing.
                        created_at__gte=OuterRef("assigned_at"),
                        created_at__lt=OuterRef("window_ends_at"),
                    )
                )
            ).count()
            if user_ids
            else 0
        )
        matured_count = matured.count() if user_ids else 0

        viewed = (
            OnboardingStepView.objects.filter(arm=arm)
            .values("step_key")
            .annotate(users=Count("user_id", distinct=True))
        )
        by_step = {row["step_key"]: row["users"] for row in viewed}

        arms.append(
            {
                "arm_key": arm.key,
                "variant_key": arm.variant.key,
                "variant_name": arm.variant.name,
                "weight": arm.weight,
                "assigned": assigned,
                "completed": completed,
                "completion_rate": _ratio(completed, assigned),
                "matured": matured_count,
                "activated": activated,
                "activation_rate": _ratio(activated, matured_count),
                # One flag per denominator: completion is out of everyone
                # assigned, activation only out of those whose window has
                # closed, and the two diverge for a new experiment's first week.
                "enough_data": assigned >= MIN_SAMPLE,
                "enough_matured": matured_count >= MIN_SAMPLE,
                "steps": [
                    {
                        "step_key": step["step_key"],
                        "title": step.get("copy", {}).get("title", ""),
                        "viewed": by_step.get(step["step_key"], 0),
                    }
                    for step in arm.variant.active_steps()
                ],
            }
        )

    return {
        "key": experiment.key,
        "name": experiment.name,
        "status": experiment.status,
        "started_at": experiment.started_at,
        "stopped_at": experiment.stopped_at,
        "activation_window_days": ACTIVATION_WINDOW_DAYS,
        "min_sample": MIN_SAMPLE,
        "arms": arms,
    }
