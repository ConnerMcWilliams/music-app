"""
Update-post API views.

The public list is anonymous (the marketing site has no auth) and therefore
throttled like the other public marketing endpoints. The manage endpoints are
the dashboard's CRUD surface, gated with ``IsAdminUser`` — the DRF default is
only ``IsAuthenticated``, so it is set explicitly here.
"""
from __future__ import annotations

from rest_framework import generics
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.throttling import ScopedRateThrottle

from config.mixins import NoStoreMixin

from .models import UpdatePost
from .serializers import UpdatePostSerializer


class PublicUpdateListView(generics.ListAPIView):
    """GET /api/updates/ — published posts, newest first, paginated."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "updates_public"
    serializer_class = UpdatePostSerializer
    queryset = UpdatePost.objects.filter(published=True)


class ManageUpdateListCreateView(NoStoreMixin, generics.ListCreateAPIView):
    """GET|POST /api/updates/manage/ — all posts including drafts."""

    permission_classes = [IsAdminUser]
    serializer_class = UpdatePostSerializer
    queryset = UpdatePost.objects.all()


class ManageUpdateDetailView(NoStoreMixin, generics.RetrieveUpdateDestroyAPIView):
    """GET|PATCH|DELETE /api/updates/manage/<pk>/ — edit one post."""

    permission_classes = [IsAdminUser]
    serializer_class = UpdatePostSerializer
    queryset = UpdatePost.objects.all()
