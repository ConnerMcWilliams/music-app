from django.db import transaction
from rest_framework import status
from rest_framework.generics import RetrieveAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import rewards
from .models import Profile
from .serializers import ProfileSerializer


class CurrentProfileView(RetrieveAPIView):
    """GET /api/profile/ — the authenticated user's streak, stats, and rewards.

    The user comes from the validated access token (``request.user``); the
    profile is created on first access if it does not exist yet.
    """

    serializer_class = ProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self) -> Profile:
        return Profile.for_user(self.request.user)


class StreakFreezePurchaseView(APIView):
    """POST /api/profile/streak-freeze/ — spend coins to buy one streak freeze.

    A freeze bridges one missed practice day so the streak survives (consumed in
    ``Profile.record_practice``). Rejects the purchase when the player is at the
    hold cap or can't afford it. Returns the updated profile so the client can
    refresh its coin balance and freeze count in one round-trip.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        with transaction.atomic():
            profile = Profile.lock_for_user(request.user)
            if profile.streak_freezes >= rewards.MAX_FREEZES:
                return Response(
                    {"detail": "You already hold the maximum number of streak freezes."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if profile.coins < rewards.FREEZE_COST:
                return Response(
                    {"detail": "Not enough coins to buy a streak freeze."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            profile.coins -= rewards.FREEZE_COST
            profile.streak_freezes += 1
            profile.save(update_fields=["coins", "streak_freezes", "updated_at"])

        return Response(ProfileSerializer(profile).data, status=status.HTTP_200_OK)
