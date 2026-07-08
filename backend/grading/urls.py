from django.urls import path

from .views import SubmissionListCreateView

app_name = "grading"

urlpatterns = [
    path(
        "submissions/",
        SubmissionListCreateView.as_view(),
        name="submission-create",
    ),
]
