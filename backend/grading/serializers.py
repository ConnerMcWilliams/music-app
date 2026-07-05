from __future__ import annotations

from rest_framework import serializers

# Reject absurdly large uploads early (a few minutes of compressed audio is well
# under this). Protects the server from memory-heavy decodes.
MAX_AUDIO_BYTES = 30 * 1024 * 1024  # 30 MB


class SubmissionCreateSerializer(serializers.Serializer):
    """Input for POST /api/submissions/ — a recorded (or uploaded) take.

    ``exercise_id`` is the mobile app's exercise id (e.g. "clarke-2"). It may be
    a section-level id rather than a ``Study.slug``, so it isn't validated
    against the catalog here — the view resolves it best-effort for the grading
    reference.
    """

    audio = serializers.FileField()
    exercise_id = serializers.CharField(required=False, allow_blank=True, default="", max_length=64)
    exercise_title = serializers.CharField(
        required=False, allow_blank=True, default="", max_length=200
    )
    duration_seconds = serializers.FloatField(required=False, min_value=0, default=0)

    def validate_audio(self, uploaded):
        if uploaded.size == 0:
            raise serializers.ValidationError("The uploaded audio file is empty.")
        if uploaded.size > MAX_AUDIO_BYTES:
            raise serializers.ValidationError("Audio file is too large (max 30 MB).")
        return uploaded
