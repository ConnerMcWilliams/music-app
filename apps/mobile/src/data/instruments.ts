/**
 * The brass instruments a player can choose during onboarding.
 *
 * Mirrors the backend's `backend/users/instruments.py` (which owns the slugs the
 * API validates against) — change both together. It is duplicated rather than
 * fetched so the picker renders instantly and offline, and because the notation
 * layer will need this metadata on-device to draw transposed studies.
 *
 * The duplication is checked, not trusted: a backend test
 * (`InstrumentCatalogTests.test_typescript_mirror_matches_this_module`) parses
 * the `INSTRUMENTS` array below and fails if any slug, label, clef, offset, or
 * family disagrees with the Python module. Keep the array a flat list of object
 * literals so that reader keeps working.
 *
 * Transposition convention matches `StudyContent.transposition_semitones`:
 *
 *     sounding pitch = written pitch + soundingOffsetSemitones
 *
 * Onboarding reads only `slug` / `label` / `family`; `clef` and
 * `soundingOffsetSemitones` are groundwork for per-instrument transposition.
 */

export type Clef = 'treble' | 'bass';
export type InstrumentFamily = 'trumpet' | 'horn' | 'low-brass';

export interface Instrument {
  slug: string;
  label: string;
  clef: Clef;
  /** Semitones from written to sounding pitch; negative sounds below the page. */
  soundingOffsetSemitones: number;
  family: InstrumentFamily;
}

/** Picker order: the trumpet family Clarke wrote for, then horns, then low brass. */
export const INSTRUMENTS: Instrument[] = [
  { slug: 'trumpet', label: 'Trumpet', clef: 'treble', soundingOffsetSemitones: -2, family: 'trumpet' },
  { slug: 'cornet', label: 'Cornet', clef: 'treble', soundingOffsetSemitones: -2, family: 'trumpet' },
  { slug: 'flugelhorn', label: 'Flugelhorn', clef: 'treble', soundingOffsetSemitones: -2, family: 'trumpet' },
  // B♭ piccolo trumpet sounds an octave above the B♭ trumpet: -2 + 12.
  { slug: 'piccolo-trumpet', label: 'Piccolo Trumpet', clef: 'treble', soundingOffsetSemitones: 10, family: 'trumpet' },
  { slug: 'french-horn', label: 'French Horn', clef: 'treble', soundingOffsetSemitones: -7, family: 'horn' },
  { slug: 'mellophone', label: 'Mellophone', clef: 'treble', soundingOffsetSemitones: -7, family: 'horn' },
  { slug: 'alto-horn', label: 'Alto / Tenor Horn', clef: 'treble', soundingOffsetSemitones: -9, family: 'horn' },
  // Treble-clef baritone/euphonium read as a B♭ tenor instrument: a major ninth below written.
  { slug: 'baritone-treble', label: 'Baritone Horn (treble clef)', clef: 'treble', soundingOffsetSemitones: -14, family: 'low-brass' },
  { slug: 'euphonium-treble', label: 'Euphonium (treble clef)', clef: 'treble', soundingOffsetSemitones: -14, family: 'low-brass' },
  // Bass-clef low brass reads concert pitch — written is what sounds.
  { slug: 'trombone', label: 'Trombone', clef: 'bass', soundingOffsetSemitones: 0, family: 'low-brass' },
  { slug: 'bass-trombone', label: 'Bass Trombone', clef: 'bass', soundingOffsetSemitones: 0, family: 'low-brass' },
  { slug: 'tuba', label: 'Tuba', clef: 'bass', soundingOffsetSemitones: 0, family: 'low-brass' },
];

/** Section headings for the picker, in the order the families appear above. */
export const INSTRUMENT_FAMILY_LABELS: Record<InstrumentFamily, string> = {
  trumpet: 'Trumpet family',
  horn: 'Horns',
  'low-brass': 'Low brass',
};

const BY_SLUG = new Map(INSTRUMENTS.map((i) => [i.slug, i]));

/** The instrument with this slug, or undefined if it isn't one we offer. */
export function getInstrument(slug: string | null | undefined): Instrument | undefined {
  return slug ? BY_SLUG.get(slug) : undefined;
}

/** Display label for a stored slug, falling back to an em dash when unset. */
export function instrumentLabel(slug: string | null | undefined): string {
  return getInstrument(slug)?.label ?? '—';
}
