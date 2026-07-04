from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.forms import UserCreationForm
from django.utils.translation import gettext_lazy as _

from .models import User


class UserCreationFormEmail(UserCreationForm):
    """Admin 'add user' form keyed on email instead of username."""

    class Meta(UserCreationForm.Meta):
        model = User
        fields = ("email", "display_name")


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    """Admin for the email-based custom user model.

    Reuses Django's UserAdmin (so password changes go through the secure
    set-password form) but drops the ``username`` field the default assumes.
    """

    add_form = UserCreationFormEmail
    ordering = ("-created_at",)
    list_display = ("email", "display_name", "is_staff", "is_active", "created_at")
    list_filter = ("is_staff", "is_superuser", "is_active")
    search_fields = ("email", "display_name")
    readonly_fields = ("id", "created_at", "updated_at", "last_login")

    fieldsets = (
        (None, {"fields": ("id", "email", "password")}),
        (_("Profile"), {"fields": ("display_name",)}),
        (_("Permissions"), {
            "fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions"),
        }),
        (_("Important dates"), {"fields": ("last_login", "created_at", "updated_at")}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "display_name", "password1", "password2"),
        }),
    )
