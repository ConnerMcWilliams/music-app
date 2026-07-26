from django.urls import path

from .views import SubmissionDetailView, SubmissionListCreateView

app_name = "grading"

urlpatterns = [
    path(
        "submissions/",
        SubmissionListCreateView.as_view(),
        name="submission-create",
    ),
    path(
        "submissions/<uuid:pk>/",
        SubmissionDetailView.as_view(),
        name="submission-detail",
    ),
]
