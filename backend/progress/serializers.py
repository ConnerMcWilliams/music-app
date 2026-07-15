from rest_framework import serializers

from . import rewards
from .models import Profile


class StudyBestScoreSerializer(serializers.Serializer):
    """One catalog study the user has at least one analyzed grade for.

    ``passed`` is computed server-side against ``grading.models.PASSING_SCORE``
    so the threshold stays a single source of truth; ``best_score`` is the max
    analyzed take. Rows are plain dicts built by ``StudyScoresView``.
    """

    slug = serializers.CharField()
    best_score = serializers.IntegerField()
    passed = serializers.BooleanField()


class ProfileSerializer(serializers.ModelSerializer):
    """Streak, aggregate stats, and reward economy for the current user.

    Identity (name, initials, join date) is NOT included here — the client
    derives it from the authenticated account (``GET /api/auth/me/``). Field
    names map onto the mobile app's profile view: ``day_streak``,
    ``personal_best`` (longest streak), ``studies_done``, ``avg_score``, plus the
    XP/level/coin fields the level card renders.

    Level and rank are derived from ``xp_total`` (not stored) so there is one
    source of truth; ``freeze_cost``/``max_freezes`` are echoed so the client can
    price the "buy streak freeze" action without hardcoding the numbers.
    """

    personal_best = serializers.IntegerField(source="longest_streak", read_only=True)
    studies_done = serializers.IntegerField(source="studies_completed", read_only=True)

    xp = serializers.IntegerField(source="xp_total", read_only=True)
    level = serializers.SerializerMethodField()
    rank_title = serializers.SerializerMethodField()
    xp_into_level = serializers.SerializerMethodField()
    xp_for_next_level = serializers.SerializerMethodField()
    freeze_cost = serializers.SerializerMethodField()
    max_freezes = serializers.SerializerMethodField()

    class Meta:
        model = Profile
        fields = [
            "day_streak",
            "personal_best",
            "studies_done",
            "avg_score",
            "xp",
            "level",
            "rank_title",
            "xp_into_level",
            "xp_for_next_level",
            "coins",
            "streak_freezes",
            "freeze_cost",
            "max_freezes",
        ]
        read_only_fields = fields

    def _progress(self, obj: Profile) -> rewards.LevelProgress:
        return rewards.level_for_xp(obj.xp_total)

    def get_level(self, obj: Profile) -> int:
        return self._progress(obj).level

    def get_rank_title(self, obj: Profile) -> str:
        return rewards.rank_title(self._progress(obj).level)

    def get_xp_into_level(self, obj: Profile) -> int:
        return self._progress(obj).xp_into_level

    def get_xp_for_next_level(self, obj: Profile) -> int:
        return self._progress(obj).xp_for_next_level

    def get_freeze_cost(self, obj: Profile) -> int:
        return rewards.FREEZE_COST

    def get_max_freezes(self, obj: Profile) -> int:
        return rewards.MAX_FREEZES
