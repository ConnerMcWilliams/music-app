import csv

from django.contrib import admin
from django.http import HttpResponse

from config.admin_utils import defuse_spreadsheet_formula

from .models import PageVisit


@admin.register(PageVisit)
class PageVisitAdmin(admin.ModelAdmin):
    list_display = ("source", "referrer_host", "path", "utm_campaign", "created_at")
    list_filter = ("source", "created_at")
    search_fields = ("visitor_id", "referrer_host", "utm_source", "utm_campaign")
    readonly_fields = ("created_at",)
    actions = ["export_csv"]

    @admin.action(description="Export selected visits to CSV")
    def export_csv(self, request, queryset):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="page_visits.csv"'
        writer = csv.writer(response)
        writer.writerow(
            [
                "visitor_id",
                "source",
                "referrer_host",
                "path",
                "utm_source",
                "utm_medium",
                "utm_campaign",
                "created_at",
            ]
        )
        for visit in queryset.order_by("created_at"):
            writer.writerow(
                [
                    defuse_spreadsheet_formula(visit.visitor_id),
                    defuse_spreadsheet_formula(visit.source),
                    defuse_spreadsheet_formula(visit.referrer_host),
                    defuse_spreadsheet_formula(visit.path),
                    defuse_spreadsheet_formula(visit.utm_source),
                    defuse_spreadsheet_formula(visit.utm_medium),
                    defuse_spreadsheet_formula(visit.utm_campaign),
                    visit.created_at.isoformat(),
                ]
            )
        return response
