import { FrameAssembler } from '@/lib/analysis';
import { detectPitch, frameLengthFor, hopLengthFor, midiToHz } from '@/lib/pitch';

/**
 * CPU budget for live analysis.
 *
 * The 10 ms hop means the detector runs ~100 times a second — 4.6× more often
 * than a non-overlapping frame would. That density is what makes verdicts
 * reliable on sixteenth notes (70% of the catalogue), so the cost has to be
 * measured rather than assumed.
 *
 * These assert generous ceilings so they can't flake on a loaded CI box; the
 * logged numbers are the actual signal.
 */
const RATE = 22050;
const FRAME = frameLengthFor(RATE);
const HOP = hopLengthFor(RATE);
/** Frames per second of audio at the production hop. */
const FRAMES_PER_SECOND = RATE / HOP;

/** A brass-like tone: strong upper partials, weaker fundamental. */
function brassFrame(): Float32Array {
  const frame = new Float32Array(FRAME);
  const hz = midiToHz(58); // written middle C on a B♭ trumpet
  const harmonics = [0.3, 1, 0.8, 0.6, 0.4, 0.25];
  for (let i = 0; i < FRAME; i += 1) {
    let sample = 0;
    harmonics.forEach((amp, h) => {
      sample += amp * Math.sin((2 * Math.PI * hz * (h + 1) * i) / RATE);
    });
    frame[i] = sample / 3;
  }
  return frame;
}

describe('live analysis CPU budget', () => {
  it('detects pitch fast enough to run at the 10 ms hop', () => {
    const frame = brassFrame();
    const iterations = 2000;

    // Warm the JIT and the detector's cached window/twiddle tables.
    for (let i = 0; i < 200; i += 1) detectPitch(frame, RATE);

    const started = performance.now();
    for (let i = 0; i < iterations; i += 1) detectPitch(frame, RATE);
    const elapsed = performance.now() - started;

    const msPerFrame = elapsed / iterations;
    const coreFraction = msPerFrame * FRAMES_PER_SECOND * 0.001;

    console.log(
      `detectPitch: ${msPerFrame.toFixed(3)} ms/frame · ` +
        `${FRAMES_PER_SECOND.toFixed(0)} frames/s · ` +
        `${(coreFraction * 100).toFixed(1)}% of one core`,
    );

    // A frame must cost well under its 10 ms slot, or analysis can't keep up.
    expect(msPerFrame).toBeLessThan(3);
  });

  it('assembles frames far faster than audio arrives', () => {
    const assembler = new FrameAssembler(FRAME, HOP);
    const chunk = brassFrame(); // stands in for a delivered buffer
    const seconds = 10;
    const chunks = Math.ceil((seconds * RATE) / chunk.length);

    let emitted = 0;
    const started = performance.now();
    for (let i = 0; i < chunks; i += 1) {
      assembler.push(chunk, (i * chunk.length) / RATE, RATE, () => {
        emitted += 1;
      });
    }
    const elapsed = performance.now() - started;

    console.log(
      `FrameAssembler: ${elapsed.toFixed(1)} ms to buffer ${seconds}s of audio ` +
        `(${emitted} frames) · ${((elapsed / (seconds * 1000)) * 100).toFixed(2)}% real-time`,
    );

    expect(emitted).toBeGreaterThan(seconds * FRAMES_PER_SECOND * 0.9);
    // Buffering must be a rounding error next to the detector.
    expect(elapsed).toBeLessThan(seconds * 1000 * 0.05);
  });

  it('produces roughly ten frames for a sixteenth note at ♩=120', () => {
    // A sixteenth at ♩=120 is 125 ms; the matcher needs a real population to
    // compute its ratios over, not two samples.
    const sixteenthSeconds = 60 / 120 / 4;
    expect(sixteenthSeconds * FRAMES_PER_SECOND).toBeGreaterThan(9);
  });
});
