"""
The *expected performance* of a study: which notes should sound, when, and at
what pitch.

This is the server-side twin of ``apps/mobile/src/lib/musicxml/timeline.ts``.
The two walk the same MusicXML under the same rules and **must agree
note-for-note**, because ``ExpectedNote.index`` is the join key that carries a
verdict from the grader here to a drawn glyph there. If the two orderings drift,
verdicts land on the wrong notes — silently, and looking entirely plausible.
``TimelineTests.test_matches_the_shared_parity_fixture`` pins the two walks
together against a shared four-note fixture (``PARITY_XML``), mirrored
byte-for-byte in ``apps/mobile/tests/results.noteOverlay.test.tsx``. That
fixture is the *whole* cross-language pin: the corpus-wide test alongside it
(``test_every_bundled_study_yields_an_ordered_timeline``) only checks that this
side's own indices come out ordered, so any rule the fixture doesn't exercise
has to be kept in step by hand.

Deliberately separate from ``reference.py``: that module answers "how long
should this take?" for the Completion score and is load-bearing for existing
grades, so it is left untouched.

Pure stdlib + the same dependency-free ``xml.etree`` approach used elsewhere.
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass

# Written-to-sounding transposition, in semitones. A B♭ trumpet sounds a major
# second *below* the written pitch, so a written C4 reaches the microphone as
# B♭3. Mirrors ``StudyContent.transposition_semitones``.
DEFAULT_TRANSPOSITION_SEMITONES = -2

# Semitones above the octave's C for each diatonic step.
_STEP_SEMITONES = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}

# Neutral tempo when a study marks none. Matches ``reference.py``.
_DEFAULT_BPM = 96.0


@dataclass(frozen=True)
class ExpectedNote:
    """One note the player is expected to sound."""

    # Ordinal among *sounding* notes — rests, grace notes and chord tones are
    # not counted. This is the wire join key shared with the client.
    index: int
    # Position among *all* ``<note>`` elements, including rests. This is what
    # addresses a drawn glyph (``ParsedNote.index`` on the client). It diverges
    # from ``index`` at the first rest, which 133 of the 169 bundled studies
    # contain — never use one where the other is meant.
    note_index: int
    # Expected **sounding** MIDI number: transposition already applied, so this
    # is directly comparable to a pitch detected from audio.
    midi: float
    # Onset in quarter notes from the start of the study.
    onset_beats: float
    # Notated length in quarter notes.
    duration_beats: float
    measure_index: int

    def onset_seconds(self, bpm: float) -> float:
        return self.onset_beats * 60.0 / bpm

    def duration_seconds(self, bpm: float) -> float:
        return self.duration_beats * 60.0 / bpm


@dataclass(frozen=True)
class ExpectedTimeline:
    """A study's expected notes plus the tempo they are placed at."""

    notes: list[ExpectedNote]
    bpm: float
    # Full notated length in quarter notes, including trailing rests.
    total_beats: float
    beats: int = 4
    beat_type: int = 4

    def __bool__(self) -> bool:
        return bool(self.notes)

    @property
    def onsets_seconds(self) -> list[float]:
        return [n.onset_seconds(self.bpm) for n in self.notes]


def midi_of_pitch(step: str, octave: int, alter: float = 0.0) -> float:
    """MIDI number for a **written** pitch (middle C = C4 = 60, A4 = 69)."""
    return (octave + 1) * 12 + _STEP_SEMITONES[step] + alter


