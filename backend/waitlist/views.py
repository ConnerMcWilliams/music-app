"""
Waitlist API view.

Public and anonymous (the marketing site has no auth), so it is rate-limited
per client IP via a dedicated throttle scope. Per docs/security.md, the endpoint
is deliberately separate from the account endpoints and grants nothing.
"""
from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import WaitlistSignup
from .serializers import WaitlistSignupSerializer


class WaitlistSignupView(APIView):
    """POST /api/waitlist/ — join the waitlist from the marketing site."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "waitlist"

    def post(self, request):
        serializer = WaitlistSignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        # Race-safe idempotency: get_or_create keyed on the unique email column.
        # Existing rows are left untouched — anyone can post any address, so
        # first-write-wins keeps a stranger from overwriting someone's details.
        WaitlistSignup.objects.get_or_create(
            email=data["email"],
            defaults={
                "instrument": data["instrument"],
                "skill": data["skill"],
                "role": data["role"],
            },
        )
        # Same status and body whether the row was created or already existed,
        # so the response never confirms membership to a prober.
        return Response({"email": data["email"]}, status=status.HTTP_201_CREATED)
