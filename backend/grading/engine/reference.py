"""
Expected-performance reference derived from a study's notation.

The grade is mostly *reference-free* in v1 (it judges the recording's intrinsic
qualities — see ``rubric.py``), because the mobile client sends a section-level
id (e.g. ``clarke-2``) that does not uniquely resolve to one transcribed
exercise. Where a study *does* resolve to MusicXML, though, we can cheaply read
how many notes it contains and how long it should take at its marked tempo, and
use that to make the **Completion** score real rather than a fixed guess.

This intentionally does not attempt note-level pitch/rhythm alignment yet — that
needs a reliable id→notation mapping and is future work noted in the rubric doc.
The parser is a small ``xml.etree`` reader (no dependency), matching the
dependency-free MusicXML approach used elsewhere in the repo.
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass

# A sensible fallback when a take can't be tied to notation: a typical Clarke
# pattern exercise runs on the order of 20 s. Completion is scored generously
# against this so a full, uncut take isn't penalised for lacking a reference.
DEFAULT_EXPECTED_SECONDS = 18.0


@dataclass(frozen=True)
class ExpectedPerformance:
    """What a complete take of a study should roughly look like."""

    note_count: int
    expected_seconds: float
    source: str  # "notation" | "default"


def expected_from_musicxml(musicxml: str, tempo_label: str = "") -> ExpectedPerformance:
    """Build an :class:`ExpectedPerformance` from a study's MusicXML.

    Falls back to :data:`DEFAULT_EXPECTED_SECONDS` if the notation is missing or
    unparseable, so callers never need to special-case failures.
    """
    if not musicxml or not musicxml.strip():
        return default_expected()

    try:
        root = ET.fromstring(musicxml)
    except ET.ParseError:
        return default_expected()

    total_quarters = 0.0
    note_count = 0
    divisions = 1  # ticks per quarter note; redefined by <attributes> as we go

    for element in root.iter():
        if element.tag == "divisions":
            divisions = _to_int(element.text, divisions) or 1
        elif element.tag == "note":
            # Grace notes carry no duration; chord notes share the previous
            # note's time slot, so they neither add duration nor a new onset.
            if element.find("grace") is not None or element.find("chord") is not None:
                continue
            duration = _to_int(element.findtext("duration"), 0)
            total_quarters += duration / divisions
            if element.find("rest") is None:
                note_count += 1

    if note_count == 0:
        return default_expected()

    bpm = _parse_bpm(musicxml, tempo_label)
    expected_seconds = total_quarters * 60.0 / bpm
    return ExpectedPerformance(
        note_count=note_count,
        expected_seconds=max(expected_seconds, 1.0),
        source="notation",
    )


def default_expected() -> ExpectedPerformance:
    return ExpectedPerformance(
        note_count=0, expected_seconds=DEFAULT_EXPECTED_SECONDS, source="default"
    )


def _parse_bpm(musicxml: str, tempo_label: str) -> float:
    """Beats per minute, from a MusicXML ``<sound tempo>`` or a tempo string."""
    match = re.search(r'tempo="([\d.]+)"', musicxml)
    if match:
        return _clamp_bpm(float(match.group(1)))
    # Tempo labels look like "♩ = 80" or "quarter = 144".
    match = re.search(r"(\d{2,3})", tempo_label)
    if match:
        return _clamp_bpm(float(match.group(1)))
    return 96.0  # neutral default when no tempo is marked


def _clamp_bpm(bpm: float) -> float:
    return min(max(bpm, 30.0), 300.0)


def _to_int(text: str | None, default: int) -> int:
    try:
        return int(str(text).strip())
    except (TypeError, ValueError):
        return default
