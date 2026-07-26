import { buildWindows, NoteMatcher } from '@/lib/analysis';
import type { NoteWindow, PitchFrame } from '@/lib/analysis';

const BPM = 120;
const BEAT_SECONDS = 0.5;

const WINDOW: NoteWindow = buildWindows(
  [
    { index: 0, noteIndex: 3, midi: 60, onsetBeats: 0, durationBeats: 1, measureIndex: 0 },
    { index: 1, noteIndex: 4, midi: 62, onsetBeats: 1, durationBeats: 1, measureIndex: 0 },
  ],
  BPM,
)[0];

/** A voiced frame at `midi`, or silence when midi is null. */
function frame(time: number, midi: number | null): PitchFrame {
  if (midi == null) return { time, hz: null, midi: null, clarity: 0, rms: 0.0005 };
  return { time, hz: 440, midi, clarity: 0.9, rms: 0.2 };
}

/** `count` frames spread across the window, all at `midi`. */
function fill(matcher: NoteMatcher, midis: (number | null)[]) {
  const span = WINDOW.end - WINDOW.start;
  midis.forEach((midi, i) => {
    const time = WINDOW.start + (span * (i + 0.5)) / midis.length;
    matcher.addFrame(WINDOW, frame(time, midi));
  });
}

const newMatcher = () => new NoteMatcher(BEAT_SECONDS);

describe('NoteMatcher verdicts', () => {
  it('calls a sustained correct pitch correct', () => {
    const matcher = newMatcher();
    fill(matcher, Array(10).fill(60));
    const judgement = matcher.finalize(WINDOW);

    expect(judgement).toMatchObject({ index: 0, noteIndex: 3, state: 'correct' });
    expect(judgement.centsError).toBeCloseTo(0, 6);
    expect(judgement.heardMidi).toBe(60);
  });

  it('calls a different note wrong and reports what it heard', () => {
    const matcher = newMatcher();
    fill(matcher, Array(10).fill(62));
    const judgement = matcher.finalize(WINDOW);

    expect(judgement.state).toBe('wrong');
    expect(judgement.heardMidi).toBe(62);
  });

  it('calls silence missed', () => {
    const matcher = newMatcher();
    fill(matcher, Array(10).fill(null));
    const judgement = matcher.finalize(WINDOW);

    expect(judgement.state).toBe('missed');
    expect(judgement.heardMidi).toBeUndefined();
    expect(judgement.centsError).toBeUndefined();
  });

  it('calls a note with no frames at all missed', () => {
    expect(newMatcher().finalize(WINDOW).state).toBe('missed');
  });
});

describe('NoteMatcher thresholds', () => {
  /**
   * The ratio decides correct-vs-wrong, so both sides of it are pinned. A note
   * started right and cracked half-way is the case this gets right and an
   * attack-only check would not.
   */
  it('is correct at exactly half the voiced frames on pitch', () => {
    const matcher = newMatcher();
    fill(matcher, [60, 60, 60, 60, 60, 62, 62, 62, 62, 62]);
    expect(matcher.finalize(WINDOW).state).toBe('correct');
  });

  it('is wrong just below half', () => {
    const matcher = newMatcher();
    fill(matcher, [60, 60, 60, 60, 62, 62, 62, 62, 62, 62]);
    expect(matcher.finalize(WINDOW).state).toBe('wrong');
  });

  it('is missed when too little of the window carried sound', () => {
    const matcher = newMatcher();
    // 2 voiced of 10 = 0.2, under the 0.25 floor.
    fill(matcher, [60, 60, null, null, null, null, null, null, null, null]);
    expect(matcher.finalize(WINDOW).state).toBe('missed');
  });

  it('is judged on pitch once enough of the window carried sound', () => {
    const matcher = newMatcher();
    // 3 voiced of 10 = 0.3, over the floor — so it gets a real verdict.
    fill(matcher, [60, 60, 60, null, null, null, null, null, null, null]);
    expect(matcher.finalize(WINDOW).state).toBe('correct');
  });

  it('ignores quiet or noisy frames when judging', () => {
    const matcher = newMatcher();
    fill(matcher, Array(10).fill(60));
    // Loud but unpitched noise must not count as a voiced frame.
    matcher.addFrame(WINDOW, { time: WINDOW.start + 0.01, hz: 300, midi: 62, clarity: 0.1, rms: 0.9 });
    expect(matcher.finalize(WINDOW).state).toBe('correct');
  });
});

