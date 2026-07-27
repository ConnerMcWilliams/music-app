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
 *
 * `startSection` is the Clarke study (1–10) the user said they were already up
 * to during onboarding: the walk begins there instead of at the First Study.
 * Earlier studies are *not* treated as passed — they simply aren't what the
 * Today card offers, and stay open from the Studies tab. A null start (the "new
 * to Clarke" answer) or a section that isn't in the catalog walks from the
 * beginning, which is also the behaviour every caller had before onboarding.
 */
export function firstUnpassedStudy(
  passed: ReadonlySet<string>,
  startSection: number | null = null,
): TodayStudy {
  const sections =
    startSection === null
      ? STUDY_SECTIONS
      : STUDY_SECTIONS.filter((section) => section.section >= startSection);
  // An out-of-range start would leave nothing to walk; fall back to the catalog.
  const walk = sections.length > 0 ? sections : STUDY_SECTIONS;

  for (const section of walk) {
    for (const exercise of section.exercises) {
      if (!passed.has(exercise.id)) return { exercise, section };
    }
  }
  const lastSection = walk[walk.length - 1];
  return {
    exercise: lastSection.exercises[lastSection.exercises.length - 1],
    section: lastSection,
  };
}
