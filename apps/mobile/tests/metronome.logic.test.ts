import {
  BPM_DEFAULT,
  BPM_MAX,
  BPM_MIN,
  beatDurationMs,
  beatDurationSeconds,
  beatIndexForNumber,
  clampBpm,
  defaultConfig,
  isBpmInRange,
  isValidConfig,
  makeAccentPattern,
  measureForNumber,
  nextBeatIndex,
  normalizeConfig,
  targetTime,
  toggleAccent,
} from '@/lib/metronome/types';

// Pure metronome logic: the timing math and config rules that must be correct
// regardless of audio hardware. No timers, no React, no audio here.
describe('BPM validation and clamping', () => {
  it('clamps below the minimum up to BPM_MIN', () => {
    expect(clampBpm(10)).toBe(BPM_MIN);
    expect(clampBpm(-5)).toBe(BPM_MIN);
  });

  it('clamps above the maximum down to BPM_MAX', () => {
    expect(clampBpm(1000)).toBe(BPM_MAX);
  });

  it('rounds fractional BPM to an integer', () => {
    expect(clampBpm(120.4)).toBe(120);
    expect(clampBpm(120.6)).toBe(121);
  });

  it('falls back to the default for non-finite input', () => {
    expect(clampBpm(NaN)).toBe(BPM_DEFAULT);
    expect(clampBpm(Infinity)).toBe(BPM_DEFAULT); // non-finite → safe default
    expect(clampBpm(-Infinity)).toBe(BPM_DEFAULT);
  });

  it('reports range membership', () => {
    expect(isBpmInRange(120)).toBe(true);
    expect(isBpmInRange(BPM_MIN)).toBe(true);
    expect(isBpmInRange(BPM_MAX)).toBe(true);
    expect(isBpmInRange(BPM_MIN - 1)).toBe(false);
    expect(isBpmInRange(BPM_MAX + 1)).toBe(false);
    expect(isBpmInRange(NaN)).toBe(false);
  });
});

describe('BPM-to-beat-duration conversion', () => {
  it('converts to seconds', () => {
    expect(beatDurationSeconds(120)).toBeCloseTo(0.5, 10);
    expect(beatDurationSeconds(60)).toBeCloseTo(1, 10);
    expect(beatDurationSeconds(240)).toBeCloseTo(0.25, 10);
  });

  it('converts to milliseconds', () => {
    expect(beatDurationMs(120)).toBeCloseTo(500, 10);
    expect(beatDurationMs(100)).toBeCloseTo(600, 10);
  });

  it('clamps the BPM before converting', () => {
    // 1000 BPM clamps to 300 → 0.2 s, not an unbounded tiny duration.
    expect(beatDurationSeconds(1000)).toBeCloseTo(60 / BPM_MAX, 10);
  });
});

describe('beat index progression and measure wrapping', () => {
  it('advances the beat index and wraps at the measure boundary', () => {
    expect(nextBeatIndex(0, 4)).toBe(1);
    expect(nextBeatIndex(2, 4)).toBe(3);
    expect(nextBeatIndex(3, 4)).toBe(0);
  });

  it('maps a monotonic beat number to its position in the measure', () => {
    const seq = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => beatIndexForNumber(n, 4));
    expect(seq).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
  });

  it('wraps to the correct measure number', () => {
    expect(measureForNumber(0, 4)).toBe(0);
    expect(measureForNumber(3, 4)).toBe(0);
    expect(measureForNumber(4, 4)).toBe(1);
    expect(measureForNumber(9, 3)).toBe(3);
  });

  it('handles a 6-beat meter', () => {
    const seq = [0, 1, 2, 3, 4, 5, 6].map((n) => beatIndexForNumber(n, 6));
    expect(seq).toEqual([0, 1, 2, 3, 4, 5, 0]);
    expect(measureForNumber(6, 6)).toBe(1);
  });
});

describe('stable target-time calculation', () => {
  it('computes target = start + N × beatDuration (absolute, not cumulative)', () => {
    const start = 10;
    const dur = 0.5;
    expect(targetTime(start, dur, 0)).toBeCloseTo(10, 10);
    expect(targetTime(start, dur, 1)).toBeCloseTo(10.5, 10);
    expect(targetTime(start, dur, 4)).toBeCloseTo(12, 10);
    expect(targetTime(start, dur, 100)).toBeCloseTo(60, 10);
  });

  it('never accumulates floating-point drift across many beats', () => {
    const start = 0;
    const dur = 60 / 137; // awkward tempo
    // Absolute formula: beat 10000 is exactly 10000 × dur from the origin.
    expect(targetTime(start, dur, 10000)).toBeCloseTo(10000 * dur, 6);
  });
});

describe('accent selection and meter changes', () => {
  it('defaults a fresh meter to a first-beat accent', () => {
    expect(makeAccentPattern(4)).toEqual([true, false, false, false]);
    expect(makeAccentPattern(3)).toEqual([true, false, false]);
  });

  it('toggles individual beat accents immutably', () => {
    const pattern = [true, false, false, false];
    const next = toggleAccent(pattern, 2);
    expect(next).toEqual([true, false, true, false]);
    expect(pattern).toEqual([true, false, false, false]); // unchanged
  });

  it('ignores out-of-range toggle indices', () => {
    const pattern = [true, false];
    expect(toggleAccent(pattern, 5)).toEqual([true, false]);
    expect(toggleAccent(pattern, -1)).toEqual([true, false]);
  });

  it('preserves overlapping accents when growing the meter', () => {
    const prev = [true, false, true, false];
    expect(makeAccentPattern(6, prev)).toEqual([true, false, true, false, false, false]);
  });

  it('truncates accents when shrinking the meter', () => {
    const prev = [true, false, true, false];
    expect(makeAccentPattern(2, prev)).toEqual([true, false]);
  });

  it('re-accents the downbeat if a resize would leave nothing accented', () => {
    const prev = [false, false, false, true];
    expect(makeAccentPattern(3, prev)).toEqual([true, false, false]);
  });
});

describe('config normalization and validation', () => {
  it('normalizes BPM and reconciles the accent-pattern length to the meter', () => {
    const normalized = normalizeConfig({
      bpm: 5000,
      beatsPerMeasure: 3,
      accentedBeats: [true],
    });
    expect(normalized.bpm).toBe(BPM_MAX);
    expect(normalized.beatsPerMeasure).toBe(3);
    expect(normalized.accentedBeats).toHaveLength(3);
    expect(normalized.accentedBeats[0]).toBe(true);
  });

  it('recognizes a valid config', () => {
    expect(isValidConfig(defaultConfig())).toBe(true);
  });

  it('rejects a config whose accent length disagrees with the meter', () => {
    expect(
      isValidConfig({ bpm: 120, beatsPerMeasure: 4, accentedBeats: [true, false] }),
    ).toBe(false);
  });

  it('produces a valid default config (120 BPM, 4/4, downbeat accented)', () => {
    const cfg = defaultConfig();
    expect(cfg.bpm).toBe(BPM_DEFAULT);
    expect(cfg.beatsPerMeasure).toBe(4);
    expect(cfg.accentedBeats).toEqual([true, false, false, false]);
  });
});
