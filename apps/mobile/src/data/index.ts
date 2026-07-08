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
export { SCORE_TREND } from './profile';

/** The study surfaced on the Home / Today screen. */
export function getTodayExercise(): Exercise {
  const inProgress = EXERCISES.find((e) => e.status === 'in_progress');
  return inProgress ?? EXERCISES[0];
}

/** Look up a single exercise by id (used when navigating from a card).
 *
 * Searches the curated demo studies first, then the full Clarke catalog, so
 * both a Today/Results card and a study picked from a section detail resolve. */
export function getExerciseById(id: string | undefined): Exercise | undefined {
  if (!id) return undefined;
  return EXERCISES.find((e) => e.id === id) ?? CATALOG_STUDIES.find((e) => e.id === id);
}

/**
 * Canonical MusicXML for a study, or undefined when it has no scored notation.
 *
 * Ids come in two shapes: catalog studies use `clarke-{section}-{local}` (a
 * direct key into the bundled notation), while the curated demo studies on
 * Home/Results use the short `clarke-{n}` form. A short id names the *n*-th
 * Clarke Study, so it resolves to that Study's first exercise (`clarke-{n}-1`).
 * Returns undefined when nothing matches, so the notation view can fall back to
 * its "unavailable" state instead of guessing.
 */
export function getMusicXmlForExercise(id: string | undefined): string | undefined {
  if (!id) return undefined;
  if (MUSICXML_BY_ID[id]) return MUSICXML_BY_ID[id];
  const shortMatch = /^clarke-(\d+)$/.exec(id);
  if (shortMatch) return MUSICXML_BY_ID[`clarke-${shortMatch[1]}-1`];
  return undefined;
}
