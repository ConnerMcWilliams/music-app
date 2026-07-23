"""Small reusable DRF view mixins."""
from __future__ import annotations


class NoStoreMixin:
    """Send ``Cache-Control: no-store`` on every response.

    Applied to endpoints that return subscriber or analytics data so the
    response is never cached by the browser or a shared/intermediary cache.
    Mix it in *before* the DRF view base so ``finalize_response`` runs.
    """

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "no-store"
        return response
