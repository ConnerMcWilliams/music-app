import { mapNoteGrading, type NoteGradingWire } from '@/services/noteResults';

/**
 * The wire → app mapping for note-level grading.
 *
 * Both endpoints that carry a grade go through `mapNoteGrading`, mirroring the
 * backend's single `wire.py` shaping point. The tests below pin the contract
 * from the client side; `NoteWireTests` in `backend/grading/tests.py` pins the
 * other end.
 */
describe('mapNoteGrading', () => {
  const full: NoteGradingWire = {
    study_slug: 'clarke-2-1',
    note_grading: true,
    note_results: [
      { i: 0, v: 'correct', t: -0.02, c: 6.5, m: 58 },
      { i: 1, v: 'wrong', t: 0.11, c: 210.4, m: 64 },
      { i: 2, v: 'missed' },
    ],
    note_summary: { correct: 1, wrong: 1, missed: 1, extra: 2, gradeable: 3 },
  };

  it('maps every verdict field to its camelCase counterpart', () => {
    const mapped = mapNoteGrading(full);
    expect(mapped.studySlug).toBe('clarke-2-1');
    expect(mapped.noteGrading).toBe(true);
    expect(mapped.noteResults).toEqual([
      { index: 0, state: 'correct', timingErrorBeats: -0.02, centsError: 6.5, heardMidi: 58 },
      { index: 1, state: 'wrong', timingErrorBeats: 0.11, centsError: 210.4, heardMidi: 64 },
      { index: 2, state: 'missed' },
    ]);
    expect(mapped.noteSummary).toEqual({
      correct: 1,
      wrong: 1,
      missed: 1,
      extra: 2,
      gradeable: 3,
    });
  });

  it('omits measurements a missed note cannot have', () => {
    const [, , missed] = mapNoteGrading(full).noteResults;
    expect(missed).not.toHaveProperty('timingErrorBeats');
    expect(missed).not.toHaveProperty('centsError');
    expect(missed).not.toHaveProperty('heardMidi');
  });

  /**
   * A backend that predates note-level grading, or a stored row from before it,
   * sends none of these fields. The overlay must simply not appear.
   */
  it('degrades safely when the fields are absent', () => {
    const mapped = mapNoteGrading({});
    expect(mapped.noteGrading).toBe(false);
    expect(mapped.noteResults).toEqual([]);
    expect(mapped.noteSummary).toBeUndefined();
    expect(mapped.studySlug).toBeNull();
  });

  it('never claims note grading without verdicts to show', () => {
    expect(mapNoteGrading({ note_grading: true, note_results: [] }).noteGrading).toBe(false);
  });

  it('drops verdicts the overlay cannot draw', () => {
    const mapped = mapNoteGrading({
      note_grading: true,
      note_results: [
        { i: 0, v: 'correct' },
        { i: 1, v: 'something-new' },
        { i: 2, v: 'active' }, // a live-mode state; never persisted
      ],
    });
    expect(mapped.noteResults).toEqual([{ index: 0, state: 'correct' }]);
  });

  it('ignores malformed rows rather than throwing', () => {
    const mapped = mapNoteGrading({
      note_grading: true,
      note_results: [
        { i: 0, v: 'correct' },
        { v: 'wrong' } as never,
        null as never,
      ],
    });
    expect(mapped.noteResults).toEqual([{ index: 0, state: 'correct' }]);
  });
});
