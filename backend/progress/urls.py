from django.urls import path

from .views import CurrentProfileView, StreakFreezePurchaseView, StudyScoresView

app_name = "progress"

urlpatterns = [
    path("profile/", CurrentProfileView.as_view(), name="current-profile"),
    path("profile/study-scores/", StudyScoresView.as_view(), name="study-scores"),
    path(
        "profile/streak-freeze/",
        StreakFreezePurchaseView.as_view(),
        name="streak-freeze",
    ),
]
