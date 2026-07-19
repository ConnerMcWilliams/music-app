"""
Newsletter delivery.

A plain function (not a view helper) so it can later be called from a
management command if the list outgrows in-request sending. Synchronous
sending is fine at the current scale; past a few hundred recipients the
request will crowd its timeout and Gmail-class SMTP daily caps (~500) start
to matter — at that point, invoke this from a management command instead.
"""
from __future__ import annotations

import logging

from django.conf import settings
from django.core.mail import EmailMessage, get_connection

from waitlist.models import WaitlistSignup
from waitlist.tokens import make_unsubscribe_token

logger = logging.getLogger(__name__)


def send_newsletter(newsletter) -> tuple[int, int]:
    """Send ``newsletter`` to every subscribed signup; return (sent, failed).

    One message per recipient — the unsubscribe link is personalized, and a
    shared ``To:`` would leak the list. All messages ride one SMTP connection.
    Failures follow the contact-app policy: log, count, keep going, so one bad
    address never blocks the rest of the list. EMAIL_TIMEOUT caps each hang.
    """
    sent = 0
    failed = 0
    with get_connection() as connection:
        for signup in WaitlistSignup.objects.filter(subscribed=True).iterator():
            token = make_unsubscribe_token(signup)
            body = (
                f"{newsletter.body}\n\n—\n"
                "You're receiving this because you joined the Clarke Coach "
                "waitlist.\n"
                f"Unsubscribe: {settings.BACKEND_BASE_URL}"
                f"/api/waitlist/unsubscribe/?token={token}"
            )
            try:
                EmailMessage(
                    newsletter.subject,
                    body,
                    settings.DEFAULT_FROM_EMAIL,
                    [signup.email],
                    connection=connection,
                ).send()
                sent += 1
            except Exception:
                logger.exception(
                    "Failed to send newsletter %s to %s", newsletter.pk, signup.email
                )
                failed += 1
    return sent, failed
