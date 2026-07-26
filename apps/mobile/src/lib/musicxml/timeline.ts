/**
 * The *expected performance* of a study: what should be played, when, and at
 * what sounding pitch.
 *
 * This is the shared reference both feedback surfaces are built on — the live
 * analytical overlay (which compares microphone pitch against the note the
 * playhead is currently inside) and the graded results overlay (which colours
 * notes from the backend's note-level alignment). Keeping it in one pure module
 * means the two can never drift apart on what "note 5" means or which pitch it
 * should sound.
 *
 * Deliberately mirrors the arithmetic in `backend/grading/engine/reference.py`
 * so the client and the grader agree note-for-note. If you change the walk here,
 * change it there too.
 *
 * Pure: no React, no audio, no I/O.
 */
import type { ParsedNote, ParsedPitch, ParsedScore, StepName } from './parseMusicXML';

/**
 * Written-to-sounding transposition for the instrument, in semitones.
 *
 * A B♭ trumpet sounds a major second *below* the written pitch, so a written C4
 * reaches the microphone as B♭3. Mirrors `StudyContent.transposition_semitones`
 * in `backend/studies/models.py`.
 */
export const DEFAULT_TRANSPOSE_SEMITONES = -2;

export interface ExpectedNote {
  /**
   * Ordinal among *sounding* notes — rests, grace notes and chord tones are not
   * counted. **This is the join key shared with the grading backend**, whose
   * reference reader walks the same MusicXML under the same skip rules.
   */
  index: number;
  /**
   * Position in {@link ParsedScore.notes} — i.e. {@link ParsedNote.index}. Use
   * this (never {@link index}) to address the drawn glyph, because the parser
   * keeps rests in `score.notes` and the backend does not count them.
   */
  noteIndex: number;
  /**
   * Expected **sounding** MIDI note number — transposition already applied, so
   * this is directly comparable to a pitch detected from the microphone.
   */
  midi: number;
  /** Onset in quarter notes from the start of the study. */
  onsetBeats: number;
  /** Notated length in quarter notes. */
  durationBeats: number;
  /** 0-based measure this note belongs to. */
  measureIndex: number;
}

export interface BuildTimelineOptions {
  /** Written-to-sounding shift. Defaults to {@link DEFAULT_TRANSPOSE_SEMITONES}. */
  transposeSemitones?: number;
}

/** Semitones above the octave's C for each diatonic step. */
const STEP_SEMITONES: Readonly<Record<StepName, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/**
 * MIDI note number for a **written** pitch (middle C = C4 = 60, A4 = 69).
 *
 * Chromatic, unlike `diatonicIndex` in `parseMusicXML.ts`, which is a
 * staff-position index and ignores accidentals.
 */
export function midiOfPitch(pitch: ParsedPitch): number {
  return (pitch.octave + 1) * 12 + STEP_SEMITONES[pitch.step] + pitch.alter;
}

/** A note that produces a pitch to match, with `pitch` narrowed as present. */
type SoundingNote = ParsedNote & { pitch: ParsedPitch };

function isSounding(note: ParsedNote): note is SoundingNote {
  return !note.rest && !note.grace && !note.chord && note.pitch != null;
}

/**
 * Build the expected-note timeline for a score.
 *
 * The walk, matching `reference.py`:
 *  - **grace notes** carry no `<duration>` — skipped entirely, time does not move;
 *  - **chord tones** share the previous note's slot — skipped, time does not move;
 *  - **rests** advance time but emit no {@link ExpectedNote};
 *  - everything else emits a note and advances time by `duration / divisions`.
 *
 * ### Ties are merged only when adjacent
 *
 * A tied pair is one held note, so the tie-stop extends the tie-start rather
 * than emitting a second note — otherwise the grader would expect an attack
 * that a player correctly never plays, and mark it missed.
 *
 * The merge requires the tie-stop to be the **immediately following**
 * time-consuming element. That guard is not pedantry: every `<tie>` in the
 * bundled corpus (14 files, all of Study 6) is an OMR artifact where the
 * "tie" spans a four-beat rest — the 1912 scan's repeat marks misread as ties.
 * Merging those unconditionally would fuse two genuinely separate notes across
 * a rest and corrupt all 14 studies. Real, adjacent ties: currently zero.
 *
 * Times are in beats (quarter notes), not seconds, because only 8 of the 132
 * bundled Clarke files carry a `<sound tempo>`. The caller supplies the tempo at
 * runtime — normally the metronome's BPM — via `seconds = beats * 60 / bpm`.
 */
