from django.urls import path

from .views import WaitlistSignupView

app_name = "waitlist"

urlpatterns = [
    path("waitlist/", WaitlistSignupView.as_view(), name="signup"),
]
