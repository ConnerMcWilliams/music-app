"""
Page-visit tracking API view.

Public and anonymous like the waitlist/contact endpoints, and rate-limited per
client IP via its own throttle scope. Obvious bots are dropped without storing a
row so the visitor count stays human; the response is always ``204`` so it
reveals nothing and stays cheap for the fire-and-forget beacon on the site.
"""
from __future__ import annotations

import re

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from config.attribution import derive_source, referrer_host

from .models import PageVisit
from .serializers import PageVisitSerializer

# Coarse bot filter. A JS beacon already excludes most crawlers (they don't run
# scripts), so this only needs to catch the headless / library clients that do.
_BOT_RE = re.compile(
    r"bot|crawl|spider|slurp|bingpreview|headless|phantom|puppeteer|playwright|"
    r"python-requests|httpx|aiohttp|okhttp|curl|wget|scrapy|facebookexternalhit|"
    r"embedly|preview|lighthouse|gtmetrix|pingdom|uptime|monitor",
    re.IGNORECASE,
)


class VisitTrackView(APIView):
    """POST /api/site/visit/ — record an anonymous marketing-site page view."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "analytics"

    def post(self, request):
        serializer = PageVisitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Drop obvious (and user-agent-less) bots silently — same 204 as a
        # stored hit, so the beacon never behaves differently and the visitor
        # count stays a human denominator.
        user_agent = request.META.get("HTTP_USER_AGENT", "")
        if not user_agent or _BOT_RE.search(user_agent):
            return Response(status=status.HTTP_204_NO_CONTENT)

        PageVisit.objects.create(
            visitor_id=data["visitor_id"],
            path=data["path"],
            referrer_host=referrer_host(data["referrer"]),
            source=derive_source(
                referrer_url=data["referrer"], utm_source=data["utm_source"]
            ),
            utm_source=data["utm_source"],
            utm_medium=data["utm_medium"],
            utm_campaign=data["utm_campaign"],
        )
        return Response(status=status.HTTP_204_NO_CONTENT)
