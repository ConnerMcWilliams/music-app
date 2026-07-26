/**
 * Pitch <-> MIDI conversions shared by the analyser and the note matcher.
 *
 * Pure arithmetic; no audio, no state. Mirrors the equal-temperament maths in
 * `backend/grading/engine/analysis.py` so a cents figure means the same thing
 * on the device as it does in the grade.
 */

/** Concert A. */
export const A4_HZ = 440;
/** MIDI note number of concert A. */
export const A4_MIDI = 69;

/** Fractional MIDI note number for a frequency (A440 equal temperament). */
export function hzToMidi(hz: number): number {
  return A4_MIDI + 12 * Math.log2(hz / A4_HZ);
}

/** Frequency of a (possibly fractional) MIDI note number. */
export function midiToHz(midi: number): number {
  return A4_HZ * Math.pow(2, (midi - A4_MIDI) / 12);
}

/**
 * Signed cents from the nearest equal-tempered semitone.
 *
 * Positive means sharp. Range is (-50, 50]. This is the "how in tune is this
 * note, whatever it is" measure the rubric's Pitch category uses — it does not
 * need to know which note was intended.
 */
export function centsFromNearestSemitone(hz: number): number {
  const midi = hzToMidi(hz);
  return (midi - Math.round(midi)) * 100;
}

/**
 * Signed cents from `hz` to a specific target note. Positive means sharp.
 *
 * Unlike {@link centsFromNearestSemitone} this is unbounded, so a wrong note
 * reads as a large error rather than folding back into ±50.
 */
export function centsFromTarget(hz: number, targetMidi: number): number {
  return (hzToMidi(hz) - targetMidi) * 100;
}

/**
 * Cents to the target, ignoring octave — i.e. folded into ±600.
 *
 * Useful for telling "right note, wrong octave" apart from "wrong note", which
 * matters because autocorrelation pitch tracking occasionally locks onto a
 * subharmonic and reports a note an octave low.
 */
export function centsFromTargetPitchClass(hz: number, targetMidi: number): number {
  const raw = centsFromTarget(hz, targetMidi);
  const folded = ((raw % 1200) + 1800) % 1200 - 600;
  return folded;
}
