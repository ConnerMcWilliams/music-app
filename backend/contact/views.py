"""
Contact-form API view.

Public and anonymous (the marketing site has no auth), so it is rate-limited
per client IP via a dedicated throttle scope. Each submission is persisted and a
notification email is sent to the site owner. Email delivery is best-effort:
the message is saved first, so a mail outage never loses it or fails the request.
"""
from __future__ import annotations

import logging

from django.conf import settings
from django.core.mail import EmailMessage
from rest_framework import status
from rest_framework.parsers import JSONParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import ContactMessage
from .serializers import ContactMessageSerializer

logger = logging.getLogger(__name__)


class ContactMessageView(APIView):
    """POST /api/contact/ — send a message from the marketing site."""

    permission_classes = [AllowAny]
    # The marketing form always sends JSON; reject anything else with a 415.
    parser_classes = [JSONParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "contact"

    def post(self, request):
        serializer = ContactMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if data.get("company", "").strip():
            # Honeypot tripped — a bot filled the hidden field. Answer like a
            # real success so the bot learns nothing, but persist and email
            # nothing.
            logger.info("Contact honeypot triggered; dropping submission")
            return Response(
                {"name": data["name"], "email": data["email"]},
                status=status.HTTP_201_CREATED,
            )
        ContactMessage.objects.create(
            name=data["name"],
            email=data["email"],
            message=data["message"],
        )
        self._notify(data)
        return Response(
            {"name": data["name"], "email": data["email"]},
            status=status.HTTP_201_CREATED,
        )

    def _notify(self, data: dict) -> None:
        # Best-effort: the message is already persisted, so a mail failure must
        # not 500 the visitor. Log and move on. When CONTACT_NOTIFICATION_EMAIL
        # is unset there is nowhere to send, so skip silently.
        recipient = settings.CONTACT_NOTIFICATION_EMAIL
        if not recipient:
            return
        subject = f"New contact message from {data['name']}"
        body = (
            f"Name: {data['name']}\n"
            f"Email: {data['email']}\n\n"
            f"{data['message']}\n"
        )
        try:
            # reply_to is the submitter, so replying from the inbox reaches them
            # directly (the From address is a no-reply sender).
            delivered = EmailMessage(
                subject,
                body,
                settings.DEFAULT_FROM_EMAIL,
                [recipient],
                reply_to=[data["email"]],
            ).send()
        except Exception:
            logger.exception("Failed to send contact notification email")
            return
        # send() returns the number of messages delivered. A 0 means the backend
        # accepted nothing without raising (e.g. fail_silently swallowed an error
        # upstream) — the owner never got the mail, so log it rather than let the
        # failure pass unnoticed.
        if not delivered:
            logger.error(
                "Contact notification email was not delivered (send() returned 0)"
            )
