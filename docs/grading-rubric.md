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
