from django.db import transaction
from django.db.models import F, Max
from rest_framework import status
from rest_framework.generics import RetrieveAPIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from grading.models import PASSING_SCORE, GradingResult

from . import rewards
from .models import Profile
from .serializers import ProfileSerializer, StudyBestScoreSerializer


class CurrentProfileView(RetrieveAPIView):
    """GET /api/profile/ — the authenticated user's streak, stats, and rewards.

    The user comes from the validated access token (``request.user``); the
    profile is created on first access if it does not exist yet.
    """

    serializer_class = ProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self) -> Profile:
        return Profile.for_user(self.request.user)


class StudyScoresView(APIView):
    """GET /api/profile/study-scores/ — the user's best score per catalog study.

    One row per study the user has an analyzed grade for, keyed by the resolved
    ``Submission.study`` slug (so legacy section-level exercise ids count toward
    the study they resolved to; takes that resolved to no study are excluded).
    ``passing_score`` is echoed so the client never hardcodes the threshold. The
    client walks its catalog order against these rows to pick the next study to
    surface — the result is bounded by the catalog (≤190 rows), so no pagination.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = (
            GradingResult.objects.filter(
                submission__user=request.user,
                submission__study__isnull=False,
                analyzed=True,
            )
            .values(slug=F("submission__study__slug"))
            .annotate(best_score=Max("total_score"))
            .order_by("slug")
        )
        studies = [
            {
                "slug": row["slug"],
                "best_score": row["best_score"],
                "passed": row["best_score"] >= PASSING_SCORE,
            }
            for row in rows
        ]
        return Response(
            {
                "passing_score": PASSING_SCORE,
                "studies": StudyBestScoreSerializer(studies, many=True).data,
            }
        )


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
