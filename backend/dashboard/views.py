"""
Owner-only dashboard API views.

Everything here is gated with ``IsAdminUser`` (``is_staff``) — the first admin
surface in the API. The DRF default permission is only ``IsAuthenticated``, so
every view in this app must set ``permission_classes`` explicitly. No throttle
scopes: this is authenticated staff traffic, not the anonymous public.
"""
from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count
from django.db.models.functions import Lower, TruncDate
from django.utils import timezone
from rest_framework import generics
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.views import APIView

from analytics.models import PageVisit
from waitlist.models import WaitlistSignup

from .emails import send_newsletter
from .models import Newsletter
from .serializers import NewsletterSerializer, WaitlistEntrySerializer

# Bounds for the signups-by-day window (?days=N).
DEFAULT_WINDOW_DAYS = 90
MAX_WINDOW_DAYS = 365


def _ratio(numerator: int, denominator: int) -> float:
    """Safe division for conversion rates, clamped to 1.0 (visitors can be
    undercounted vs signups); a zero denominator reads as 0.0."""
    return round(min(numerator / denominator, 1.0), 4) if denominator else 0.0


class AnalyticsView(APIView):
    """GET /api/dashboard/analytics/ — one-shot summary for the dashboard.

    Counts registered accounts and waitlist signups, with breakdowns over the
    free-text signup fields. Values are case-folded (``Lower``) so "Teacher"
    and "teacher" merge; blank stays ``""`` for the client to label.
    """

    permission_classes = [IsAdminUser]

    def get(self, request):
        try:
            days = int(request.query_params.get("days", DEFAULT_WINDOW_DAYS))
        except ValueError:
            days = DEFAULT_WINDOW_DAYS
        days = max(1, min(days, MAX_WINDOW_DAYS))
        since = timezone.now() - timedelta(days=days)

        signups = WaitlistSignup.objects.all()

        def breakdown(field: str) -> list[dict]:
            return list(
                signups.annotate(value=Lower(field))
                .values("value")
                .annotate(count=Count("id"))
                .order_by("-count", "value")
            )

        window_signups = signups.filter(created_at__gte=since)
        by_day = (
            window_signups.annotate(date=TruncDate("created_at"))
            .values("date")
            .annotate(count=Count("id"))
            .order_by("date")
        )

        return Response(
            {
                "members": {"total": get_user_model().objects.count()},
                "waitlist": {
                    "total": signups.count(),
                    "subscribed": signups.filter(subscribed=True).count(),
                    "by_role": breakdown("role"),
                    "by_instrument": breakdown("instrument"),
                    "by_skill": breakdown("skill"),
                    "signups_by_day": [
                        {"date": row["date"].isoformat(), "count": row["count"]}
                        for row in by_day
                    ],
                },
                "conversion": self._conversion(since, days, window_signups),
            }
        )

    def _conversion(self, since, days: int, window_signups) -> dict:
        """Visitors vs signups over the window, plus a per-channel breakdown.

        Unique visitors (the conversion denominator) are *distinct*
        ``visitor_id`` values — repeat visits by one anonymous browser count
        once. The rate is a plain ratio; the dashboard formats the percentage.
        """
        window_visits = PageVisit.objects.filter(created_at__gte=since)

        unique_visitors = window_visits.values("visitor_id").distinct().count()
        pageviews = window_visits.count()
        signup_count = window_signups.count()

        visitors_by_day = (
            window_visits.annotate(date=TruncDate("created_at"))
            .values("date")
            .annotate(count=Count("visitor_id", distinct=True))
            .order_by("date")
        )

        # Per-channel: unique visitors and signups keyed on the same normalized
        # source, so each row's rate is that channel's conversion. Blank sources
        # (pre-tracking rows) fold into "direct" to match a no-referrer visit.
        visitors_by_source: dict[str, int] = {}
        for row in window_visits.values("source").annotate(
            visitors=Count("visitor_id", distinct=True)
        ):
            visitors_by_source[row["source"] or "direct"] = (
                visitors_by_source.get(row["source"] or "direct", 0) + row["visitors"]
            )

        signups_by_source: dict[str, int] = {}
        for row in window_signups.values("source").annotate(count=Count("id")):
            signups_by_source[row["source"] or "direct"] = (
                signups_by_source.get(row["source"] or "direct", 0) + row["count"]
            )

        by_source = [
            {
                "source": name,
                "visitors": visitors_by_source.get(name, 0),
                "signups": signups_by_source.get(name, 0),
                "rate": _ratio(signups_by_source.get(name, 0), visitors_by_source.get(name, 0)),
            }
            for name in set(visitors_by_source) | set(signups_by_source)
        ]
        by_source.sort(key=lambda r: (-r["visitors"], -r["signups"], r["source"]))

        return {
            "window_days": days,
            "unique_visitors": unique_visitors,
            "pageviews": pageviews,
            "signups": signup_count,
            "rate": _ratio(signup_count, unique_visitors),
            "visitors_by_day": [
                {"date": row["date"].isoformat(), "count": row["count"]}
                for row in visitors_by_day
            ],
            "by_source": by_source,
        }


class WaitlistBrowseView(generics.ListAPIView):
    """GET /api/dashboard/waitlist/ — paginated, filterable signup browser.

    Filters: ``role``/``instrument``/``skill`` (icontains over the free-text
    fields), ``q`` (email icontains), ``subscribed`` (true/false).
    """

    permission_classes = [IsAdminUser]
    serializer_class = WaitlistEntrySerializer

    def get_queryset(self):
        qs = WaitlistSignup.objects.all()  # Meta orders newest-first
        params = self.request.query_params
        for field in ("role", "instrument", "skill"):
            value = params.get(field, "").strip()
            if value:
                qs = qs.filter(**{f"{field}__icontains": value})
        q = params.get("q", "").strip()
        if q:
            qs = qs.filter(email__icontains=q)
        subscribed = params.get("subscribed")
        if subscribed in ("true", "false"):
            qs = qs.filter(subscribed=(subscribed == "true"))
        return qs


class NewsletterListCreateView(generics.ListCreateAPIView):
    """GET|POST /api/dashboard/newsletters/ — send history and compose-and-send.

    POST persists the row first (a mail outage never loses the composed text —
    the contact-app policy), then sends synchronously and records the outcome
    on the same row.
    """

    permission_classes = [IsAdminUser]
    queryset = Newsletter.objects.all()
    serializer_class = NewsletterSerializer

    def perform_create(self, serializer):
        newsletter = serializer.save()
        sent, failed = send_newsletter(newsletter)
        newsletter.sent_at = timezone.now()
        newsletter.recipient_count = sent
        newsletter.failed_count = failed
        newsletter.save(update_fields=["sent_at", "recipient_count", "failed_count"])
