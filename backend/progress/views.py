from rest_framework.generics import RetrieveAPIView
from rest_framework.permissions import IsAuthenticated

from .models import Profile
from .serializers import ProfileSerializer


class CurrentProfileView(RetrieveAPIView):
    """GET /api/profile/ — the authenticated user's streak and stats.

    The user comes from the validated access token (``request.user``); the
    profile is created on first access if it does not exist yet.
    """

    serializer_class = ProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self) -> Profile:
        return Profile.for_user(self.request.user)
