from django.urls import path

from .views import UnsubscribeView, WaitlistSignupView

app_name = "waitlist"

urlpatterns = [
    path("waitlist/", WaitlistSignupView.as_view(), name="signup"),
    path("waitlist/unsubscribe/", UnsubscribeView.as_view(), name="unsubscribe"),
]
