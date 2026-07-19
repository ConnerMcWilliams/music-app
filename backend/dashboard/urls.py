from django.urls import path

from .views import AnalyticsView, NewsletterListCreateView, WaitlistBrowseView

app_name = "dashboard"

urlpatterns = [
    path("dashboard/analytics/", AnalyticsView.as_view(), name="analytics"),
    path("dashboard/waitlist/", WaitlistBrowseView.as_view(), name="waitlist"),
    path(
        "dashboard/newsletters/",
        NewsletterListCreateView.as_view(),
        name="newsletters",
    ),
]
