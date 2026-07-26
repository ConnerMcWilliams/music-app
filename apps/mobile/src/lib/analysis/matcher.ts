/**
 * The matcher — turns audio frames into a verdict for each note.
 *
 * This is the heart of analytical mode and it is deliberately pure: frames in,
 * judgements out, no audio API and no clock. Every threshold it uses lives in
 * `types.ts`, so tuning is a data change rather than a logic change.
 *
 * ## Why sustained match ratio, not attack timing
 *
 * The obvious design — check the pitch at each note's attack — fails on this
 * repertoire. A brass attack's first ~30 ms is broadband noise with no stable
 * pitch, and most of Clarke is *slurred*, so for the majority of notes there is
 * no attack transient at all. Judging on the share of the note's duration spent
 * on the right pitch handles both, and correctly catches "started right, then
 * cracked".
 *
 * The cost is that two identical slurred notes in a row are indistinguishable —
 * a held note and two tied-together notes look the same to the microphone. Both
 * read correct. That is an accepted limitation of v1.
 */
import {
  signedCents,
  isVoiced,
  matchesExpected,
  median,
  mode,
  CORRECT_MATCH_RATIO,
  MISSED_VOICED_RATIO,
  type NoteJudgement,
  type NoteWindow,
  type PitchFrame,
} from './types';

interface Accumulator {
  total: number;
  voicedMidis: number[];
  matchedCents: number[];
  /** Timeline second of the first voiced frame — the perceived attack. */
  firstVoicedTime: number | null;
}

function emptyAccumulator(): Accumulator {
  return { total: 0, voicedMidis: [], matchedCents: [], firstVoicedTime: null };
}

export class NoteMatcher {
  /** Per-note accumulators, keyed by `NoteWindow.index`. */
  private readonly bins = new Map<number, Accumulator>();
  private readonly beatSeconds: number;

  constructor(beatSeconds: number) {
    this.beatSeconds = beatSeconds;
  }

  /** Fold one frame into the note that owns it. */
  addFrame(window: NoteWindow, frame: PitchFrame): void {
    let bin = this.bins.get(window.index);
    if (!bin) {
      bin = emptyAccumulator();
      this.bins.set(window.index, bin);
    }

    bin.total += 1;
    if (!isVoiced(frame) || frame.midi == null) return;

    bin.voicedMidis.push(frame.midi);
    if (bin.firstVoicedTime == null) bin.firstVoicedTime = frame.time;
    if (matchesExpected(frame.midi, window.midi)) {
      bin.matchedCents.push(signedCents(frame.midi, window.midi));
    }
  }

  /**
   * Judge a note whose window has closed.
   *
   * - no sound worth speaking of → `missed`
   * - most of the sound was the right note → `correct`
   * - otherwise → `wrong`, reporting what was actually heard
   */
  finalize(window: NoteWindow): NoteJudgement {
    const bin = this.bins.get(window.index) ?? emptyAccumulator();
    this.bins.delete(window.index);

    const voiced = bin.voicedMidis.length;
    const voicedRatio = bin.total > 0 ? voiced / bin.total : 0;

    if (voiced === 0 || voicedRatio < MISSED_VOICED_RATIO) {
      return { index: window.index, noteIndex: window.noteIndex, state: 'missed' };
    }

    const heardMidi = mode(bin.voicedMidis.map((m) => Math.round(m))) ?? undefined;
    const timingErrorBeats =
      bin.firstVoicedTime != null
        ? (bin.firstVoicedTime - window.onset) / this.beatSeconds
        : undefined;

    const matchRatio = bin.matchedCents.length / voiced;
    if (matchRatio >= CORRECT_MATCH_RATIO) {
      return {
        index: window.index,
        noteIndex: window.noteIndex,
        state: 'correct',
        // Median, not mean: attack transients drag a mean badly off.
        centsError: median(bin.matchedCents) ?? undefined,
        timingErrorBeats,
        heardMidi,
      };
    }

    return {
      index: window.index,
      noteIndex: window.noteIndex,
      state: 'wrong',
      timingErrorBeats,
      heardMidi,
    };
  }

  /** Drop accumulated audio for notes being re-judged after a re-anchor. */
  forget(windows: readonly NoteWindow[]): void {
    for (const window of windows) this.bins.delete(window.index);
  }

  /** Discard everything (a new run). */
  clear(): void {
    this.bins.clear();
  }
}
