from rest_framework import serializers

from .models import Profile


class ProfileSerializer(serializers.ModelSerializer):
    """Streak + aggregate stats for the current user.

    Identity (name, initials, join date) is NOT included here — the client
    derives it from the authenticated account (``GET /api/auth/me/``). Field
    names map onto the mobile app's profile view: ``day_streak``,
    ``personal_best`` (longest streak), ``studies_done``, ``avg_score``.
    """

    personal_best = serializers.IntegerField(source="longest_streak", read_only=True)
    studies_done = serializers.IntegerField(source="studies_completed", read_only=True)

    class Meta:
        model = Profile
        fields = ["day_streak", "personal_best", "studies_done", "avg_score"]
        read_only_fields = fields
