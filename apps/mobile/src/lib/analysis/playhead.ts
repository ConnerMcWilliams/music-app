/**
 * The playhead — where the score says the player should be, right now.
 *
 * In tempo-locked mode this is pure bookkeeping over the metronome's clock: the
 * caller supplies a time in *timeline seconds* (0 = the first judged beat) and
 * the playhead answers which note owns that instant and which notes have gone
 * past. It holds no clock of its own, exactly as `LookaheadScheduler` takes its
 * clock by injection, so all of it is unit-testable with plain numbers.
 *
 * The cursor only ever moves forward, which is what keeps judging a single pass
 * over the audio. {@link Playhead.reAnchor} is the one deliberate exception: no
 * tempo-locked caller needs it today, and it is kept as the seam a free-tempo
 * `onset-follow` mode would move the cursor through.
 */
import type { NoteWindow } from './types';

export class Playhead {
  private readonly windows: readonly NoteWindow[];
  /** Index of the first window not yet reported closed. */
  private cursor = 0;

  constructor(windows: readonly NoteWindow[]) {
    this.windows = windows;
  }

  get length(): number {
    return this.windows.length;
  }

  /** True once every window has been reported closed. */
  get isFinished(): boolean {
    return this.cursor >= this.windows.length;
  }

  /** Timeline second at which the last note stops being judged. */
  get endTime(): number {
    return this.windows[this.windows.length - 1]?.end ?? 0;
  }

  /**
   * The window strictly containing `time`, or undefined in a gap / past the end.
   *
   * Used to route an audio frame to the note it belongs to. Frames landing in a
   * gap belong to nothing and are dropped — that dead space exists precisely so
   * one attack can't be counted against two notes.
   */
  windowAt(time: number): NoteWindow | undefined {
    // Windows are sorted and non-overlapping, so a scan from the cursor is O(1)
    // amortised across a run.
    for (let i = this.cursor; i < this.windows.length; i += 1) {
      const window = this.windows[i];
      if (time < window.start) return undefined; // in the gap before it
      if (time < window.end) return window;
    }
    return undefined;
  }

  /**
   * The note to highlight at `time`: the one being played, or the one coming up
   * if we're between notes. Leading slightly is deliberate — the halo should
   * tell the player where to go, not only where they are.
   */
  activeAt(time: number): NoteWindow | undefined {
    for (let i = this.cursor; i < this.windows.length; i += 1) {
      if (time < this.windows[i].end) return this.windows[i];
    }
    return undefined;
  }

  /**
   * Windows that have finished at `time`, in order, since the last call.
   *
   * Advancing the cursor here is what makes verdicts *latch*: a note is judged
   * once, when its window closes, so its colour can't flicker mid-note.
   */
  advanceTo(time: number): NoteWindow[] {
    const closed: NoteWindow[] = [];
    while (this.cursor < this.windows.length && time >= this.windows[this.cursor].end) {
      closed.push(this.windows[this.cursor]);
      this.cursor += 1;
    }
    return closed;
  }

  /**
   * Rewind the cursor to the first window still open at `time`.
   *
   * The only backward move: for a caller whose timeline origin has shifted under
   * it. Returns the windows that are no longer considered judged, so the caller
   * can clear their verdicts.
   */
  reAnchor(time: number): NoteWindow[] {
    let target = 0;
    while (target < this.windows.length && time >= this.windows[target].end) target += 1;
    const unjudged = this.windows.slice(Math.min(target, this.cursor), this.cursor);
    this.cursor = target;
    return unjudged;
  }
}
