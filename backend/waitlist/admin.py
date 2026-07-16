import csv

from django.contrib import admin
from django.http import HttpResponse

from .models import WaitlistSignup


def _defuse_spreadsheet_formula(value: str) -> str:
    """Neutralize cells that Excel/Sheets would evaluate as formulas."""
    if value.startswith(("=", "+", "-", "@", "\t", "\r")):
        return f"'{value}"
    return value


@admin.register(WaitlistSignup)
class WaitlistSignupAdmin(admin.ModelAdmin):
    list_display = ("email", "instrument", "skill", "role", "created_at")
    list_filter = ("role", "created_at")
    search_fields = ("email", "instrument", "skill")
    readonly_fields = ("created_at",)
    actions = ["export_csv"]

    @admin.action(description="Export selected signups to CSV")
    def export_csv(self, request, queryset):
        # Select-all in the changelist, run this action, and feed the CSV to
        # any mail tool — the app itself sends no email.
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="waitlist.csv"'
        writer = csv.writer(response)
        writer.writerow(["email", "instrument", "skill", "role", "created_at"])
        for signup in queryset.order_by("created_at"):
            writer.writerow(
                [
                    _defuse_spreadsheet_formula(signup.email),
                    _defuse_spreadsheet_formula(signup.instrument),
                    _defuse_spreadsheet_formula(signup.skill),
                    _defuse_spreadsheet_formula(signup.role),
                    signup.created_at.isoformat(),
                ]
            )
        return response
