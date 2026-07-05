from django.urls import path

from .views import StudyDetailView, StudyListView

app_name = "studies"

urlpatterns = [
    path("studies/", StudyListView.as_view(), name="study-list"),
    path("studies/<slug:slug>/", StudyDetailView.as_view(), name="study-detail"),
]
