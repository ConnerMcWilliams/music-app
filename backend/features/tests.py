"""
Tests for editable onboarding config and its A/B experiments.

Three contracts matter more than the rest here:

* **Staff gating.** ``/api/features/`` edits what every new account sees, so the
  gating suite checks 401/403/200 on every route, ``Cache-Control: no-store``,
  and that denials reach the audit log (which is what fails if
  ``config.exception_handler._ADMIN_PREFIXES`` was not updated).
* **Validation is total.** Onboarding is a hard gate — an account that cannot
  finish it cannot use the app — so no dashboard edit may produce a flow the
  mobile client can't render. Every rejection below is a way that could happen.
* **Assignment is stable.** A player must not move between arms mid-experiment,
  and editing a weight must not re-bucket anyone already assigned, or the
  results mean nothing.
"""
from __future__ import annotations

import copy
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.management import call_command
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from grading.models import GradingResult, Submission
from users.models import UserPreferences

from .assignment import bucket, resolve_for_user
from .metrics import ACTIVATION_WINDOW_DAYS, MIN_SAMPLE
from .models import (
    Experiment,
    ExperimentArm,
    ExperimentAssignment,
    OnboardingStepView,
    OnboardingVariant,
)
from .seed.onboarding import DEFAULT_KEY, DEFAULT_STEPS

User = get_user_model()


def make_variant(key: str = "v1", **kwargs) -> OnboardingVariant:
    """A variant carrying the shipped flow unless the test says otherwise."""
    defaults = {
        "name": key.title(),
        "steps": copy.deepcopy(DEFAULT_STEPS),
        "is_default": False,
    }
    defaults.update(kwargs)
    return OnboardingVariant.objects.create(key=key, **defaults)


class ThrottleResetMixin:
    """Reset DRF's throttle cache before each test so scopes start fresh."""

    def setUp(self):
        cache.clear()
        super().setUp()


class FeaturesAuthMixin:
    """Clients for the three caller kinds the gating tests exercise."""

    def setUp(self):
        super().setUp()
        self.anon = APIClient()
        self.member_user = User.objects.create_user("member@example.com", "pw")
        self.member = APIClient()
        self.member.force_authenticate(self.member_user)
        self.staff = APIClient()
        self.staff.force_authenticate(
            User.objects.create_user("owner@example.com", "pw", is_staff=True)
        )


