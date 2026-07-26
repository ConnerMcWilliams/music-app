import {
  centsFromNearestSemitone,
  centsFromTarget,
  centsFromTargetPitchClass,
  detectPitch,
  fftInPlace,
  frameLengthFor,
  frameRms,
  hannWindow,
  hopLengthFor,
  hzToMidi,
  midiToHz,
  nextPowerOfTwo,
  MAX_F0_HZ,
  MIN_F0_HZ,
} from '@/lib/pitch';

const SAMPLE_RATE = 22050;
const FRAME = frameLengthFor(SAMPLE_RATE);

/** A pure tone, optionally with harmonics, at unit-ish amplitude. */
function tone(hz: number, length = FRAME, rate = SAMPLE_RATE, harmonics: number[] = [1]) {
  const frame = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    let sample = 0;
    harmonics.forEach((amp, h) => {
      sample += amp * Math.sin((2 * Math.PI * hz * (h + 1) * i) / rate);
    });
    frame[i] = sample;
  }
  return frame;
}

function centsBetween(a: number, b: number) {
  return Math.abs(1200 * Math.log2(a / b));
}

describe('fft', () => {
  it('rounds sizes up to a power of two', () => {
    expect(nextPowerOfTwo(1)).toBe(1);
    expect(nextPowerOfTwo(1000)).toBe(1024);
    expect(nextPowerOfTwo(1024)).toBe(1024);
    expect(nextPowerOfTwo(1025)).toBe(2048);
  });

  it('rejects a non-power-of-two length', () => {
    expect(() => fftInPlace(new Float64Array(3), new Float64Array(3))).toThrow(/power of two/);
  });

  it('puts a sinusoid in the expected bin', () => {
    const n = 1024;
    const bin = 64;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i += 1) re[i] = Math.cos((2 * Math.PI * bin * i) / n);

    fftInPlace(re, im, false);

    const magnitudes = Array.from({ length: n / 2 }, (_, i) => Math.hypot(re[i], im[i]));
    const peak = magnitudes.indexOf(Math.max(...magnitudes));
    expect(peak).toBe(bin);
  });

  it('round-trips through the inverse transform', () => {
    const n = 256;
    const original = Float64Array.from({ length: n }, (_, i) => Math.sin(i) + 0.5 * Math.cos(3 * i));
    const re = Float64Array.from(original);
    const im = new Float64Array(n);

    fftInPlace(re, im, false);
    fftInPlace(re, im, true);

    for (let i = 0; i < n; i += 1) {
      expect(re[i]).toBeCloseTo(original[i], 9);
    }
  });

  it('builds a symmetric Hann window matching numpy.hanning', () => {
    const w = hannWindow(5);
    // numpy.hanning(5) === [0, 0.5, 1, 0.5, 0]
    expect(Array.from(w).map((v) => Number(v.toFixed(6)))).toEqual([0, 0.5, 1, 0.5, 0]);
    expect(Array.from(hannWindow(1))).toEqual([1]);
  });
});

describe('frame geometry', () => {
  it('derives ~46 ms frames and 10 ms hops from the sample rate', () => {
    expect(frameLengthFor(22050)).toBe(1014);
    expect(hopLengthFor(22050)).toBe(221);
    expect(frameLengthFor(48000)).toBe(2208);
    expect(hopLengthFor(48000)).toBe(480);
  });
});

