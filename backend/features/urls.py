from django.urls import path

from .views import (
    ExperimentDetailView,
    ExperimentListCreateView,
    ExperimentResultsView,
    OnboardingCatalogView,
    OnboardingConfigView,
    OnboardingStepViewCreateView,
    VariantDetailView,
    VariantDuplicateView,
    VariantListCreateView,
    VariantSetDefaultView,
)

app_name = "features"

urlpatterns = [
    # Mobile-facing: the caller's own flow, and the funnel beacon.
    path("onboarding/config/", OnboardingConfigView.as_view(), name="onboarding-config"),
    path("onboarding/views/", OnboardingStepViewCreateView.as_view(), name="onboarding-view"),
    # Dashboard-facing. Every path below is matched by `_ADMIN_PREFIXES` in
    # `config/exception_handler.py`, so denials here are audited.
    path(
        "features/onboarding/catalog/",
        OnboardingCatalogView.as_view(),
        name="onboarding-catalog",
    ),
    path(
        "features/onboarding/variants/",
        VariantListCreateView.as_view(),
        name="variant-list",
    ),
    path(
        "features/onboarding/variants/<slug:key>/",
        VariantDetailView.as_view(),
        name="variant-detail",
    ),
    path(
        "features/onboarding/variants/<slug:key>/duplicate/",
        VariantDuplicateView.as_view(),
        name="variant-duplicate",
    ),
    path(
        "features/onboarding/variants/<slug:key>/default/",
        VariantSetDefaultView.as_view(),
        name="variant-set-default",
    ),
    path("features/experiments/", ExperimentListCreateView.as_view(), name="experiment-list"),
    path(
        "features/experiments/<slug:key>/",
        ExperimentDetailView.as_view(),
        name="experiment-detail",
    ),
    path(
        "features/experiments/<slug:key>/results/",
        ExperimentResultsView.as_view(),
        name="experiment-results",
    ),
]
