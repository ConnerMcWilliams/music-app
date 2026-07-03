from rest_framework import serializers

from .models import Study, StudyContent


class StudyContentSerializer(serializers.ModelSerializer):
    has_notation = serializers.BooleanField(read_only=True)

    class Meta:
        model = StudyContent
        fields = [
            "notation_format",
            "musicxml",
            "display_asset",
            "midi_asset",
            "transposition_semitones",
            "source_url",
            "has_notation",
        ]


class StudySerializer(serializers.ModelSerializer):
    """List representation — catalog metadata only.

    `slug` is exposed as `id` so it maps directly onto the mobile app's
    `Exercise.id` (e.g. "clarke-2").
    """

    id = serializers.SlugField(source="slug", read_only=True)
    key = serializers.CharField(source="key_signature", read_only=True)
    has_content = serializers.SerializerMethodField()

    class Meta:
        model = Study
        fields = [
            "id",
            "section",
            "section_label",
            "number",
            "title",
            "subtitle",
            "key",
            "tempo",
            "range_label",
            "category",
            "est_minutes",
            "instrument",
            "source",
            "order",
            "has_content",
        ]

    def get_has_content(self, obj: Study) -> bool:
        content = getattr(obj, "content", None)
        return bool(content and content.has_notation)


class StudyDetailSerializer(StudySerializer):
    """Detail representation — includes the study's notation content."""

    content = StudyContentSerializer(read_only=True)

    class Meta(StudySerializer.Meta):
        fields = [*StudySerializer.Meta.fields, "content"]
