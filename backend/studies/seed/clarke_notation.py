"""
Programmatic note data for Clarke's *Technical Studies for the Cornet* (1912).

Every pattern exercise in Studies I-IX is a small formula (a figure transposed
through keys/degrees). This module encodes those formulas exactly as engraved
in the public-domain Carl Fischer scan (IMSLP), which was read page-by-page
with a purpose-built notehead-detection pass plus visual verification of every
scheme (see scripts/generate_clarke_musicxml.py for the renderer).

Each entry produced by `build_exercises()` is a dict:
    slug          e.g. "clarke-2-5"
    key           music21 key string, e.g. "G", "g#" (lowercase = minor)
    time          e.g. "2/2", "4/4", "3/4", "6/8"
    tempo         (text, bpm_referent, bpm) or None
    dynamic       e.g. "pp"
    events        list of (pitch_or_None, quarterLength) — pitch as music21
                  string with octave, e.g. "F#3"; None = rest
    repeat_bars   (start_bar, end_bar) wrapped in repeat signs, or None
    fermata_last  True to put a fermata over the final barline/rest
    slur_all      True to slur each repeated section phrase

Encoded so far: Studies I-VI complete, plus Study IX Nos. 178-183. The 10 études
(Nos. 26, 45, 65, 86, 117, 132, 170, 177, 189, 190) are through-composed and are
NOT generated: they are transcribed separately.

Every exercise is engraved in treble clef (see scripts/generate_clarke_musicxml.py
— music21 otherwise picks a clef from the pitch range and drops the lowest
exercises into bass clef).

The remaining pattern studies are not all encodable against the current renderer;
see backend/README.md for the per-study breakdown. In short: Study VII Nos.
133-153 (12/8) and 155-169 (6/8) are straightforward, while Study VIII, Study IX
Nos. 184-186 and Study VII No. 154 need tuplet support and Study X Nos. 187-188
need grace notes.
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Small music helpers (pure pitch arithmetic; no music21 dependency here)
# ---------------------------------------------------------------------------

LETTERS = ["C", "D", "E", "F", "G", "A", "B"]
# diatonic pitch classes for major keys, by tonic name
MAJOR_SHARPS = {  # name -> number of sharps (negative = flats)
    "C": 0, "G": 1, "D": 2, "A": 3, "E": 4, "B": 5, "F#": 6, "C#": 7,
    "F": -1, "Bb": -2, "Eb": -3, "Ab": -4, "Db": -5, "Gb": -6, "Cb": -7,
}
SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"]


def major_scale(tonic: str) -> list[str]:
    """Return the 7 pitch names (no octave) of a major scale."""
    n = MAJOR_SHARPS[tonic]
    alts = {}
    if n >= 0:
        for L in SHARP_ORDER[:n]:
            alts[L] = "#"
    else:
        for L in reversed(SHARP_ORDER[len(SHARP_ORDER) + n:]):
            alts[L] = "b"
        # flats apply to the LAST -n letters of SHARP_ORDER reversed:
        alts = {}
        for L in ["B", "E", "A", "D", "G", "C", "F"][:-n]:
            alts[L] = "b"
    letter0 = tonic[0]
    i0 = LETTERS.index(letter0)
    return [LETTERS[(i0 + k) % 7] + alts.get(LETTERS[(i0 + k) % 7], "")
            for k in range(7)]


def scale_note(tonic: str, octave_of_tonic: int, degree_index: int,
               scale: list[str] | None = None) -> str:
    """degree_index 0 = tonic; may be negative or >6 (octave shifts).
    Returns e.g. 'F#3'."""
    sc = scale or major_scale(tonic)
    idx = degree_index % 7
    shift = degree_index // 7
    name = sc[idx]
    # octave: count letter crossings of C between tonic letter and target
    letter_pos = LETTERS.index(name[0])
    tonic_pos = LETTERS.index(tonic[0])
    octv = octave_of_tonic + shift
    if letter_pos < tonic_pos:
        octv += 1
    return f"{name}{octv}"


def chromatic_run_up(start_pitch: str, n: int) -> list[str]:
    """n chromatic pitches ascending from start (sharp spelling),
    as engraved in Study I (sharps up, flats down)."""
    from fractions import Fraction  # noqa: F401  (kept minimal; no deps)
    NAMES_UP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    return _chromatic(start_pitch, n, NAMES_UP, +1)


def chromatic_run_down(start_pitch: str, n: int) -> list[str]:
    NAMES_DOWN = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
    return _chromatic(start_pitch, n, NAMES_DOWN, -1)


_PC = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5,
       "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10,
       "Bb": 10, "B": 11,
       # enharmonic spellings that appear in extreme keys
       "E#": 5, "B#": 0, "Fb": 4, "Cb": 11,
       "F##": 7, "C##": 3, "G##": 9, "D##": 5, "A##": 0,
       "Bbb": 9, "Ebb": 2, "Abb": 7}


def _chromatic(start_pitch: str, n: int, names: list[str], step: int) -> list[str]:
    name, octv = start_pitch[:-1], int(start_pitch[-1])
    pc = _PC[name]
    midi = (octv + 1) * 12 + pc
    out = []
    for _ in range(n):
        pc_ = midi % 12
        oct_ = midi // 12 - 1
        out.append(f"{names[pc_]}{oct_}")
        midi += step
    return out


def transpose_chromatic(pitch: str, semitones: int, prefer_flat=False) -> str:
    name, octv = pitch[:-1], int(pitch[-1])
    midi = (octv + 1) * 12 + _PC[name] + semitones
    NAMES = (["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"]
             if prefer_flat else
             ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"])
    return f"{NAMES[midi % 12]}{midi // 12 - 1}"


# ---------------------------------------------------------------------------
# Study I  (Nos. 1-25): chromatic tritone runs. No. 26 is Étude I.
# ---------------------------------------------------------------------------
# Ex N starts on F#3 + (N-1) semitones. 3/4, pp, whole phrase slurred,
# 4 bars (2-bar cell x2) under a repeat, then a closing half note on the
# start pitch with a fermata. Bar 1: 6 eighths chromatically up from the
# start; bar 2: back down from the tritone above. Met. quarter=160 -> dotted
# half=112 (printed once, on No. 1).

def build_study1():
    out = []
    for n in range(1, 26):
        start = transpose_chromatic("F#3", n - 1)
        up = chromatic_run_up(start, 7)          # e.g. F#..C (tritone above)
        bar1 = up[:6]                            # F# G G# A A# B
        top = up[6]                              # C
        bar2 = chromatic_run_down(top, 6)        # C B Bb A Ab G
        events = []
        for p in bar1 + bar2 + bar1 + bar2:
            events.append((p, 0.5))
        events.append((start, 2.0))              # closing half note
        events.append((None, 1.0))               # quarter rest under fermata
        out.append({
            "slug": f"clarke-1-{n}",
            "key": "C",
            "time": "3/4",
            "tempo": (("Met. quarter = 160 to dotted-half = 112", "quarter", 160)
                      if n == 1 else None),
            "dynamic": "pp",
            "events": events,
            "repeat_bars": (1, 4),
            "fermata_last": True,
            "slur_all": True,
        })
    return out


# ---------------------------------------------------------------------------
# Study II  (Nos. 27-44): one degree pattern through 18 chromatic keys.
# No. 45 is Étude II.
# ---------------------------------------------------------------------------
# Cut time, p, accents each 4-note group, 4 bars repeated + final bar
# (tonic half + half rest, fermata). Degree cells (1-indexed degrees,
# L = leading tone below tonic):
#   (1231)(2342) | (3453)(1231) | (2342)(L12L) | (1321)(2432) | 1(half)
STUDY2_KEYS = [
    ("G", "G", 3), ("Ab", "Ab", 3), ("A", "A", 3), ("Bb", "Bb", 3),
    ("B", "B", 3), ("C", "C", 4), ("Db", "Db", 4), ("D", "D", 4),
    ("Eb", "Eb", 4), ("E", "E", 4), ("F", "F", 4), ("F#", "F#", 4),
    ("G", "G", 4), ("Ab", "Ab", 4), ("A", "A", 4), ("Bb", "Bb", 4),
    ("B", "B", 4), ("C", "C", 5),
]

_STUDY2_DEGREES = [
    0, 1, 2, 0,   1, 2, 3, 1,
    2, 3, 4, 2,   0, 1, 2, 0,
    1, 2, 3, 1,   -1, 0, 1, -1,
    0, 2, 1, 0,   1, 3, 2, 1,
]


def build_study2():
    out = []
    for i, (key, tonic, octv) in enumerate(STUDY2_KEYS):
        n = 27 + i
        sc = major_scale(tonic)
        events = [(scale_note(tonic, octv, d, sc), 0.5) for d in _STUDY2_DEGREES]
        events.append((scale_note(tonic, octv, 0, sc), 2.0))
        events.append((None, 2.0))
        out.append({
            "slug": f"clarke-2-{n - 26}",
            "key": key,
            "time": "2/2",
            "tempo": (("Met. half = 60 to half = 120", "half", 60)
                      if n == 27 else None),
            "dynamic": "p",
            "events": events,
            "repeat_bars": (1, 4),
            "fermata_last": True,
            "slur_all": True,
            "accent_every": 4,
        })
    return out


# ---------------------------------------------------------------------------
# Study III  (Nos. 46-64): arpeggio-cell template through 19 chromatic keys.
# No. 65 is Étude III.
# ---------------------------------------------------------------------------
# Cut time, p, slur/accent per 4-group. 8 bars repeated, then coda bar +
# tonic half. Cells (degrees, L = leading tone below):
#  bars 1-2: (1353) x4          bars 3-4: (1464) x4   [No.46: bar 4 roots = L]
#  bars 5-6: (1353) x4          bars 7-8: (2454)(L454) x2
#  coda: (1235)(8535) eighths, tonic half + half rest, fermata.
STUDY3_KEYS = [
    ("F#", "F#", 3), ("G", "G", 3), ("Ab", "Ab", 3), ("A", "A", 3),
    ("Bb", "Bb", 3), ("B", "B", 3), ("C", "C", 4), ("Db", "Db", 4),
    ("D", "D", 4), ("Eb", "Eb", 4), ("E", "E", 4), ("F", "F", 4),
    ("F#", "F#", 4), ("G", "G", 4), ("Ab", "Ab", 4), ("A", "A", 4),
    ("Bb", "Bb", 4), ("B", "B", 4), ("C", "C", 5),
]


def build_study3():
    out = []
    for i, (key, tonic, octv) in enumerate(STUDY3_KEYS):
        n = 46 + i
        sc = major_scale(tonic)
        deg = []
        deg += [0, 2, 4, 2] * 4                       # bars 1-2
        if n == 46:                                    # engraved variant
            deg += [0, 3, 5, 3] * 2 + [-1, 3, 5, 3] * 2
        else:
            deg += [0, 3, 5, 3] * 4                   # bars 3-4
        deg += [0, 2, 4, 2] * 4                       # bars 5-6
        deg += ([1, 3, 4, 3] + [-1, 3, 4, 3]) * 2     # bars 7-8
        coda = [0, 1, 2, 4, 7, 4, 2, 4]               # coda bar (eighths)
        events = [(scale_note(tonic, octv, d, sc), 0.5) for d in deg]
        events += [(scale_note(tonic, octv, d, sc), 0.5) for d in coda]
        events.append((scale_note(tonic, octv, 0, sc), 2.0))
        events.append((None, 2.0))
        out.append({
            "slug": f"clarke-3-{n - 45}",
            "key": key,
            "time": "2/2",
            "tempo": ("Met. half = 60 to half = 120", "half", 60) if n == 46 else None,
            "dynamic": "p",
            "events": events,
            "repeat_bars": (1, 8),
            "fermata_last": True,
            "slur_all": True,
            "accent_every": 4,
        })
    return out


# ---------------------------------------------------------------------------
# Study IV  (Nos. 66-85): whole-tone trill exercises. No. 86 is Étude IV.
# ---------------------------------------------------------------------------
# Common time, pp, 16ths. 8 bars + coda:
#  bar1: (1,2)x8            bar2: (1,2,b3,2)x4
#  bar3: (1,2)x8            bar4: (1,2,b3,2)x2 + run 1..8 (16ths)
#  bar5: (5,6)x8            bar6: (5,6,b7,6)x4
#  bar7: (5,6)x8            bar8: (5,6,b7,6)x3 + descend (5,4,3,2)
#  coda bar (eighths): Nos. 66-67: (L,3,2,4,3,5,4,2); others (1,3,2,4,3,5,4,2)
#  then tonic half note (trill octave), fermata.
STUDY4_KEYS = [
    ("F#", "F#", 3), ("G", "G", 3), ("Ab", "Ab", 3), ("A", "A", 3),
    ("Bb", "Bb", 3), ("B", "B", 3), ("C", "C", 4), ("Db", "Db", 4),
    ("D", "D", 4), ("Eb", "Eb", 4), ("E", "E", 4), ("F", "F", 4),
    ("Gb", "Gb", 4), ("G", "G", 4), ("Ab", "Ab", 4), ("A", "A", 4),
    ("Bb", "Bb", 4), ("B", "B", 4), ("C", "C", 5), ("Db", "Db", 5),
]


def _flat3(tonic, octv, sc):
    """Chromatic lower-third neighbour: minor third above tonic (b3)."""
    third = scale_note(tonic, octv, 2, sc)
    return transpose_chromatic(third, -1, prefer_flat=not third.endswith("#"))


def build_study4():
    out = []
    for i, (key, tonic, octv) in enumerate(STUDY4_KEYS):
        n = 66 + i
        sc = major_scale(tonic)

        def p(d, tonic=tonic, octv=octv, sc=sc):
            return scale_note(tonic, octv, d, sc)

        b3 = _flat3(tonic, octv, sc)
        fifth = p(4)
        sixth = p(5)
        b7 = transpose_chromatic(p(6), -1, prefer_flat=not p(6).endswith("#"))
        sixteenths = []
        sixteenths += [p(0), p(1)] * 8                       # bar 1
        sixteenths += [p(0), p(1), b3, p(1)] * 4             # bar 2
        sixteenths += [p(0), p(1)] * 8                       # bar 3
        sixteenths += [p(0), p(1), b3, p(1)] * 2             # bar 4
        sixteenths += [p(d) for d in range(0, 8)]
        sixteenths += [fifth, sixth] * 8                     # bar 5
        sixteenths += [fifth, sixth, b7, sixth] * 4          # bar 6
        sixteenths += [fifth, sixth] * 8                     # bar 7
        sixteenths += [fifth, sixth, b7, sixth] * 3          # bar 8
        sixteenths += [p(d) for d in (4, 3, 2, 1)]
        ev = [(pitch, 0.25) for pitch in sixteenths]
        # coda bar: eighths
        first = -1 if n in (66, 67) else 0
        for d in (first, 2, 1, 3, 2, 4, 3, 1):
            ev.append((p(d), 0.5))
        ev.append((p(0), 2.0))
        ev.append((None, 2.0))
        out.append({
            "slug": f"clarke-4-{n - 65}",
            "key": key,
            "time": "4/4",
            "tempo": ("Met. quarter = 100 to 144", "quarter", 100) if n == 66 else None,
            "dynamic": "pp",
            "events": ev,
            "repeat_bars": (1, 8),
            "fermata_last": True,
            "slur_all": True,
            "accent_every": 4,
        })
    return out


# ---------------------------------------------------------------------------
# Study V  (Nos. 87-116): endurance waves and two-octave scales.
# No. 117 is Étude V.
# ---------------------------------------------------------------------------
STUDY5A_KEYS = [  # Nos. 87-98: wave + octave-run exercises
    ("F#", "F#", 3), ("G", "G", 3), ("Ab", "Ab", 3), ("A", "A", 3),
    ("Bb", "Bb", 3), ("B", "B", 3), ("C", "C", 4), ("Db", "Db", 4),
    ("D", "D", 4), ("Eb", "Eb", 4), ("E", "E", 4), ("F", "F", 4),
]


def build_study5a():
    """Common time, pp, 16ths.
    bars1-2 |: (1,2,3,4,5,4,3,2)x3 (1..8) ; bars3-4 (5,6,7,8,9,8,7,6)x3
    (5,6,7,6,5,4,3,2) :| ; bars5-8: (1..8)(9..2)(3..10)(11..4)(5..12)(13..6)
    (7..14) + tonic'' half, fermata."""
    out = []
    for i, (key, tonic, octv) in enumerate(STUDY5A_KEYS):
        n = 87 + i
        sc = major_scale(tonic)

        def p(d, tonic=tonic, octv=octv, sc=sc):
            return scale_note(tonic, octv, d, sc)

        degrees = []
        degrees += [0, 1, 2, 3, 4, 3, 2, 1] * 3          # bars 1-2a
        degrees += list(range(0, 8))                     # octave run
        degrees += [4, 5, 6, 7, 8, 7, 6, 5] * 3          # bars 3-4a
        degrees += [4, 5, 6, 5, 4, 3, 2, 1]              # turn back down
        # second half: climbing octave runs
        degrees += list(range(0, 8))                     # 1..8
        degrees += list(range(8, 0, -1))                 # 9..2
        degrees += list(range(2, 10))                    # 3..10
        degrees += list(range(10, 2, -1))                # 11..4
        degrees += list(range(4, 12))                    # 5..12
        degrees += list(range(12, 4, -1))                # 13..6
        degrees += list(range(6, 14))                    # 7..14
        ev = [(p(d), 0.25) for d in degrees]
        ev.append((p(14), 2.0))      # two octaves above the start
        ev.append((None, 2.0))
        out.append({
            "slug": f"clarke-5-{n - 86}",
            "key": key,
            "time": "4/4",
            "tempo": ("Met. quarter = 72 to quarter = 144", "quarter", 72) if n == 87 else None,
            "dynamic": "pp",
            "events": ev,
            "repeat_bars": (1, 4),
            "fermata_last": True,
            "slur_all": True,
            "accent_every": 8,
        })
    return out


def minor_scale_melodic(tonic: str) -> tuple[list[str], list[str]]:
    """(ascending, descending) pitch names for a melodic minor scale.
    tonic like 'g', 'g#', 'bb' (lowercase)."""
    t = tonic[0].upper() + tonic[1:]
    rel_major_pc = (_PC[t] + 3) % 12
    # find the relative major with a matching sensible spelling
    letter_above = LETTERS[(LETTERS.index(t[0]) + 2) % 7]
    candidates = [name for name, pc in _PC.items()
                  if pc == rel_major_pc and name[0] == letter_above]
    relmaj = candidates[0]
    nat = major_scale(relmaj)  # natural minor = rotation of relative major
    i0 = nat.index(t) if t in nat else None
    if i0 is None:
        raise ValueError(f"cannot spell {tonic} minor from {relmaj}")
    natural = [nat[(i0 + k) % 7] for k in range(7)]
    asc = natural[:]
    for k in (5, 6):  # raise 6th and 7th
        asc[k] = _raise(asc[k])
    return asc, natural


def _raise(name: str) -> str:
    if name.endswith("b"):
        return name[:-1]
    if name.endswith("#"):
        return name + "#"  # double sharp (music21 accepts '##')
    return name + "#"


SCALE_SWEEPS = [
    # (global number, key string for music21, tonic spelling, tonic octave,
    #  quality, start_degree_offset)  offset 0 = tonic start, 2 = mediant
    (99, "g", "G", 3, "min", 0), (100, "G", "G", 3, "maj", 0),
    (101, "g#", "G#", 3, "min", 0), (102, "Ab", "Ab", 3, "maj", 0),
    (103, "a", "A", 3, "min", 0), (104, "A", "A", 3, "maj", 0),
    (105, "bb", "Bb", 3, "min", 0), (106, "Bb", "Bb", 3, "maj", 0),
    (107, "b", "B", 3, "min", 0), (108, "B", "B", 3, "maj", 0),
    (109, "c", "C", 4, "min", 0), (110, "C", "C", 4, "maj", 0),
    (111, "c#", "C#", 4, "min", 0),
    (112, "g", "G", 3, "min", 2), (113, "f#", "F#", 3, "min", 2),
    (114, "f", "F", 3, "min", 2), (115, "e", "E", 3, "min", 2),
    (116, "d#", "D#", 3, "min", 2),
]


def build_study5b():
    """Two-octave scale sweeps: 2 bars of 16ths (up 15, down 16 to the
    step below the anchor) + anchor half note + half rest, repeated,
    fermata. Melodic minors use raised 6/7 up, natural down."""
    out = []
    for num, key, tonic, octv, quality, offset in SCALE_SWEEPS:
        if quality == "maj":
            asc_names = major_scale(tonic)
            desc_names = asc_names
        else:
            asc_names, desc_names = minor_scale_melodic(key)
        def note_at(deg, names, tonic=tonic, octv=octv):
            idx = deg % 7
            shift = deg // 7
            name = names[idx]
            letter_pos = LETTERS.index(name[0])
            tonic_pos = LETTERS.index(tonic[0].upper())
            octv_ = octv + shift
            if letter_pos < tonic_pos:
                octv_ += 1
            return f"{name}{octv_}"
        ev = []
        for d in range(offset, offset + 16):            # ascent: 2 octaves + step
            ev.append((note_at(d, asc_names), 0.25))
        for d in range(offset + 14, offset - 2, -1):    # descent to step below anchor
            if quality == "min" and offset == 0 and d == -1:
                # cadential leading tone is raised even in the descent
                ev.append((note_at(d, asc_names), 0.25))
            else:
                ev.append((note_at(d, desc_names), 0.25))
        ev.append((note_at(offset, desc_names), 2.0))   # anchor half
        ev.append((None, 2.0))
        out.append({
            "slug": f"clarke-5-{num - 86}",
            "key": key,
            "time": "4/4",
            "tempo": ("Met. quarter = 76 to quarter = 160", "quarter", 76) if num == 99 else None,
            "dynamic": "p",
            "events": ev,
            "repeat_bars": (1, 2),
            "fermata_last": True,
            "slur_all": True,
            "accent_every": 8,
        })
    return out


# ---------------------------------------------------------------------------
# Study VI  (Nos. 118-131): minor/major pairs. No. 132 is Étude VI.
# ---------------------------------------------------------------------------
# Common time, pp, 16ths. Per exercise (anchor = tonic):
#  bar1: (1,2,3,2)x3 (1,2,3,1)      bar2: (2,3,4,3)x3 (2,3,4,2)
#  bar3: (3,4,5,4)x3 (3,4,5,3)      bar4: (2,3,4,3)x3 (2,3,4,2)  [repeat 1-4]
#  bars5-6: two-octave sweep (up 16, down 16 to leading tone)
#  bars7-8: the same sweep again
#  bar9: (1,2,3,4,5,4,3,2)x2
#  bar10: dotted 8th+16th pairs (1,3)(5,8)(10,12) then half note on 15.
# Minors are melodic: raised 6/7 ascending, natural descending.
STUDY6_PAIRS = [
    (118, "f#", "F#", 3), (119, "F#", "F#", 3),
    (120, "g", "G", 3), (121, "G", "G", 3),
    (122, "g#", "G#", 3), (123, "Ab", "Ab", 3),
    (124, "a", "A", 3), (125, "A", "A", 3),
    (126, "bb", "Bb", 3), (127, "Bb", "Bb", 3),
    (128, "b", "B", 3), (129, "B", "B", 3),
    (130, "c", "C", 4), (131, "C", "C", 4),
]


def build_study6():
    out = []
    for num, keystr, tonic, octv in STUDY6_PAIRS:
        minor = keystr[0].islower()
        if minor:
            asc_names, desc_names = minor_scale_melodic(keystr)
        else:
            asc_names = major_scale(tonic)
            desc_names = asc_names

        def note_at(deg, names, tonic=tonic, octv=octv):
            idx = deg % 7
            shift = deg // 7
            name = names[idx]
            octv_ = octv + shift
            if LETTERS.index(name[0]) < LETTERS.index(tonic[0].upper()):
                octv_ += 1
            return f"{name}{octv_}"

        def p(d, note_at=note_at, asc_names=asc_names):
            return note_at(d, asc_names)

        ev = []

        def add16(d, names=None, ev=ev, note_at=note_at, asc_names=asc_names):
            ev.append((note_at(d, names or asc_names), 0.25))
        for root in (0, 1, 2, 1):                       # bars 1-4
            for _ in range(3):
                for d in (root, root + 1, root + 2, root + 1):
                    add16(d)
            for d in (root, root + 1, root + 2, root):
                add16(d)
        for _ in range(2):                              # bars 5-8: sweeps x2
            for d in range(0, 16):
                add16(d)
            for d in range(14, -2, -1):
                if minor and d == -1:
                    add16(d)                            # raised leading tone
                else:
                    add16(d, desc_names)
        for _ in range(2):                              # bar 9
            for d in (0, 1, 2, 3, 4, 3, 2, 1):
                add16(d)
        for lo, hi in ((0, 2), (4, 7), (9, 11)):        # bar 10: dotted pairs
            ev.append((p(lo), 0.75))
            ev.append((p(hi), 0.25))
        ev.append((p(14), 2.0))                         # closing half, 2 octaves
        out.append({
            "slug": f"clarke-6-{num - 117}",
            "key": keystr,
            "time": "4/4",
            "tempo": ("Met. quarter = 92 to 132", "quarter", 92) if num == 118 else None,
            "dynamic": "pp",
            "events": ev,
            "repeat_bars": (1, 4),
            "fermata_last": True,
            "slur_all": True,
            "accent_every": 8,
        })
    return out


# ---------------------------------------------------------------------------
# Study IX  (Nos. 178-186): chromatic scale runs.
# Nos. 178-183 are encoded; 184-186 (the long endurance forms) are transcribed
# separately, like the études.
# ---------------------------------------------------------------------------
# Common time, 16ths. |: 32 up (start .. start+31, sharp spelling),
# 32 down (peak respelled in flats .. start, flat spelling) :| then a whole
# note on the start pitch with fermata. pp cresc to mf and dim (hairpins not
# encoded). Each exercise begins a semitone higher: F#3, G3, ... B3.

def build_study9_runs():
    out = []
    for i in range(6):
        num = 178 + i
        start = transpose_chromatic("F#3", i)
        up = chromatic_run_up(start, 32)
        peak_flat = transpose_chromatic(start, 31, prefer_flat=True)
        down = chromatic_run_down(peak_flat, 32)
        ev = [(p, 0.25) for p in up + down]
        ev.append((start, 4.0))
        out.append({
            "slug": f"clarke-9-{num - 177}",
            "key": "C",
            "time": "4/4",
            "tempo": ("Met. quarter = 144", "quarter", 144) if num == 178 else None,
            "dynamic": "pp",
            "events": ev,
            "repeat_bars": (1, 4),
            "fermata_last": True,
            "slur_all": True,
            "accent_every": 32,
        })
    return out


def build_exercises():
    return (build_study1() + build_study2() + build_study3()
            + build_study4() + build_study5a() + build_study5b()
            + build_study6() + build_study9_runs())
