import uuid

from rest_framework import generics, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Study
from .serializers import (
    StudyDetailSerializer,
    StudySerializer,
    SubmissionCreateSerializer,
)


class StudyListView(generics.ListAPIView):
    """GET /api/studies/ — list studies (catalog metadata).

    Optional filters:
      ?section=2            all exercises in the Second Study
      ?section_label=Second Study
    """

    serializer_class = StudySerializer

    def get_queryset(self):
        qs = Study.objects.all()
        section = self.request.query_params.get("section")
        if section is not None and section.isdigit():
            qs = qs.filter(section=int(section))
        section_label = self.request.query_params.get("section_label")
        if section_label:
            qs = qs.filter(section_label__iexact=section_label)
        return qs


class StudyDetailView(generics.RetrieveAPIView):
    """GET /api/studies/<slug>/ — one study, including its notation content."""

    queryset = Study.objects.select_related("content")
    serializer_class = StudyDetailSerializer
    lookup_field = "slug"


# Canned grade returned for every take until the real engine lands
# (see docs/grading-rubric.md for the target rubric).
PLACEHOLDER_GRADE = {
    "total_score": 88,
    "grade_label": "A−",
    "categories": [
        {"label": "Intonation", "score": 92},
        {"label": "Tone Quality", "score": 90},
        {"label": "Rhythm", "score": 85},
        {"label": "Tempo Accuracy", "score": 84},
    ],
    "feedback_author": "Prof. Halvorsen",
    "feedback_initials": "PH",
    "feedback_text": (
        "Lovely legato through the slurs. Watch the tempo drift in bar 3 — "
        "keep the air steady and the rhythm will lock in."
    ),
}


class SubmissionCreateView(APIView):
    """POST /api/submissions/ — submit a take (multipart audio) for grading.

    Placeholder implementation: the audio file is received, validated, and
    discarded, and PLACEHOLDER_GRADE is returned. No submission is stored.
    TODO(grading): persist the take and run the real grading engine.
    """

    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        serializer = SubmissionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        return Response(
            {
                "submission_id": f"sub-{uuid.uuid4().hex[:12]}",
                "exercise_id": data["exercise_id"],
                "exercise_title": data["exercise_title"] or "Clarke Study",
                **PLACEHOLDER_GRADE,
            },
            status=status.HTTP_201_CREATED,
        )
