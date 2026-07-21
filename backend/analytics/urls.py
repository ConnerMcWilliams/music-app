from django.urls import path

from .views import VisitTrackView

app_name = "analytics"

urlpatterns = [
    path("site/visit/", VisitTrackView.as_view(), name="visit"),
]
