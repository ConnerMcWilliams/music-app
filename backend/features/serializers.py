"""
Serializers for editable config and experiments.

``OnboardingVariantSerializer.validate_steps`` is the load-bearing one: it is the
only thing standing between a dashboard typo and an onboarding flow the mobile
app cannot render. Onboarding is a hard gate — an account that cannot finish it
cannot use the app at all — so validation is total, and every rejection comes
back as an ordinary DRF field error the editor can show inline.
"""
from __future__ import annotations

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from . import onboarding_catalog
from .models import (
    SURFACE_ONBOARDING,
    Experiment,
    ExperimentArm,
    ExperimentAssignment,
    OnboardingVariant,
)


class OnboardingVariantSerializer(serializers.ModelSerializer):
    """Read/write one onboarding flow, validated against the code catalog."""

    # Referenced by an experiment arm, so it can't be deleted (the arm FK is
    # PROTECTed). The dashboard reads this to offer Archive instead of Delete.
    in_use = serializers.SerializerMethodField()

    class Meta:
        model = OnboardingVariant
        fields = [
            "key",
            "name",
            "notes",
            "is_default",
            "archived",
            "steps",
            "in_use",
            "created_at",
            "updated_at",
        ]
        # Promoting a default is an action, not a field edit: it has to demote
        # the incumbent in the same breath, which a PATCH of one row cannot
        # express. Set it via POST .../default/ instead.
        read_only_fields = ["is_default", "in_use", "created_at", "updated_at"]
        # The model's conditional "only one default" UniqueConstraint would
        # otherwise become a DRF UniqueTogetherValidator that rejects the
        # promotion before `OnboardingVariant.save()` can demote the old one.
        # The constraint still guards the database; this only stops DRF
        # pre-empting it with a rule it cannot model.
        validators = []

    def get_in_use(self, variant: OnboardingVariant) -> bool:
        return variant.arms.exists()

    def validate_steps(self, value: object) -> list[dict]:
        if not isinstance(value, list):
            raise serializers.ValidationError("Steps must be a list.")
        if not value:
            raise serializers.ValidationError("A variant needs at least one step.")

        seen_keys: set[str] = set()
        cleaned: list[dict] = []

        # List position *is* the step order — there is no separate field to
        # disagree with it, so reordering in the dashboard is a list move.
        for index, raw in enumerate(value):
            if not isinstance(raw, dict):
                raise serializers.ValidationError(f"Step {index + 1} must be an object.")

            step_key = raw.get("step_key")
            spec = onboarding_catalog.get_step(step_key)
            if spec is None:
                raise serializers.ValidationError(f"Unknown step “{step_key}”.")
            if step_key in seen_keys:
                raise serializers.ValidationError(f"Step “{step_key}” is listed twice.")
            seen_keys.add(step_key)

            enabled = raw.get("enabled", True)
            if not isinstance(enabled, bool):
                raise serializers.ValidationError(f"Step “{step_key}” enabled must be true/false.")

            cleaned.append(
                {
                    "step_key": step_key,
                    "enabled": enabled,
                    "copy": self._clean_copy(spec, raw.get("copy")),
                    "options": self._clean_options(spec, raw.get("options")),
                }
            )

        if not any(step["enabled"] for step in cleaned):
            # With nothing enabled the flow can never be completed, and the
            # route guard would hold every account in it forever.
            raise serializers.ValidationError("At least one step must stay enabled.")

        return cleaned

    def _clean_copy(self, spec: onboarding_catalog.StepSpec, raw: object) -> dict:
        if raw is None:
            raw = {}
        if not isinstance(raw, dict):
            raise serializers.ValidationError(f"Step “{spec.key}” copy must be an object.")

        known = {slot.key for slot in spec.copy_slots}
        unknown = sorted(set(raw) - known)
        if unknown:
            raise serializers.ValidationError(
                f"Step “{spec.key}” has no copy field “{unknown[0]}”."
            )

        cleaned: dict[str, str] = {}
        for slot in spec.copy_slots:
            text = raw.get(slot.key, "")
            if not isinstance(text, str):
                raise serializers.ValidationError(f"“{slot.label}” must be text.")
            text = text.strip()
            if slot.required and not text:
                raise serializers.ValidationError(
                    f"Step “{spec.key}” needs a {slot.label.lower()}."
                )
            if len(text) > slot.max_length:
                raise serializers.ValidationError(
                    f"“{slot.label}” is longer than {slot.max_length} characters."
                )
            cleaned[slot.key] = text
        return cleaned

    def _clean_options(self, spec: onboarding_catalog.StepSpec, raw: object) -> dict:
        if raw is None:
            raw = {}
        if not isinstance(raw, dict):
            raise serializers.ValidationError(f"Step “{spec.key}” options must be an object.")

        known = {group.key for group in spec.option_groups}
        unknown = sorted(set(raw) - known)
        if unknown:
            raise serializers.ValidationError(
                f"Step “{spec.key}” has no option group “{unknown[0]}”."
            )

        cleaned: dict[str, list[dict]] = {}
        for group in spec.option_groups:
            entries = raw.get(group.key)
            if entries is None:
                # Unsent group means "offer everything", which is also what a
                # freshly added group should do to variants written before it.
                entries = [{"value": value} for value in group.values]
            if not isinstance(entries, list) or not entries:
                raise serializers.ValidationError(
                    f"“{group.label}” needs at least one option."
                )

            legal = list(group.values)
            seen: set[object] = set()
            rows: list[dict] = []
            for entry in entries:
                if not isinstance(entry, dict):
                    raise serializers.ValidationError(f"“{group.label}” options must be objects.")

                value = entry.get("value")
                if isinstance(value, bool) or value not in legal:
                    raise serializers.ValidationError(
                        f"“{value}” is not an option for “{group.label}”."
                    )
                if value in seen:
                    raise serializers.ValidationError(
                        f"“{group.label}” lists “{value}” twice."
                    )
                seen.add(value)

                row: dict[str, object] = {"value": value}
                for field in ("label", "hint"):
                    if field not in entry:
                        continue
                    if field not in group.editable:
                        # Instruments and Clarke sections are named by the
                        # client, from catalogs the server depends on; letting a
                        # variant rename them here would silently fork them.
                        raise serializers.ValidationError(
                            f"“{group.label}” options cannot set a custom {field}."
                        )
                    text = entry[field]
                    if not isinstance(text, str):
                        raise serializers.ValidationError(f"“{group.label}” {field} must be text.")
                    text = text.strip()
                    if len(text) > 120:
                        raise serializers.ValidationError(
                            f"“{group.label}” {field} is longer than 120 characters."
                        )
                    row[field] = text
                rows.append(row)

            cleaned[group.key] = rows
        return cleaned


