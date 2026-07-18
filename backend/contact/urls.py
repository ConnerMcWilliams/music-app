from django.urls import path

from .views import ContactMessageView

app_name = "contact"

urlpatterns = [
    path("contact/", ContactMessageView.as_view(), name="create"),
]
