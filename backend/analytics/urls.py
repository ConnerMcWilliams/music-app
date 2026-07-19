from django.urls import path

from .views import VisitTrackView

app_name = "analytics"

urlpatterns = [
    path("analytics/visit/", VisitTrackView.as_view(), name="visit"),
]
