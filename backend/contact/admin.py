import csv

from django.contrib import admin
from django.http import HttpResponse

from config.admin_utils import defuse_spreadsheet_formula

from .models import ContactMessage


@admin.register(ContactMessage)
class ContactMessageAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "created_at")
    list_filter = ("created_at",)
    search_fields = ("name", "email", "message")
    readonly_fields = ("created_at",)
    actions = ["export_csv"]

    @admin.action(description="Export selected messages to CSV")
    def export_csv(self, request, queryset):
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="contact_messages.csv"'
        writer = csv.writer(response)
        writer.writerow(["name", "email", "message", "created_at"])
        for message in queryset.order_by("created_at"):
            writer.writerow(
                [
                    defuse_spreadsheet_formula(message.name),
                    defuse_spreadsheet_formula(message.email),
                    defuse_spreadsheet_formula(message.message),
                    message.created_at.isoformat(),
                ]
            )
        return response
