import { getMusicXmlForExercise, MUSICXML_BY_ID, toStudySlug } from '@/data';

describe('toStudySlug', () => {
  it('passes through an exercise-level slug that has notation', () => {
    expect(toStudySlug('clarke-1-1')).toBe('clarke-1-1');
    expect(toStudySlug('clarke-2-5')).toBe('clarke-2-5');
  });

  /**
   * Legacy history rows and the curated demo studies still carry section-level
   * ids. They name a Study, not one of its ~30 exercises, so they narrow to that
   * Study's first transcribed exercise.
   */
  it('narrows a section-level id to the first exercise of that study', () => {
    expect(toStudySlug('clarke-2')).toBe('clarke-2-1');
    expect(toStudySlug('clarke-4')).toBe('clarke-4-1');
  });

  it('returns undefined when nothing resolves', () => {
    expect(toStudySlug(undefined)).toBeUndefined();
    expect(toStudySlug('')).toBeUndefined();
    expect(toStudySlug('not-a-study')).toBeUndefined();
    // A section with no bundled notation must not invent a slug.
    expect(toStudySlug('clarke-999')).toBeUndefined();
  });

  it('only ever returns a slug that actually has notation', () => {
    for (const id of ['clarke-1', 'clarke-2', 'clarke-3', 'clarke-1-1', 'clarke-9-3']) {
      const slug = toStudySlug(id);
      if (slug !== undefined) expect(MUSICXML_BY_ID[slug]).toBeTruthy();
    }
  });
});

describe('getMusicXmlForExercise', () => {
  it('stays consistent with toStudySlug', () => {
    for (const id of ['clarke-1', 'clarke-2-5', 'nope', undefined]) {
      const slug = toStudySlug(id);
      const xml = getMusicXmlForExercise(id);
      expect(xml).toBe(slug ? MUSICXML_BY_ID[slug] : undefined);
    }
  });
});
