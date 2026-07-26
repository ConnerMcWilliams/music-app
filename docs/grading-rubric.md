# Grading Rubric

## Purpose

This document defines how Clarke Study submissions are graded.

The goal is not to judge musical artistry perfectly in v1. The goal is to give consistent, useful feedback on fundamentals: pitch, rhythm, tempo, tone stability, completion, and recording quality.

## V1 Grading Philosophy

The grading system should reward the fundamentals:
 - accurate pitch
 - steady rhythm
 - clear tone
 - stable tempo

The grading system should not over-prioritize:
- advanced musical interpretation
- speed alone
- competitive ranking
- subjective musical taste

## Total Score

Submissions are graded out of 100 points.

Suggested v1 breakdown:

| Category | Points |
|---|---:|
| Pitch accuracy | 25 |
| Rhythm accuracy | 25 |
| Tempo consistency | 20 |
| Tone stability | 15 |
| Completion | 15 |
| Total | 100 |

## Category Definitions

### Pitch Accuracy — 25 points

Measures how close the performed notes are to the expected notes.

Possible checks:
- correct note detection
- average cents deviation
- missed notes
- wrong notes
- unstable pitch on sustained notes

v1 rule:
- This can be approximate.
- The first implementation should focus on obvious pitch errors, not professional-level intonation judgment.

### Rhythm Accuracy — 25 points

Measures whether notes are played at the correct relative times.

Possible checks:
- note onset timing
- early/late attacks
- skipped notes
- extra notes
- rhythmic consistency within the exercise

v1 rule:
- Compare detected note onsets against the expected Clarke pattern.
- Do not require perfect sheet-music-level transcription in the first version.

### Tempo Consistency — 20 points

Measures whether the player keeps a steady tempo.

Possible checks:
- tempo drift
- sudden rushing
- sudden dragging
- consistency between measures or phrases

v1 rule:
- Grade steadiness more than speed.
- A slower steady performance should score better than a fast sloppy performance.

### Tone Stability — 15 points

Measures the steadiness and clarity of the sound.

Possible checks:
- volume stability
- cracked notes
- noisy attacks
- inconsistent sustain
- excessive wavering

v1 rule:
- Keep this simple at first.
- Use basic audio features before attempting advanced tone modeling.

### Completion — 15 points

Measures whether the user completed the assigned exercise.

Possible checks:
- expected duration reached
- expected number of notes detected
- no major missing sections
- recording was not cut off

## Score Bands

| Score | Meaning |
|---:|---|
| 90–100 | Excellent fundamentals |
| 80–89 | Strong performance with small issues |
| 70–79 | Good attempt with noticeable mistakes |
| 60–69 | Needs focused practice |
| Below 60 | Recording or performance needs major improvement |

A study counts as **passed** once the player's best *analyzed* take scores at
least **70** (`PASSING_SCORE` in `backend/grading/models.py`). Progression
surfaces — the Today card's "first unpassed study" — compare best scores
against this bar via `GET /api/profile/study-scores/` (see `docs/api.md`).

## Feedback Format

Each graded submission should return:

```json
{
  "total_score": 84,
  "pitch_score": 21,
  "rhythm_score": 20,
  "tempo_score": 17,
  "tone_score": 13,
  "completion_score": 14,
  "summary": "Good steady attempt. Main issue was a few missed notes in the middle section.",
  "practice_tip": "Repeat the exercise slowly with a metronome and focus on even attacks."
}
```

## Implementation (v1)

The engine lives in `backend/grading/engine/` and is wired to
`POST /api/submissions/` (the `grading` Django app). It follows this rubric's
"reward the fundamentals, keep it approximate" philosophy:

- **Pitch** — mean cents deviation of sustained pitches from equal temperament,
  plus how much of the sound was cleanly pitched (vs. breathy/cracked).
- **Rhythm** — how consistently note onsets fall on a steady subdivision grid.
- **Tempo** — steadiness of the pulse over the take (drift + jitter), rewarding
  a slow steady tempo over a fast unsteady one.
- **Tone** — loudness evenness, absence of dropouts, and low pitch waver.
- **Completion** — sound duration vs. the study's expected length (read from its
  MusicXML at its marked tempo), plus a not-cut-off check.

DSP uses NumPy only (framed RMS, FFT autocorrelation pitch, spectral-flux
onsets). The wire response carries each category normalized to 0–100 for the
mobile Results screen, alongside `total_score`, a letter `grade_label`, and a
generated `summary` + `practice_tip`.

## Note-level grading

When a take resolves to **exactly one** transcribed exercise, Pitch and Rhythm
are scored from a note-by-note match against the notation instead of the
reference-free heuristics above. This is what drives the Results screen's
green/red notation overlay, so the colours and the number always agree.

The pipeline (`backend/grading/engine/`):

1. **`timeline.py`** — reads the study's MusicXML into the expected notes:
   sounding pitch (B♭ transposition from `StudyContent.transposition_semitones`
   applied *exactly once*), onset and duration in beats. This mirrors the
   client's `apps/mobile/src/lib/musicxml/timeline.ts` walk note-for-note; a
   parity fixture pins the two together, because the note index is the join key
   that carries a verdict to a drawn glyph.
2. **`segment.py`** — groups the frame-level pitch track into performed notes.
   Boundaries come from attacks **and** sustained pitch changes: most of Clarke
   is slurred, and a slurred note change produces no attack transient at all.
3. **`align.py`** — semi-global Needleman–Wunsch over notes, with free end gaps.
   A dynamic program rather than a greedy walk because one inserted or dropped
   note must stay one mistake instead of shifting every later pairing and
   reddening the whole study. Free end gaps make a played repeat, a count-in and
   a late start harmless. A two-pass tempo fit means Rhythm judges timing
   *within the tempo the player held* — absolute steadiness is Tempo's job.
4. **`rubric.py`** — Pitch becomes `0.75 × note accuracy + 0.25 × intonation`
   (playing the right notes dominates; centre-of-pitch refines it). Rhythm
   becomes on-the-beat placement plus tightness, less a penalty for extra notes.

### When it deliberately does *not* run

Every one of these falls back to the reference-free scores, with
`note_grading: false` so the app hides the overlay rather than showing verdicts
it shouldn't trust:

- the client sent a section-level id (`clarke-2`), which names a Study but not
  which of its ~30 exercises was played;
- the notation fails `validate_notation` (the bundled MusicXML is OMR output
  from a 1912 scan — a transcription error would mark a correct performance
  wrong, permanently, with no way for the player to tell);
- the audio couldn't be decoded or segmented;
- the alignment came back degenerate — too little of the study reached, or too
  few notes correct to believe we are comparing against the right music.

That last fallback is forgiving on purpose. Showing a practising player a wall
of red they didn't earn destroys trust in the feature, and Tempo, Tone and
Completion still reflect a genuinely poor take.

**Known limitation:** grading covers one written pass. Repeats are not expanded;
a player who takes the repeat has the second pass absorbed as unpenalised
trailing notes.