describe('NoteMatcher pitch detail', () => {
  it('reports a median cents error, not a mean', () => {
    const matcher = newMatcher();
    // One wild attack transient among otherwise steady, slightly sharp frames.
    fill(matcher, [60.5, 60.1, 60.1, 60.1, 60.1, 60.1, 60.1, 60.1, 60.1, 60.1]);
    const judgement = matcher.finalize(WINDOW);
    expect(judgement.state).toBe('correct');
    // A mean would be dragged toward the outlier; the median stays at 10 cents.
    expect(judgement.centsError).toBeCloseTo(10, 4);
  });

  /**
   * An octave error is a wrong note — musically, and to
   * `backend/grading/engine/align.py`. This is pinned because the two overlays
   * disagreeing would mean the same take reads green live and red in results.
   */
  it('calls an octave error wrong and reports the octave actually played', () => {
    const matcher = newMatcher();
    fill(matcher, Array(10).fill(72)); // an octave above the expected 60
    const judgement = matcher.finalize(WINDOW);

    expect(judgement.state).toBe('wrong');
    expect(judgement.heardMidi).toBe(72);
    // "expected C4, heard C5" — no cents figure, because nothing matched.
    expect(judgement.centsError).toBeUndefined();
  });

  it('calls an octave below wrong too', () => {
    const matcher = newMatcher();
    fill(matcher, Array(10).fill(48));
    const judgement = matcher.finalize(WINDOW);
    expect(judgement.state).toBe('wrong');
    expect(judgement.heardMidi).toBe(48);
  });

  it('is not thrown by a lone octave slip among correct frames', () => {
    const matcher = newMatcher();
    // The 10 ms hop gives ~10 frames per sixteenth, so one bad reading cannot
    // flip a verdict against the 50% match ratio.
    fill(matcher, [60, 60, 60, 72, 60, 60, 60, 60, 60, 60]);
    expect(matcher.finalize(WINDOW).state).toBe('correct');
  });

  it('measures the attack against the notated onset, in beats', () => {
    const matcher = newMatcher();
    // First sound lands 0.1 s after the onset — a fifth of a beat late.
    matcher.addFrame(WINDOW, frame(0.1, 60));
    matcher.addFrame(WINDOW, frame(0.2, 60));
    matcher.addFrame(WINDOW, frame(0.3, 60));
    const judgement = matcher.finalize(WINDOW);
    expect(judgement.timingErrorBeats).toBeCloseTo(0.2, 6);
  });

  it('reports a negative timing error for an early attack', () => {
    const matcher = newMatcher();
    matcher.addFrame(WINDOW, frame(-0.05, 60));
    matcher.addFrame(WINDOW, frame(0.1, 60));
    expect(matcher.finalize(WINDOW).timingErrorBeats).toBeCloseTo(-0.1, 6);
  });
});

describe('NoteMatcher bookkeeping', () => {
  it('finalizing consumes the note, so a second call cannot double-count', () => {
    const matcher = newMatcher();
    fill(matcher, Array(10).fill(60));
    expect(matcher.finalize(WINDOW).state).toBe('correct');
    expect(matcher.finalize(WINDOW).state).toBe('missed');
  });

  it('forgets notes being re-judged after a re-anchor', () => {
    const matcher = newMatcher();
    fill(matcher, Array(10).fill(60));
    matcher.forget([WINDOW]);
    expect(matcher.finalize(WINDOW).state).toBe('missed');
  });

  it('clears everything for a new run', () => {
    const matcher = newMatcher();
    fill(matcher, Array(10).fill(60));
    matcher.clear();
    expect(matcher.finalize(WINDOW).state).toBe('missed');
  });
});