def timeline_from_musicxml(
    musicxml: str,
    *,
    tempo_label: str = "",
    transposition_semitones: int = DEFAULT_TRANSPOSITION_SEMITONES,
) -> ExpectedTimeline | None:
    """Parse a study's notation into its expected-note timeline.

    Returns ``None`` when the notation is missing, unparseable, or contains no
    sounding notes — callers then fall back to reference-free scoring rather
    than grading against nothing.

    The walk, matching the TypeScript ``buildTimeline`` exactly:

    * **grace notes** carry no ``<duration>`` — skipped, time does not move;
    * **chord tones** share the previous note's slot — skipped, time does not move;
    * **rests** advance time but emit no note;
    * everything else emits a note and advances by ``duration / divisions``.

    Ties are merged **only when adjacent** (see :func:`_merge_tie`).
    """
    if not musicxml or not musicxml.strip():
        return None
    try:
        root = ET.fromstring(musicxml)
    except ET.ParseError:
        return None

    divisions = _first_divisions(root)
    transpose = transposition_semitones

    notes: list[ExpectedNote] = []
    cursor_beats = 0.0
    note_index = 0
    beats, beat_type = 4, 4
    saw_time = False
    # The previous time-consuming element and the note it emitted (None for a
    # rest), used to decide whether a tie is real.
    prev_tie_start = False
    prev_emitted: int | None = None  # index into `notes`

    for measure_index, measure in enumerate(root.iter("measure")):
        if not saw_time:
            time_el = measure.find(".//time")
            if time_el is not None:
                beats = _to_int(time_el.findtext("beats"), beats) or beats
                beat_type = _to_int(time_el.findtext("beat-type"), beat_type) or beat_type
                saw_time = True

        for note_el in measure.iter("note"):
            index_of_this_element = note_index
            note_index += 1

            is_grace = note_el.find("grace") is not None
            is_chord = note_el.find("chord") is not None
            if is_grace or is_chord:
                # Occupies no time of its own, and is not a gradeable note.
                continue

            duration_beats = _to_int(note_el.findtext("duration"), 0) / divisions
            pitch = _read_pitch(note_el)
            # The client treats a note it cannot pitch as a rest; match that, or
            # the two note orderings diverge on malformed input.
            is_rest = note_el.find("rest") is not None or pitch is None

            if is_rest:
                cursor_beats += duration_beats
                prev_tie_start = False
                prev_emitted = None
                continue

            step, octave, alter = pitch
            midi = midi_of_pitch(step, octave, alter) + transpose

            tie_types = _tie_types(note_el)
            if (
                "stop" in tie_types
                and prev_emitted is not None
                and prev_tie_start
                and notes[prev_emitted].midi == midi
            ):
                notes[prev_emitted] = _extend(notes[prev_emitted], duration_beats)
                cursor_beats += duration_beats
                prev_tie_start = "start" in tie_types
                continue

            notes.append(
                ExpectedNote(
                    index=len(notes),
                    note_index=index_of_this_element,
                    # Transposition is applied here and nowhere else on the server.
                    midi=midi,
                    onset_beats=cursor_beats,
                    duration_beats=duration_beats,
                    measure_index=measure_index,
                )
            )
            cursor_beats += duration_beats
            prev_emitted = len(notes) - 1
            prev_tie_start = "start" in tie_types

    if not notes:
        return None

    return ExpectedTimeline(
        notes=notes,
        bpm=parse_bpm(musicxml, tempo_label),
        total_beats=cursor_beats,
        beats=beats,
        beat_type=beat_type,
    )


def parse_bpm(musicxml: str, tempo_label: str = "") -> float:
    """Beats per minute from a ``<sound tempo>`` or a tempo string.

    Same precedence and clamping as ``reference.py`` so Completion and the
    note timeline never place a study at two different tempos.
    """
    match = re.search(r'tempo="([\d.]+)"', musicxml)
    if match:
        return _clamp_bpm(float(match.group(1)))
    match = re.search(r"(\d{2,3})", tempo_label)
    if match:
        return _clamp_bpm(float(match.group(1)))
    return _DEFAULT_BPM


# --- Corpus validation ------------------------------------------------------
#
# The bundled MusicXML is OMR output from a 1912 scan. A transcription error is
# worse than a missing feature: it marks a *correct* performance wrong, forever,
# with no way for the player to tell. `validate_notation` is the gate that keeps
# note-level grading off notation we don't trust.

# Widest written pitches the Clarke catalogue legitimately spans, E3–G6
# (see docs/architecture.md). Anything outside is a transcription error, not a
# hard study. Measured across the corpus: written F3 (53) to F♯6 (90), so this
# bound currently flags nothing and exists to catch regressions.
MIN_WRITTEN_MIDI = 52  # E3
MAX_WRITTEN_MIDI = 91  # G6


@dataclass(frozen=True)
class NotationIssue:
    kind: str
    detail: str