class ExperimentArmSerializer(serializers.ModelSerializer):
    """One arm, written inline with its experiment."""

    variant = serializers.SlugRelatedField(
        slug_field="key", queryset=OnboardingVariant.objects.all()
    )
    variant_name = serializers.CharField(source="variant.name", read_only=True)

    class Meta:
        model = ExperimentArm
        fields = ["key", "variant", "variant_name", "weight"]

    def validate_weight(self, value: int) -> int:
        if value < 1:
            raise serializers.ValidationError("Give each arm a weight of at least 1.")
        return value


class ExperimentSerializer(serializers.ModelSerializer):
    """Read/write an experiment and its arms as one object.

    Arms are written inline because an experiment is meaningless without at
    least two of them — splitting them across requests would let a half-created
    experiment be started.
    """

    arms = ExperimentArmSerializer(many=True)

    class Meta:
        model = Experiment
        fields = [
            "key",
            "surface",
            "name",
            "hypothesis",
            "status",
            "arms",
            "started_at",
            "stopped_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["started_at", "stopped_at", "created_at", "updated_at"]

    def validate_arms(self, value: list[dict]) -> list[dict]:
        if len(value) < 2:
            raise serializers.ValidationError("An experiment needs at least two arms.")
        keys = [arm["key"] for arm in value]
        if len(set(keys)) != len(keys):
            raise serializers.ValidationError("Arm keys must be unique.")
        variants = [arm["variant"].pk for arm in value]
        if len(set(variants)) != len(variants):
            raise serializers.ValidationError("Each arm needs a different variant.")
        return value

    def validate(self, attrs: dict) -> dict:
        status = attrs.get("status", getattr(self.instance, "status", Experiment.Status.DRAFT))
        # `surface` has a model default, so a create that omits it never reaches
        # `attrs` — falling through to None here would silently match nothing
        # and let the database raise an IntegrityError instead of a 400.
        surface = attrs.get("surface") or getattr(self.instance, "surface", SURFACE_ONBOARDING)
        if status == Experiment.Status.RUNNING:
            clash = Experiment.objects.filter(
                surface=surface, status=Experiment.Status.RUNNING
            ).exclude(pk=getattr(self.instance, "pk", None))
            if clash.exists():
                raise serializers.ValidationError(
                    {"status": ["Another experiment is already running on this surface."]}
                )

        if self.instance is not None and "arms" in attrs:
            # Checked here rather than in `update()` so a rejected arms edit
            # never leaves the fields alongside it already written: `update()`
            # saves the experiment before it would reach the arms, and a status
            # stamped once could not be stamped again.
            if self.instance.status != Experiment.Status.DRAFT:
                raise serializers.ValidationError(
                    {"arms": ["Arms can only be changed while the experiment is a draft."]}
                )
            if ExperimentAssignment.objects.filter(experiment=self.instance).exists():
                # Arms are replaced wholesale and assignments PROTECT the row
                # they point at, so this would be an IntegrityError (500).
                raise serializers.ValidationError(
                    {"arms": ["Accounts have already been assigned to these arms."]}
                )
        return attrs

    def create(self, validated_data: dict) -> Experiment:
        arms = validated_data.pop("arms")
        # An experiment and its arms are one object to everything that reads
        # them; a half-written one could be started with a single arm.
        with transaction.atomic():
            experiment = Experiment.objects.create(**validated_data)
            if self._sync_status_stamps(experiment):
                experiment.save(update_fields=["started_at", "stopped_at", "updated_at"])
            for arm in arms:
                ExperimentArm.objects.create(experiment=experiment, **arm)
        return experiment

    def update(self, instance: Experiment, validated_data: dict) -> Experiment:
        arms = validated_data.pop("arms", None)

        with transaction.atomic():
            for field, value in validated_data.items():
                setattr(instance, field, value)
            self._sync_status_stamps(instance)
            instance.save()

            if arms is not None:
                # Replace wholesale: arms are edited as a set in the dashboard,
                # and assignments reference arms by row, so `validate()` has
                # already refused this for anything past a draft.
                instance.arms.all().delete()
                for arm in arms:
                    ExperimentArm.objects.create(experiment=instance, **arm)
        return instance

    def _sync_status_stamps(self, experiment: Experiment) -> bool:
        """Stamp start/stop times from the status, once each. True if changed.

        Stamped once so restarting a stopped experiment never rewrites when it
        originally began — the same rule ``onboarding_completed_at`` follows.
        """
        changed = False
        if experiment.status == Experiment.Status.RUNNING and experiment.started_at is None:
            experiment.started_at = timezone.now()
            changed = True
        if experiment.status == Experiment.Status.STOPPED and experiment.stopped_at is None:
            experiment.stopped_at = timezone.now()
            changed = True
        return changed


class OnboardingStepViewSerializer(serializers.Serializer):
    """The one field the mobile app reports when a step comes into view."""

    step_key = serializers.ChoiceField(choices=list(onboarding_catalog.STEP_KEYS))
