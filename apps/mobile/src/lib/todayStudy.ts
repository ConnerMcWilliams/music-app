/**
 * Which study the Today card should surface: the first exercise in catalog
 * order (Study 1 → 10, exercises in order within each) the user has not yet
 * passed. "Passed" is decided server-side (best analyzed score at or above the
 * passing bar) and arrives via `fetchStudyScores`.
 *
 * Imports the catalog module directly — not the `@/data` barrel — so this pure
 * logic never drags the bundled MusicXML catalog into its dependents' tests.
 */
import { STUDY_SECTIONS } from '@/data/studies';
import type { Exercise, StudySection } from '@/types';
import type { StudyScores } from '@/services/studyScores';

/** An exercise plus its section, so callers can label it ("First Study · …"). */
export interface TodayStudy {
  exercise: Exercise;
  section: StudySection;
}

/** The catalog slugs the user has passed, per the fetched scores. */
export function passedSlugs(scores: StudyScores): Set<string> {
  const passed = new Set<string>();
  for (const [slug, score] of Object.entries(scores.bySlug)) {
    if (score.passed) passed.add(slug);
  }
  return passed;
}

/**
 * First exercise in catalog order not in `passed`. When every catalog exercise
 * is passed, returns the LAST one (the final folk-melody étude) so the card
 * always has a real target to re-practice.
 */
export function firstUnpassedStudy(passed: ReadonlySet<string>): TodayStudy {
  for (const section of STUDY_SECTIONS) {
    for (const exercise of section.exercises) {
      if (!passed.has(exercise.id)) return { exercise, section };
    }
  }
  const lastSection = STUDY_SECTIONS[STUDY_SECTIONS.length - 1];
  return {
    exercise: lastSection.exercises[lastSection.exercises.length - 1],
    section: lastSection,
  };
}
