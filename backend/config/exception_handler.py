"""
Custom DRF exception handler.

Two jobs beyond DRF's default handler:

1. **Unexpected exceptions** that DRF does not turn into a handled 4xx would
   otherwise bubble up to a Django 500. We catch them here, log them with a
   short reference id, and answer with a generic body that carries only that
   reference — never a stack trace, an exception message, or any request data.
   The same reference is written to the server log, so an operator can trace a
   failure without anything sensitive being exposed publicly.

2. **Auth failures (401/403) on the admin API surface** are logged as warnings
   so repeated unauthorized-access attempts are visible. Only the method, path,
   and status are recorded — never tokens, headers, or bodies.
"""
from __future__ import annotations

import logging
import uuid

from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger("config.errors")

# Admin API surfaces whose auth failures are worth logging. ``str.startswith``
# accepts a tuple, so this is matched directly against the request path.
_ADMIN_PREFIXES = ("/api/dashboard/", "/api/updates/manage/", "/api/features/")


def _request_line(request) -> str:
    """A log-safe one-liner for a request: method + path only, no query/body."""
    if request is None:
        return "-"
    return f"{request.method} {request.path}"


def exception_handler(exc, context):
    """Wrap DRF's handler to add safe 500 responses and admin-denial logging."""
    response = drf_exception_handler(exc, context)
    request = context.get("request") if context else None

    if response is not None:
        # A handled error (validation, throttle, auth, 404, …). DRF's body is
        # already safe. Just note admin auth failures for the audit trail.
        if response.status_code in (401, 403) and request is not None:
            if request.path.startswith(_ADMIN_PREFIXES):
                logger.warning(
                    "Admin access denied (%s) for %s",
                    response.status_code,
                    _request_line(request),
                )
        return response

    # response is None → an unexpected exception DRF did not translate. Do not
    # let it reach the client: log it with a reference and return a generic 500
    # that leaks nothing (no message, no traceback, no internals).
    reference = uuid.uuid4().hex[:12]
    logger.exception(
        "Unhandled server error [ref=%s] on %s", reference, _request_line(request)
    )
    return Response(
        {"detail": "A server error occurred.", "reference": reference},
        status=500,
    )
