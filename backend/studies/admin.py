from django.contrib import admin

from .models import Study, StudyContent


class StudyContentInline(admin.StackedInline):
    model = StudyContent
    extra = 0
    fields = (
        "notation_format",
        "musicxml",
        "display_asset",
        "midi_asset",
        "transposition_semitones",
        "source_url",
    )


@admin.register(Study)
class StudyAdmin(admin.ModelAdmin):
    list_display = ("section", "number", "title", "slug", "category", "instrument", "order")
    list_filter = ("section", "section_label", "category", "instrument", "source")
    search_fields = ("title", "subtitle", "slug", "section_label")
    ordering = ("section", "order", "number")
    inlines = [StudyContentInline]


@admin.register(StudyContent)
class StudyContentAdmin(admin.ModelAdmin):
    list_display = ("study", "notation_format", "has_notation", "transposition_semitones")
    list_select_related = ("study",)

    @admin.display(boolean=True, description="Has notation")
    def has_notation(self, obj: StudyContent) -> bool:
        return obj.has_notation
