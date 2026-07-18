import csv

from django.contrib import admin
from django.http import HttpResponse

from config.admin_utils import defuse_spreadsheet_formula

from .models import WaitlistSignup


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
                    defuse_spreadsheet_formula(signup.email),
                    defuse_spreadsheet_formula(signup.instrument),
                    defuse_spreadsheet_formula(signup.skill),
                    defuse_spreadsheet_formula(signup.role),
                    signup.created_at.isoformat(),
                ]
            )
        return response
