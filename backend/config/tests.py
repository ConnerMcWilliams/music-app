"""
Tests for the custom DRF exception handler (config/exception_handler.py).

These lock in the production-safety contract: an unexpected exception must never
reach the client as a stack trace or message, only as a generic body with a
traceable reference; and admin auth failures must be logged (but public ones
must not be logged as admin denials).
"""
from __future__ import annotations

from django.test import RequestFactory, TestCase
from rest_framework.exceptions import NotAuthenticated, PermissionDenied

from config.exception_handler import exception_handler


class ExceptionHandlerTests(TestCase):
    def setUp(self):
        self.factory = RequestFactory()

    def test_unhandled_exception_is_generic_and_leaks_nothing(self):
        request = self.factory.post("/api/waitlist/")
        response = exception_handler(
            RuntimeError("boom: secret db password at 10.0.0.1"),
            {"request": request},
        )
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.data["detail"], "A server error occurred.")
        self.assertTrue(response.data["reference"])
        # No exception text / internals leak into the client-visible payload.
        self.assertNotIn("secret db password", str(response.data))
        self.assertNotIn("10.0.0.1", str(response.data))

    def test_unhandled_exception_is_logged_with_the_same_reference(self):
        request = self.factory.get("/api/dashboard/analytics/")
        with self.assertLogs("config.errors", level="ERROR") as cm:
            response = exception_handler(RuntimeError("boom"), {"request": request})
        reference = response.data["reference"]
        self.assertTrue(any(reference in line for line in cm.output), cm.output)

    def test_admin_auth_failure_is_logged(self):
        request = self.factory.get("/api/dashboard/waitlist/")
        with self.assertLogs("config.errors", level="WARNING") as cm:
            response = exception_handler(PermissionDenied(), {"request": request})
        self.assertEqual(response.status_code, 403)
        self.assertTrue(
            any("Admin access denied" in line for line in cm.output), cm.output
        )

    def test_public_auth_failure_is_not_logged_as_admin(self):
        # A 401 on a non-admin path must not be recorded as an admin denial.
        request = self.factory.get("/api/waitlist/")
        with self.assertNoLogs("config.errors", level="WARNING"):
            exception_handler(NotAuthenticated(), {"request": request})
