"""
Waitlist API view.

Public and anonymous (the marketing site has no auth), so it is rate-limited
per client IP via a dedicated throttle scope. Per docs/security.md, the endpoint
is deliberately separate from the account endpoints and grants nothing.
"""
from __future__ import annotations

import logging

from django.http import HttpResponse
from rest_framework import status
from rest_framework.parsers import JSONParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from config.attribution import derive_source

from .emails import send_waitlist_welcome_email
from .models import WaitlistSignup
from .serializers import WaitlistSignupSerializer
from .tokens import read_unsubscribe_token

logger = logging.getLogger(__name__)


class WaitlistSignupView(APIView):
    """POST /api/waitlist/ — join the waitlist from the marketing site."""

    permission_classes = [AllowAny]
    # The marketing form always sends JSON; reject anything else with a 415
    # rather than parsing unexpected form/multipart bodies.
    parser_classes = [JSONParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "waitlist"

    def post(self, request):
        serializer = WaitlistSignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if data.get("company", "").strip():
            # Honeypot tripped — a bot filled the hidden field. Answer exactly
            # like a real success so the bot learns nothing, but persist nothing.
            logger.info("Waitlist honeypot triggered; dropping submission")
            return Response(
                {"email": data["email"]}, status=status.HTTP_201_CREATED
            )
        # Race-safe idempotency: get_or_create keyed on the unique email column.
        # Existing rows are left untouched — anyone can post any address, so
        # first-write-wins keeps a stranger from overwriting someone's details.
        signup, created = WaitlistSignup.objects.get_or_create(
            email=data["email"],
            defaults={
                "instrument": data["instrument"],
                "skill": data["skill"],
                "role": data["role"],
                # First-touch attribution, derived once on create so a re-signup
                # keeps the original channel that brought the person in.
                "source": derive_source(
                    referrer_url=data["referrer"], utm_source=data["utm_source"]
                ),
                "utm_source": data["utm_source"],
                "utm_medium": data["utm_medium"],
                "utm_campaign": data["utm_campaign"],
            },
        )
        # Welcome only a brand-new signup; a re-signup maps to the existing row
        # (created is False) and must not be re-emailed. Best-effort and inline:
        # the row is already committed, so a mail failure can't change the reply.
        if created:
            send_waitlist_welcome_email(signup)
        # Same status and body whether the row was created or already existed,
        # so the response never confirms membership to a prober.
        return Response({"email": data["email"]}, status=status.HTTP_201_CREATED)


def _unsubscribe_page(message: str, status_code: int) -> HttpResponse:
    # The link lands in a browser from an email client, so answer with a tiny
    # human-readable page rather than JSON.
    html = (
        "<!doctype html><html><head><meta charset='utf-8'>"
        "<title>Clarke Coach</title></head>"
        f"<body style='font-family: sans-serif; margin: 3rem;'><p>{message}</p>"
        "</body></html>"
    )
    return HttpResponse(html, status=status_code)


class UnsubscribeView(APIView):
    """GET /api/waitlist/unsubscribe/?token=... — one-click newsletter opt-out.

    One-click GET means mail scanners that prefetch links can unsubscribe
    someone silently; accepted at this list's scale (the fix, if it ever
    matters, is a confirm-button page).
    """

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "unsubscribe"

    def get(self, request):
        pk = read_unsubscribe_token(request.query_params.get("token", ""))
        if pk is None:
            return _unsubscribe_page(
                "This unsubscribe link is invalid.", status.HTTP_400_BAD_REQUEST
            )
        # Idempotent: repeat clicks (or an already-deleted row) still land on
        # the confirmation, and never reveal whether the address is on the list.
        WaitlistSignup.objects.filter(pk=pk).update(subscribed=False)
        return _unsubscribe_page(
            "You've been unsubscribed. You won't receive further updates.",
            status.HTTP_200_OK,
        )
