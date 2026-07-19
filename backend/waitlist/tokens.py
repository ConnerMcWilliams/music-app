"""
Signed unsubscribe tokens for waitlist newsletter emails.

Stateless by design: the token is the signup's primary key signed with
SECRET_KEY, so there is no token column or extra migration. The trade-off is
that rotating SECRET_KEY invalidates every link already sent — acceptable for
a small personal mailing list.
"""
from __future__ import annotations

from django.core import signing

# Salt scopes these tokens so a signed value from another feature can never be
# replayed as an unsubscribe token (and vice versa).
_SALT = "waitlist.unsubscribe"


def make_unsubscribe_token(signup) -> str:
    return signing.dumps(signup.pk, salt=_SALT)


def read_unsubscribe_token(token: str) -> int | None:
    # No max_age: an unsubscribe link at the bottom of an old email must keep
    # working for as long as the address is on the list.
    try:
        return signing.loads(token, salt=_SALT)
    except signing.BadSignature:
        return None
