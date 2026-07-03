"""
Data model for storing Clarke (and later, other) studies.

A *study* is split into two records:

* ``Study`` — the catalog metadata a client needs to list and describe a study
  (number, title, key, tempo, range, difficulty category). This mirrors the
  ``Exercise`` shape the mobile app already renders from mock data.
* ``StudyContent`` — the study's actual notation (canonical MusicXML plus
  rendered display assets). This is the single source of truth that will later
  both render sheet music *and* be compiled into a grading reference.

Per-user state (completed / in-progress / last score) is intentionally NOT
stored here — that depends on submissions and progress, which are separate,
later concerns. This module is only about storing the studies themselves.

The grading reference (the expected note events a recording is scored against)
is derived from ``StudyContent.musicxml`` during ingestion and will be added as
its own model in the ingestion/scraping change.
"""
from __future__ import annotations

from django.db import models


class Study(models.Model):
    """A single practice study (e.g. Clarke Technical Studies, Second Study)."""

    class Category(models.TextChoices):
        FOUNDATIONAL = "foundational", "Foundational"
        ARTICULATION = "articulation", "Articulation"
        FLEXIBILITY = "flexibility", "Flexibility"

    # Stable public identifier used by clients and in URLs, e.g. "clarke-2-5"
    # (Second Study, exercise 5).
    slug = models.SlugField(max_length=64, unique=True)

    # The grouping this exercise belongs to: the Clarke "Study" number, e.g. 2
    # for the Second Study. Filterable so a client can pull every exercise in a
    # given study ("all of the second studies").
    section = models.PositiveIntegerField(db_index=True, default=0)
    # Display label for the section, e.g. "Second Study".
    section_label = models.CharField(max_length=80, blank=True)

    # Position of this exercise within its section, e.g. 5 for the 5th exercise
    # of the Second Study.
    number = models.PositiveIntegerField()

    title = models.CharField(max_length=200)
    subtitle = models.CharField(max_length=200, blank=True)

    # Human-readable musical metadata (display-oriented strings).
    key_signature = models.CharField("key", max_length=40, blank=True)
    tempo = models.CharField(max_length=40, blank=True)
    range_label = models.CharField(max_length=40, blank=True)

    category = models.CharField(
        max_length=20,
        choices=Category.choices,
        default=Category.FOUNDATIONAL,
    )

    est_minutes = models.PositiveIntegerField(default=0)

    # Instrument the study is written for. Trumpet to start; kept explicit so
    # other brass can be added later without a schema change.
    instrument = models.CharField(max_length=40, default="trumpet")

    # Provenance / grouping, e.g. "Clarke — Technical Studies for the Cornet".
    source = models.CharField(max_length=200, default="Clarke — Technical Studies")

    # Explicit catalog ordering, independent of `number` so studies from
    # multiple sources can be interleaved later.
    order = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["section", "order", "number"]
        verbose_name_plural = "studies"
        indexes = [
            models.Index(fields=["section", "number"], name="studies_section_number_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.title} ({self.slug})"


class StudyContent(models.Model):
    """The notation for a study: canonical MusicXML plus display assets."""

    class NotationFormat(models.TextChoices):
        MUSICXML = "musicxml", "MusicXML"

    study = models.OneToOneField(
        Study,
        on_delete=models.CASCADE,
        related_name="content",
    )

    # Canonical, machine-readable notation. Populated during ingestion; blank
    # until a study has been transcribed.
    notation_format = models.CharField(
        max_length=20,
        choices=NotationFormat.choices,
        default=NotationFormat.MUSICXML,
    )
    musicxml = models.TextField(blank=True)

    # Path/URL to a rendered sheet-music asset (PDF/SVG) for quick display.
    # Object storage comes later; for now this is just a reference string.
    display_asset = models.CharField(max_length=500, blank=True)

    # Path/URL to an optional MIDI rendering used for playback demonstration.
    midi_asset = models.CharField(max_length=500, blank=True)

    # Written-to-concert transposition of the instrument, in semitones. B♭
    # trumpet sounds a major second (2 semitones) below the written pitch, so
    # grading must shift expected pitches by this amount to match what the
    # microphone actually hears. Stored here because it describes the notation.
    transposition_semitones = models.SmallIntegerField(default=-2)

    # Where the notation came from (e.g. the IMSLP page), for provenance.
    source_url = models.URLField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "study content"

    def __str__(self) -> str:
        return f"Content for {self.study.slug}"

    @property
    def has_notation(self) -> bool:
        return bool(self.musicxml)
