"""
Seed data for Herbert L. Clarke's *Technical Studies for the Cornet* (1912).

This is the source of truth for the **catalog** (the section/exercise structure).
The actual notation (MusicXML) is intentionally NOT here: no openly-licensed
machine-readable Clarke exists, so it must be transcribed from the public-domain
IMSLP scan via OMR (Audiveris) + manual cleanup — see the backend README and
docs/architecture.md. Every generated entry carries the IMSLP provenance URL and
an empty `musicxml` to be filled in per-exercise later.

Verified vs. assumed (from research):
- VERIFIED: 10 Studies; 190 exercises total; each Study I–VIII closes with an
  étude at a known number/key/tempo; Study IX has no étude; Study X ends with two
  named melodies — No. 189 "An Irish Ballad" and No. 190 "An Old German Folksong".
- DERIVED (from the verified étude numbers, assuming contiguous numbering): the
  global exercise range of each Study. These sum to exactly 190 as a check.
- VERIFIED (against the IMSLP scan, p. 51 of the printed score): the Tenth
  Study begins at No. 187, so IX = 178–186 and X = 187–190 (Nos. 187–188 are
  arpeggio-melody studies; 189–190 are the two named melodies).
- Non-étude per-exercise keys/tempos are deliberately left blank (unknown without
  score inspection) rather than guessed.
"""

IMSLP_URL = (
    "https://imslp.org/wiki/Clarke's_Technical_Studies_for_the_Cornet_"
    "(Clarke,_Herbert_Lincoln)"
)
SOURCE = "Clarke — Technical Studies for the Cornet"

# section, label, inclusive GLOBAL exercise range [first, last], rough category
# bucket, and a short focus description.
SECTIONS = [
    {"section": 1, "label": "First Study", "first": 1, "last": 26,
     "category": "foundational",
     "focus": "Finger dexterity: short legato cells shifted chromatically, very soft."},
    {"section": 2, "label": "Second Study", "first": 27, "last": 45,
     "category": "foundational",
     "focus": "Scalar-to-arpeggiated four-note cells moved through keys; slur then tongue."},
    {"section": 3, "label": "Third Study", "first": 46, "last": 65,
     "category": "articulation",
     "focus": "Slur and articulation flexibility; combined-articulation patterns."},
    {"section": 4, "label": "Fourth Study", "first": 66, "last": 86,
     "category": "flexibility",
     "focus": "Whole-tone / trill-type figures targeting awkward intervals."},
    {"section": 5, "label": "Fifth Study", "first": 87, "last": 117,
     "category": "foundational",
     "focus": "Extended two-octave scales; range and endurance."},
    {"section": 6, "label": "Sixth Study", "first": 118, "last": 132,
     "category": "foundational",
     "focus": "Major and minor scales across registers."},
    {"section": 7, "label": "Seventh Study", "first": 133, "last": 170,
     "category": "flexibility",
     "focus": "Chromatic triplets and arpeggios incl. diminished-7ths, all registers."},
    {"section": 8, "label": "Eighth Study", "first": 171, "last": 177,
     "category": "articulation",
     "focus": "Extended chromatic sequences; soft, then single/triple tongue."},
    {"section": 9, "label": "Ninth Study", "first": 178, "last": 186,
     "category": "foundational",
     "focus": "Progressive chromatic scales — a daily endurance test (no closing étude)."},
    {"section": 10, "label": "Tenth Study", "first": 187, "last": 190,
     "category": "foundational",
     "focus": "Arpeggio-melody studies; ends with the two named folk melodies."},
]

# Verified capstone études / named melodies, keyed by GLOBAL exercise number.
ETUDES = {
    26:  {"title": "First Study — Étude", "key": "C major", "tempo": "♩ = 120"},
    45:  {"title": "Second Study — Étude", "key": "G major", "tempo": "♩ = 144"},
    65:  {"title": "Third Study — Étude", "key": "C major", "tempo": "♩ = 138"},
    86:  {"title": "Fourth Study — Étude", "key": "G major", "tempo": "♩ = 144"},
    117: {"title": "Fifth Study — Étude", "key": "C major", "tempo": "♩ = 176"},
    132: {"title": "Sixth Study — Étude", "key": "C minor", "tempo": "♩ = 138"},
    170: {"title": "Seventh Study — Étude", "key": "C major", "tempo": "♩ = 152"},
    177: {"title": "Eighth Study — Étude", "key": "C major", "tempo": "♩ = 84"},
    189: {"title": 'Tenth Study — "An Irish Ballad"', "key": "F major", "tempo": "♩ = 72"},
    190: {"title": 'Tenth Study — "An Old German Folksong"', "key": "B♭ major", "tempo": "♩ = 80"},
}


def _build_studies():
    """Expand SECTIONS into one entry per exercise (190 total)."""
    studies = []
    for sec in SECTIONS:
        section = sec["section"]
        label = sec["label"]
        local = 0
        for global_number in range(sec["first"], sec["last"] + 1):
            local += 1
            entry = {
                "slug": f"clarke-{section}-{local}",
                "section": section,
                "section_label": label,
                "number": local,            # position within the Study
                "order": global_number,     # global exercise number (1..190)
                "category": sec["category"],
                # Difficulty tracks the Study number (I–X → 1–10); capstone
                # études are a couple of notches harder. Drives XP value.
                "difficulty": section,
                "source": SOURCE,
                "est_minutes": 3,
                # Provenance only — notation is transcribed from this scan later.
                "source_url": IMSLP_URL,
            }
            etude = ETUDES.get(global_number)
            if etude:
                entry["title"] = f'{etude["title"]} (No. {global_number})'
                entry["subtitle"] = "Capstone étude"
                entry["key"] = etude["key"]
                entry["tempo"] = etude["tempo"]
                entry["est_minutes"] = 5
                entry["difficulty"] = min(section + 2, 12)
            else:
                entry["title"] = f"{label}, No. {local}"
            studies.append(entry)
    return studies


STUDIES = _build_studies()

# Sanity check: the derived ranges must cover exactly 190 exercises.
assert len(STUDIES) == 190, f"expected 190 Clarke exercises, built {len(STUDIES)}"
