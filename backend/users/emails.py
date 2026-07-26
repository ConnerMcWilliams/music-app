"""
Transactional welcome email for newly created accounts.

Sent once, when an account is first created — from the email/password register
endpoint and from a *first-time* Google sign-in (never on a later login). Both
callers defer this to ``transaction.on_commit`` (see users/views.py) so an
account that a rollback would erase is never emailed.

Best-effort like the rest of the project's outgoing mail (contact/views.py,
dashboard/emails.py): the account already exists, so a mail outage must never
fail the signup. Per docs/security.md, logs identify the user by primary key,
never by email address.
"""
from __future__ import annotations

import logging

from django.conf import settings
from django.core.mail import EmailMessage

logger = logging.getLogger(__name__)

SUBJECT = "Welcome to Clarke Coach"

_BODY = """\
Hi {name},

Welcome to Clarke Coach — your account is ready.

Clarke Coach turns Herbert L. Clarke's Technical Studies into daily, gradable
practice: play a study, get instant feedback on your accuracy, and build a
streak by coming back each day.

Here's how to start:
  1. Open the app and pick your first study.
  2. Record yourself playing it — you'll get a score in seconds.
  3. Come back tomorrow to keep your streak alive.

Questions or feedback? Just reply to this email.

Keep practicing,
The Clarke Coach team
"""


def send_account_welcome_email(user) -> None:
    """Email ``user`` a one-time welcome. Never raises.

    Failures are swallowed and logged (by user pk, never email) so a mail
    outage can't break account creation. Delivery uses whatever EMAIL_BACKEND
    is configured — the console backend in local dev, Resend (Anymail) in
    production.
    """
    name = (user.display_name or "").strip() or "there"
    body = _BODY.format(name=name)
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
            [user.email],
            reply_to=reply_to,
        ).send()
    except Exception:
        logger.exception("Failed to send welcome email to user %s", user.pk)
        return
    # send() returns the number of messages delivered. A 0 means the backend
    # accepted nothing without raising — log it so a silent non-delivery is
    # visible rather than passing unnoticed (mirrors contact/dashboard).
    if not delivered:
        logger.error(
            "Welcome email was not delivered to user %s (send() returned 0)",
            user.pk,
        )
