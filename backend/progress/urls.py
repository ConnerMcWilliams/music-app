from django.urls import path

from .views import CurrentProfileView, StreakFreezePurchaseView

app_name = "progress"

urlpatterns = [
    path("profile/", CurrentProfileView.as_view(), name="current-profile"),
    path(
        "profile/streak-freeze/",
        StreakFreezePurchaseView.as_view(),
        name="streak-freeze",
    ),
]
