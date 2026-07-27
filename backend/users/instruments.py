"""
The brass instruments a player can choose during onboarding.

A pure module (constants + lookups, no Django imports) in the same spirit as
``progress.rewards``, so the grading engine can import it later without touching
the database. Mirrored on the client by
``apps/mobile/src/data/instruments.ts`` — change both together.

Transposition convention matches ``studies.StudyContent.transposition_semitones``
(``-2`` for the B♭ trumpet parts the Clarke corpus is written in)::

    sounding pitch = written pitch + sounding_offset_semitones

Onboarding itself only reads ``slug``/``label``/``family``. ``clef`` and
``sounding_offset_semitones`` are recorded now as groundwork for the per-instrument
transposition work: they describe the instrument, not the app's use of it, so
writing them down once here keeps that data in a single reviewed place.
"""
from __future__ import annotations

from dataclasses import dataclass

# Notation the player reads from. The Clarke corpus is engraved in treble clef;
# the low brass entries below read the same music in bass clef.
CLEF_TREBLE = "treble"
CLEF_BASS = "bass"

# Coarse grouping, used to order and section the onboarding picker.
FAMILY_TRUMPET = "trumpet"
FAMILY_HORN = "horn"
FAMILY_LOW_BRASS = "low-brass"


@dataclass(frozen=True)
class Instrument:
    """One selectable instrument and the facts needed to transpose for it."""

    slug: str
    label: str
    clef: str
    # Semitones from written to sounding pitch; negative sounds below the page.
    sounding_offset_semitones: int
    family: str


# Ordered as the onboarding picker presents them: trumpet family first (the
# instrument Clarke wrote for), then horns, then low brass.
INSTRUMENTS: tuple[Instrument, ...] = (
    Instrument("trumpet", "Trumpet", CLEF_TREBLE, -2, FAMILY_TRUMPET),
    Instrument("cornet", "Cornet", CLEF_TREBLE, -2, FAMILY_TRUMPET),
    Instrument("flugelhorn", "Flugelhorn", CLEF_TREBLE, -2, FAMILY_TRUMPET),
    # B♭ piccolo trumpet sounds an octave above the B♭ trumpet: -2 + 12.
    Instrument("piccolo-trumpet", "Piccolo Trumpet", CLEF_TREBLE, 10, FAMILY_TRUMPET),
    Instrument("french-horn", "French Horn", CLEF_TREBLE, -7, FAMILY_HORN),
    Instrument("mellophone", "Mellophone", CLEF_TREBLE, -7, FAMILY_HORN),
    Instrument("alto-horn", "Alto / Tenor Horn", CLEF_TREBLE, -9, FAMILY_HORN),
    # Treble-clef baritone/euphonium read as a B♭ tenor instrument: a major
    # ninth (an octave plus a major second) below the written note.
    Instrument(
        "baritone-treble", "Baritone Horn (treble clef)", CLEF_TREBLE, -14, FAMILY_LOW_BRASS
    ),
    Instrument("euphonium-treble", "Euphonium (treble clef)", CLEF_TREBLE, -14, FAMILY_LOW_BRASS),
    # Bass-clef low brass reads concert pitch — written is what sounds.
    Instrument("trombone", "Trombone", CLEF_BASS, 0, FAMILY_LOW_BRASS),
    Instrument("bass-trombone", "Bass Trombone", CLEF_BASS, 0, FAMILY_LOW_BRASS),
    Instrument("tuba", "Tuba", CLEF_BASS, 0, FAMILY_LOW_BRASS),
)

# For the model field's ``choices``. Kept derived so the tuple above stays the
# single place an instrument is added or renamed.
INSTRUMENT_CHOICES: list[tuple[str, str]] = [(i.slug, i.label) for i in INSTRUMENTS]

_BY_SLUG: dict[str, Instrument] = {i.slug: i for i in INSTRUMENTS}


def get_instrument(slug: str) -> Instrument | None:
    """The instrument with this slug, or ``None`` if it isn't one we offer."""
    return _BY_SLUG.get(slug)