export function buildTimeline(
  score: ParsedScore,
  opts: BuildTimelineOptions = {},
): ExpectedNote[] {
  const transpose = opts.transposeSemitones ?? DEFAULT_TRANSPOSE_SEMITONES;
  const divisions = score.divisions > 0 ? score.divisions : 1;

  const timeline: ExpectedNote[] = [];
  let cursorBeats = 0;
  // The previous element that consumed time, and the note it emitted (null for
  // a rest). Used to decide whether a tie is real — see below.
  let previous: { note: ParsedNote; emitted: ExpectedNote | null } | null = null;

  for (const note of score.notes) {
    // Grace notes and chord tones occupy no time of their own.
    if (note.grace || note.chord) continue;

    const durationBeats = note.duration / divisions;

    if (isSounding(note)) {
      const midi = midiOfPitch(note.pitch) + transpose;

      // A tie continues the previous note rather than starting a new one — but
      // only when it genuinely *is* the previous note. See `isRealTie`.
      if (
        note.tieStop &&
        previous?.emitted != null &&
        previous.note.tieStart &&
        previous.emitted.midi === midi
      ) {
        previous.emitted.durationBeats += durationBeats;
        cursorBeats += durationBeats;
        previous = { note, emitted: previous.emitted };
        continue;
      }

      const emitted: ExpectedNote = {
        index: timeline.length,
        noteIndex: note.index,
        // Transposition is applied here and nowhere else on the client.
        midi,
        onsetBeats: cursorBeats,
        durationBeats,
        measureIndex: note.measureIndex,
      };
      timeline.push(emitted);
      cursorBeats += durationBeats;
      previous = { note, emitted };
      continue;
    }

    cursorBeats += durationBeats;
    previous = { note, emitted: null };
  }

  return timeline;
}

/**
 * Span covered by the *sounding* notes, in beats.
 *
 * Note this stops at the last note's release: a study ending in rests is longer
 * than this. Use {@link scoreDurationBeats} when you need the full notated
 * length (e.g. to know when a live run is over).
 */
export function timelineBeats(timeline: readonly ExpectedNote[]): number {
  const last = timeline[timeline.length - 1];
  return last ? last.onsetBeats + last.durationBeats : 0;
}

/**
 * Full notated length of the score in beats, **including trailing rests**.
 *
 * Walks with the same skip rules as {@link buildTimeline}, so the two always
 * agree on where time goes.
 */
export function scoreDurationBeats(score: ParsedScore): number {
  const divisions = score.divisions > 0 ? score.divisions : 1;
  let beats = 0;
  for (const note of score.notes) {
    if (note.grace || note.chord) continue;
    beats += note.duration / divisions;
  }
  return beats;
}

/**
 * The note sounding at `beat`, or null in a rest / past the end.
 *
 * Half-open windows (`[onset, onset + duration)`) so adjacent notes never both
 * claim the boundary. Linear scan — timelines are tens of notes, and callers
 * that poll per audio frame should track a cursor instead.
 */
export function noteAtBeat(
  timeline: readonly ExpectedNote[],
  beat: number,
): ExpectedNote | null {
  for (const note of timeline) {
    if (beat < note.onsetBeats) return null; // past it — timeline is ordered
    if (beat < note.onsetBeats + note.durationBeats) return note;
  }
  return null;
}

/** Convert beats to seconds at a given tempo. */
export function beatsToSeconds(beats: number, bpm: number): number {
  return (beats * 60) / bpm;
}

/** Convert seconds to beats at a given tempo. */
export function secondsToBeats(seconds: number, bpm: number): number {
  return (seconds * bpm) / 60;
}
