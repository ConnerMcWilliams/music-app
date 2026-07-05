from django.urls import path

from .views import SubmissionCreateView

app_name = "grading"

urlpatterns = [
    path("submissions/", SubmissionCreateView.as_view(), name="submission-create"),
]
