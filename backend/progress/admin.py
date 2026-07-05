from django.contrib import admin

from .models import Profile


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "day_streak",
        "longest_streak",
        "studies_completed",
        "avg_score",
        "last_active_date",
    )
    search_fields = ("user__email", "user__display_name")
    readonly_fields = ("created_at", "updated_at")
    autocomplete_fields = ("user",)
