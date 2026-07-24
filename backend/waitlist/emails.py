"""
Welcome email for new waitlist signups.

Sent once, the first time an address joins the waitlist. A re-signup maps to the
existing row via ``get_or_create`` and is deliberately not re-emailed (see
waitlist/views.py). Best-effort like the newsletter (dashboard/emails.py): the
signup is already persisted, so a mail outage must never fail the request. Per
docs/security.md, logs identify the signup by primary key, never by email.

Joining the waitlist opts the address into product updates, so this welcome is
the first message on that list and — like the newsletter — carries a
personalized one-click unsubscribe link.
"""
from __future__ import annotations

import logging

from django.conf import settings
from django.core.mail import EmailMessage

from .tokens import make_unsubscribe_token

logger = logging.getLogger(__name__)

SUBJECT = "You're on the Clarke Coach waitlist"

_BODY = """\
Hi there,

Thanks for joining the Clarke Coach waitlist — you're on the list.

Clarke Coach turns Herbert L. Clarke's Technical Studies into daily, gradable
practice: play a study, get instant feedback on your accuracy, and build a
streak. We're putting the finishing touches on it now.

We'll email you the moment it's ready to play. Have a question or a request in
the meantime? Just reply to this email.

Talk soon,
The Clarke Coach team

—
You're receiving this because you joined the Clarke Coach waitlist.
Unsubscribe: {unsubscribe_url}
"""


def send_waitlist_welcome_email(signup) -> None:
    """Email ``signup`` a one-time waitlist welcome. Never raises.

    Failures are swallowed and logged (by signup pk, never email) so a mail
    outage can't fail the signup request.
    """
    unsubscribe_url = (
        f"{settings.BACKEND_BASE_URL}/api/waitlist/unsubscribe/"
        f"?token={make_unsubscribe_token(signup)}"
    )
    body = _BODY.format(unsubscribe_url=unsubscribe_url)
    # reply_to points at the owner's inbox (when configured) so "reply to this
    # email" reaches a human; the From address is a no-reply sender.
    reply_to = (
        [settings.CONTACT_NOTIFICATION_EMAIL]
        if settings.CONTACT_NOTIFICATION_EMAIL
        else None
    )
    try:
        delivered = EmailMessage(
            SUBJECT,
            body,
            settings.DEFAULT_FROM_EMAIL,
            [signup.email],
            reply_to=reply_to,
        ).send()
    except Exception:
        logger.exception("Failed to send waitlist welcome to signup %s", signup.pk)
        return
    # A 0 from send() means the backend accepted nothing without raising; log it
    # so a silent non-delivery is visible (mirrors dashboard/emails.py).
    if not delivered:
        logger.error(
            "Waitlist welcome was not delivered to signup %s (send() returned 0)",
            signup.pk,
        )
