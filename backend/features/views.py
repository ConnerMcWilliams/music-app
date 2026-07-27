"""
Two audiences, two permission levels.

The mobile app reads the flow it has been assigned and reports which steps it
showed; both are ordinary authenticated endpoints, throttled like the rest of
the app's traffic. Everything under ``/api/features/`` is the dashboard's, gated
with ``IsAdminUser`` — the DRF default is only ``IsAuthenticated``, so it is set
explicitly on every view here — and carries ``NoStoreMixin`` like the other
admin surfaces. The staff views are deliberately unthrottled, matching
``dashboard/views.py``: this is authenticated staff traffic, not the public.
"""
from __future__ import annotations

from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAdminUser, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from config.mixins import NoStoreMixin

from . import onboarding_catalog
from .assignment import resolve_for_user
from .metrics import results_for
from .models import (
    Experiment,
    ExperimentAssignment,
    OnboardingStepView,
    OnboardingVariant,
)
from .serializers import (
    ExperimentSerializer,
    OnboardingStepViewSerializer,
    OnboardingVariantSerializer,
)


class OnboardingConfigView(APIView):
    """GET /api/onboarding/config/ — the caller's onboarding flow.

    Assigns the caller to an experiment arm on first read (see
    ``features.assignment``). Deliberately not ``NoStoreMixin``: that is for
    subscriber and analytics data, and this is the caller's own config.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "onboarding_config"

    def get(self, request):
        resolution = resolve_for_user(request.user)
        variant = resolution.variant
        return Response(
            {
                "variant_key": variant.key if variant else "",
                "variant_name": variant.name if variant else "",
                "experiment_key": resolution.experiment.key if resolution.experiment else None,
                "arm_key": resolution.arm.key if resolution.arm else None,
                "steps": resolution.steps,
            }
        )


class OnboardingStepViewCreateView(APIView):
    """POST /api/onboarding/views/ — record that a step was shown.

    Fire-and-forget: always ``204``, never a body. The client does not wait on
    it and must never fail a step because a funnel beacon did.
    """

    permission_classes = [IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "onboarding_views"

    def post(self, request):
        serializer = OnboardingStepViewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        resolution = resolve_for_user(request.user)
        OnboardingStepView.objects.get_or_create(
            user=request.user,
            variant_key=resolution.variant.key if resolution.variant else "",
            step_key=serializer.validated_data["step_key"],
            defaults={"experiment": resolution.experiment, "arm": resolution.arm},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class OnboardingCatalogView(NoStoreMixin, APIView):
    """GET /api/features/onboarding/catalog/ — the editable-surface schema.

    The dashboard editor renders its fields from this, so a copy slot added to
    ``features.onboarding_catalog`` grows a field in the UI with no frontend
    change and can never drift from what the serializer will accept.
    """

    permission_classes = [IsAdminUser]

    def get(self, request):
        return Response({"steps": onboarding_catalog.as_schema()})


class VariantListCreateView(NoStoreMixin, generics.ListCreateAPIView):
    """GET|POST /api/features/onboarding/variants/"""

    permission_classes = [IsAdminUser]
    serializer_class = OnboardingVariantSerializer
    queryset = OnboardingVariant.objects.all()
    # The dashboard shows every variant on one page; there will never be many.
    pagination_class = None


class VariantDetailView(NoStoreMixin, generics.RetrieveUpdateDestroyAPIView):
    """GET|PATCH|DELETE /api/features/onboarding/variants/<key>/"""

    permission_classes = [IsAdminUser]
    serializer_class = OnboardingVariantSerializer
    queryset = OnboardingVariant.objects.all()
    lookup_field = "key"

    def perform_destroy(self, instance: OnboardingVariant) -> None:
        if instance.is_default:
            # Deleting the fallback would leave accounts outside an experiment
            # with no flow to be served.
            raise ValidationError({"detail": ["Make another variant the default first."]})
        if instance.arms.exists():
            # The arm FK is PROTECTed, so this would be an IntegrityError (500)
            # rather than something the dashboard could explain.
            raise ValidationError(
                {"detail": ["An experiment uses this variant. Archive it instead."]}
            )
        super().perform_destroy(instance)


class VariantDuplicateView(NoStoreMixin, APIView):
    """POST /api/features/onboarding/variants/<key>/duplicate/ — copy a flow.

    One click from "the flow we run" to "the flow we want to test against it",
    which is how an experiment arm normally gets built.
    """

    permission_classes = [IsAdminUser]

    def post(self, request, key: str):
        source = OnboardingVariant.objects.filter(key=key).first()
        if source is None:
            return Response({"detail": "No such variant."}, status=status.HTTP_404_NOT_FOUND)

        # Through the same serializer the normal create path uses, so a copy
        # cannot be given a key or name the editor itself would have rejected —
        # an unroutable key here would strand the variant behind every
        # ``<slug:key>`` route it is reached by. ``is_default`` is read-only, so
        # the copy is never born the default.
        serializer = OnboardingVariantSerializer(
            data={
                "key": request.data.get("key", ""),
                "name": str(request.data.get("name", "")).strip() or f"{source.name} (copy)",
                "notes": source.notes,
                "steps": source.steps,
            }
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class VariantSetDefaultView(NoStoreMixin, APIView):
    """POST /api/features/onboarding/variants/<key>/default/ — promote a flow.

    An action rather than a PATCH of ``is_default``, because promoting one
    variant must demote the incumbent in the same transaction — two rows can
    never both be the default, and a field edit cannot express that pair.
    """

    permission_classes = [IsAdminUser]

    def post(self, request, key: str):
        variant = OnboardingVariant.objects.filter(key=key).first()
        if variant is None:
            return Response({"detail": "No such variant."}, status=status.HTTP_404_NOT_FOUND)
        if variant.archived:
            raise ValidationError({"detail": ["Un-archive it before making it the default."]})

        variant.is_default = True
        variant.save()
        return Response(OnboardingVariantSerializer(variant).data)


class ExperimentListCreateView(NoStoreMixin, generics.ListCreateAPIView):
    """GET|POST /api/features/experiments/"""

    permission_classes = [IsAdminUser]
    serializer_class = ExperimentSerializer
    queryset = Experiment.objects.prefetch_related("arms__variant")
    pagination_class = None


class ExperimentDetailView(NoStoreMixin, generics.RetrieveUpdateDestroyAPIView):
    """GET|PATCH|DELETE /api/features/experiments/<key>/ — start/stop via status."""

    permission_classes = [IsAdminUser]
    serializer_class = ExperimentSerializer
    queryset = Experiment.objects.prefetch_related("arms__variant")
    lookup_field = "key"

    def perform_destroy(self, instance: Experiment) -> None:
        if ExperimentAssignment.objects.filter(experiment=instance).exists():
            # Arms cascade from the experiment but assignments PROTECT them, so
            # the collector would raise rather than delete — a 500 where the
            # dashboard should be told the results are worth keeping.
            raise ValidationError(
                {"detail": ["Accounts were assigned to this experiment. Stop it instead."]}
            )
        super().perform_destroy(instance)


class ExperimentResultsView(NoStoreMixin, APIView):
    """GET /api/features/experiments/<key>/results/ — the per-arm funnel."""

    permission_classes = [IsAdminUser]

    def get(self, request, key: str):
        experiment = (
            Experiment.objects.prefetch_related("arms__variant").filter(key=key).first()
        )
        if experiment is None:
            return Response({"detail": "No such experiment."}, status=status.HTTP_404_NOT_FOUND)
        return Response(results_for(experiment))
