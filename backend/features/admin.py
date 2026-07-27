from django.contrib import admin

from .models import (
    Experiment,
    ExperimentArm,
    ExperimentAssignment,
    OnboardingStepView,
    OnboardingVariant,
)


@admin.register(OnboardingVariant)
class OnboardingVariantAdmin(admin.ModelAdmin):
    list_display = ("name", "key", "is_default", "archived", "updated_at")
    list_filter = ("is_default", "archived")
    search_fields = ("key", "name", "notes")
    readonly_fields = ("created_at", "updated_at")


class ExperimentArmInline(admin.TabularInline):
    model = ExperimentArm
    extra = 0
    readonly_fields = ("created_at",)


@admin.register(Experiment)
class ExperimentAdmin(admin.ModelAdmin):
    list_display = ("name", "key", "surface", "status", "started_at", "stopped_at")
    list_filter = ("surface", "status")
    search_fields = ("key", "name", "hypothesis")
    readonly_fields = ("created_at", "updated_at")
    inlines = [ExperimentArmInline]


@admin.register(ExperimentAssignment)
class ExperimentAssignmentAdmin(admin.ModelAdmin):
    list_display = ("user", "experiment", "arm", "assigned_at")
    list_filter = ("experiment", "arm")
    search_fields = ("user__email",)
    autocomplete_fields = ("user",)
    readonly_fields = ("assigned_at",)


@admin.register(OnboardingStepView)
class OnboardingStepViewAdmin(admin.ModelAdmin):
    list_display = ("user", "variant_key", "step_key", "arm", "created_at")
    list_filter = ("variant_key", "step_key")
    search_fields = ("user__email",)
    autocomplete_fields = ("user",)
    readonly_fields = ("created_at",)