class FeaturesGatingTests(FeaturesAuthMixin, ThrottleResetMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.variant = make_variant(DEFAULT_KEY, is_default=True)

    def test_every_staff_endpoint_is_staff_only(self):
        urls = [
            reverse("features:onboarding-catalog"),
            reverse("features:variant-list"),
            reverse("features:variant-detail", args=[self.variant.key]),
            reverse("features:experiment-list"),
        ]
        for url in urls:
            with self.subTest(url=url):
                self.assertEqual(self.anon.get(url).status_code, 401)
                self.assertEqual(self.member.get(url).status_code, 403)
                self.assertEqual(self.staff.get(url).status_code, 200)

    def test_staff_responses_are_not_cached(self):
        response = self.staff.get(reverse("features:variant-list"))
        self.assertEqual(response["Cache-Control"], "no-store")

    def test_denied_admin_access_is_logged(self):
        # The audit trail only fires if "/api/features/" is in
        # config.exception_handler._ADMIN_PREFIXES.
        with self.assertLogs("config.errors", level="WARNING") as logged:
            self.member.get(reverse("features:variant-list"))
        self.assertTrue(any("Admin access denied" in line for line in logged.output))

    def test_mobile_endpoints_require_authentication(self):
        self.assertEqual(self.anon.get(reverse("features:onboarding-config")).status_code, 401)
        self.assertEqual(
            self.anon.post(reverse("features:onboarding-view"), {}, format="json").status_code,
            401,
        )


class VariantValidationTests(FeaturesAuthMixin, ThrottleResetMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.url = reverse("features:variant-list")

    def post(self, steps, key="candidate"):
        return self.staff.post(
            self.url, {"key": key, "name": "Candidate", "steps": steps}, format="json"
        )

    def test_accepts_the_shipped_flow(self):
        self.assertEqual(self.post(copy.deepcopy(DEFAULT_STEPS)).status_code, 201)

    def test_accepts_a_reordered_and_shortened_flow(self):
        steps = copy.deepcopy(DEFAULT_STEPS)
        steps.reverse()
        steps[0]["enabled"] = False
        response = self.post(steps)
        self.assertEqual(response.status_code, 201)
        # List position is the order, so it round-trips as sent.
        self.assertEqual(
            [step["step_key"] for step in response.json()["steps"]],
            [step["step_key"] for step in steps],
        )

    def test_rejects_an_unknown_step(self):
        steps = copy.deepcopy(DEFAULT_STEPS)
        steps[0]["step_key"] = "favourite-colour"
        self.assertEqual(self.post(steps).status_code, 400)

    def test_rejects_a_duplicated_step(self):
        steps = copy.deepcopy(DEFAULT_STEPS)
        steps.append(copy.deepcopy(steps[0]))
        self.assertEqual(self.post(steps).status_code, 400)

    def test_rejects_a_flow_with_nothing_enabled(self):
        # Every step off means the flow can never be completed, and the route
        # guard would hold every account inside it forever.
        steps = copy.deepcopy(DEFAULT_STEPS)
        for step in steps:
            step["enabled"] = False
        self.assertEqual(self.post(steps).status_code, 400)

    def test_rejects_an_option_the_preferences_api_would_refuse(self):
        cases = {
            "instrument": ("instruments", "sousaphone"),
            "experience": ("levels", "y10_20"),
            "goal": ("goals", "vibrato"),
            "practice": ("days", 9),
            "clarke": ("sections", 11),
        }
        for step_key, (group, illegal) in cases.items():
            with self.subTest(step=step_key):
                steps = copy.deepcopy(DEFAULT_STEPS)
                step = next(s for s in steps if s["step_key"] == step_key)
                step["options"][group] = [{"value": illegal}]
                self.assertEqual(self.post(steps, key=f"bad-{step_key}").status_code, 400)

    def test_rejects_relabelling_an_instrument(self):
        # Instrument labels are pinned to the client by the mirror test in
        # users/tests.py; a variant that renamed one would silently fork them.
        steps = copy.deepcopy(DEFAULT_STEPS)
        step = next(s for s in steps if s["step_key"] == "instrument")
        step["options"]["instruments"] = [{"value": "trumpet", "label": "Horn"}]
        self.assertEqual(self.post(steps).status_code, 400)

    def test_rejects_a_blank_required_title(self):
        steps = copy.deepcopy(DEFAULT_STEPS)
        steps[0]["copy"]["title"] = "   "
        self.assertEqual(self.post(steps).status_code, 400)

    def test_rejects_an_over_length_title(self):
        steps = copy.deepcopy(DEFAULT_STEPS)
        steps[0]["copy"]["title"] = "x" * 200
        self.assertEqual(self.post(steps).status_code, 400)

    def test_rejects_an_unknown_copy_field(self):
        steps = copy.deepcopy(DEFAULT_STEPS)
        steps[0]["copy"]["tagline"] = "Hello"
        self.assertEqual(self.post(steps).status_code, 400)

    def test_rejects_emptying_a_question(self):
        steps = copy.deepcopy(DEFAULT_STEPS)
        step = next(s for s in steps if s["step_key"] == "goal")
        step["options"]["goals"] = []
        self.assertEqual(self.post(steps).status_code, 400)

    def test_blank_cta_is_allowed_and_means_the_app_default(self):
        steps = copy.deepcopy(DEFAULT_STEPS)
        steps[0]["copy"]["cta"] = ""
        self.assertEqual(self.post(steps).status_code, 201)


class VariantManagementTests(FeaturesAuthMixin, ThrottleResetMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.default = make_variant(DEFAULT_KEY, is_default=True)

    def test_promoting_a_variant_demotes_the_old_default(self):
        other = make_variant("short")
        response = self.staff.post(
            reverse("features:variant-set-default", args=[other.key]), {}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(OnboardingVariant.objects.filter(is_default=True).count(), 1)
        self.default.refresh_from_db()
        self.assertFalse(self.default.is_default)

    def test_a_plain_patch_cannot_change_which_flow_is_the_default(self):
        other = make_variant("short")
        self.staff.patch(
            reverse("features:variant-detail", args=[other.key]),
            {"is_default": True},
            format="json",
        )
        other.refresh_from_db()
        self.assertFalse(other.is_default)

    def test_an_archived_variant_cannot_become_the_default(self):
        other = make_variant("retired", archived=True)
        response = self.staff.post(
            reverse("features:variant-set-default", args=[other.key]), {}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_the_default_cannot_be_deleted(self):
        response = self.staff.delete(
            reverse("features:variant-detail", args=[self.default.key])
        )
        self.assertEqual(response.status_code, 400)
        self.assertTrue(OnboardingVariant.objects.filter(key=self.default.key).exists())

    def test_a_variant_an_experiment_uses_cannot_be_deleted(self):
        other = make_variant("short")
        experiment = Experiment.objects.create(key="e1", name="E1")
        ExperimentArm.objects.create(experiment=experiment, variant=other, key="b", weight=50)

        response = self.staff.delete(reverse("features:variant-detail", args=[other.key]))
        # A 400 the dashboard can explain, not the 500 the PROTECT would raise.
        self.assertEqual(response.status_code, 400)
        self.assertTrue(OnboardingVariant.objects.filter(key=other.key).exists())

    def test_duplicate_copies_the_steps_without_the_default_flag(self):
        response = self.staff.post(
            reverse("features:variant-duplicate", args=[self.default.key]),
            {"key": "short", "name": "Short flow"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        copy_ = OnboardingVariant.objects.get(key="short")
        self.assertEqual(copy_.steps, self.default.steps)
        self.assertFalse(copy_.is_default)

    def test_duplicate_refuses_an_existing_key(self):
        response = self.staff.post(
            reverse("features:variant-duplicate", args=[self.default.key]),
            {"key": DEFAULT_KEY},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_duplicate_holds_the_copy_to_the_same_rules_as_a_new_flow(self):
        # The dashboard asks for the key with a free-text prompt, so this action
        # has to validate exactly what the create path does. A key with a space
        # in it can never match the `<slug:key>` routes the copy is reached by,
        # and an over-length name is a database error rather than a field one.
        rejected = [
            {"key": "short flow", "name": "Short flow"},
            {"key": "", "name": "Short flow"},
            {"key": "s" * 65, "name": "Short flow"},
            {"key": "short", "name": "n" * 121},
        ]
        for body in rejected:
            with self.subTest(body=body):
                response = self.staff.post(
                    reverse("features:variant-duplicate", args=[self.default.key]),
                    body,
                    format="json",
                )
                self.assertEqual(response.status_code, 400)
        self.assertEqual(OnboardingVariant.objects.count(), 1)


class ExperimentTests(FeaturesAuthMixin, ThrottleResetMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.a = make_variant("a", is_default=True)
        self.b = make_variant("b")
        self.url = reverse("features:experiment-list")

    def payload(self, key="e1", status="draft", **kwargs):
        body = {
            "key": key,
            "name": "Short vs long",
            "status": status,
            "arms": [
                {"key": "control", "variant": "a", "weight": 50},
                {"key": "b", "variant": "b", "weight": 50},
            ],
        }
        body.update(kwargs)
        return body

    def test_creates_an_experiment_with_its_arms(self):
        response = self.staff.post(self.url, self.payload(), format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(ExperimentArm.objects.count(), 2)

    def test_rejects_a_single_armed_experiment(self):
        body = self.payload()
        body["arms"] = body["arms"][:1]
        self.assertEqual(self.staff.post(self.url, body, format="json").status_code, 400)

    def test_rejects_two_arms_on_the_same_variant(self):
        body = self.payload()
        body["arms"][1]["variant"] = "a"
        self.assertEqual(self.staff.post(self.url, body, format="json").status_code, 400)

    def test_rejects_a_zero_weight(self):
        body = self.payload()
        body["arms"][0]["weight"] = 0
        self.assertEqual(self.staff.post(self.url, body, format="json").status_code, 400)

    def test_only_one_experiment_may_run_per_surface(self):
        self.staff.post(self.url, self.payload("e1", status="running"), format="json")
        c = make_variant("c")
        body = self.payload("e2", status="running")
        body["arms"][1]["variant"] = c.key
        response = self.staff.post(self.url, body, format="json")
        # A 400 the dashboard can show, not an IntegrityError 500.
        self.assertEqual(response.status_code, 400)

    def test_starting_stamps_started_at_once(self):
        self.staff.post(self.url, self.payload("e1"), format="json")
        detail = reverse("features:experiment-detail", args=["e1"])

        self.staff.patch(detail, {"status": "running"}, format="json")
        first = Experiment.objects.get(key="e1").started_at
        self.assertIsNotNone(first)

        self.staff.patch(detail, {"status": "stopped"}, format="json")
        self.staff.patch(detail, {"status": "running"}, format="json")
        # Restarting must not rewrite when it originally began.
        self.assertEqual(Experiment.objects.get(key="e1").started_at, first)

    def test_arms_cannot_be_rewritten_once_it_has_started(self):
        self.staff.post(self.url, self.payload("e1", status="running"), format="json")
        detail = reverse("features:experiment-detail", args=["e1"])
        body = {
            "arms": [
                {"key": "control", "variant": "a", "weight": 90},
                {"key": "b", "variant": "b", "weight": 10},
            ]
        }
        self.assertEqual(self.staff.patch(detail, body, format="json").status_code, 400)
        self.assertEqual(Experiment.objects.get(key="e1").arms.get(key="control").weight, 50)

    def test_a_refused_arms_edit_writes_nothing_beside_it(self):
        self.staff.post(self.url, self.payload("e1", status="running"), format="json")
        detail = reverse("features:experiment-detail", args=["e1"])
        body = {
            "status": "stopped",
            "arms": [
                {"key": "control", "variant": "a", "weight": 90},
                {"key": "b", "variant": "b", "weight": 10},
            ],
        }
        self.assertEqual(self.staff.patch(detail, body, format="json").status_code, 400)

        experiment = Experiment.objects.get(key="e1")
        # A 400 that had already stopped the experiment would also have stamped
        # stopped_at, which is written once and never again.
        self.assertEqual(experiment.status, Experiment.Status.RUNNING)
        self.assertIsNone(experiment.stopped_at)

    def test_arms_cannot_be_rewritten_after_accounts_were_assigned(self):
        self.staff.post(self.url, self.payload("e1", status="running"), format="json")
        experiment = Experiment.objects.get(key="e1")
        ExperimentAssignment.objects.create(
            experiment=experiment,
            arm=experiment.arms.first(),
            user=User.objects.create_user("player@example.com", "pw"),
        )
        # Back to draft, which is the one way a served experiment could reach
        # the wholesale arm replacement below.
        Experiment.objects.filter(pk=experiment.pk).update(status=Experiment.Status.DRAFT)

        body = {
            "arms": [
                {"key": "control", "variant": "a", "weight": 90},
                {"key": "b", "variant": "b", "weight": 10},
            ]
        }
        response = self.staff.patch(
            reverse("features:experiment-detail", args=["e1"]), body, format="json"
        )
        # A 400, not the 500 the PROTECTed assignment would raise.
        self.assertEqual(response.status_code, 400)
        self.assertEqual(experiment.arms.get(key="control").weight, 50)

    def test_an_experiment_that_has_been_assigned_cannot_be_deleted(self):
        self.staff.post(self.url, self.payload("e1", status="running"), format="json")
        experiment = Experiment.objects.get(key="e1")
        ExperimentAssignment.objects.create(
            experiment=experiment,
            arm=experiment.arms.first(),
            user=User.objects.create_user("player@example.com", "pw"),
        )

        response = self.staff.delete(reverse("features:experiment-detail", args=["e1"]))
        # Deleting cascades to the arms, which the assignment PROTECTs: a 400
        # the dashboard can explain rather than the 500 the collector raises.
        self.assertEqual(response.status_code, 400)
        self.assertTrue(Experiment.objects.filter(key="e1").exists())

    def test_an_unassigned_experiment_deletes_with_its_arms(self):
        self.staff.post(self.url, self.payload("e1"), format="json")
        response = self.staff.delete(reverse("features:experiment-detail", args=["e1"]))
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Experiment.objects.filter(key="e1").exists())
        self.assertEqual(ExperimentArm.objects.count(), 0)


class BucketingTests(TestCase):
    """The pure function behind assignment, exercised without the database."""

    def setUp(self):
        self.arms = [
            ExperimentArm(key="control", weight=50),
            ExperimentArm(key="b", weight=50),
        ]

    def test_is_deterministic(self):
        first = bucket("e1", 42, self.arms)
        self.assertIs(bucket("e1", 42, self.arms), first)

    def test_splits_roughly_by_weight(self):
        arms = [ExperimentArm(key="control", weight=80), ExperimentArm(key="b", weight=20)]
        counts = {"control": 0, "b": 0}
        for user_pk in range(1000):
            counts[bucket("e1", user_pk, arms).key] += 1
        # Wide tolerance: this pins "the weights are honoured", not the hash.
        self.assertGreater(counts["control"], 700)
        self.assertLess(counts["control"], 900)

    def test_different_experiments_bucket_independently(self):
        # Otherwise every experiment would test the same half of the userbase.
        a = [bucket("e1", pk, self.arms).key for pk in range(200)]
        b = [bucket("e2", pk, self.arms).key for pk in range(200)]
        self.assertNotEqual(a, b)

    def test_all_weights_zero_still_returns_an_arm(self):
        arms = [ExperimentArm(key="control", weight=0), ExperimentArm(key="b", weight=0)]
        self.assertIsNotNone(bucket("e1", 1, arms))


class ResolveTests(ThrottleResetMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user("player@example.com", "pw")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.url = reverse("features:onboarding-config")

    def start_experiment(self, weights=(50, 50)):
        a = make_variant("a", is_default=True)
        b = make_variant("b")
        experiment = Experiment.objects.create(
            key="e1", name="E1", status=Experiment.Status.RUNNING
        )
        ExperimentArm.objects.create(
            experiment=experiment, variant=a, key="control", weight=weights[0]
        )
        ExperimentArm.objects.create(experiment=experiment, variant=b, key="b", weight=weights[1])
        return experiment

    def test_an_empty_database_still_serves_the_shipped_flow(self):
        # Onboarding is a hard gate: an unseeded database must not strand a signup.
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["steps"]), len(DEFAULT_STEPS))
        self.assertIsNone(response.json()["experiment_key"])

    def test_serves_the_default_variant_when_nothing_is_running(self):
        make_variant("house", is_default=True)
        self.assertEqual(self.client.get(self.url).json()["variant_key"], "house")

    def test_disabled_steps_are_not_served(self):
        steps = copy.deepcopy(DEFAULT_STEPS)
        steps[3]["enabled"] = False
        make_variant("short", is_default=True, steps=steps)

        served = self.client.get(self.url).json()["steps"]
        self.assertEqual(len(served), len(DEFAULT_STEPS) - 1)
        self.assertNotIn(steps[3]["step_key"], [s["step_key"] for s in served])

    def test_stale_option_values_are_dropped_on_read(self):
        # A variant saved before an instrument was retired must not offer it.
        steps = copy.deepcopy(DEFAULT_STEPS)
        step = next(s for s in steps if s["step_key"] == "instrument")
        step["options"]["instruments"] = [{"value": "trumpet"}, {"value": "ophicleide"}]
        make_variant("stale", is_default=True, steps=steps)

        served = self.client.get(self.url).json()["steps"]
        offered = next(s for s in served if s["step_key"] == "instrument")
        self.assertEqual(offered["options"]["instruments"], [{"value": "trumpet"}])

    def test_assignment_is_created_once_and_is_stable(self):
        self.start_experiment()
        first = self.client.get(self.url).json()
        second = self.client.get(self.url).json()

        self.assertEqual(first["arm_key"], second["arm_key"])
        self.assertEqual(first["experiment_key"], "e1")
        self.assertEqual(ExperimentAssignment.objects.filter(user=self.user).count(), 1)

    def test_changing_a_weight_does_not_move_an_assigned_player(self):
        experiment = self.start_experiment()
        assigned = self.client.get(self.url).json()["arm_key"]

        # Swing every visitor to the other arm from here on.
        for arm in experiment.arms.all():
            arm.weight = 100 if arm.key != assigned else 0
            arm.save(update_fields=["weight"])

        self.assertEqual(self.client.get(self.url).json()["arm_key"], assigned)

    def test_stopping_an_experiment_returns_later_readers_to_the_default(self):
        experiment = self.start_experiment()
        self.client.get(self.url)
        experiment.status = Experiment.Status.STOPPED
        experiment.save(update_fields=["status"])

        body = self.client.get(self.url).json()
        self.assertIsNone(body["experiment_key"])
        self.assertEqual(body["variant_key"], "a")

    def test_an_onboarded_account_is_never_newly_assigned(self):
        # The account screen's edit deep-links hit this endpoint too. Counting
        # them as experiment starts would wreck every completion rate.
        self.start_experiment()
        UserPreferences.objects.create(user=self.user, onboarding_completed_at=timezone.now())

        body = self.client.get(self.url).json()
        self.assertIsNone(body["experiment_key"])
        self.assertEqual(ExperimentAssignment.objects.count(), 0)

    def test_an_already_assigned_account_keeps_its_arm_after_onboarding(self):
        self.start_experiment()
        assigned = self.client.get(self.url).json()["arm_key"]
        UserPreferences.objects.create(user=self.user, onboarding_completed_at=timezone.now())

        self.assertEqual(self.client.get(self.url).json()["arm_key"], assigned)

    def test_a_running_experiment_with_no_arms_falls_back(self):
        make_variant("house", is_default=True)
        Experiment.objects.create(key="empty", name="Empty", status=Experiment.Status.RUNNING)
        self.assertEqual(self.client.get(self.url).json()["variant_key"], "house")


class StepViewTests(ThrottleResetMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create_user("player@example.com", "pw")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.url = reverse("features:onboarding-view")
        make_variant(DEFAULT_KEY, is_default=True)

    def test_records_a_view_and_answers_204(self):
        response = self.client.post(self.url, {"step_key": "instrument"}, format="json")
        self.assertEqual(response.status_code, 204)
        self.assertEqual(OnboardingStepView.objects.count(), 1)

    def test_repeat_beacons_do_not_inflate_the_funnel(self):
        for _ in range(4):
            self.client.post(self.url, {"step_key": "instrument"}, format="json")
        self.assertEqual(OnboardingStepView.objects.count(), 1)

    def test_rejects_an_unknown_step(self):
        response = self.client.post(self.url, {"step_key": "nonsense"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(OnboardingStepView.objects.count(), 0)


class ResultsTests(FeaturesAuthMixin, ThrottleResetMixin, TestCase):
    def setUp(self):
        super().setUp()
        self.a = make_variant("a", is_default=True)
        self.b = make_variant("b")
        self.experiment = Experiment.objects.create(
            key="e1", name="E1", status=Experiment.Status.RUNNING
        )
        self.control = ExperimentArm.objects.create(
            experiment=self.experiment, variant=self.a, key="control", weight=50
        )
        self.url = reverse("features:experiment-results", args=["e1"])

    def assign(self, email: str, *, days_ago: int = 30):
        user = User.objects.create_user(email, "pw")
        assignment = ExperimentAssignment.objects.create(
            experiment=self.experiment, arm=self.control, user=user
        )
        # assigned_at is auto_now_add, so age it deliberately.
        ExperimentAssignment.objects.filter(pk=assignment.pk).update(
            assigned_at=timezone.now() - timedelta(days=days_ago)
        )
        assignment.refresh_from_db()
        return user, assignment

    def submit(self, user, *, when, analyzed=True):
        submission = Submission.objects.create(user=user, exercise_id="clarke-1")
        Submission.objects.filter(pk=submission.pk).update(created_at=when)
        GradingResult.objects.create(
            submission=submission,
            total_score=80,
            grade_label="B",
            band="Solid",
            pitch_score=20,
            rhythm_score=20,
            tempo_score=16,
            tone_score=12,
            completion_score=12,
            summary="",
            practice_tip="",
            analyzed=analyzed,
        )
        return submission

    def arm_row(self):
        body = self.staff.get(self.url).json()
        return next(arm for arm in body["arms"] if arm["arm_key"] == "control")

    def test_counts_assignments_completions_and_step_views(self):
        user, _ = self.assign("one@example.com")
        UserPreferences.objects.create(user=user, onboarding_completed_at=timezone.now())
        OnboardingStepView.objects.create(
            user=user, experiment=self.experiment, arm=self.control,
            variant_key=self.a.key, step_key="instrument",
        )
        self.assign("two@example.com")

        row = self.arm_row()
        self.assertEqual(row["assigned"], 2)
        self.assertEqual(row["completed"], 1)
        self.assertEqual(row["completion_rate"], 0.5)
        viewed = {step["step_key"]: step["viewed"] for step in row["steps"]}
        self.assertEqual(viewed["instrument"], 1)
        self.assertEqual(viewed["goal"], 0)

    def test_a_take_after_assignment_counts_as_activation(self):
        user, assignment = self.assign("one@example.com")
        self.submit(user, when=assignment.assigned_at + timedelta(days=1))
        self.assertEqual(self.arm_row()["activated"], 1)

    def test_a_take_after_the_window_closes_does_not_count(self):
        # The window is what makes a take attributable to the flow at all. A
        # first take six weeks later is the player's own habit, and counting it
        # would let a bad arm keep accruing activations forever.
        user, assignment = self.assign("one@example.com", days_ago=60)
        self.submit(user, when=assignment.assigned_at + timedelta(days=45))
        row = self.arm_row()
        self.assertEqual(row["matured"], 1)
        self.assertEqual(row["activated"], 0)

    def test_a_take_before_assignment_does_not_count(self):
        user, assignment = self.assign("one@example.com")
        self.submit(user, when=assignment.assigned_at - timedelta(days=1))
        self.assertEqual(self.arm_row()["activated"], 0)

    def test_an_undecodable_take_does_not_count(self):
        # Scored on clip length alone — a broken recorder, not practice.
        user, assignment = self.assign("one@example.com")
        self.submit(user, when=assignment.assigned_at + timedelta(days=1), analyzed=False)
        self.assertEqual(self.arm_row()["activated"], 0)

    def test_recent_assignments_are_excluded_from_the_activation_denominator(self):
        self.assign("old@example.com", days_ago=ACTIVATION_WINDOW_DAYS + 1)
        self.assign("new@example.com", days_ago=0)
        row = self.arm_row()
        self.assertEqual(row["assigned"], 2)
        self.assertEqual(row["matured"], 1)

    def test_small_arms_are_flagged_rather_than_hidden(self):
        self.assign("one@example.com")
        row = self.arm_row()
        self.assertFalse(row["enough_data"])
        self.assertFalse(row["enough_matured"])

    def test_an_arm_can_have_enough_data_before_it_has_enough_matured(self):
        # A young experiment: plenty of accounts assigned, almost none of them
        # past the activation window. One flag could not honestly gate both
        # rates, so completion reads and activation still shows “—”.
        for index in range(MIN_SAMPLE):
            self.assign(f"new{index}@example.com", days_ago=0)
        self.assign("old@example.com", days_ago=ACTIVATION_WINDOW_DAYS + 1)

        row = self.arm_row()
        self.assertEqual(row["assigned"], MIN_SAMPLE + 1)
        self.assertEqual(row["matured"], 1)
        self.assertTrue(row["enough_data"])
        self.assertFalse(row["enough_matured"])

    def test_results_are_staff_only(self):
        self.assertEqual(self.anon.get(self.url).status_code, 401)
        self.assertEqual(self.member.get(self.url).status_code, 403)


class SeedCommandTests(TestCase):
    def test_creates_the_default_variant(self):
        call_command("seed_onboarding_config", verbosity=0)
        variant = OnboardingVariant.objects.get(key=DEFAULT_KEY)
        self.assertTrue(variant.is_default)
        self.assertEqual(len(variant.steps), len(DEFAULT_STEPS))

    def test_leaves_dashboard_edits_alone_on_a_second_run(self):
        call_command("seed_onboarding_config", verbosity=0)
        variant = OnboardingVariant.objects.get(key=DEFAULT_KEY)
        variant.steps[0]["copy"]["title"] = "Edited"
        variant.save(update_fields=["steps"])

        call_command("seed_onboarding_config", verbosity=0)
        variant.refresh_from_db()
        self.assertEqual(variant.steps[0]["copy"]["title"], "Edited")

    def test_force_overwrites(self):
        call_command("seed_onboarding_config", verbosity=0)
        variant = OnboardingVariant.objects.get(key=DEFAULT_KEY)
        variant.steps[0]["copy"]["title"] = "Edited"
        variant.save(update_fields=["steps"])

        call_command("seed_onboarding_config", force=True, verbosity=0)
        variant.refresh_from_db()
        self.assertEqual(variant.steps[0]["copy"]["title"], DEFAULT_STEPS[0]["copy"]["title"])

    def test_dry_run_writes_nothing(self):
        call_command("seed_onboarding_config", dry_run=True, verbosity=0)
        self.assertEqual(OnboardingVariant.objects.count(), 0)

    def test_the_shipped_flow_passes_its_own_validator(self):
        # The seed and the dashboard write through the same rules; a seed the
        # API would reject would be un-editable the moment it was loaded.
        staff = APIClient()
        staff.force_authenticate(User.objects.create_user("o@example.com", "pw", is_staff=True))
        response = staff.post(
            reverse("features:variant-list"),
            {"key": "check", "name": "Check", "steps": copy.deepcopy(DEFAULT_STEPS)},
            format="json",
        )
        self.assertEqual(response.status_code, 201)

    def test_resolve_returns_the_seeded_flow(self):
        call_command("seed_onboarding_config", verbosity=0)
        user = User.objects.create_user("player@example.com", "pw")
        resolution = resolve_for_user(user)
        self.assertEqual(resolution.variant.key, DEFAULT_KEY)
        self.assertEqual(len(resolution.steps), len(DEFAULT_STEPS))
