from django.urls import path

from .views import (
    ManageUpdateDetailView,
    ManageUpdateListCreateView,
    PublicUpdateListView,
)

app_name = "updates"

urlpatterns = [
    path("updates/", PublicUpdateListView.as_view(), name="public-list"),
    path("updates/manage/", ManageUpdateListCreateView.as_view(), name="manage-list"),
    path(
        "updates/manage/<int:pk>/",
        ManageUpdateDetailView.as_view(),
        name="manage-detail",
    ),
]