describe('detectPitch', () => {
  /**
   * Accuracy is worst at the bottom of the range and excellent at the top:
   * measured ~10 cents at 165 Hz falling to ~0.3 cents above 880 Hz.
   *
   * That is the autocorrelation envelope bias, not quantisation — the Hann
   * window leaves less overlap at long lags, so the decaying envelope pulls the
   * peak toward shorter lags and low notes read slightly sharp. Normalising by
   * the overlap would remove it, but `analysis.py` does not, and **matching the
   * backend matters more than absolute accuracy**: a shared bias keeps live and
   * graded verdicts consistent, which is the whole point of the port. Well
   * inside the matcher's ±50 cent tolerance either way.
   */
  it('tracks pure tones across the trumpet range', () => {
    for (const hz of [165, 220, 293.66, 440, 587.33, 880, 1046.5]) {
      const reading = detectPitch(tone(hz), SAMPLE_RATE);
      expect(reading).not.toBeNull();
      expect(centsBetween(reading!.hz, hz)).toBeLessThan(12);
      expect(reading!.clarity).toBeGreaterThan(0.55);
    }
  });

  it('is most accurate in the upper register, where the notes are hardest', () => {
    for (const hz of [880, 1046.5]) {
      const reading = detectPitch(tone(hz), SAMPLE_RATE);
      expect(centsBetween(reading!.hz, hz)).toBeLessThan(2);
    }
  });

  it('works at other sample rates', () => {
    const rate = 48000;
    const reading = detectPitch(tone(440, frameLengthFor(rate), rate), rate);
    expect(reading).not.toBeNull();
    expect(centsBetween(reading!.hz, 440)).toBeLessThan(5);
  });

  /**
   * The classic autocorrelation failure: a brass-like tone whose fundamental is
   * quieter than its upper partials must still report the fundamental, not an
   * octave (or twelfth) up.
   */
  it('does not octave-jump on a harmonic-rich tone with a weak fundamental', () => {
    const brassy = tone(233.08, FRAME, SAMPLE_RATE, [0.3, 1, 0.8, 0.6, 0.4, 0.25]);
    const reading = detectPitch(brassy, SAMPLE_RATE);
    expect(reading).not.toBeNull();
    expect(centsBetween(reading!.hz, 233.08)).toBeLessThan(15);
  });

  it('returns null for silence', () => {
    expect(detectPitch(new Float32Array(FRAME), SAMPLE_RATE)).toBeNull();
  });

  it('returns null for white noise', () => {
    // Deterministic pseudo-noise so the test can never flake.
    let seed = 12345;
    const noise = new Float32Array(FRAME);
    for (let i = 0; i < FRAME; i += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      noise[i] = (seed / 0x3fffffff) - 1;
    }
    const reading = detectPitch(noise, SAMPLE_RATE);
    if (reading !== null) expect(reading.clarity).toBeLessThan(0.75);
  });

  it('rejects tones below the searched range', () => {
    expect(detectPitch(tone(80), SAMPLE_RATE)).toBeNull();
    expect(detectPitch(tone(120), SAMPLE_RATE)).toBeNull();
  });

  /**
   * Documents a real limitation rather than asserting a wish. The lag search
   * stops at `MAX_F0_HZ`, and a pure tone's autocorrelation peaks at *every*
   * multiple of its period — so a tone above the range folds onto one of its
   * own subharmonics inside the range (2500 Hz → 500 Hz, a 1/5 subharmonic)
   * instead of being rejected.
   *
   * Acceptable: that is two octaves above the top of the trumpet's range, and
   * `analysis.py` behaves identically, so the grade agrees. Real brass tones
   * carry energy at the fundamental and do not trigger it.
   */
  it('folds a tone above the range onto a subharmonic (known limitation)', () => {
    const reading = detectPitch(tone(2500), SAMPLE_RATE);
    expect(reading).not.toBeNull();
    const ratio = 2500 / reading!.hz;
    expect(Math.abs(ratio - Math.round(ratio))).toBeLessThan(0.02);
  });

  it('is unmoved by a DC offset', () => {
    const clean = tone(440);
    const offset = Float32Array.from(clean, (v) => v + 0.5);
    const a = detectPitch(clean, SAMPLE_RATE);
    const b = detectPitch(offset, SAMPLE_RATE);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(centsBetween(a!.hz, b!.hz)).toBeLessThan(1);
  });

  it('guards degenerate input', () => {
    expect(detectPitch(new Float32Array(2), SAMPLE_RATE)).toBeNull();
    expect(detectPitch(tone(440), 0)).toBeNull();
  });

  it('keeps the search bounds in agreement with the backend', () => {
    expect(MIN_F0_HZ).toBe(150);
    expect(MAX_F0_HZ).toBe(1250);
  });

  it('reuses scratch buffers across many calls', () => {
    // A leak would show up as a heap blow-up; this mainly asserts stability of
    // the repeated-call path that live mode hammers 100×/second.
    const frame = tone(440);
    const first = detectPitch(frame, SAMPLE_RATE);
    for (let i = 0; i < 500; i += 1) detectPitch(frame, SAMPLE_RATE);
    const last = detectPitch(frame, SAMPLE_RATE);
    expect(last!.hz).toBeCloseTo(first!.hz, 10);
  });
});

describe('frameRms', () => {
  it('measures level', () => {
    expect(frameRms(new Float32Array(64))).toBe(0);
    expect(frameRms(Float32Array.from({ length: 64 }, () => 1))).toBeCloseTo(1, 6);
    // RMS of a full-scale sine is 1/√2.
    expect(frameRms(tone(440))).toBeCloseTo(Math.SQRT1_2, 2);
  });

  it('handles an empty frame', () => {
    expect(frameRms(new Float32Array(0))).toBe(0);
  });
});

describe('midi conversions', () => {
  it('anchors on A440', () => {
    expect(hzToMidi(440)).toBeCloseTo(69, 10);
    expect(midiToHz(69)).toBeCloseTo(440, 10);
    expect(midiToHz(60)).toBeCloseTo(261.6256, 3);
  });

  it('round-trips', () => {
    for (const midi of [50, 60, 69, 79, 88]) {
      expect(hzToMidi(midiToHz(midi))).toBeCloseTo(midi, 10);
    }
  });

  it('measures cents from the nearest semitone', () => {
    expect(centsFromNearestSemitone(440)).toBeCloseTo(0, 6);
    expect(centsFromNearestSemitone(midiToHz(69.25))).toBeCloseTo(25, 4);
    expect(centsFromNearestSemitone(midiToHz(68.75))).toBeCloseTo(-25, 4);
  });

  it('measures signed cents from a target, unbounded', () => {
    expect(centsFromTarget(440, 69)).toBeCloseTo(0, 6);
    expect(centsFromTarget(midiToHz(71), 69)).toBeCloseTo(200, 4);
    expect(centsFromTarget(midiToHz(57), 69)).toBeCloseTo(-1200, 4);
  });

  it('folds octaves away for pitch-class comparison', () => {
    // An octave error reads as zero, a true wrong note does not.
    expect(centsFromTargetPitchClass(midiToHz(81), 69)).toBeCloseTo(0, 4);
    expect(centsFromTargetPitchClass(midiToHz(57), 69)).toBeCloseTo(0, 4);
    expect(Math.abs(centsFromTargetPitchClass(midiToHz(71), 69))).toBeCloseTo(200, 4);
  });
});
