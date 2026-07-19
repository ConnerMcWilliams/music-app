from django.contrib import admin

from .models import UpdatePost


@admin.register(UpdatePost)
class UpdatePostAdmin(admin.ModelAdmin):
    list_display = ("title", "published", "created_at", "updated_at")
    list_filter = ("published",)
    search_fields = ("title", "body")
    readonly_fields = ("created_at", "updated_at")