def validate_notation(musicxml: str) -> list[NotationIssue]:
    """Structural problems that make a study unsafe to grade note-by-note.

    Only faults that would corrupt an *alignment* are reported. In particular a
    short or long **final** measure is not an issue: every bundled study is
    written with repeats, and the last bar is routinely a partial ending or an
    OMR rendering of one. Interior measures are different — a wrong duration
    there shifts every following onset and mis-times the rest of the study.
    """
    issues: list[NotationIssue] = []
    if not musicxml or not musicxml.strip():
        return [NotationIssue("empty", "no notation")]
    try:
        root = ET.fromstring(musicxml)
    except ET.ParseError:
        return [NotationIssue("unparseable", "notation is not valid XML")]

    divisions = _first_divisions(root)
    if divisions <= 0:
        issues.append(NotationIssue("divisions", "non-positive <divisions>"))

    beats, beat_type = 4, 4
    saw_time = False
    measure_quarters: list[float] = []
    written: list[float] = []

    for measure in root.iter("measure"):
        if not saw_time:
            time_el = measure.find(".//time")
            if time_el is not None:
                beats = _to_int(time_el.findtext("beats"), beats) or beats
                beat_type = _to_int(time_el.findtext("beat-type"), beat_type) or beat_type
                saw_time = True
        total = 0
        for note_el in measure.iter("note"):
            if note_el.find("grace") is not None or note_el.find("chord") is not None:
                continue
            total += _to_int(note_el.findtext("duration"), 0)
            pitch = _read_pitch(note_el)
            if pitch is not None and note_el.find("rest") is None:
                written.append(midi_of_pitch(*pitch))
        measure_quarters.append(total / divisions)

    expected_quarters = beats * 4.0 / beat_type
    # Skip the first (pickup) and last (partial/repeat ending) measures.
    for i, quarters in enumerate(measure_quarters[1:-1], start=1):
        if abs(quarters - expected_quarters) > 1e-6:
            issues.append(
                NotationIssue(
                    "measure_duration",
                    f"measure {i} holds {quarters:g} quarters, expected "
                    f"{expected_quarters:g} ({beats}/{beat_type})",
                )
            )

    if written:
        if min(written) < MIN_WRITTEN_MIDI:
            issues.append(
                NotationIssue("pitch_range", f"written MIDI {min(written):g} below E3")
            )
        if max(written) > MAX_WRITTEN_MIDI:
            issues.append(
                NotationIssue("pitch_range", f"written MIDI {max(written):g} above G6")
            )
    return issues


# --- Internals --------------------------------------------------------------


def _extend(note: ExpectedNote, extra_beats: float) -> ExpectedNote:
    """A tied continuation lengthens the held note rather than adding one."""
    return ExpectedNote(
        index=note.index,
        note_index=note.note_index,
        midi=note.midi,
        onset_beats=note.onset_beats,
        duration_beats=note.duration_beats + extra_beats,
        measure_index=note.measure_index,
    )


def _first_divisions(root: ET.Element) -> int:
    """The first positive ``<divisions>``, defaulting to 1.

    First-only, matching the client parser. (Every bundled study declares one
    value, 10080, so this is unambiguous in practice.)
    """
    for element in root.iter("divisions"):
        value = _to_int(element.text, 0)
        if value > 0:
            return value
    return 1


def _read_pitch(note_el: ET.Element) -> tuple[str, int, float] | None:
    pitch_el = note_el.find("pitch")
    if pitch_el is None:
        return None
    step = (pitch_el.findtext("step") or "").strip().upper()
    if step not in _STEP_SEMITONES:
        return None
    octave = _to_int(pitch_el.findtext("octave"), -1)
    if octave < 0:
        return None
    try:
        alter = float((pitch_el.findtext("alter") or "0").strip())
    except ValueError:
        alter = 0.0
    return step, octave, alter


def _tie_types(note_el: ET.Element) -> set[str]:
    """Tie start/stop markers, from both ``<tie>`` and ``<notations><tied>``."""
    types: set[str] = set()
    for tag in ("tie", "tied"):
        for element in note_el.iter(tag):
            value = (element.get("type") or "").strip().lower()
            if value:
                types.add(value)
    return types


def _to_int(text: str | None, default: int) -> int:
    try:
        return int(str(text).strip())
    except (TypeError, ValueError):
        return default


def _clamp_bpm(bpm: float) -> float:
    return min(max(bpm, 30.0), 300.0)
