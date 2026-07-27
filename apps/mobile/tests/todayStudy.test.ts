import { CATALOG_STUDIES, STUDY_SECTIONS } from '@/data/studies';
import { firstUnpassedStudy, passedSlugs } from '@/lib/todayStudy';
import type { StudyScores } from '@/services/studyScores';

// Pure progression logic: walk the catalog in order (Study 1 → 10, exercises
// in order within each) and surface the first study the user hasn't passed.

function scores(bySlug: StudyScores['bySlug']): StudyScores {
  return { passingScore: 70, bySlug };
}

describe('passedSlugs', () => {
  it('keeps only the studies the backend marked passed', () => {
    const set = passedSlugs(
      scores({
        'clarke-1-1': { bestScore: 84, passed: true },
        'clarke-1-2': { bestScore: 62, passed: false },
        'clarke-1-3': { bestScore: 70, passed: true },
      }),
    );
    expect(set).toEqual(new Set(['clarke-1-1', 'clarke-1-3']));
  });
});

describe('firstUnpassedStudy', () => {
  it('starts a brand-new user on the very first study', () => {
    const { exercise, section } = firstUnpassedStudy(new Set());
    expect(exercise.id).toBe('clarke-1-1');
    expect(section.section).toBe(1);
  });

  it('advances past passed studies in order (passed 1 and 2 → shows 3)', () => {
    const { exercise, section } = firstUnpassedStudy(
      new Set(['clarke-1-1', 'clarke-1-2']),
    );
    expect(exercise.id).toBe('clarke-1-3');
    expect(exercise.number).toBe(3);
    expect(section.label).toBe('First Study');
  });

  it('returns the earliest gap, not the frontier (passed 1 and 3 → shows 2)', () => {
    const { exercise } = firstUnpassedStudy(new Set(['clarke-1-1', 'clarke-1-3']));
    expect(exercise.id).toBe('clarke-1-2');
  });

  it('rolls over to the next section once one is fully passed', () => {
    const firstSection = new Set(STUDY_SECTIONS[0].exercises.map((e) => e.id));
    const { exercise, section } = firstUnpassedStudy(firstSection);
    expect(exercise.id).toBe('clarke-2-1');
    expect(section.section).toBe(2);
  });

  it('falls back to the final study when everything is passed', () => {
    const all = new Set(CATALOG_STUDIES.map((e) => e.id));
    const { exercise, section } = firstUnpassedStudy(all);
    expect(exercise.id).toBe('clarke-10-4');
    expect(section.section).toBe(10);
  });

  it('ignores slugs that are not in the catalog (legacy ids)', () => {
    const { exercise } = firstUnpassedStudy(new Set(['clarke-2', 'bogus']));
    expect(exercise.id).toBe('clarke-1-1');
  });
});

describe('firstUnpassedStudy with an onboarding start section', () => {
  it('begins at the study the player said they were already up to', () => {
    const { exercise, section } = firstUnpassedStudy(new Set(), 3);
    expect(exercise.id).toBe('clarke-3-1');
    expect(section.section).toBe(3);
  });

  it('does not treat the skipped studies as passed — it just starts later', () => {
    // Nothing before the start is marked passed; the Studies tab still offers
    // them, so an unpassed Study 1 must not pull the card back to the top.
    const { exercise } = firstUnpassedStudy(new Set(['clarke-3-1']), 3);
    expect(exercise.id).toBe('clarke-3-2');
  });

  it('rolls past a fully passed starting study into the next one', () => {
    const thirdSection = new Set(STUDY_SECTIONS[2].exercises.map((e) => e.id));
    const { exercise, section } = firstUnpassedStudy(thirdSection, 3);
    expect(exercise.id).toBe('clarke-4-1');
    expect(section.section).toBe(4);
  });

  it('walks the whole catalog for "new to Clarke" (an explicit null)', () => {
    const { exercise } = firstUnpassedStudy(new Set(), null);
    expect(exercise.id).toBe('clarke-1-1');
  });

  it('falls back to the whole catalog when the start is out of range', () => {
    // Nothing is at or after Study 99, which would leave no studies to walk.
    const { exercise, section } = firstUnpassedStudy(new Set(), 99);
    expect(exercise.id).toBe('clarke-1-1');
    expect(section.section).toBe(1);
  });

  it('falls back to the last study when everything from the start is passed', () => {
    const all = new Set(CATALOG_STUDIES.map((e) => e.id));
    const { exercise, section } = firstUnpassedStudy(all, 8);
    expect(exercise.id).toBe('clarke-10-4');
    expect(section.section).toBe(10);
  });
});
