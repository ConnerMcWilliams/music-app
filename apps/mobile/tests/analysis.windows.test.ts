import {
  buildWindows,
  signedCents,
  isVoiced,
  matchesExpected,
  median,
  mode,
  parseTempoBpm,
  MATCH_SEMITONES,
  WINDOW_PRE_MAX_SECONDS,
} from '@/lib/analysis';
import type { PitchFrame } from '@/lib/analysis';
import { buildTimeline, parseMusicXML } from '@/lib/musicxml';
import type { ExpectedNote } from '@/lib/musicxml';

function note(
  index: number,
  onsetBeats: number,
  durationBeats: number,
  midi = 60,
): ExpectedNote {
  return { index, noteIndex: index, midi, onsetBeats, durationBeats, measureIndex: 0 };
}

describe('parseTempoBpm', () => {
  it('reads a marked tempo', () => {
    expect(parseTempoBpm('♩ = 144')).toBe(144);
    expect(parseTempoBpm('quarter = 80')).toBe(80);
  });

  it('returns null when there is nothing usable', () => {
    expect(parseTempoBpm(undefined)).toBeNull();
    expect(parseTempoBpm('')).toBeNull();
    expect(parseTempoBpm('Allegro')).toBeNull();
    expect(parseTempoBpm('♩ = 5')).toBeNull(); // single digit, not a tempo
  });

  it('rejects tempos outside the metronome range', () => {
    expect(parseTempoBpm('♩ = 900')).toBeNull();
    expect(parseTempoBpm('♩ = 20')).toBeNull();
  });
});

describe('matchesExpected', () => {
  it('accepts pitches within tolerance', () => {
    expect(matchesExpected(60, 60)).toBe(true);
    expect(matchesExpected(60 + MATCH_SEMITONES - 0.01, 60)).toBe(true);
    expect(matchesExpected(60 - MATCH_SEMITONES + 0.01, 60)).toBe(true);
  });

  it('rejects a neighbouring semitone', () => {
    expect(matchesExpected(61, 60)).toBe(false);
    expect(matchesExpected(59, 60)).toBe(false);
  });

  /**
   * Octave-strict, and pinned here because it has to stay in step with
   * `backend/grading/engine/align.py`. If the two ever disagree, the same take
   * reads green while practising and red in its results.
   */
  it('rejects whole-octave errors, matching the grader', () => {
    expect(matchesExpected(72, 60)).toBe(false);
    expect(matchesExpected(48, 60)).toBe(false);
    expect(matchesExpected(84, 60)).toBe(false);
  });

  it('is a plain distance check with no special cases', () => {
    // Kept off the exact threshold — float error at 0.6 is not what this is
    // testing; the boundary itself is covered above.
    for (const delta of [0, 0.3, 0.59, 1, 5, 11.5, 12, 12.4, 24]) {
      const expected = delta <= MATCH_SEMITONES;
      expect(matchesExpected(60 + delta, 60)).toBe(expected);
      expect(matchesExpected(60 - delta, 60)).toBe(expected);
    }
  });
});

describe('signedCents', () => {
  it('measures signed distance from the expected note', () => {
    expect(signedCents(60.25, 60)).toBeCloseTo(25, 6);
    expect(signedCents(59.75, 60)).toBeCloseTo(-25, 6);
    expect(signedCents(60, 60)).toBeCloseTo(0, 6);
  });

  /** Only ever computed over matched frames, so it stays inside ±60 cents. */
  it('stays within the match tolerance for anything the matcher accepts', () => {
    for (const delta of [-0.6, -0.3, 0, 0.3, 0.6]) {
      expect(Math.abs(signedCents(60 + delta, 60))).toBeLessThanOrEqual(
        MATCH_SEMITONES * 100 + 1e-9,
      );
    }
  });
});

describe('isVoiced', () => {
  const base: PitchFrame = { time: 0, hz: 261, midi: 60, clarity: 0.9, rms: 0.2 };

  it('accepts a loud, clearly pitched frame', () => {
    expect(isVoiced(base)).toBe(true);
  });

  it('rejects quiet, noisy, or unpitched frames', () => {
    expect(isVoiced({ ...base, rms: 0.0001 })).toBe(false);
    expect(isVoiced({ ...base, clarity: 0.2 })).toBe(false);
    expect(isVoiced({ ...base, midi: null, hz: null })).toBe(false);
  });
});

describe('median / mode', () => {
  it('handles odd and even lengths', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it('finds the most common value', () => {
    expect(mode([60, 61, 60, 62])).toBe(60);
    expect(mode([])).toBeNull();
  });
});

describe('buildWindows', () => {
  const bpm = 120; // one beat = 0.5 s

  it('gives each note a lead-in and a trailing gap', () => {
    const [first] = buildWindows([note(0, 0, 1), note(1, 1, 1)], bpm);
    expect(first.start).toBeCloseTo(-WINDOW_PRE_MAX_SECONDS, 6);
    expect(first.end).toBeCloseTo(0.48, 6); // 0.5 − 0.02 gap
  });

  /**
   * The invariant the whole streaming design rests on. A generous lead-in would
   * otherwise reach back into the previous note, and a frame could be counted
   * against two notes at once.
   */
  it('never lets windows overlap', () => {
    const windows = buildWindows(
      [note(0, 0, 1), note(1, 1, 1), note(2, 2, 0.25), note(3, 2.25, 0.25)],
      bpm,
    );
    for (let i = 1; i < windows.length; i += 1) {
      expect(windows[i].start).toBeGreaterThanOrEqual(windows[i - 1].end);
    }
    // The second window would have started at 0.41 unclamped; the first ends 0.48.
    expect(windows[1].start).toBeCloseTo(windows[0].end, 6);
  });

  it('keeps every window non-empty', () => {
    const windows = buildWindows(
      [note(0, 0, 0.05), note(1, 0.05, 0.05), note(2, 0.1, 1)],
      bpm,
    );
    for (const window of windows) expect(window.end).toBeGreaterThan(window.start);
  });

  it('shortens the lead-in for very short notes', () => {
    // A 0.05-beat note is 25 ms; half of that is well under the 90 ms cap.
    const [first] = buildWindows([note(0, 0, 0.05), note(1, 1, 1)], bpm);
    expect(first.start).toBeCloseTo(-0.0125, 6);
  });

  it('carries the note identity through untouched', () => {
    const windows = buildWindows(
      [{ index: 7, noteIndex: 11, midi: 58, onsetBeats: 2, durationBeats: 1, measureIndex: 1 }],
      bpm,
    );
    expect(windows[0]).toMatchObject({ index: 7, noteIndex: 11, midi: 58, onset: 1 });
  });

  it('returns nothing for an empty timeline', () => {
    expect(buildWindows([], bpm)).toEqual([]);
  });

  it('holds the non-overlap invariant across a real study', () => {
    const xml = `<score-partwise><part><measure number="1">
      <attributes><divisions>4</divisions></attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>2</duration><type>eighth</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration><type>eighth</type></note>
      <note><rest/><duration>4</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>8</duration><type>half</type></note>
    </measure></part></score-partwise>`;
    const windows = buildWindows(buildTimeline(parseMusicXML(xml)), 96);
    expect(windows).toHaveLength(3);
    for (let i = 1; i < windows.length; i += 1) {
      expect(windows[i].start).toBeGreaterThanOrEqual(windows[i - 1].end);
    }
    // The rest leaves a real gap before the final note — no window covers it.
    expect(windows[2].start).toBeGreaterThan(windows[1].end);
  });
});
