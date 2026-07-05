from django.contrib import admin

from .models import GradingResult, Submission


class GradingResultInline(admin.StackedInline):
    model = GradingResult
    extra = 0
    can_delete = False
    readonly_fields = (
        "total_score", "grade_label", "band",
        "pitch_score", "rhythm_score", "tempo_score", "tone_score",
        "completion_score", "summary", "practice_tip", "analyzed", "created_at",
    )


@admin.register(Submission)
class SubmissionAdmin(admin.ModelAdmin):
    list_display = ("id", "exercise_id", "exercise_title", "user", "created_at")
    list_filter = ("created_at",)
    search_fields = ("id", "exercise_id", "exercise_title")
    readonly_fields = ("id", "created_at")
    inlines = [GradingResultInline]


@admin.register(GradingResult)
class GradingResultAdmin(admin.ModelAdmin):
    list_display = ("submission", "total_score", "grade_label", "analyzed", "created_at")
    list_filter = ("grade_label", "analyzed", "created_at")
