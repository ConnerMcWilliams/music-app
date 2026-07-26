"""
Render the encoded Clarke exercises (studies/seed/clarke_notation.py) to
MusicXML, one file per exercise, named by slug:

    backend/studies/seed/musicxml/clarke-<section>-<number>.musicxml

Usage (needs music21; not a Django runtime dependency):

    uv venv .venv && uv pip install -p .venv/bin/python music21
    .venv/bin/python scripts/generate_clarke_musicxml.py [outdir]

The files are written trumpet parts (B-flat, sounding a major second lower);
StudyContent.transposition_semitones carries that offset for grading.
"""
from __future__ import annotations

import os
import re
import sys

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

from music21 import (  # noqa: E402
    articulations,
    bar,
    clef,
    dynamics,
    expressions,
    key,
    meter,
    note,
    spanner,
    stream,
    tempo,
)

from studies.seed.clarke_notation import build_exercises  # noqa: E402


def render(ex: dict) -> stream.Score:
    score = stream.Score()
    part = stream.Part()
    part.partName = "Trumpet in Bb"

    ts = meter.TimeSignature(ex["time"])
    ks = key.Key(ex["key"])
    # Clarke is a cornet method: treble throughout. Without an explicit clef
    # music21 picks one from the pitch range, which put the lowest-starting
    # exercises (clarke-1-1, 1-2, 2-1, 3-1, 4-1) into bass clef.
    part.append(clef.TrebleClef())
    part.append(ks)
    part.append(ts)

    if ex.get("tempo"):
        text, referent, bpm = ex["tempo"]
        mm = tempo.MetronomeMark(text=text, number=bpm, referent=referent)
        part.append(mm)

    notes = []
    accent_every = ex.get("accent_every")
    idx_in_pattern = 0
    for pitch, ql in ex["events"]:
        if pitch is None:
            n = note.Rest(quarterLength=ql)
        else:
            n = note.Note(pitch, quarterLength=ql)
            if accent_every and ql < 1.0:
                if idx_in_pattern % accent_every == 0:
                    n.articulations.append(articulations.Accent())
                idx_in_pattern += 1
        notes.append(n)
        part.append(n)

    if ex.get("dynamic"):
        first_note = next(n for n in notes if isinstance(n, note.Note))
        part.insert(first_note.offset, dynamics.Dynamic(ex["dynamic"]))

    # bars + repeats
    part.makeMeasures(inPlace=True)
    measures = list(part.getElementsByClass(stream.Measure))
    if ex.get("repeat_bars"):
        start, end = ex["repeat_bars"]
        if start - 1 < len(measures):
            measures[start - 1].leftBarline = bar.Repeat(direction="start")
        if end - 1 < len(measures):
            measures[end - 1].rightBarline = bar.Repeat(direction="end")

    if ex.get("fermata_last"):
        last_measure = measures[-1]
        targets = list(last_measure.notesAndRests)
        if targets:
            targets[-1].expressions.append(expressions.Fermata())
        last_measure.rightBarline = bar.Barline("final")

    if ex.get("slur_all"):
        real_notes = [n for n in notes if isinstance(n, note.Note)]
        # slur the repeated phrase (all notes up to the closing long note)
        if len(real_notes) > 2:
            sl = spanner.Slur(real_notes[:-1])
            part.insert(0, sl)

    score.append(part)
    return score


def stabilize(xml: str, slug: str) -> str:
    """Strip the two things music21 varies per run.

    The part id is derived from in-memory object identity and the encoding date
    is stamped from the clock, so every regeneration rewrites all 132 files and
    buries the real change. Pinning both keeps regeneration diffs reviewable.

    Each distinct source id maps to its own stable id (``P-<slug>``, then
    ``P-<slug>-2``...) in order of first appearance, so a ``<score-part>`` and
    the ``<part>`` it describes stay paired and multi-part scores keep unique
    ids. Clarke's output is single-part, so every file gets ``P-<slug>``.
    """
    renamed: dict[str, str] = {}

    def rename(m: re.Match[str]) -> str:
        original = m.group(2)
        if original not in renamed:
            n = len(renamed) + 1
            renamed[original] = f"P-{slug}" if n == 1 else f"P-{slug}-{n}"
        return f"{m.group(1)}{renamed[original]}{m.group(3)}"

    xml = re.sub(r'(<(?:score-)?part id=")([^"]+)(")', rename, xml)
    return re.sub(r"[ \t]*<encoding-date>[^<]*</encoding-date>\n?", "", xml)


def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        BACKEND_DIR, "studies", "seed", "musicxml")
    os.makedirs(outdir, exist_ok=True)
    exercises = build_exercises()
    slugs = set()
    for ex in exercises:
        slug = ex["slug"]
        assert slug not in slugs, f"duplicate slug {slug}"
        slugs.add(slug)
        score = render(ex)
        path = os.path.join(outdir, f"{slug}.musicxml")
        score.write("musicxml", fp=path)
        with open(path, encoding="utf-8") as fh:
            xml = fh.read()
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(stabilize(xml, slug))
        print(f"wrote {path}")
    print(f"{len(exercises)} exercises rendered")


if __name__ == "__main__":
    main()
