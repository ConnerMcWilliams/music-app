from django.contrib import admin

from .models import Newsletter


@admin.register(Newsletter)
class NewsletterAdmin(admin.ModelAdmin):
    """Read-only send log — newsletters are composed and sent from the
    dashboard app, so the admin is just a fallback viewer."""

    list_display = ("subject", "sent_at", "recipient_count", "failed_count")
    readonly_fields = (
        "created_at",
        "sent_at",
        "recipient_count",
        "failed_count",
    )
    search_fields = ("subject",)
