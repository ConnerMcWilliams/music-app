/**
 * Centralized mock data barrel.
 *
 * Everything the mock frontend reads comes from here, so replacing it with a
 * real API layer (`src/services/api.ts`) later touches one place. Screens import
 * from `@/data`, never from a backend directly (there isn't one yet).
 */
import type { Exercise } from '@/types';
import { EXERCISES } from './exercises';
import { MUSICXML_BY_ID } from './musicxmlCatalog';
import { CATALOG_STUDIES } from './studies';

export { EXERCISES } from './exercises';
export { STUDY_SECTIONS, CATALOG_STUDIES, getSectionById } from './studies';
export { MUSICXML_BY_ID } from './musicxmlCatalog';
export { MOCK_GRADING_RESULT } from './gradingResults';
export {
  INSTRUMENTS,
  INSTRUMENT_FAMILY_LABELS,
  getInstrument,
  instrumentLabel,
} from './instruments';
export type { Clef, Instrument, InstrumentFamily } from './instruments';
export {
  EXPERIENCE_LEVELS,
  PRIMARY_GOALS,
  experienceLabel,
  goalLabel,
} from './onboardingChoices';
export type { Choice } from './onboardingChoices';

/** Look up a single exercise by id (used when navigating from a card).
 *
 * Searches the curated demo studies first (their legacy short ids, e.g.
 * `clarke-2`, still appear in history rows), then the full Clarke catalog, so
 * both a Results/history row and a catalog study (Today card, section detail)
 * resolve. */
export function getExerciseById(id: string | undefined): Exercise | undefined {
  if (!id) return undefined;
  return EXERCISES.find((e) => e.id === id) ?? CATALOG_STUDIES.find((e) => e.id === id);
}

/**
 * The exercise-level study slug an id refers to, or undefined if none does.
 *
 * Ids come in two shapes: catalog studies use `clarke-{section}-{local}` (a
 * direct key into the bundled notation), while the curated demo studies on
 * Home/Results use the short `clarke-{n}` form. A short id names the *n*-th
 * Clarke Study, so it resolves to that Study's first exercise (`clarke-{n}-1`).
 *
 * This is the single rule for narrowing a section-level id to one transcribed
 * exercise. It matters beyond notation lookup: a submission tagged `clarke-2`
 * tells the grader only "some exercise from the Second Study", which is not
 * enough to align a recording against notes. Submitting the resolved slug is
 * what lets the backend grade note-by-note — see `docs/grading-rubric.md`.
 */
export function toStudySlug(id: string | undefined): string | undefined {
  if (!id) return undefined;
  if (MUSICXML_BY_ID[id]) return id;
  const shortMatch = /^clarke-(\d+)$/.exec(id);
  if (shortMatch) {
    const slug = `clarke-${shortMatch[1]}-1`;
    if (MUSICXML_BY_ID[slug]) return slug;
  }
  return undefined;
}

/**
 * Canonical MusicXML for a study, or undefined when it has no scored notation.
 *
 * Returns undefined when nothing matches, so the notation view can fall back to
 * its "unavailable" state instead of guessing.
 */
export function getMusicXmlForExercise(id: string | undefined): string | undefined {
  const slug = toStudySlug(id);
  return slug ? MUSICXML_BY_ID[slug] : undefined;
}
