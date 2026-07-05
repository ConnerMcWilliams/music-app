from rest_framework import generics
from rest_framework.permissions import AllowAny

from .models import Study
from .serializers import StudyDetailSerializer, StudySerializer


class StudyListView(generics.ListAPIView):
    """GET /api/studies/ — list studies (catalog metadata).

    Optional filters:
      ?section=2            all exercises in the Second Study
      ?section_label=Second Study
    """

    # The study catalog is public (browsable before signing in).
    permission_classes = [AllowAny]
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

    permission_classes = [AllowAny]
    queryset = Study.objects.select_related("content")
    serializer_class = StudyDetailSerializer
    lookup_field = "slug"
