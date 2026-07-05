from django.urls import path

from .views import CurrentProfileView

app_name = "progress"

urlpatterns = [
    path("profile/", CurrentProfileView.as_view(), name="current-profile"),
]
